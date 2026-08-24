import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeStoryHtml, storyHtmlHasText } from "@/lib/sanitize-html";
import {
  getStoryLockKind,
  splitStoryAtLastTbc,
  type StoryAccessGrant,
} from "@/lib/story-access";
import {
  MAX_STORY_LISTEN_CHARS,
  storyHtmlToPlainText,
  storyListenCacheKey,
} from "@/lib/story-listen";
import {
  fishSlaveVoiceId,
  fishTextToSpeech,
  fishTtsModel,
} from "@/lib/fish-audio";
import {
  presignGet,
  putR2Object,
  r2ObjectExists,
} from "@/lib/storage/r2";
import { r2ObjectKey, toR2StoredPath } from "@/lib/storage/paths";

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

  let payload: { storyId?: unknown };
  try {
    payload = (await request.json()) as { storyId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const storyId = typeof payload.storyId === "string" ? payload.storyId : "";
  if (!storyId) {
    return NextResponse.json({ error: "storyId required" }, { status: 400 });
  }

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("id, author_id, title, body, status, viewable_until, tbc_locked")
    .eq("id", storyId)
    .maybeSingle();

  if (storyError || !story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

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

  let slaveVoice: string;
  try {
    slaveVoice = fishSlaveVoiceId();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Slave voice is not configured";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const title = (story.title as string).trim();
  const body = storyHtmlToPlainText(html);
  const plainText = [title ? `${title}.` : "", body]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_STORY_LISTEN_CHARS);
  if (!plainText.trim()) {
    return NextResponse.json(
      { error: "Nothing to read aloud yet" },
      { status: 400 }
    );
  }

  const hash = storyListenCacheKey([
    storyId,
    "slave",
    slaveVoice,
    fishTtsModel(),
    lockKind,
    plainText,
  ]);
  const relativePath = `${story.author_id}/listen/${storyId}-${hash}.mp3`;
  const storedPath = toR2StoredPath("stories", relativePath);
  const key = r2ObjectKey(storedPath);

  try {
    const cached = await r2ObjectExists(key);
    if (!cached) {
      const { audio } = await fishTextToSpeech({
        text: plainText,
        referenceId: slaveVoice,
      });
      await putR2Object({
        key,
        body: audio,
        contentType: "audio/mpeg",
      });
    }

    const url = await presignGet({ key, expiresIn: 60 * 60 });
    return NextResponse.json({
      url,
      cached,
      speakers: ["slave"] as const,
    });
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status?: number }).status)
        : 500;
    const message = err instanceof Error ? err.message : "Could not generate audio";
    console.error("story listen failed", err);
    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
