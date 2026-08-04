"use client";

import { Dumbbell } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { BodyRatingsPanel } from "@/components/workouts/body-ratings-panel";
import { WorkoutWeeklyProgress } from "@/components/workouts/workout-weekly-progress";
import { WorkoutSessionsList } from "@/components/workouts/workout-sessions-list";
import { WorkoutActiveSessions } from "@/components/workouts/workout-active-sessions";
import { WorkoutActionButtons } from "@/components/workouts/workout-action-buttons";

export default function WorkoutsPage() {
  const { isQueen, isSlave, loading: authLoading } = useAuth();

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
              : "Plan ahead, log training, or mark rest days — everything saves as you go"}
          </p>
        </div>
        {isSlave && <WorkoutActionButtons />}
      </div>

      {isSlave && <WorkoutActiveSessions />}

      <BodyRatingsPanel />

      <WorkoutWeeklyProgress />

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">Sessions</h2>
        <WorkoutSessionsList />
      </section>
    </div>
  );
}
