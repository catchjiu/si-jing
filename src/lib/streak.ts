import type { Task } from "@/lib/types";

/**
 * Consecutive-day streak from approved tasks (same logic as dashboard).
 */
export function computeStreak(tasks: Task[]): number {
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
