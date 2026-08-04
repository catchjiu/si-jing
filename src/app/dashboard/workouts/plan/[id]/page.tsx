"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { WorkoutSessionLogger } from "@/components/workouts/workout-session-logger";

export default function WorkoutPlanEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const { isSlave, loading: authLoading } = useAuth();

  if (!authLoading && !isSlave) {
    router.replace("/dashboard/workouts");
    return null;
  }

  if (authLoading || !id) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/dashboard/workouts/${id}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" /> Back to plan
      </Link>
      <section className="rounded-2xl border border-gold/20 bg-charcoal/80 p-5 shadow-[0_0_32px_rgba(212,175,55,0.06)]">
        <WorkoutSessionLogger sessionId={id} mode="plan" />
      </section>
    </div>
  );
}
