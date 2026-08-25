/** Stable hash of reading title+body for listen_script freshness (browser + server). */
export function storyListenBodyHash(title: string, html: string): string {
  const input = `${title.trim()}\n${html.trim()}`;
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Extra mix for longer strings
  for (let i = 0; i < input.length; i += 97) {
    h ^= input.charCodeAt(i) + i;
    h = Math.imul(h, 2246822519);
  }
  const a = (h >>> 0).toString(16).padStart(8, "0");
  let h2 = 0x811c9dc5;
  for (let i = input.length - 1; i >= 0; i--) {
    h2 ^= input.charCodeAt(i);
    h2 = Math.imul(h2, 16777619);
  }
  const b = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${a}${b}`;
}
