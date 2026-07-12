import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Task } from "@/lib/types";

type Client = SupabaseClient<Database>;

/** Generate dated occurrences for recurring templates (daily/weekly/monthly). */
export async function ensureRecurringOccurrences(
  supabase: Client,
  lookAheadDays = 7
) {
  await supabase.rpc("ensure_recurring_task_occurrences", {
    look_ahead_days: lookAheadDays,
  });
}

/**
 * Active list tasks: one-offs + dated occurrences.
 * Hides recurring templates (series definitions).
 * Always sorted by deadline ascending.
 */
export function isListableTask(task: Task): boolean {
  if (task.parent_task_id) return true;
  if (task.is_recurring) return false;
  return true;
}

export function sortTasksByDeadline<T extends { deadline: string }>(
  tasks: T[]
): T[] {
  return [...tasks].sort(
    (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  );
}

export function filterListableTasks(tasks: Task[]): Task[] {
  return sortTasksByDeadline(tasks.filter(isListableTask));
}

export function recurrenceLabel(task: Task): string | null {
  if (!task.recurrence_pattern && !task.parent_task_id) return null;
  const pattern = task.recurrence_pattern;
  if (!pattern) return task.parent_task_id ? "Recurring" : null;
  if (pattern === "daily") return "Daily";
  if (pattern === "weekly") return "Weekly";
  if (pattern === "monthly") return "Monthly";
  return pattern;
}
