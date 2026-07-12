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

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  let body: PushPayload & { target?: "queen" | "slave" | "both" } = {
    title: "Queen Sisi",
    body: "Update",
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

  const result = await sendPushToRoles(supabase, target, {
    title: body.title,
    body: body.body,
    url: body.url,
  });

  return NextResponse.json({ ok: true, ...result });
}
