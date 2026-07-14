import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeaseMediaKind } from "@/lib/types";

/** Video: play count. Image: total seconds looked. */
export function teaseWatchMetric(
  mediaKind: TeaseMediaKind,
  sessionStartedAtMs: number
): number {
  if (mediaKind === "video") return 1;
  return Math.max(1, Math.round((Date.now() - sessionStartedAtMs) / 1000));
}

export function formatTeaseViewCount(
  count: number,
  mediaKind: TeaseMediaKind
): string {
  if (count <= 0) {
    return mediaKind === "video" ? "0 views" : "0s looked";
  }
  if (mediaKind === "video") {
    return count === 1 ? "1 view" : `${count} views`;
  }
  if (count < 60) return `${count}s looked`;
  const mins = Math.floor(count / 60);
  const secs = count % 60;
  if (secs === 0) return `${mins}m looked`;
  return `${mins}m ${secs}s looked`;
}

export async function recordTeaseView(
  supabase: SupabaseClient,
  teaseId: string,
  watchMetric: number
): Promise<void> {
  const { error } = await supabase.rpc("record_tease_view", {
    p_tease_id: teaseId,
    p_watch_metric: watchMetric,
  });
  if (error) throw error;
}
