import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task } from "@/lib/types";
import { computeStreak } from "@/lib/streak";

/**
 * Award streak milestones when current streak meets or exceeds target_days.
 */
export async function checkAndAwardStreakMilestones(
  supabase: SupabaseClient,
  tasks: Task[]
): Promise<number> {
  const streak = computeStreak(tasks);
  if (streak < 1) return 0;

  const [{ data: milestones }, { data: awards }] = await Promise.all([
    supabase.from("streak_milestones").select("id, target_days"),
    supabase.from("streak_milestone_awards").select("milestone_id"),
  ]);

  const awarded = new Set(
    (awards ?? []).map((a) => a.milestone_id as string)
  );

  const rows = (milestones ?? [])
    .filter((m) => {
      const id = m.id as string;
      const target = m.target_days as number;
      return !awarded.has(id) && streak >= target;
    })
    .map((m) => ({
      milestone_id: m.id as string,
      streak_at_award: streak,
    }));

  if (rows.length === 0) return 0;

  const { error, data } = await supabase
    .from("streak_milestone_awards")
    .insert(rows)
    .select("id");
  if (error) return 0;
  return data?.length ?? rows.length;
}
