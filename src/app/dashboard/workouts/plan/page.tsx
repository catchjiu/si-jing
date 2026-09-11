"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { createWorkoutSession, fetchQueenId } from "@/lib/workout-persist";
import { toast } from "sonner";

export default function WorkoutPlanPage() {
  const router = useRouter();
  const { profile, isSlave, loading: authLoading } = useAuth();
  const started = useRef(false);

  useEffect(() => {
    if (!isSlave && !authLoading) {
      router.replace("/dashboard/workouts");
    }
  }, [isSlave, authLoading, router]);

  useEffect(() => {
    if (authLoading || !profile || !isSlave || started.current) return;
    started.current = true;
    void (async () => {
      const supabase = createClient();
      try {
        const queenId = await fetchQueenId(supabase);
        if (!queenId) {
          toast.error("Queen account not found");
          started.current = false;
          return;
        }
        const id = await createWorkoutSession(supabase, {
          profileId: profile.id,
          queenId,
          status: "planned",
        });
        router.replace(`/dashboard/workouts/plan/${id}`);
      } catch (err) {
        started.current = false;
        toast.error(err instanceof Error ? err.message : "Could not start plan");
      }
    })();
  }, [authLoading, profile, isSlave, router]);

  if (!isSlave && !authLoading) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/workouts"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Workouts
      </Link>
      <p className="text-sm text-muted-foreground">Preparing planner…</p>
    </div>
  );
}
