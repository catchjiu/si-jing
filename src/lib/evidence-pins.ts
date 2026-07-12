import { createClient } from "@/lib/supabase/client";
import type {
  EvidencePinMediaKind,
  EvidencePinSourceType,
} from "@/lib/types";

export type PinEvidenceInput = {
  pinnedBy: string;
  sourceType: EvidencePinSourceType;
  sourceId: string;
  mediaKind: EvidencePinMediaKind;
  title: string;
  caption?: string | null;
  youtubeUrl?: string | null;
  filePath?: string | null;
  storageBucket?: "teases" | "voice" | "submissions" | "date_posts" | null;
  meta?: Record<string, unknown> | null;
};

/** Upsert a Queen evidence pin. Returns true if newly pinned, false if already kept. */
export async function pinEvidence(
  input: PinEvidenceInput
): Promise<{ ok: true; already: boolean } | { ok: false; error: string }> {
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("evidence_pins")
    .select("id")
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId)
    .eq("media_kind", input.mediaKind)
    .maybeSingle();

  if (existing) {
    return { ok: true, already: true };
  }

  const { error } = await supabase.from("evidence_pins").insert({
    pinned_by: input.pinnedBy,
    source_type: input.sourceType,
    source_id: input.sourceId,
    media_kind: input.mediaKind,
    title: input.title,
    caption: input.caption ?? null,
    youtube_url: input.youtubeUrl ?? null,
    file_path: input.filePath ?? null,
    storage_bucket: input.storageBucket ?? null,
    meta: input.meta ?? null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, already: false };
}

export async function unpinEvidence(pinId: string) {
  const supabase = createClient();
  return supabase.from("evidence_pins").delete().eq("id", pinId);
}

export async function isPinned(
  sourceType: EvidencePinSourceType,
  sourceId: string,
  mediaKind: EvidencePinMediaKind
) {
  const supabase = createClient();
  const { data } = await supabase
    .from("evidence_pins")
    .select("id")
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .eq("media_kind", mediaKind)
    .maybeSingle();
  return data?.id ?? null;
}
