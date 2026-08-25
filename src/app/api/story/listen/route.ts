import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
  type StorySpeaker,
} from "@/lib/story-listen";
import {
  generateListenScriptFromReading,
  parseStoryAiProvider,
} from "@/lib/story-ai";
import {
  fishQueenVoiceId,
  fishSlaveVoiceId,
  fishStoryDialogueToSpeech,
  fishTtsModel,
  fishTtsStabilityKey,
} from "@/lib/fish-audio";
import {
  getR2ObjectBytes,
  presignGet,
  putR2Object,
  r2ObjectExists,
} from "@/lib/storage/r2";
import { r2ObjectKey, toR2StoredPath } from "@/lib/storage/paths";
import { storyAudioFilename } from "@/lib/story-audio-filename";
import type { UserRole } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { storyId?: unknown; download?: unknown; provider?: unknown };
  try {
    payload = (await request.json()) as {
      storyId?: unknown;
      download?: unknown;
      provider?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const storyId = typeof payload.storyId === "string" ? payload.storyId : "";
  const asDownload = payload.download === true;
  const provider = parseStoryAiProvider(payload.provider);
  if (!storyId) {
    return NextResponse.json({ error: "storyId required" }, { status: 400 });
  }

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select(
      "id, author_id, title, body, status, viewable_until, tbc_locked, listen_script, listen_body_hash"
    )
    .eq("id", storyId)
    .maybeSingle();

  if (storyError || !story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
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
    .eq("story_id", storyId);
  const grants = (grantRows ?? []) as Pick<StoryAccessGrant, "grantee_id">[];

  const lockKind = getStoryLockKind({
    authorId: story.author_id as string,
    status: story.status as string,
    viewableUntil: story.viewable_until as string | null,
    tbcLocked: story.tbc_locked as boolean | null,
    html: story.body as string,
    viewerId: user.id,
    grants,
  });
  if (lockKind === "full") {
    return NextResponse.json(
      { error: "Unlock the story to listen" },
      { status: 403 }
    );
  }

  const fullHtml = sanitizeStoryHtml(story.body as string);
  const html =
    lockKind === "tbc" ? splitStoryAtLastTbc(fullHtml).preview : fullHtml;
  if (!storyHtmlHasText(html)) {
    return NextResponse.json(
      { error: "Nothing to read aloud yet" },
      { status: 400 }
    );
  }

  const title = ((story.title as string) || "").trim();
  const bodyHash = storyListenBodyHash(title, html);
  let listenScript = ((story.listen_script as string) || "").trim();
  const storedHash = ((story.listen_body_hash as string) || "").trim();

  if (!listenScript || storedHash !== bodyHash) {
    try {
      listenScript = await generateListenScriptFromReading({
        provider,
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
        .eq("id", storyId);
    } catch (err) {
      console.error("listen script generation failed; falling back", err);
      listenScript = "";
    }
  }

  let queenVoice: string;
  let slaveVoice: string;
  try {
    queenVoice = fishQueenVoiceId();
    slaveVoice = fishSlaveVoiceId();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Fish voices are not configured";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const script = buildStoryListenScript({
    title,
    html,
    listenScript: listenScript || null,
    authorRole,
  });
  if (!script.fishText.trim()) {
    return NextResponse.json(
      { error: "Nothing to read aloud yet" },
      { status: 400 }
    );
  }

  // Fish speaker tags: 0 = queen, 1 = slave (used only for script building)
  const speakers = script.speakers as StorySpeaker[];

  const hash = storyListenCacheKey([
    storyId,
    authorRole,
    speakers.join(","),
    queenVoice,
    slaveVoice,
    fishTtsModel(),
    fishTtsStabilityKey(),
    lockKind,
    bodyHash,
    script.fishText,
  ]);
  const relativePath = `${story.author_id}/listen/${storyId}-${hash}.mp3`;
  const storedPath = toR2StoredPath("stories", relativePath);
  const key = r2ObjectKey(storedPath);
  const filename = storyAudioFilename(title || undefined, storyId);

  try {
    const cached = await r2ObjectExists(key);
    if (!cached) {
      const { audio } = await fishStoryDialogueToSpeech({
        segments: script.segments,
        queenVoiceId: queenVoice,
        slaveVoiceId: slaveVoice,
      });
      await putR2Object({
        key,
        body: audio,
        contentType: "audio/mpeg",
      });
    }

    if (asDownload) {
      const { body, contentType } = await getR2ObjectBytes(key);
      return new NextResponse(new Uint8Array(body), {
        status: 200,
        headers: {
          "Content-Type": contentType || "audio/mpeg",
          "Content-Length": String(body.length),
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    const url = await presignGet({ key, expiresIn: 60 * 60 });
    return NextResponse.json({
      url,
      cached,
      authorRole,
      speakers,
      filename,
      listenScriptFresh: Boolean(listenScript),
    });
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status?: number }).status)
        : 500;
    const message =
      err instanceof Error ? err.message : "Could not generate audio";
    console.error("story listen failed", err);
    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
