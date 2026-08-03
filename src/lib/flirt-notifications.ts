import type { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/lib/inbox";

type Supabase = ReturnType<typeof createClient>;

const FLIRT_HREF_RE = /^\/dashboard\/flirt\/([^/?#]+)/;

export function isFlirtNotification(n: Pick<AppNotification, "kind" | "href">) {
  return n.kind.startsWith("flirt_") || FLIRT_HREF_RE.test(n.href);
}

export function flirtGuyIdFromHref(href: string): string | null {
  const match = href.match(FLIRT_HREF_RE);
  return match?.[1] ?? null;
}

export type FlirtUnreadBreakdown = {
  total: number;
  byGuy: Record<string, number>;
};

export async function fetchUnreadFlirtNotifications(
  supabase: Supabase,
  userId: string
): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .is("read_at", null)
    .like("kind", "flirt_%")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as AppNotification[]) ?? [];
}

export function buildFlirtUnreadBreakdown(
  notifications: AppNotification[]
): FlirtUnreadBreakdown {
  const byGuy: Record<string, number> = {};
  let total = 0;

  for (const n of notifications) {
    if (!isFlirtNotification(n)) continue;
    total += 1;
    const guyId = flirtGuyIdFromHref(n.href);
    if (guyId) {
      byGuy[guyId] = (byGuy[guyId] ?? 0) + 1;
    }
  }

  return { total, byGuy };
}

export async function countUnreadFlirtNotifications(
  supabase: Supabase,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null)
    .like("kind", "flirt_%");

  if (error) throw error;
  return count ?? 0;
}

export async function markFlirtGuyNotificationsRead(
  supabase: Supabase,
  userId: string,
  guyId: string
) {
  const hrefPrefix = `/dashboard/flirt/${guyId}`;
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null)
    .like("kind", "flirt_%")
    .like("href", `${hrefPrefix}%`);
}
