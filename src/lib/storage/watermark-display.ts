import { isR2Path } from "@/lib/storage/paths";

/**
 * R2 uploads are stamped on upload (server or presign fallback).
 * Legacy Supabase storage paths still need the CSS overlay when displayed.
 */
export function needsDisplayWatermark(mediaPath?: string | null): boolean {
  if (!mediaPath) return false;
  return !isR2Path(mediaPath);
}
