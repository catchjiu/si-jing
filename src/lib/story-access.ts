import type { Story, StoryStatus } from "@/lib/types";
import { formatCountdown, getCountdownParts } from "@/lib/format";
import { storyHtmlHasText } from "@/lib/sanitize-html";

export const STORY_VIEW_WINDOW_OPTIONS = [
  { minutes: null, value: "none", label: "No time limit" },
  { minutes: 30, value: "30", label: "30 minutes" },
  { minutes: 60, value: "60", label: "1 hour" },
  { minutes: 240, value: "240", label: "4 hours" },
  { minutes: 1440, value: "1440", label: "24 hours" },
] as const;

export type StoryViewWindowMinutes = 30 | 60 | 240 | 1440;

export type StoryAccessGrant = {
  story_id: string;
  grantee_id: string;
  granted_by: string;
  granted_at: string;
};

export type StoryAccessRequestStatus = "pending" | "granted" | "denied";

export type StoryAccessRequest = {
  id: string;
  story_id: string;
  requester_id: string;
  status: StoryAccessRequestStatus;
  created_at: string;
  responded_at: string | null;
};

export function parseStoryViewWindow(value: string): StoryViewWindowMinutes | null {
  if (value === "none" || value === "") return null;
  const n = Number(value);
  if (n === 30 || n === 60 || n === 240 || n === 1440) return n;
  return null;
}

export function storyViewWindowSelectValue(
  minutes: number | null | undefined
): string {
  if (minutes === 30 || minutes === 60 || minutes === 240 || minutes === 1440) {
    return String(minutes);
  }
  return "none";
}

export function storyViewWindowLabel(
  minutes: number | null | undefined
): string {
  const match = STORY_VIEW_WINDOW_OPTIONS.find((opt) => opt.minutes === minutes);
  return match?.label ?? "No time limit";
}

export function computeViewableUntil(
  minutes: number | null,
  from = new Date()
): string | null {
  if (minutes == null) return null;
  return new Date(from.getTime() + minutes * 60 * 1000).toISOString();
}

export function nextStoryTimingFields(opts: {
  previous?: Pick<
    Story,
    "status" | "view_window_minutes" | "viewable_until" | "published_at"
  > | null;
  nextStatus: StoryStatus;
  nextWindowMinutes: number | null;
  now?: Date;
}): {
  view_window_minutes: number | null;
  viewable_until: string | null;
  published_at: string | null;
} {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const previous = opts.previous ?? null;

  if (opts.nextStatus === "draft") {
    return {
      view_window_minutes: opts.nextWindowMinutes,
      viewable_until: null,
      published_at: null,
    };
  }

  const becomingPublished = !previous || previous.status !== "published";
  const windowChanged =
    (previous?.view_window_minutes ?? null) !== opts.nextWindowMinutes;

  if (becomingPublished || windowChanged) {
    return {
      view_window_minutes: opts.nextWindowMinutes,
      viewable_until: computeViewableUntil(opts.nextWindowMinutes, now),
      published_at: nowIso,
    };
  }

  return {
    view_window_minutes: opts.nextWindowMinutes,
    viewable_until: previous?.viewable_until ?? null,
    published_at: previous?.published_at ?? nowIso,
  };
}

export function viewerHasStoryGrant(
  grants: Pick<StoryAccessGrant, "grantee_id">[] | null | undefined,
  viewerId: string
): boolean {
  return Boolean(grants?.some((g) => g.grantee_id === viewerId));
}

export function isStoryWindowExpired(
  viewableUntil: string | null | undefined,
  now = Date.now()
): boolean {
  if (!viewableUntil) return false;
  return new Date(viewableUntil).getTime() <= now;
}

/** True when this viewer should see the whole body blurred (no TBC preview). */
export function isStoryBodyLockedForViewer(opts: {
  authorId: string;
  status: string;
  viewableUntil?: string | null;
  viewerId: string;
  grants?: Pick<StoryAccessGrant, "grantee_id">[] | null;
  now?: number;
}): boolean {
  const now = opts.now ?? Date.now();
  if (opts.authorId === opts.viewerId) return false;
  if (opts.status !== "published") return false;
  if (!isStoryWindowExpired(opts.viewableUntil, now)) return false;
  if (viewerHasStoryGrant(opts.grants, opts.viewerId)) return false;
  return true;
}

export function formatStoryReadWindow(
  viewableUntil: string,
  now = Date.now()
): string {
  const { isOverdue } = getCountdownParts(viewableUntil);
  if (isOverdue || new Date(viewableUntil).getTime() <= now) {
    return "Window closed";
  }
  return `Readable for ${formatCountdown(viewableUntil)}`;
}

export function pendingStoryAccessRequest(
  requests: StoryAccessRequest[] | null | undefined,
  requesterId: string
): StoryAccessRequest | undefined {
  return requests?.find(
    (r) => r.requester_id === requesterId && r.status === "pending"
  );
}

export const STORY_TBC_HTML = `<aside data-tbc="1">To be continued</aside>`;

const STORY_TBC_BLOCK_RE =
  /<aside\b[^>]*\bdata-tbc\b[^>]*>[\s\S]*?<\/aside>/gi;

export function storyHasTbc(html: string | null | undefined): boolean {
  if (!html) return false;
  STORY_TBC_BLOCK_RE.lastIndex = 0;
  return STORY_TBC_BLOCK_RE.test(html);
}

/** Split on the last TBC so earlier chapters stay visible after a new lock. */
export function splitStoryAtLastTbc(html: string): {
  preview: string;
  remainder: string;
  hasTbc: boolean;
} {
  const matches = [...(html ?? "").matchAll(STORY_TBC_BLOCK_RE)];
  const last = matches.at(-1);
  if (!last || last.index == null) {
    return { preview: html ?? "", remainder: "", hasTbc: false };
  }
  return {
    preview: (html ?? "").slice(0, last.index).trim(),
    remainder: (html ?? "").slice(last.index + last[0].length).trim(),
    hasTbc: true,
  };
}

export function continuationFingerprint(html: string | null | undefined): string {
  const { remainder, hasTbc } = splitStoryAtLastTbc(html ?? "");
  return hasTbc ? remainder : "";
}

export function appendTrailingTbc(html: string): string {
  const { remainder, hasTbc } = splitStoryAtLastTbc(html);
  if (hasTbc && !storyHtmlHasText(remainder)) return html;
  const base = (html ?? "").trim();
  return `${base}${STORY_TBC_HTML}<p></p>`;
}

export type StoryLockKind = "none" | "full" | "tbc";

export function getStoryLockKind(opts: {
  authorId: string;
  status: string;
  viewableUntil?: string | null;
  tbcLocked?: boolean | null;
  html?: string | null;
  viewerId: string;
  grants?: Pick<StoryAccessGrant, "grantee_id">[] | null;
  now?: number;
}): StoryLockKind {
  if (opts.authorId === opts.viewerId) return "none";
  if (opts.status !== "published") return "none";
  if (viewerHasStoryGrant(opts.grants, opts.viewerId)) return "none";
  if (opts.tbcLocked || storyHasTbc(opts.html)) return "tbc";
  if (isStoryWindowExpired(opts.viewableUntil, opts.now)) return "full";
  return "none";
}

export function isStoryAccessRequired(
  opts: Parameters<typeof getStoryLockKind>[0]
): boolean {
  return getStoryLockKind(opts) !== "none";
}
