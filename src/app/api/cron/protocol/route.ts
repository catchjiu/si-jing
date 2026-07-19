import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToRoles } from "@/lib/push-server";

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
    { data: scheduleApplied },
    { data: noContactCleared },
  ] = await Promise.all([
    supabase.rpc("open_due_check_ins"),
    supabase.rpc("flag_missed_check_ins"),
    supabase.rpc("complete_expired_punishments"),
    supabase.rpc("ensure_recurring_task_occurrences", {
      look_ahead_days: 14,
    }),
    supabase.rpc("apply_queen_work_schedules"),
    supabase.rpc("clear_expired_no_contact"),
    supabase.rpc("ensure_queen_love_day_rollover"),
  ]);

  const clearedCount = Number(noContactCleared ?? 0);
  if (clearedCount > 0) {
    const { data: slaves } = await supabase
      .from("users")
      .select("id")
      .eq("role", "slave");
    if (slaves && slaves.length > 0) {
      await supabase.from("notifications").insert(
        slaves.map((r) => ({
          user_id: r.id,
          kind: "no_contact_lifted",
          title: "No contact lifted",
          body: "The timed No contact period ended. You may engage.",
          href: "/dashboard",
        }))
      );
    }
    try {
      await sendPushToRoles(supabase, "slave", {
        title: "No contact lifted",
        body: "The timed No contact period ended. You may engage.",
        url: "/dashboard",
        tag: "no-contact",
        renotify: true,
      });
    } catch {
      // push is best-effort
    }
  }

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
    scheduleApplied: scheduleApplied ?? 0,
    noContactCleared: clearedCount,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
