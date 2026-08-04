"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { WorkoutSessionLogger } from "@/components/workouts/workout-session-logger";
import { startPlannedSession } from "@/lib/workout-persist";
import { toast } from "sonner";
import type { WorkoutSession } from "@/lib/types";

export default function WorkoutLogByIdPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const { profile, isSlave, loading: authLoading } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isSlave && !authLoading) {
      router.replace("/dashboard/workouts");
    }
  }, [isSlave, authLoading, router]);

  useEffect(() => {
    if (authLoading || !profile || !isSlave || !id) return;
    void (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("workout_sessions")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        toast.error("Session not found");
        router.replace("/dashboard/workouts");
        return;
      }
      const session = data as WorkoutSession;
      if (session.created_by !== profile.id) {
        router.replace("/dashboard/workouts");
        return;
      }
      if (session.status === "completed" || session.status === "skipped") {
        router.replace(`/dashboard/workouts/${id}`);
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
  }, [authLoading, profile, isSlave, id, router]);

  if (authLoading || !isSlave || !ready) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
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
        <WorkoutSessionLogger sessionId={id} mode="log" />
      </section>
    </div>
  );
}
