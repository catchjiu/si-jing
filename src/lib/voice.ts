import type { VoiceEntityType } from "@/lib/types";
import { extensionForMime, normalizeVoiceBlob } from "@/lib/voice-format";
import { createClient } from "@/lib/supabase/client";
import { presignAndUpload } from "@/lib/storage/client";

export type CapturedVoice = {
  blob: Blob;
  durationMs: number;
};

export async function uploadVoiceNote(
  _supabase: ReturnType<typeof createClient> | unknown,
  opts: {
    userId: string;
    entityType: VoiceEntityType;
    entityId: string;
    blob: Blob;
    durationMs: number | null;
  }
) {
  const { userId, entityType, entityId, durationMs } = opts;
  const blob = await normalizeVoiceBlob(opts.blob);
  const mime = blob.type || "audio/wav";
  const ext = extensionForMime(mime);
  const relativePath = `${userId}/${entityType}/${entityId}/${Date.now()}.${ext}`;

  const path = await presignAndUpload({
    bucket: "voice",
    file: blob,
    contentType: mime,
    ext,
    relativePath,
  });

  const supabase = createClient();
  const { error: insertError } = await supabase.from("voice_notes").insert({
    created_by: userId,
    entity_type: entityType,
    entity_id: entityId,
    file_path: path,
    duration_ms: durationMs,
  });
  if (insertError) throw insertError;

  return path;
}
