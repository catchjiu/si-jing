/** Safe ASCII .mp3 filename for Content-Disposition / browser downloads. */
export function storyAudioFilename(
  title: string | undefined,
  storyId: string
): string {
  const raw = (title ?? "").trim();
  const slug = raw
    .replace(/[^\p{L}\p{N}\s_-]+/gu, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/^-|-$/g, "");
  const ascii = (slug || `story-${storyId.slice(0, 8)}`)
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${ascii || `story-${storyId.slice(0, 8)}`}.mp3`;
}
