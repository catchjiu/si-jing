import { createHash } from "crypto";
import { sanitizeStoryHtml } from "@/lib/sanitize-html";
import type { UserRole } from "@/lib/types";

export { storyListenBodyHash } from "@/lib/story-listen-hash";

export type StorySpeaker = "queen" | "slave";

export type StoryListenSegment = {
  speaker: StorySpeaker;
  text: string;
};

export const MAX_STORY_LISTEN_CHARS = 12_000;

const QUOTE_RE = /[“"]([^”"]{1,2000})[”"]/g;

const ATTR_VERBS =
  "said|asked|whispered|murmured|moaned|replied|answered|called|cried|gasped|growled|snapped|breathed|ordered|begged|pleaded|laughed|sighed|told|tells|tell|murmur";

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\u00a0/g, " ");
}

/** Plain story text for TTS, preserving paragraph breaks. */
export function storyHtmlToPlainText(html: string): string {
  const cleaned = sanitizeStoryHtml(html)
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[23]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/blockquote>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(cleaned)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function otherStorySpeaker(role: StorySpeaker): StorySpeaker {
  return role === "queen" ? "slave" : "queen";
}

function stripOuterQuotes(text: string): string {
  return text
    .replace(/^[“"']+/, "")
    .replace(/[”"']+$/, "")
    .replace(/[“”]/g, '"')
    .trim();
}

function classifyAttribution(
  raw: string,
  authorRole: StorySpeaker
): StorySpeaker | null {
  const t = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (/\bi\b/.test(t) || new RegExp(`\\bi\\s+(?:${ATTR_VERBS})\\b`).test(t)) {
    return authorRole;
  }
  if (/\b(queen|sisi)\b/.test(t) || /\bshe\b/.test(t)) return "queen";
  if (/\b(slave)\b/.test(t) || /\bhe\b/.test(t) || /(^|\s)d(\s|$)/.test(t)) {
    return "slave";
  }
  return null;
}

function stripLinePrefix(line: string): {
  speaker: StorySpeaker | null;
  text: string;
} {
  const m = line.match(
    /^\s*(?:the\s+)?(queen|sisi|slave|d)\s*[:—–-]\s*(.*)$/i
  );
  if (!m) return { speaker: null, text: line.trim() };
  const who = m[1].toLowerCase();
  const speaker: StorySpeaker =
    who === "slave" || who === "d" ? "slave" : "queen";
  return { speaker, text: (m[2] ?? "").trim() };
}

function pushSegment(
  parts: StoryListenSegment[],
  speaker: StorySpeaker,
  text: string
) {
  const clean = text
    .replace(/<\|speaker:\d+\|>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return;
  const last = parts[parts.length - 1];
  if (last && last.speaker === speaker) {
    last.text = `${last.text} ${clean}`;
    return;
  }
  parts.push({ speaker, text: clean });
}

/**
 * Preferred form: `<p>Queen: …</p>` / `<p>Slave: …</p>` for speech.
 * Fallback: inline quotes — attributed when possible, else the non-author voice.
 */
function parseParagraph(
  paragraph: string,
  authorRole: StorySpeaker
): StoryListenSegment[] {
  const prefixed = stripLinePrefix(paragraph);
  const line = prefixed.text;
  const segments: StoryListenSegment[] = [];
  if (!line) return segments;

  // Labeled dialogue line — whole line is that speaker (Fish-friendly format).
  if (prefixed.speaker) {
    pushSegment(segments, prefixed.speaker, stripOuterQuotes(line));
    return segments;
  }

  const matches = [...line.matchAll(QUOTE_RE)];
  if (matches.length === 0) {
    pushSegment(segments, authorRole, line);
    return segments;
  }

  const quoteDefault = otherStorySpeaker(authorRole);
  let cursor = 0;
  let lastQuoteSpeaker: StorySpeaker = quoteDefault;
  for (const match of matches) {
    const start = match.index ?? 0;
    const before = line.slice(cursor, start);
    const quote = match[1] ?? "";
    const afterStart = start + match[0].length;
    const afterWindow = line.slice(afterStart, afterStart + 80);

    const speaker =
      classifyAttribution(before, authorRole) ??
      classifyAttribution(afterWindow, authorRole) ??
      lastQuoteSpeaker ??
      quoteDefault;

    const narration = before.replace(
      new RegExp(`[,\\s]*(?:${ATTR_VERBS})\\s*$`, "i"),
      " "
    );
    pushSegment(segments, authorRole, narration);
    pushSegment(segments, speaker, quote);
    lastQuoteSpeaker = speaker;
    cursor = afterStart;
  }
  pushSegment(segments, authorRole, line.slice(cursor));
  return segments;
}

export function storyTextToSegments(
  plain: string,
  authorRole: StorySpeaker
): StoryListenSegment[] {
  const paragraphs = plain
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const segments: StoryListenSegment[] = [];
  for (const paragraph of paragraphs) {
    // Also split single newlines that may carry Queen:/Slave: turns.
    const lines = paragraph.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      for (const seg of parseParagraph(line, authorRole)) {
        pushSegment(segments, seg.speaker, seg.text);
      }
    }
  }
  return segments;
}

export function segmentsToFishText(segments: StoryListenSegment[]): string {
  return segments
    .map((seg) => {
      const idx = seg.speaker === "queen" ? 0 : 1;
      return `<|speaker:${idx}|>${seg.text}`;
    })
    .join("");
}

export function buildStoryListenScript(opts: {
  title: string;
  html?: string;
  /** Preferred: plain-text Queen:/Slave: script for Fish. */
  listenScript?: string | null;
  authorRole: UserRole;
}): {
  authorRole: StorySpeaker;
  segments: StoryListenSegment[];
  fishText: string;
  plainText: string;
  speakers: StorySpeaker[];
} {
  const authorRole: StorySpeaker =
    opts.authorRole === "queen" ? "queen" : "slave";
  const title = opts.title.trim();
  const script = (opts.listenScript ?? "").trim();
  const body = script
    ? script
    : storyHtmlToPlainText(opts.html ?? "");
  const titled = [title ? `${title}.` : "", body].filter(Boolean).join("\n\n");
  let segments = storyTextToSegments(titled, authorRole);
  let fishText = segmentsToFishText(segments);
  if (fishText.length > MAX_STORY_LISTEN_CHARS) {
    fishText = fishText.slice(0, MAX_STORY_LISTEN_CHARS);
    const lastTag = fishText.lastIndexOf("<|speaker:");
    if (lastTag > 0) fishText = fishText.slice(0, lastTag).trim();
    segments = storyTextToSegments(
      fishText.replace(/<\|speaker:\d+\|>/g, "\n"),
      authorRole
    );
  }
  const speakers = [...new Set(segments.map((s) => s.speaker))];
  return {
    authorRole,
    segments,
    fishText,
    plainText: titled,
    speakers,
  };
}

export function storyListenCacheKey(parts: string[]): string {
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 24);
}
