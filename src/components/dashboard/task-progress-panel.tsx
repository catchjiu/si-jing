"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isSameDay, parseISO } from "date-fns";
import { ChevronRight, Play, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dayProgress } from "@/lib/day-groups";
import { formatRelative } from "@/lib/format";
import type { Task, TaskWithRelations } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/tasks/status-badge";
import { TaskElapsedDisplay } from "@/components/tasks/task-begin-button";

interface TaskProgressPanelProps {
  tasks: TaskWithRelations[];
  slaveId?: string;
  className?: string;
}

function sortByActivity(tasks: Task[]): Task[] {
  const priority: Record<Task["status"], number> = {
    in_progress: 0,
    submitted: 1,
    failed: 1,
    pending: 2,
    rejected: 3,
    approved: 4,
  };

  return [...tasks].sort((a, b) => {
    const byStatus = priority[a.status] - priority[b.status];
    if (byStatus !== 0) return byStatus;
    if (a.status === "in_progress" && a.started_at && b.started_at) {
      return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
    }
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

function progressHint(task: Task): string | null {
  if (task.status === "in_progress" && task.started_at) {
    return `Started ${formatRelative(task.started_at)}`;
  }
  if (task.status === "submitted") {
    return `Finished ${formatRelative(task.updated_at)} · awaiting review`;
  }
  if (task.status === "failed") {
    return `Failed ${formatRelative(task.updated_at)} · apology sent`;
  }
  if (task.status === "approved") {
    return `Completed ${formatRelative(task.updated_at)}`;
  }
  if (task.status === "rejected") {
    return `Rejected ${formatRelative(task.updated_at)}`;
  }
  return null;
}

export function TaskProgressPanel({
  tasks: initialTasks,
  slaveId,
  className,
}: TaskProgressPanelProps) {
  const [tasks, setTasks] = useState(initialTasks);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  useEffect(() => {
    if (!slaveId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`queen-task-progress:${slaveId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `assigned_to=eq.${slaveId}`,
        },
        (payload) => {
          const row = payload.new as Task | undefined;
          if (!row?.deadline) return;

          const today = new Date();
          if (!isSameDay(parseISO(row.deadline), today)) return;

          setTasks((prev) => {
            const idx = prev.findIndex((t) => t.id === row.id);
            if (payload.eventType === "DELETE") {
              return idx === -1 ? prev : prev.filter((t) => t.id !== row.id);
            }
            const next = { ...(idx === -1 ? {} : prev[idx]), ...row };
            if (idx === -1) return sortByActivity([...prev, next as TaskWithRelations]);
            const copy = [...prev];
            copy[idx] = { ...copy[idx], ...row };
            return sortByActivity(copy);
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [slaveId]);

  const todayTasks = sortByActivity(
    tasks.filter((t) => isSameDay(parseISO(t.deadline), new Date()))
  );

  const { done, total } = dayProgress(todayTasks);
  const completionRate = total === 0 ? 0 : Math.round((done / total) * 100);
  const inProgress = todayTasks.filter((t) => t.status === "in_progress");

  if (todayTasks.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-gold/15 bg-charcoal/80 p-4",
          className
        )}
      >
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Task progress
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          No duties due today.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-gold/15 bg-charcoal/80 p-4",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Task progress
          </p>
          <p className="mt-1 font-heading text-lg text-ivory">
            {done}/{total} done{" "}
            <span className="text-gold tabular-nums">{completionRate}%</span>
          </p>
        </div>
        <Link
          href="/dashboard/tasks"
          className="inline-flex shrink-0 items-center gap-1 text-xs text-gold hover:underline"
        >
          View all
          <ChevronRight className="size-3.5" />
        </Link>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-void/60">
        <div
          className="h-full rounded-full bg-gold transition-all duration-500"
          style={{ width: `${completionRate}%` }}
        />
      </div>

      {inProgress.length > 0 && (
        <div className="mt-4 space-y-2">
          {inProgress.map((task) => (
            <Link
              key={task.id}
              href={`/dashboard/task/${task.id}`}
              className="flex items-center gap-3 rounded-lg border border-gold/25 bg-gold/5 px-3 py-3 transition-colors hover:border-gold/40"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold/15">
                <Play className="size-4 text-gold" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ivory">{task.title}</p>
                <p className="mt-0.5 text-xs text-gold">
                  {progressHint(task)}
                </p>
              </div>
              <TaskElapsedDisplay startedAt={task.started_at ?? null} />
            </Link>
          ))}
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {todayTasks
          .filter((t) => t.status !== "in_progress")
          .map((task) => {
            const hint = progressHint(task);
            const isDone = ["approved", "submitted"].includes(task.status);

            return (
              <li key={task.id}>
                <Link
                  href={`/dashboard/task/${task.id}`}
                  className="flex items-center gap-3 rounded-lg border border-gold/10 bg-charcoal/50 px-3 py-2.5 transition-colors hover:border-gold/25 hover:bg-charcoal/70"
                >
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full",
                      isDone ? "bg-emerald-500/15" : "bg-royal/25"
                    )}
                  >
                    {isDone ? (
                      <CheckCircle2 className="size-3.5 text-emerald-400" />
                    ) : (
                      <span className="size-2 rounded-full bg-muted-foreground/50" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ivory">{task.title}</p>
                    {hint && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {hint}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={task.status} type="task" />
                </Link>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
