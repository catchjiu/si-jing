import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatRoleSpeech } from "@/lib/role-speech";
import { storyAudioFilename } from "@/lib/story-audio-filename";
import {
  fishQueenVoiceId,
  fishTextToSpeech,
  fishTtsModel,
} from "@/lib/fish-audio";
import {
  getR2ObjectBytes,
  presignGet,
  putR2Object,
  r2ObjectExists,
} from "@/lib/storage/r2";
import { r2ObjectKey, toR2StoredPath } from "@/lib/storage/paths";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_INSULT_CHARS = 2000;

function cacheKey(parts: string[]): string {
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 24);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: insultId } = await context.params;
  if (!insultId) {
    return NextResponse.json({ error: "insult id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: me } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.role !== "slave") {
    return NextResponse.json(
      { error: "Only the slave can play insults" },
      { status: 403 }
    );
  }

  let asDownload = false;
  try {
    const payload = (await request.json()) as { download?: unknown };
    asDownload = payload.download === true;
  } catch {
    // empty body is fine
  }

  const { data: insult, error } = await supabase
    .from("story_insults")
    .select("id, author_id, body")
    .eq("id", insultId)
    .eq("author_id", user.id)
    .maybeSingle();

  if (error || !insult) {
    return NextResponse.json({ error: "Insult not found" }, { status: 404 });
  }

  const spoken = formatRoleSpeech(
    ((insult.body as string) || "").trim().slice(0, MAX_INSULT_CHARS),
    "queen"
  );
  if (!spoken) {
    return NextResponse.json({ error: "Nothing to speak" }, { status: 400 });
  }

  let queenVoice: string;
  try {
    queenVoice = fishQueenVoiceId();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Queen voice is not configured";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const hash = cacheKey([insultId, queenVoice, fishTtsModel(), spoken]);
  const relativePath = `${user.id}/insults/${insultId}-${hash}.mp3`;
  const storedPath = toR2StoredPath("stories", relativePath);
  const key = r2ObjectKey(storedPath);
  const filename = storyAudioFilename(spoken, insultId);

  try {
    const cached = await r2ObjectExists(key);
    if (!cached) {
      const { audio } = await fishTextToSpeech({
        text: spoken,
        referenceId: queenVoice,
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
    return NextResponse.json({ url, cached, filename });
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status?: number }).status)
        : 500;
    const message =
      err instanceof Error ? err.message : "Could not generate audio";
    console.error("story insult speak failed", err);
    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
