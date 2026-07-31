"use client";

import { useState } from "react";
import { Dumbbell } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { BodyRatingsPanel } from "@/components/workouts/body-ratings-panel";
import { WorkoutWeeklyProgress } from "@/components/workouts/workout-weekly-progress";
import { WorkoutSessionsList } from "@/components/workouts/workout-sessions-list";
import { WorkoutSessionForm } from "@/components/workouts/workout-session-form";
import { Button } from "@/components/ui/button";

export default function WorkoutsPage() {
  const { isQueen, isSlave, loading: authLoading } = useAuth();
  const [logging, setLogging] = useState(false);

  if (authLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading flex items-center gap-3 text-2xl text-ivory sm:text-3xl">
            <Dumbbell className="h-7 w-7 text-gold" />
            Workouts
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isQueen
              ? "Rate his body, review sessions, and watch progress over time"
              : "See Queen’s ratings, log training, and add weekly progress pics"}
          </p>
        </div>
        {isSlave && (
          <Button
            type="button"
            onClick={() => setLogging((v) => !v)}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {logging ? "Close logger" : "Log workout"}
          </Button>
        )}
      </div>

      <BodyRatingsPanel />

      <WorkoutWeeklyProgress />

      {isSlave && logging && (
        <section className="space-y-3 rounded-2xl border border-gold/20 bg-charcoal/80 p-5 shadow-[0_0_32px_rgba(212,175,55,0.06)]">
          <h2 className="font-heading text-xl text-gold">Log workout</h2>
          <WorkoutSessionForm />
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">Sessions</h2>
        <WorkoutSessionsList />
      </section>
    </div>
  );
}
