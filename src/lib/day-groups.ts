import {
  format,
  isSameDay,
  isTomorrow,
  isYesterday,
  parseISO,
  startOfDay,
} from "date-fns";
import type { Task } from "@/lib/types";

export type DayGroup = {
  dateKey: string;
  date: Date;
  label: string;
  shortLabel: string;
  isToday: boolean;
  isPast: boolean;
  tasks: Task[];
};

export function groupTasksByDay(tasks: Task[]): DayGroup[] {
  const map = new Map<string, DayGroup>();

  const sorted = [...tasks].sort(
    (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  );

  for (const task of sorted) {
    const date = parseISO(task.deadline);
    const dateKey = format(date, "yyyy-MM-dd");
    const existing = map.get(dateKey);
    if (existing) {
      existing.tasks.push(task);
      continue;
    }

    const today = new Date();
    const isToday = isSameDay(date, today);
    let label: string;
    if (isToday) label = "Today";
    else if (isTomorrow(date)) label = "Tomorrow";
    else if (isYesterday(date)) label = "Yesterday";
    else label = format(date, "EEEE");

    map.set(dateKey, {
      dateKey,
      date: startOfDay(date),
      label,
      shortLabel: format(date, "MMM d"),
      isToday,
      isPast: startOfDay(date) < startOfDay(today) && !isToday,
      tasks: [task],
    });
  }

  return Array.from(map.values());
}

export function dayProgress(tasks: Task[]) {
  const done = tasks.filter((t) =>
    ["approved", "submitted"].includes(t.status)
  ).length;
  const total = tasks.length;
  return { done, total, remaining: total - done };
}
