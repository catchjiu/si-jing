import type { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/lib/inbox";

type Supabase = ReturnType<typeof createClient>;

/** Insert a durable inbox notification for a specific user. */
export async function notifyUser(
  supabase: Supabase,
  opts: {
    userId: string;
    kind: string;
    title: string;
    body?: string | null;
    href?: string;
    entityType?: string | null;
    entityId?: string | null;
  }
): Promise<string | null> {
  const { data, error } = await supabase.rpc("notify_user", {
    p_user_id: opts.userId,
    p_kind: opts.kind,
    p_title: opts.title,
    p_body: opts.body ?? null,
    p_href: opts.href ?? "/dashboard/inbox",
    p_entity_type: opts.entityType ?? null,
    p_entity_id: opts.entityId ?? null,
  });

  if (error) {
    console.error("notify_user failed", error);
    return null;
  }

  return (data as string) ?? null;
}

export async function fetchNotifications(
  supabase: Supabase,
  userId: string,
  limit = 40
): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as AppNotification[]) ?? [];
}

export async function countUnreadNotifications(
  supabase: Supabase,
  userId: string
): Promise<number> {
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  return count ?? 0;
}

export async function markAllNotificationsRead(
  supabase: Supabase,
  userId: string
) {
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
}

export async function markNotificationRead(
  supabase: Supabase,
  notificationId: string
) {
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);
}
