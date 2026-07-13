import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env missing");
  return createClient(url, key);
}

/** Keeps check-ins / punishments / tease unlocks in sync when nobody is on the site. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = adminClient();

  const [
    { data: opened },
    { data: missed },
    { data: expired },
    { data: recurring },
  ] = await Promise.all([
    supabase.rpc("open_due_check_ins"),
    supabase.rpc("flag_missed_check_ins"),
    supabase.rpc("complete_expired_punishments"),
    supabase.rpc("ensure_recurring_task_occurrences", {
      look_ahead_days: 14,
    }),
  ]);

  const nowIso = new Date().toISOString();
  await supabase
    .from("teases")
    .update({ unlocked_notified_at: nowIso })
    .lte("unlocks_at", nowIso)
    .is("unlocked_notified_at", null);

  return NextResponse.json({
    ok: true,
    opened: opened ?? 0,
    missed: missed ?? 0,
    expired: expired ?? 0,
    recurring: recurring ?? 0,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
