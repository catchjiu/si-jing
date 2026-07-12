import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QueenDashboard } from "@/components/dashboard/queen-dashboard";
import { SlaveDashboard } from "@/components/dashboard/slave-dashboard";
import {
  ensureRecurringOccurrences,
  filterListableTasks,
} from "@/lib/tasks";
import type {
  DesireRequest,
  Profile,
  Punishment,
  QueenDashboardStats,
  SlaveDashboardStats,
  SubmissionWithRelations,
  Task,
  TaskWithRelations,
} from "@/lib/types";

function computeStreak(tasks: Task[]): number {
  const approved = tasks
    .filter((t) => t.status === "approved")
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

  let streak = 0;
  const dayMs = 24 * 60 * 60 * 1000;
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  for (const task of approved) {
    const d = new Date(task.updated_at);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((cursor.getTime() - d.getTime()) / dayMs);
    if (diff <= 1) {
      streak += 1;
      cursor = d;
    } else {
      break;
    }
  }
  return streak;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profileData } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  const profile = profileData as Profile | null;
  if (!profile) redirect("/");

  await ensureRecurringOccurrences(supabase, 7);
  await Promise.all([
    supabase.rpc("open_due_check_ins"),
    supabase.rpc("flag_missed_check_ins"),
    supabase.rpc("ensure_ritual_occurrences", { look_ahead_days: 14 }),
    supabase.rpc("flag_missed_rituals"),
    supabase.rpc("complete_expired_punishments"),
  ]);

  const { data: tasksData } = await supabase
    .from("tasks")
    .select("*, submissions(count)")
    .order("deadline", { ascending: true });

  const tasks = filterListableTasks(
    (tasksData ?? []).map((t) => {
      const row = t as Task & { submissions?: { count: number }[] };
      return {
        ...row,
        submission_count: row.submissions?.[0]?.count ?? 0,
      };
    }) as TaskWithRelations[]
  ) as TaskWithRelations[];

  const today = todayISO();

  const [{ data: activeRules }, { data: allAcks }] = await Promise.all([
    supabase.from("rules").select("id").eq("is_active", true),
    supabase.from("rule_acknowledgments").select("*"),
  ]);

  const activeRuleIds = (activeRules ?? []).map((r) => r.id as string);
  const acks = (allAcks ?? []) as {
    rule_id: string;
    user_id: string;
    acknowledged_at: string;
  }[];

  if (profile.role === "queen") {
    const { data: slave } = await supabase
      .from("users")
      .select("id")
      .eq("role", "slave")
      .limit(1)
      .maybeSingle();

    const slaveId = slave?.id as string | undefined;
    const slaveAcks = slaveId
      ? acks.filter((a) => a.user_id === slaveId)
      : [];
    const ackedSet = new Set(slaveAcks.map((a) => a.rule_id));
    const unackedRules = activeRuleIds.filter((id) => !ackedSet.has(id)).length;

    const [
      { data: submissionsData },
      { data: requestsData },
      { data: punishmentsData },
      openCheckInsRes,
      pendingPunishRes,
      ritualPendingRes,
    ] = await Promise.all([
      supabase
        .from("submissions")
        .select("*, task:tasks(*), media:submission_media(*)")
        .order("submitted_at", { ascending: false })
        .limit(8),
      supabase
        .from("requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("punishments")
        .select("*")
        .eq("status", "active")
        .gt("ends_at", new Date().toISOString())
        .order("ends_at", { ascending: true }),
      supabase
        .from("check_ins")
        .select("*", { count: "exact", head: true })
        .eq("status", "open"),
      supabase
        .from("punishments")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("ritual_occurrences")
        .select("*, ritual:rituals!inner(is_active)", {
          count: "exact",
          head: true,
        })
        .eq("due_date", today)
        .eq("status", "pending")
        .eq("ritual.is_active", true),
    ]);

    const submissions = (submissionsData ?? []) as SubmissionWithRelations[];
    const pendingRequests = (requestsData ?? []) as DesireRequest[];
    const activePunishments = (punishmentsData ?? []) as Punishment[];
    const pendingSubmissions = submissions.filter(
      (s) => s.status === "pending"
    ).length;
    const completed = tasks.filter((t) => t.status === "approved").length;

    const stats: QueenDashboardStats = {
      tasksAssigned: tasks.length,
      pendingSubmissions,
      completionRate:
        tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100),
      pendingRequests: pendingRequests.length,
      activePunishments: activePunishments.length,
      unackedRules,
      openCheckIns: openCheckInsRes.count ?? 0,
      pendingPunishments: pendingPunishRes.count ?? 0,
      todayRitualsPending: ritualPendingRes.count ?? 0,
    };

    return (
      <QueenDashboard
        tasks={tasks}
        submissions={submissions}
        pendingRequests={pendingRequests}
        activePunishments={activePunishments}
        stats={stats}
      />
    );
  }

  const myTasks = tasks.filter((t) => t.assigned_to === profile.id);
  const completed = myTasks.filter((t) => t.status === "approved").length;
  const active = myTasks.filter(
    (t) => !["approved", "rejected"].includes(t.status)
  ).length;

  const myAcks = acks.filter((a) => a.user_id === profile.id);
  const ackedSet = new Set(myAcks.map((a) => a.rule_id));
  const unackedRules = activeRuleIds.filter((id) => !ackedSet.has(id)).length;
  const lastRulesAckAt =
    myAcks
      .map((a) => a.acknowledged_at)
      .sort()
      .at(-1) ?? null;

  const [
    { data: punishmentData },
    openCheckInsRes,
    { data: nextTease },
    ritualPendingRes,
  ] = await Promise.all([
    supabase
      .from("punishments")
      .select("*")
      .eq("issued_to", profile.id)
      .eq("punishment_type", "contact_restriction")
      .eq("status", "active")
      .gt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("check_ins")
      .select("*", { count: "exact", head: true })
      .eq("assigned_to", profile.id)
      .eq("status", "open"),
    supabase
      .from("teases")
      .select("unlocks_at")
      .eq("sent_to", profile.id)
      .gt("unlocks_at", new Date().toISOString())
      .order("unlocks_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ritual_occurrences")
      .select("*, ritual:rituals!inner(assigned_to, is_active)", {
        count: "exact",
        head: true,
      })
      .eq("due_date", today)
      .eq("status", "pending")
      .eq("ritual.assigned_to", profile.id)
      .eq("ritual.is_active", true),
  ]);

  const stats: SlaveDashboardStats = {
    completionRate:
      myTasks.length === 0 ? 0 : Math.round((completed / myTasks.length) * 100),
    streak: computeStreak(myTasks),
    completed,
    total: myTasks.length,
    completedTasks: completed,
    activeTasks: active,
    unackedRules,
    lastRulesAckAt,
    openCheckIns: openCheckInsRes.count ?? 0,
    nextTeaseUnlockAt:
      (nextTease as { unlocks_at?: string } | null)?.unlocks_at ?? null,
    todayRitualsPending: ritualPendingRes.count ?? 0,
  };

  return (
    <SlaveDashboard
      tasks={myTasks}
      stats={stats}
      activeContactRestriction={(punishmentData as Punishment | null) ?? null}
    />
  );
}
