"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { WorkoutSessionLogger } from "@/components/workouts/workout-session-logger";
import { createWorkoutSession, fetchQueenId } from "@/lib/workout-persist";
import { toast } from "sonner";

export default function WorkoutPlanPage() {
  const router = useRouter();
  const { profile, isSlave, loading: authLoading } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    if (!isSlave && !authLoading) {
      router.replace("/dashboard/workouts");
    }
  }, [isSlave, authLoading, router]);

  useEffect(() => {
    if (authLoading || !profile || !isSlave) return;
    void (async () => {
      setBooting(true);
      const supabase = createClient();
      try {
        const queenId = await fetchQueenId(supabase);
        if (!queenId) {
          toast.error("Queen account not found");
          return;
        }
        const id = await createWorkoutSession(supabase, {
          profileId: profile.id,
          queenId,
          status: "planned",
        });
        setSessionId(id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not start plan");
      } finally {
        setBooting(false);
      }
    })();
  }, [authLoading, profile, isSlave]);

  if (authLoading || !isSlave || booting) {
    return <p className="text-sm text-muted-foreground">Preparing planner…</p>;
  }

  if (!sessionId) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/workouts"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <p className="text-sm text-muted-foreground">Could not start planning.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/workouts"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Workouts
      </Link>
      <section className="rounded-2xl border border-gold/20 bg-charcoal/80 p-5 shadow-[0_0_32px_rgba(212,175,55,0.06)]">
        <WorkoutSessionLogger sessionId={sessionId} mode="plan" />
      </section>
    </div>
  );
}
