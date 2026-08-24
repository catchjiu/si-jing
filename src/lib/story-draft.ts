import type { StoryStatus } from "@/lib/types";
import { storyHtmlHasText } from "@/lib/sanitize-html";

const STORAGE_KEY = "queen-sisi:story-composer-draft";

export type StoryComposerDraft = {
  /** Open the new-story form (vs editing an existing one). */
  showForm: boolean;
  promptFirst: boolean;
  editingId: string | null;
  tbcEditingId: string | null;
  title: string;
  body: string;
  status: StoryStatus;
  viewWindow: string;
  generatePrompt: string;
};

function isStoryStatus(value: unknown): value is StoryStatus {
  return value === "draft" || value === "published";
}

function isDraft(value: unknown): value is StoryComposerDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.showForm === "boolean" &&
    typeof d.promptFirst === "boolean" &&
    (d.editingId === null || typeof d.editingId === "string") &&
    (d.tbcEditingId === null || typeof d.tbcEditingId === "string") &&
    typeof d.title === "string" &&
    typeof d.body === "string" &&
    isStoryStatus(d.status) &&
    typeof d.viewWindow === "string" &&
    typeof d.generatePrompt === "string"
  );
}

/** True when the draft has something worth restoring (form open or text). */
export function storyDraftIsActive(draft: StoryComposerDraft): boolean {
  if (draft.showForm || draft.editingId) return true;
  if (draft.title.trim()) return true;
  if (storyHtmlHasText(draft.body)) return true;
  if (draft.generatePrompt.trim()) return true;
  return false;
}

export function readStoryComposerDraft(): StoryComposerDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isDraft(parsed)) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (!storyDraftIsActive(parsed)) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoryComposerDraft(draft: StoryComposerDraft): void {
  if (typeof window === "undefined") return;
  try {
    if (!storyDraftIsActive(draft)) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Quota / private mode — ignore
  }
}

export function clearStoryComposerDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Drop an in-progress story draft when leaving the Story menu. */
export function clearStoryComposerDraftIfLeaving(pathname: string): void {
  if (pathname === "/dashboard/story" || pathname.startsWith("/dashboard/story/")) {
    return;
  }
  clearStoryComposerDraft();
}
