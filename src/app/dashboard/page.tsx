import { redirect } from "next/navigation";
import { isSameDay, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { QueenDashboard } from "@/components/dashboard/queen-dashboard";
import { SlaveDashboard } from "@/components/dashboard/slave-dashboard";
import {
  ensureRecurringOccurrences,
  filterListableTasks,
} from "@/lib/tasks";
import { dayProgress } from "@/lib/day-groups";
import { computeStreak } from "@/lib/streak";
import { checkAndAwardStreakMilestones } from "@/lib/streak-milestones";
import type {
  DesireRequest,
  Profile,
  Punishment,
  QueenAvailability,
  QueenDashboardStats,
  SlaveDashboardStats,
  SubmissionWithRelations,
  Task,
  TaskWithRelations,
  UserStatus,
} from "@/lib/types";

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
        .order("created_at", { ascending: false }),
      supabase
        .from("check_ins")
        .select("*", { count: "exact", head: true })
        .eq("status", "open"),
      supabase
        .from("punishments")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

    const submissions = (submissionsData ?? []) as SubmissionWithRelations[];
    const pendingRequests = (requestsData ?? []) as DesireRequest[];
    const nowIso = new Date().toISOString();
    const activePunishments = ((punishmentsData ?? []) as Punishment[]).filter(
      (p) => {
        const mode = p.clearance_mode ?? "timed";
        if (mode === "task_debt") return true;
        return p.ends_at > nowIso;
      }
    );
    const pendingSubmissions = submissions.filter(
      (s) => s.status === "pending"
    ).length;

    const slaveTasks = slaveId
      ? tasks.filter((t) => t.assigned_to === slaveId)
      : tasks;

    await checkAndAwardStreakMilestones(supabase, slaveTasks as Task[]);

    const { data: slaveStatusData } = slaveId
      ? await supabase
          .from("user_status")
          .select("*")
          .eq("user_id", slaveId)
          .maybeSingle()
      : { data: null };

    const slaveStatus = slaveStatusData as UserStatus | null;

    const today = new Date();
    const todayTasks = slaveTasks.filter((t) =>
      isSameDay(parseISO(t.deadline), today)
    );
    const { done: todayDone, total: todayTotal } = dayProgress(todayTasks);

    const stats: QueenDashboardStats = {
      tasksAssigned: tasks.length,
      pendingSubmissions,
      completionRate:
        todayTotal === 0 ? 0 : Math.round((todayDone / todayTotal) * 100),
      completedToday: todayDone,
      totalToday: todayTotal,
      streak: computeStreak(slaveTasks),
      pendingRequests: pendingRequests.length,
      activePunishments: activePunishments.length,
      unackedRules,
      openCheckIns: openCheckInsRes.count ?? 0,
      pendingPunishments: pendingPunishRes.count ?? 0,
    };

    return (
      <QueenDashboard
        tasks={tasks}
        progressTasks={slaveTasks}
        slaveId={slaveId}
        submissions={submissions}
        pendingRequests={pendingRequests}
        activePunishments={activePunishments}
        stats={stats}
        slaveStatus={slaveStatus}
      />
    );
  }

  const myTasks = tasks.filter((t) => t.assigned_to === profile.id);
  await checkAndAwardStreakMilestones(supabase, myTasks as Task[]);
  const today = new Date();
  const todayTasks = myTasks.filter((t) =>
    isSameDay(parseISO(t.deadline), today)
  );
  const { done: todayDone, total: todayTotal } = dayProgress(todayTasks);
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
    { data: queenRow },
  ] = await Promise.all([
    supabase
      .from("punishments")
      .select("*")
      .eq("issued_to", profile.id)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
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
      .from("users")
      .select("id, username, status:user_status(availability, updated_at)")
      .eq("role", "queen")
      .limit(1)
      .maybeSingle(),
  ]);

  const now = new Date();
  const activePunishments = ((punishmentData ?? []) as Punishment[]).filter(
    (p) => {
      const mode = p.clearance_mode ?? "timed";
      if (mode === "task_debt") return true;
      return new Date(p.ends_at) > now;
    }
  );

  const queenJoined = queenRow as
    | {
        id: string;
        username: string;
        status:
          | { availability: string | null; updated_at: string }
          | { availability: string | null; updated_at: string }[]
          | null;
      }
    | null;
  const queenStatusRow = Array.isArray(queenJoined?.status)
    ? queenJoined?.status[0]
    : queenJoined?.status;

  const stats: SlaveDashboardStats = {
    completionRate:
      todayTotal === 0 ? 0 : Math.round((todayDone / todayTotal) * 100),
    streak: computeStreak(myTasks),
    completed: todayDone,
    total: todayTotal,
    completedTasks: completed,
    activeTasks: active,
    unackedRules,
    lastRulesAckAt,
    openCheckIns: openCheckInsRes.count ?? 0,
    nextTeaseUnlockAt:
      (nextTease as { unlocks_at?: string } | null)?.unlocks_at ?? null,
  };

  return (
    <SlaveDashboard
      tasks={myTasks}
      stats={stats}
      activePunishments={activePunishments}
      queenAvailability={
        (queenStatusRow?.availability as QueenAvailability | null) ??
        "available"
      }
      queenStatusUpdatedAt={queenStatusRow?.updated_at ?? null}
      queenUsername={queenJoined?.username ?? "Queen"}
    />
  );
}
