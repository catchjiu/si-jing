"use client";

import type { Task } from "@/lib/types";
import { dayProgress, groupTasksByDay } from "@/lib/day-groups";
import { cn } from "@/lib/utils";
import { SwipeableTaskRow } from "@/components/tasks/swipeable-task-row";

interface DayAgendaProps {
  tasks: Task[];
  /** Only show open duties (exclude approved/rejected) */
  activeOnly?: boolean;
  className?: string;
  /** Called after swipe delete or complete */
  onTasksChange?: () => void;
}

export function DayAgenda({
  tasks,
  activeOnly = true,
  className,
  onTasksChange,
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
                  <SwipeableTaskRow task={task} onAction={onTasksChange} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
