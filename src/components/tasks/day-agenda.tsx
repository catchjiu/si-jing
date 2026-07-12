"use client";

import Link from "next/link";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import type { Task } from "@/lib/types";
import { dayProgress, groupTasksByDay } from "@/lib/day-groups";
import { recurrenceLabel } from "@/lib/tasks";
import { formatDeadline, isOverdue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/tasks/status-badge";
import { Countdown } from "@/components/tasks/countdown";
import { Badge } from "@/components/ui/badge";

interface DayAgendaProps {
  tasks: Task[];
  /** Only show open duties (exclude approved/rejected) */
  activeOnly?: boolean;
  className?: string;
}

function TaskRow({ task }: { task: Task }) {
  const overdue = isOverdue(task.deadline) && task.status !== "approved";
  const recur = recurrenceLabel(task);
  const done = task.status === "approved";
  const submitted = task.status === "submitted";

  return (
    <Link
      href={`/dashboard/task/${task.id}`}
      className={cn(
        "group flex items-start gap-3 rounded-lg border px-3 py-3 transition-all duration-200",
        overdue
          ? "border-red-500/35 bg-red-950/20 hover:border-red-500/55"
          : done
            ? "border-emerald-500/20 bg-emerald-950/10 hover:border-emerald-500/40"
            : "border-gold/10 bg-void/40 hover:border-gold/30 hover:bg-void/70"
      )}
    >
      <div className="mt-0.5 shrink-0 text-muted-foreground">
        {done ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
        ) : submitted ? (
          <Clock className="h-5 w-5 text-gold" />
        ) : (
          <Circle
            className={cn("h-5 w-5", overdue ? "text-red-400" : "text-gold/50")}
          />
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              "font-medium text-ivory group-hover:text-gold transition-colors",
              done && "text-ivory/60 line-through decoration-ivory/30"
            )}
          >
            {task.title}
          </p>
          {recur && (
            <Badge
              variant="outline"
              className="border-royal/50 bg-royal/20 text-[10px] uppercase tracking-wider text-ivory/70"
            >
              {recur}
            </Badge>
          )}
          <StatusBadge status={task.status} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Due {formatDeadline(task.deadline).replace(/, \d{4}/, "")}</span>
          <Countdown
            deadline={task.deadline}
            showLabels={false}
            className={cn(
              "font-mono",
              overdue ? "text-red-400" : "text-gold/80"
            )}
          />
        </div>
      </div>
    </Link>
  );
}

export function DayAgenda({
  tasks,
  activeOnly = true,
  className,
}: DayAgendaProps) {
  const source = activeOnly
    ? tasks.filter((t) => !["approved", "rejected"].includes(t.status))
    : tasks;

  const groups = groupTasksByDay(source);

  if (groups.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-gold/15 bg-charcoal/60 px-6 py-12 text-center text-sm text-muted-foreground",
          className
        )}
      >
        No duties on the schedule.
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      {groups.map((day) => {
        const { done, total } = dayProgress(day.tasks);
        return (
          <section
            key={day.dateKey}
            className={cn(
              "overflow-hidden rounded-xl border",
              day.isToday
                ? "border-gold/40 bg-charcoal/90 glow-gold"
                : day.isPast
                  ? "border-red-500/25 bg-charcoal/70"
                  : "border-gold/15 bg-charcoal/70"
            )}
          >
            <header
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5 sm:gap-3 sm:px-5 sm:py-3",
                day.isToday
                  ? "border-gold/25 bg-gold/10"
                  : day.isPast
                    ? "border-red-500/20 bg-red-950/20"
                    : "border-gold/10 bg-void/30"
              )}
            >
              <div className="flex min-w-0 items-baseline gap-2 sm:gap-3">
                <h3
                  className={cn(
                    "font-heading text-lg sm:text-xl",
                    day.isToday
                      ? "text-gold"
                      : day.isPast
                        ? "text-red-300"
                        : "text-ivory"
                  )}
                >
                  {day.label}
                </h3>
                <span className="text-xs text-muted-foreground sm:text-sm">
                  {day.shortLabel}
                </span>
              </div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground sm:text-xs">
                {done}/{total} done
                {day.isToday && total - done > 0
                  ? ` · ${total - done} left`
                  : ""}
              </p>
            </header>

            <ul className="space-y-2 p-2.5 sm:p-4">
              {day.tasks.map((task) => (
                <li key={task.id}>
                  <TaskRow task={task} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
