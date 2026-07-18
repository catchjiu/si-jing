import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToRoles, type PushPayload } from "@/lib/push-server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PushPayload & {
    target?: "queen" | "slave" | "both";
    kind?: string;
  } = {
    title: "Queen Sisi",
    body: "Update",
    action: "show",
  };
  try {
    body = { ...body, ...(await request.json()) };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data: me } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  // Default: notify the other role
  let target = body.target;
  if (!target) {
    target = me?.role === "queen" ? "slave" : "queen";
  }

  let roleFilter: string[] = [];
  if (target === "queen") roleFilter = ["queen"];
  else if (target === "slave") roleFilter = ["slave"];
  else roleFilter = ["queen", "slave"];

  const { data: recipients } = await supabase
    .from("users")
    .select("id")
    .in("role", roleFilter)
    .neq("id", user.id);

  const href = body.url || "/dashboard/inbox";
  const kind = body.kind || "push";
  const action = body.action === "close" ? "close" : "show";

  // Durable inbox notifications (even if web push is not configured)
  if (action === "show" && recipients && recipients.length > 0) {
    await supabase.from("notifications").insert(
      recipients.map((r) => ({
        user_id: r.id,
        kind,
        title: body.title,
        body: body.body,
        href,
      }))
    );
  }

  if (
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    !process.env.VAPID_PRIVATE_KEY
  ) {
    return NextResponse.json({ ok: true, notified: recipients?.length ?? 0 });
  }

  const result = await sendPushToRoles(supabase, target, {
    title: body.title,
    body: body.body,
    url: href,
    tag: body.tag,
    requireInteraction: body.requireInteraction,
    renotify: body.renotify,
    action,
  });

  return NextResponse.json({
    ok: true,
    notified: recipients?.length ?? 0,
    ...result,
  });
}
