import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "blockquote",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "hr",
  "aside",
];

/** Sanitize TipTap HTML for safe storage/display. */
export function sanitizeStoryHtml(html: string): string {
  return DOMPurify.sanitize(html ?? "", {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["data-tbc"],
  }).trim();
}

/** True when HTML has meaningful text content. */
export function storyHtmlHasText(html: string): boolean {
  const text = sanitizeStoryHtml(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0;
}

/** Concatenate two sanitized story HTML fragments. */
export function appendStoryHtml(existing: string, addition: string): string {
  const a = sanitizeStoryHtml(existing);
  const b = sanitizeStoryHtml(addition);
  if (!a) return b;
  if (!b) return a;
  return `${a}${b}`;
}

/** Plain excerpt for notifications / previews. */
export function storyHtmlExcerpt(html: string, max = 120): string {
  const text = sanitizeStoryHtml(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

const STORY_BLOCK_RE =
  /<hr\b[^>]*\/?>|<(p|h2|h3|blockquote|ul|ol|aside)(\s[^>]*)?>[\s\S]*?<\/\1>/gi;

/**
 * Truncate story HTML to the first ~N top-level blocks (≈ lines of TipTap prose).
 */
export function previewStoryHtml(
  html: string,
  maxBlocks = 20
): { preview: string; truncated: boolean } {
  const safe = sanitizeStoryHtml(html);
  if (!safe) return { preview: "", truncated: false };
  if (maxBlocks < 1) return { preview: "", truncated: true };

  const blocks = safe.match(STORY_BLOCK_RE);
  if (!blocks || blocks.length === 0) {
    // Fallback for atypical markup: soft character cap (~20 short lines).
    const plain = safe.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (plain.length <= 900) return { preview: safe, truncated: false };
    return {
      preview: sanitizeStoryHtml(`<p>${storyHtmlExcerpt(safe, 900)}</p>`),
      truncated: true,
    };
  }

  if (blocks.length <= maxBlocks) {
    return { preview: safe, truncated: false };
  }

  return {
    preview: blocks.slice(0, maxBlocks).join(""),
    truncated: true,
  };
}
