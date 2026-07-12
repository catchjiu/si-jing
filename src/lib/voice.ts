import type { SupabaseClient } from "@supabase/supabase-js";
import type { VoiceEntityType } from "@/lib/types";

export type CapturedVoice = {
  blob: Blob;
  durationMs: number;
};

export async function uploadVoiceNote(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    entityType: VoiceEntityType;
    entityId: string;
    blob: Blob;
    durationMs: number | null;
  }
) {
  const { userId, entityType, entityId, blob, durationMs } = opts;
  const ext = blob.type.includes("mp4")
    ? "m4a"
    : blob.type.includes("ogg")
      ? "ogg"
      : "webm";
  const path = `${userId}/${entityType}/${entityId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("voice")
    .upload(path, blob, {
      contentType: blob.type || "audio/webm",
      upsert: false,
    });
  if (uploadError) throw uploadError;

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
