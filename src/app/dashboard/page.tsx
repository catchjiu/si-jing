import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QueenDashboard } from "@/components/dashboard/queen-dashboard";
import { SlaveDashboard } from "@/components/dashboard/slave-dashboard";
import {
  ensureRecurringOccurrences,
  filterListableTasks,
} from "@/lib/tasks";
import type {
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

  if (profile.role === "queen") {
    const { data: submissionsData } = await supabase
      .from("submissions")
      .select("*, task:tasks(*), media:submission_media(*)")
      .order("submitted_at", { ascending: false })
      .limit(8);

    const submissions = (submissionsData ?? []) as SubmissionWithRelations[];
    const pendingSubmissions = submissions.filter(
      (s) => s.status === "pending"
    ).length;
    const completed = tasks.filter((t) => t.status === "approved").length;
    const stats: QueenDashboardStats = {
      tasksAssigned: tasks.length,
      pendingSubmissions,
      completionRate:
        tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100),
    };

    return (
      <QueenDashboard
        tasks={tasks}
        submissions={submissions}
        stats={stats}
      />
    );
  }

  const myTasks = tasks.filter((t) => t.assigned_to === profile.id);
  const completed = myTasks.filter((t) => t.status === "approved").length;
  const active = myTasks.filter(
    (t) => !["approved", "rejected"].includes(t.status)
  ).length;

  await supabase.rpc("complete_expired_punishments");

  const { data: punishmentData } = await supabase
    .from("punishments")
    .select("*")
    .eq("issued_to", profile.id)
    .eq("punishment_type", "contact_restriction")
    .eq("status", "active")
    .gt("ends_at", new Date().toISOString())
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const stats: SlaveDashboardStats = {
    completionRate:
      myTasks.length === 0 ? 0 : Math.round((completed / myTasks.length) * 100),
    streak: computeStreak(myTasks),
    completed,
    total: myTasks.length,
    completedTasks: completed,
    activeTasks: active,
  };

  return (
    <SlaveDashboard
      tasks={myTasks}
      stats={stats}
      activeContactRestriction={(punishmentData as Punishment | null) ?? null}
    />
  );
}
