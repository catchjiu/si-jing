import type { AppNotification } from "@/lib/inbox";

export type AlertDigest =
  | { kind: "single"; id: string; item: AppNotification }
  | {
      kind: "group";
      id: string;
      key: string;
      title: string;
      body: string;
      href: string;
      count: number;
      items: AppNotification[];
      newestAt: string;
      allRead: boolean;
    };

function digestKey(n: AppNotification): string | null {
  const kind = (n.kind || "").toLowerCase();
  const title = (n.title || "").toLowerCase();
  const href = n.href || "";
  const day = n.created_at.slice(0, 10);

  if (kind.includes("creep") || title.includes("creep")) {
    if (title.includes("gallery")) return `creep-gallery:${day}`;
    if (title.includes("comment")) return `creep-comment:${day}`;
    return `creep:${day}`;
  }
  if (kind.includes("worship") || title.includes("worship")) {
    if (title.includes("photo")) return `worship-photo:${day}`;
    if (title.includes("gallery")) return `worship-gallery:${day}`;
    if (title.includes("comment")) return `worship-comment:${day}`;
    return `worship:${day}`;
  }
  if (kind.includes("tease") || title.includes("tease")) {
    if (title.includes("reaction")) return `tease-reaction:${day}`;
    return `tease:${day}`;
  }
  if (kind.includes("task") || title.includes("task") || title.includes("submission")) {
    return `task:${day}`;
  }
  if (kind.includes("request") || title.includes("request")) {
    return `request:${day}`;
  }
  // Don't digest unique one-offs
  if (href.includes("/dashboard/worship/")) {
    const galleryId = href.split("/dashboard/worship/")[1]?.split("?")[0];
    if (galleryId && title.includes("photo")) {
      return `worship-photo-gallery:${galleryId}:${day}`;
    }
  }
  return null;
}

function digestTitle(key: string, count: number, sample: AppNotification): string {
  if (key.startsWith("creep-gallery")) {
    return count === 1 ? sample.title : `${count} new Creep galleries`;
  }
  if (key.startsWith("creep-comment")) {
    return count === 1 ? sample.title : `${count} Creep comments`;
  }
  if (key.startsWith("creep")) {
    return count === 1 ? sample.title : `${count} Creep updates`;
  }
  if (key.startsWith("worship-photo")) {
    return count === 1 ? sample.title : `${count} new worship photos`;
  }
  if (key.startsWith("worship-gallery")) {
    return count === 1 ? sample.title : `${count} new worship galleries`;
  }
  if (key.startsWith("worship-comment")) {
    return count === 1 ? sample.title : `${count} worship comments`;
  }
  if (key.startsWith("tease-reaction")) {
    return count === 1 ? sample.title : `${count} tease reactions`;
  }
  if (key.startsWith("tease")) {
    return count === 1 ? sample.title : `${count} tease updates`;
  }
  if (key.startsWith("task")) {
    return count === 1 ? sample.title : `${count} task updates`;
  }
  if (key.startsWith("request")) {
    return count === 1 ? sample.title : `${count} request updates`;
  }
  return sample.title;
}

/** Collapse similar same-day alerts into digest rows (newest first preserved). */
export function buildAlertDigests(
  notifications: AppNotification[]
): AlertDigest[] {
  const groups = new Map<string, AppNotification[]>();
  const order: string[] = [];

  for (const n of notifications) {
    const key = digestKey(n);
    if (!key) {
      const id = `single:${n.id}`;
      order.push(id);
      groups.set(id, [n]);
      continue;
    }
    if (!groups.has(key)) {
      order.push(key);
      groups.set(key, []);
    }
    groups.get(key)!.push(n);
  }

  const result: AlertDigest[] = [];
  for (const key of order) {
    const items = groups.get(key)!;
    if (key.startsWith("single:") || items.length === 1) {
      const item = items[0]!;
      result.push({ kind: "single", id: item.id, item });
      continue;
    }
    const newest = items[0]!;
    result.push({
      kind: "group",
      id: `digest:${key}`,
      key,
      title: digestTitle(key, items.length, newest),
      body: items
        .slice(0, 3)
        .map((i) => i.body)
        .filter(Boolean)
        .join(" · "),
      href: newest.href,
      count: items.length,
      items,
      newestAt: newest.created_at,
      allRead: items.every((i) => !!i.read_at),
    });
  }
  return result;
}
