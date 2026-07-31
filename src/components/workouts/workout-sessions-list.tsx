"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  formatVolume,
  sessionVolume,
  buildSparklineSeries,
} from "@/lib/workout-stats";
import type { WorkoutSession, WorkoutSet } from "@/lib/types";
import { WorkoutExerciseSparkline } from "@/components/workouts/workout-exercise-sparkline";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SessionCard = WorkoutSession & {
  sets: WorkoutSet[];
  spark: number[];
  volume: number;
  prCount: number;
  exerciseCount: number;
};

export function WorkoutSessionsList({ className }: { className?: string }) {
  const { profile, isSlave } = useAuth();
  const [items, setItems] = useState<SessionCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      setLoading(true);
      const supabase = createClient();
      let query = supabase
        .from("workout_sessions")
        .select("*")
        .order("performed_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30);
      if (isSlave) query = query.eq("created_by", profile.id);
      const { data } = await query;
      const rows = (data ?? []) as WorkoutSession[];
      const ids = rows.map((r) => r.id);
      let setsBySession = new Map<string, WorkoutSet[]>();
      if (ids.length > 0) {
        const { data: setRows } = await supabase
          .from("workout_sets")
          .select("*")
          .in("session_id", ids);
        for (const s of (setRows ?? []) as WorkoutSet[]) {
          const list = setsBySession.get(s.session_id) ?? [];
          list.push(s);
          setsBySession.set(s.session_id, list);
        }
      }
      setItems(
        rows.map((r) => {
          const sets = setsBySession.get(r.id) ?? [];
          const weights = sets.map((s) => Number(s.weight));
          const names = new Set(sets.map((s) => s.exercise_name));
          return {
            ...r,
            sets,
            volume: sessionVolume(
              sets.map((s) => ({ reps: s.reps, weight: Number(s.weight) }))
            ),
            prCount: sets.filter((s) => s.is_pr).length,
            exerciseCount: names.size,
            spark: buildSparklineSeries(
              weights.map((w, i) => ({
                at: String(i),
                weight: w,
              }))
            ),
          };
        })
      );
      setLoading(false);
    })();
  }, [profile, isSlave]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading sessions…</p>;
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-gold/15 bg-charcoal/60 px-6 py-10 text-center text-sm text-muted-foreground">
        No workouts logged yet.
      </p>
    );
  }

  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((s, i) => (
        <li
          key={s.id}
          className="animate-in fade-in slide-in-from-bottom-2"
          style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
        >
          <Link
            href={`/dashboard/workouts/${s.id}`}
            className="flex gap-3 rounded-xl border border-gold/15 bg-charcoal/80 p-4 transition hover:border-gold/40"
          >
            <div className="w-1 shrink-0 rounded-full bg-gold/70" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-heading text-ivory">
                  {new Date(`${s.performed_at}T12:00:00`).toLocaleDateString(
                    undefined,
                    { weekday: "short", month: "short", day: "numeric" }
                  )}
                </p>
                {s.prCount > 0 && (
                  <Badge className="bg-gold/20 text-gold border-gold/40">
                    {s.prCount} PR
                  </Badge>
                )}
                {s.queen_impressed != null && (
                  <Badge variant="outline" className="border-gold/30 text-gold">
                    Impressed {s.queen_impressed}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {s.exerciseCount} exercises · {s.sets.length} sets ·{" "}
                {formatVolume(s.volume)}
              </p>
              <WorkoutExerciseSparkline values={s.spark} className="mt-1 h-8 w-28" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
