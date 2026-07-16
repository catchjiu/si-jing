import type { MessageAttachmentType } from "@/lib/inbox";

export const inboxAnchors = {
  tease: (teaseId: string) => `tease:${teaseId}`,
  teaseComment: (messageId: string) => `tease_comment:${messageId}`,
  worshipGallery: () => "worship_gallery",
  worshipEntry: (entryId: string) => `worship_entry:${entryId}`,
  worshipGalleryComment: (messageId: string) =>
    `worship_gallery_comment:${messageId}`,
  worshipPhotoComment: (entryId: string, messageId: string) =>
    `worship_photo_comment:${entryId}:${messageId}`,
} as const;

export function messageAttachmentHref(opts: {
  type: MessageAttachmentType;
  id: string;
  anchor?: string | null;
}): string {
  const { type, id, anchor } = opts;

  if (type === "task") return `/dashboard/task/${id}`;
  if (type === "submission") return `/dashboard/submissions/${id}`;
  if (type === "tease") return teaseDeepLink(id, anchor);
  if (type === "punishment") return `/dashboard/punishments`;
  if (type === "reward") return `/dashboard/rewards`;
  if (type === "request") return `/dashboard/requests`;
  if (type === "date") return `/dashboard/dates`;
  if (type === "journal") return `/dashboard/journal`;
  if (type === "wishlist") return `/dashboard/wishlist`;
  if (type === "worship") return worshipDeepLink(id, anchor);
  if (type === "shop") return `/dashboard/shop`;
  if (type === "worship_assignment") return `/dashboard/worship`;
  return `/dashboard/inbox`;
}

function teaseDeepLink(teaseId: string, anchor?: string | null): string {
  const params = new URLSearchParams({ tease: teaseId });
  if (anchor?.startsWith("tease_comment:")) {
    params.set("comment", anchor.slice("tease_comment:".length));
  }
  return `/dashboard/teases?${params.toString()}`;
}

function worshipDeepLink(galleryId: string, anchor?: string | null): string {
  const base = `/dashboard/worship/${galleryId}`;
  if (!anchor) return base;

  const params = new URLSearchParams();
  if (anchor === "worship_gallery") {
    params.set("section", "comments");
  } else if (anchor.startsWith("worship_entry:")) {
    params.set("entry", anchor.slice("worship_entry:".length));
  } else if (anchor.startsWith("worship_gallery_comment:")) {
    params.set("galleryComment", anchor.slice("worship_gallery_comment:".length));
    params.set("section", "comments");
  } else if (anchor.startsWith("worship_photo_comment:")) {
    const rest = anchor.slice("worship_photo_comment:".length);
    const [entryId, messageId] = rest.split(":");
    if (entryId) params.set("entry", entryId);
    if (messageId) params.set("photoComment", messageId);
  }

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function highlightMessageElement(messageId: string) {
  const el = document.getElementById(`inbox-focus-${messageId}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-gold/50", "ring-offset-2", "ring-offset-void");
  window.setTimeout(() => {
    el.classList.remove(
      "ring-2",
      "ring-gold/50",
      "ring-offset-2",
      "ring-offset-void"
    );
  }, 3200);
}
