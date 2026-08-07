"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Dumbbell, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { workoutStatusLabel } from "@/lib/workout-persist";
import type { WorkoutSession } from "@/lib/types";
import { WorkoutDeleteButton } from "@/components/workouts/workout-delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function WorkoutActiveSessions() {
  const { profile, isSlave } = useAuth();
  const [items, setItems] = useState<WorkoutSession[]>([]);

  useEffect(() => {
    if (!profile || !isSlave) return;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("workout_sessions")
        .select("*")
        .eq("created_by", profile.id)
        .in("status", ["planned", "in_progress"])
        .order("performed_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5);
      setItems((data ?? []) as WorkoutSession[]);
    })();
  }, [profile, isSlave]);

  if (!isSlave || items.length === 0) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-gold/25 bg-gold/5 p-4">
      <h2 className="font-heading flex items-center gap-2 text-lg text-gold">
        <CalendarClock className="h-5 w-5" />
        Continue or start
      </h2>
      <ul className="space-y-2">
        {items.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/15 bg-charcoal/70 px-4 py-3"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-ivory">
                  {new Date(`${s.performed_at}T12:00:00`).toLocaleDateString(
                    undefined,
                    { weekday: "short", month: "short", day: "numeric" }
                  )}
                </p>
                <Badge
                  variant="outline"
                  className={
                    s.status === "in_progress"
                      ? "border-emerald-400/40 text-emerald-300"
                      : "border-gold/40 text-gold"
                  }
                >
                  {workoutStatusLabel(s.status)}
                </Badge>
              </div>
              {s.notes && (
                <p className="truncate text-xs text-muted-foreground">{s.notes}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                asChild
                size="sm"
                className="bg-gold text-void hover:bg-gold-muted"
              >
                <Link href={`/dashboard/workouts/log/${s.id}`}>
                  {s.status === "planned" ? (
                    <>
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                      Start
                    </>
                  ) : (
                    <>
                      <Dumbbell className="mr-1.5 h-3.5 w-3.5" />
                      Continue
                    </>
                  )}
                </Link>
              </Button>
              <WorkoutDeleteButton
                sessionId={s.id}
                status={s.status}
                onDeleted={() =>
                  setItems((prev) => prev.filter((item) => item.id !== s.id))
                }
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
