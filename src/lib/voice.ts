import type { SupabaseClient } from "@supabase/supabase-js";
import type { VoiceEntityType } from "@/lib/types";
import { extensionForMime, normalizeVoiceBlob } from "@/lib/voice-format";

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
  const { userId, entityType, entityId, durationMs } = opts;
  const blob = await normalizeVoiceBlob(opts.blob);
  const mime = blob.type || "audio/wav";
  const ext = extensionForMime(mime);
  const path = `${userId}/${entityType}/${entityId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("voice")
    .upload(path, blob, {
      contentType: mime,
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
