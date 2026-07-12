import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/tasks/status-badge";
import { Countdown } from "@/components/tasks/countdown";
import { SubmissionForm } from "@/components/submissions/submission-form";
import { formatDeadline, DIFFICULTY_LABELS } from "@/lib/format";
import { recurrenceLabel } from "@/lib/tasks";
import { formatRoleSpeech } from "@/lib/role-speech";
import type {
  DifficultyLevel,
  Profile,
  SubmissionWithRelations,
  Task,
} from "@/lib/types";
import { TaskDetailActions } from "@/components/tasks/task-detail-actions";
import { Badge } from "@/components/ui/badge";
import { VoiceNotes } from "@/components/voice/voice-notes";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: taskData } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single();

  if (!taskData) notFound();
  const task = taskData as Task;

  // Recurring templates aren't submitted against — send to today's occurrence
  if (task.is_recurring && !task.parent_task_id) {
    const { data: todayOcc } = await supabase
      .from("tasks")
      .select("id")
      .eq("parent_task_id", task.id)
      .order("deadline", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (todayOcc) redirect(`/dashboard/task/${todayOcc.id}`);
  }

  const recur = recurrenceLabel(task);

  const { data: submissionsData } = await supabase
    .from("submissions")
    .select("*, media:submission_media(*)")
    .eq("task_id", id)
    .order("submitted_at", { ascending: false });

  const submissions = (submissionsData ?? []) as SubmissionWithRelations[];
  const isQueen = profile.role === "queen";
  const isAssignee = task.assigned_to === profile.id;
  const canSubmit =
    isAssignee && !["approved"].includes(task.status);

  return (
    <div className="space-y-8">
      <Link
        href="/dashboard/tasks"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" />
        Tasks
      </Link>

      <div className="rounded-xl border border-gold/15 bg-charcoal/80 p-6 md:p-8 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl text-ivory">
              {formatRoleSpeech(task.title, "queen")}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StatusBadge status={task.status} />
              {task.difficulty_level && (
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {DIFFICULTY_LABELS[task.difficulty_level as DifficultyLevel]}
                </span>
              )}
              {recur && (
                <Badge
                  variant="outline"
                  className="border-royal/50 bg-royal/20 text-[10px] uppercase tracking-wider text-ivory/80"
                >
                  {recur}
                  {task.occurrence_key ? ` · ${task.occurrence_key}` : ""}
                </Badge>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Deadline
            </p>
            <p className="text-sm text-ivory mt-1">
              {formatDeadline(task.deadline)}
            </p>
            <div className="mt-2">
              <Countdown deadline={task.deadline} />
            </div>
          </div>
        </div>

        {task.description && (
          <p className="text-sm leading-relaxed text-ivory/80 whitespace-pre-wrap border-t border-gold/10 pt-4">
            {formatRoleSpeech(task.description, "queen")}
          </p>
        )}

        {isQueen && <TaskDetailActions task={task} />}
      </div>

      {canSubmit && (
        <section className="space-y-4">
          <h2 className="font-heading text-xl text-gold">Submit Proof</h2>
          <SubmissionForm taskId={task.id} />
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">
          Submissions ({submissions.length})
        </h2>
        {submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No submissions yet.</p>
        ) : (
          <ul className="space-y-3">
            {submissions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/dashboard/submissions/${s.id}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-gold/10 bg-void/40 px-4 py-3 transition-colors hover:border-gold/30"
                >
                  <div>
                    <p className="text-sm text-ivory">
                      {s.submission_text?.slice(0, 80) || "Submission"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDeadline(s.submitted_at)}
                    </p>
                  </div>
                  <StatusBadge status={s.status} type="submission" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <VoiceNotes entityType="task" entityId={task.id} />
    </div>
  );
}
