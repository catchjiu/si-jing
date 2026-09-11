"use client";

import { Crown } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { WorkoutSessionsList } from "@/components/workouts/workout-sessions-list";
import { WorkoutActiveSessions } from "@/components/workouts/workout-active-sessions";
import { WorkoutActionButtons } from "@/components/workouts/workout-action-buttons";

export default function QueenWorkoutsPage() {
  const { isQueen, isSlave, loading: authLoading } = useAuth();

  if (authLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading flex items-center gap-3 text-2xl text-ivory sm:text-3xl">
            <Crown className="h-7 w-7 text-gold" />
            Queen Workouts
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isQueen
              ? "Log the sessions slave planned for you. Add a comment or video when you finish."
              : "Plan Queen’s training and attach a form video whenever an exercise needs one."}
          </p>
        </div>
        {isSlave && <WorkoutActionButtons athleteRole="queen" />}
      </div>

      <WorkoutActiveSessions athleteRole="queen" />

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">Sessions</h2>
        <WorkoutSessionsList athleteRole="queen" />
      </section>
    </div>
  );
}
