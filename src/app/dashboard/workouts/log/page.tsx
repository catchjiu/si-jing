"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { createWorkoutSession, fetchQueenId } from "@/lib/workout-persist";
import { toast } from "sonner";

export default function WorkoutLogPage() {
  const router = useRouter();
  const { profile, isSlave, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!isSlave && !authLoading) {
      router.replace("/dashboard/workouts");
    }
  }, [isSlave, authLoading, router]);

  useEffect(() => {
    if (authLoading || !profile || !isSlave) return;
    void (async () => {
      const supabase = createClient();

      const { data: existing } = await supabase
        .from("workout_sessions")
        .select("id")
        .eq("created_by", profile.id)
        .eq("status", "in_progress")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        router.replace(`/dashboard/workouts/log/${(existing as { id: string }).id}`);
        return;
      }

      try {
        const queenId = await fetchQueenId(supabase);
        if (!queenId) {
          toast.error("Queen account not found");
          return;
        }
        const id = await createWorkoutSession(supabase, {
          profileId: profile.id,
          queenId,
          status: "in_progress",
        });
        router.replace(`/dashboard/workouts/log/${id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not start session");
      }
    })();
  }, [authLoading, profile, isSlave, router]);

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/workouts"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Workouts
      </Link>
      <p className="text-sm text-muted-foreground">Starting session…</p>
    </div>
  );
}
