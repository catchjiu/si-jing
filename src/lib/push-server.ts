import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

export type PushTarget = "queen" | "slave" | "both" | "self";

function configureVapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:queen@si-jing.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function sendPushToSubscriptions(
  subscriptions: {
    endpoint: string;
    p256dh: string;
    auth: string;
  }[],
  payload: PushPayload
) {
  if (!configureVapid()) {
    return { sent: 0, skipped: true as const };
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/dashboard",
  });

  let sent = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
        sent += 1;
      } catch (err) {
        // 410 Gone = stale subscription; caller may clean up
        console.error("push failed", err);
      }
    })
  );

  return { sent, skipped: false as const };
}

export async function sendPushToRoles(
  supabase: SupabaseClient,
  target: Exclude<PushTarget, "self">,
  payload: PushPayload
) {
  let roleFilter: string[] = [];
  if (target === "queen") roleFilter = ["queen"];
  else if (target === "slave") roleFilter = ["slave"];
  else roleFilter = ["queen", "slave"];

  const { data: users } = await supabase
    .from("users")
    .select("id")
    .in("role", roleFilter);

  const ids = (users ?? []).map((u) => u.id as string);
  if (ids.length === 0) return { sent: 0, skipped: false };

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", ids);

  return sendPushToSubscriptions(subs ?? [], payload);
}
