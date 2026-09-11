"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { WorkoutSessionLogger } from "@/components/workouts/workout-session-logger";
import { WorkoutCommentThread } from "@/components/workouts/workout-comment-thread";
import { QUEEN_WORKOUTS_PATH, startPlannedSession } from "@/lib/workout-persist";
import { toast } from "sonner";
import type { WorkoutSession } from "@/lib/types";

export default function QueenWorkoutLogByIdPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const { profile, isQueen, loading: authLoading } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isQueen && !authLoading) {
      router.replace(QUEEN_WORKOUTS_PATH);
    }
  }, [isQueen, authLoading, router]);

  useEffect(() => {
    if (authLoading || !profile || !isQueen || !id) return;
    void (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("workout_sessions")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        toast.error("Session not found");
        router.replace(QUEEN_WORKOUTS_PATH);
        return;
      }
      const session = data as WorkoutSession;
      if (session.athlete_role !== "queen") {
        router.replace(`/dashboard/workouts/${id}`);
        return;
      }
      if (session.status === "completed" || session.status === "skipped") {
        router.replace(`${QUEEN_WORKOUTS_PATH}/${id}`);
        return;
      }
      if (session.status === "planned") {
        try {
          await startPlannedSession(supabase, id);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not start plan");
          return;
        }
      }
      setReady(true);
    })();
  }, [authLoading, profile, isQueen, id, router]);

  if (authLoading || !isQueen || !ready) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <Link
        href={QUEEN_WORKOUTS_PATH}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Queen Workouts
      </Link>
      <section className="rounded-2xl border border-gold/20 bg-charcoal/80 p-5 shadow-[0_0_32px_rgba(212,175,55,0.06)]">
        <WorkoutSessionLogger sessionId={id} mode="log" athleteRole="queen" />
      </section>
      <WorkoutCommentThread sessionId={id} sessionLabel="This workout" />
    </div>
  );
}
