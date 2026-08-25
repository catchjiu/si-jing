import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { sanitizeStoryHtml, storyHtmlHasText } from "@/lib/sanitize-html";
import {
  getStoryLockKind,
  splitStoryAtLastTbc,
  type StoryAccessGrant,
} from "@/lib/story-access";
import {
  buildStoryListenScript,
  storyListenBodyHash,
  storyListenCacheKey,
  type StoryListenSegment,
} from "@/lib/story-listen";
import { generateListenScriptFromReading } from "@/lib/story-ai";
import {
  fishQueenVoiceId,
  fishSlaveVoiceId,
  fishStoryDialogueToSpeech,
  fishTtsModel,
  fishTtsStabilityKey,
} from "@/lib/fish-audio";
import { putR2Object, r2ObjectExists } from "@/lib/storage/r2";
import { r2ObjectKey, toR2StoredPath } from "@/lib/storage/paths";
import { notifyUser } from "@/lib/notifications";
import { sendPushToUserIds } from "@/lib/push-server";
import { storyPageHref } from "@/lib/inbox-deep-links";
import type { UserRole } from "@/lib/types";

export type StoryListenPrepared = {
  cacheKey: string;
  relativePath: string;
  storedPath: string;
  objectKey: string;
  title: string;
  authorId: string;
  exists: boolean;
  segments: StoryListenSegment[];
};

/** Service-role client for background workers (bypasses RLS). */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw Object.assign(
      new Error("SUPABASE_SERVICE_ROLE_KEY is required for listen jobs"),
      { status: 503 }
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Build cache key + R2 path for the listenable audio of a story (viewer-aware). */
export async function prepareStoryListenTarget(opts: {
  storyId: string;
  viewerId: string;
  provider?: "claude" | "grok";
  /** Prefer the signed-in user client on API routes (anon has no stories access). */
  supabase?: SupabaseClient;
}): Promise<StoryListenPrepared> {
  const supabase = opts.supabase ?? adminClient();
  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select(
      "id, author_id, title, body, status, viewable_until, tbc_locked, listen_script, listen_body_hash"
    )
    .eq("id", opts.storyId)
    .maybeSingle();

  if (storyError || !story) {
    throw Object.assign(new Error("Story not found"), { status: 404 });
  }

  const { data: authorRow } = await supabase
    .from("users")
    .select("role")
    .eq("id", story.author_id as string)
    .maybeSingle();

  const authorRole: UserRole =
    authorRow?.role === "queen" ? "queen" : "slave";

  const { data: grantRows } = await supabase
    .from("story_access_grants")
    .select("grantee_id")
    .eq("story_id", opts.storyId);
  const grants = (grantRows ?? []) as Pick<StoryAccessGrant, "grantee_id">[];

  const lockKind = getStoryLockKind({
    authorId: story.author_id as string,
    status: story.status as string,
    viewableUntil: story.viewable_until as string | null,
    tbcLocked: story.tbc_locked as boolean | null,
    html: story.body as string,
    viewerId: opts.viewerId,
    grants,
  });
  if (lockKind === "full") {
    throw Object.assign(new Error("Unlock the story to listen"), {
      status: 403,
    });
  }

  const fullHtml = sanitizeStoryHtml(story.body as string);
  const html =
    lockKind === "tbc" ? splitStoryAtLastTbc(fullHtml).preview : fullHtml;
  if (!storyHtmlHasText(html)) {
    throw Object.assign(new Error("Nothing to read aloud yet"), {
      status: 400,
    });
  }

  const title = ((story.title as string) || "").trim();
  const bodyHash = storyListenBodyHash(title, html);
  let listenScript = ((story.listen_script as string) || "").trim();
  const storedHash = ((story.listen_body_hash as string) || "").trim();

  if (!listenScript || storedHash !== bodyHash) {
    try {
      listenScript = await generateListenScriptFromReading({
        provider: opts.provider ?? "claude",
        title,
        html,
        authorRole,
      });
      await supabase
        .from("stories")
        .update({
          listen_script: listenScript,
          listen_body_hash: bodyHash,
          updated_at: new Date().toISOString(),
        })
        .eq("id", opts.storyId);
    } catch (err) {
      console.error("listen script generation failed; falling back", err);
      listenScript = "";
    }
  }

  const queenVoice = fishQueenVoiceId();
  const slaveVoice = fishSlaveVoiceId();

  const script = buildStoryListenScript({
    title,
    html,
    listenScript: listenScript || null,
    authorRole,
  });
  if (!script.fishText.trim()) {
    throw Object.assign(new Error("Nothing to read aloud yet"), {
      status: 400,
    });
  }

  const cacheKey = storyListenCacheKey([
    opts.storyId,
    authorRole,
    script.speakers.join(","),
    queenVoice,
    slaveVoice,
    fishTtsModel(),
    fishTtsStabilityKey(),
    lockKind,
    bodyHash,
    script.fishText,
  ]);
  const relativePath = `${story.author_id}/listen/${opts.storyId}-${cacheKey}.mp3`;
  const storedPath = toR2StoredPath("stories", relativePath);
  const objectKey = r2ObjectKey(storedPath);
  const exists = await r2ObjectExists(objectKey);

  return {
    cacheKey,
    relativePath,
    storedPath,
    objectKey,
    title,
    authorId: story.author_id as string,
    exists,
    segments: script.segments,
  };
}

export async function synthesizeStoryListenAudio(opts: {
  storyId: string;
  viewerId: string;
  provider?: "claude" | "grok";
  supabase?: SupabaseClient;
}): Promise<StoryListenPrepared> {
  const prepared = await prepareStoryListenTarget(opts);
  if (prepared.exists) return prepared;

  const { audio } = await fishStoryDialogueToSpeech({
    segments: prepared.segments,
    queenVoiceId: fishQueenVoiceId(),
    slaveVoiceId: fishSlaveVoiceId(),
  });
  await putR2Object({
    key: prepared.objectKey,
    body: audio,
    contentType: "audio/mpeg",
  });

  return { ...prepared, exists: true };
}

export async function processStoryListenJob(jobId: string): Promise<void> {
  const supabase = adminClient();
  const { data: job, error } = await supabase
    .from("story_listen_jobs")
    .select(
      "id, story_id, requester_id, cache_key, status, title, audio_path"
    )
    .eq("id", jobId)
    .maybeSingle();

  if (error || !job) {
    throw new Error(error?.message || "Listen job not found");
  }
  if (job.status === "ready" && job.audio_path) return;
  if (job.status === "running") return;

  const { data: claimed } = await supabase
    .from("story_listen_jobs")
    .update({
      status: "running",
      updated_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", jobId)
    .in("status", ["queued", "failed"])
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  try {
    const prepared = await synthesizeStoryListenAudio({
      storyId: job.story_id as string,
      viewerId: job.requester_id as string,
      supabase,
    });

    await supabase
      .from("story_listen_jobs")
      .update({
        status: "ready",
        audio_path: prepared.storedPath,
        cache_key: prepared.cacheKey,
        title: prepared.title,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    const title = (prepared.title || "Story").trim() || "Story";
    const href = storyPageHref(job.story_id as string, { listen: true });
    await notifyUser(supabase as never, {
      userId: job.requester_id as string,
      kind: "story_listen",
      title: "Story ready to listen",
      body: title,
      href,
      entityType: "story",
      entityId: job.story_id as string,
    });
    await sendPushToUserIds(supabase, [job.requester_id as string], {
      title: "Story ready to listen",
      body: title,
      url: href,
      tag: `story-listen-${job.story_id}`,
      renotify: true,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not generate audio";
    console.error("story listen job failed", jobId, err);
    await supabase
      .from("story_listen_jobs")
      .update({
        status: "failed",
        error: message.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    const href = storyPageHref(job.story_id as string);
    await notifyUser(supabase as never, {
      userId: job.requester_id as string,
      kind: "story_listen",
      title: "Story listen failed",
      body: message.slice(0, 160),
      href,
      entityType: "story",
      entityId: job.story_id as string,
    }).catch(() => null);
  }
}
