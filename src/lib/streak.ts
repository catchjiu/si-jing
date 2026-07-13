import type { Task } from "@/lib/types";

function startOfLocalDay(iso: string | Date): Date {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Consecutive calendar days with at least one approved task.
 * Multiple approvals on the same day count as one day.
 */
export function computeStreak(tasks: Task[]): number {
  const dayMs = 24 * 60 * 60 * 1000;
  const uniqueDays = new Map<number, Date>();

  for (const task of tasks) {
    if (task.status !== "approved") continue;
    const day = startOfLocalDay(task.updated_at);
    uniqueDays.set(day.getTime(), day);
  }

  if (uniqueDays.size === 0) return 0;

  const days = Array.from(uniqueDays.values()).sort(
    (a, b) => b.getTime() - a.getTime()
  );

  const today = startOfLocalDay(new Date());
  const newest = days[0];
  const gapFromToday = Math.round(
    (today.getTime() - newest.getTime()) / dayMs
  );
  // Streak is alive if there was an approval today or yesterday
  if (gapFromToday > 1) return 0;

  let streak = 1;
  let cursor = newest;

  for (let i = 1; i < days.length; i++) {
    const day = days[i];
    const diff = Math.round((cursor.getTime() - day.getTime()) / dayMs);
    if (diff === 1) {
      streak += 1;
      cursor = day;
    } else {
      break;
    }
  }

  return streak;
}
