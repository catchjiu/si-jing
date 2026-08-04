"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Moon } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { WorkoutRestDayForm } from "@/components/workouts/workout-rest-day-form";

export default function WorkoutRestPage() {
  const router = useRouter();
  const { isSlave, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!isSlave && !authLoading) {
      router.replace("/dashboard/workouts");
    }
  }, [isSlave, authLoading, router]);

  if (authLoading || !isSlave) {
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
        <h1 className="font-heading mb-4 flex items-center gap-2 text-xl text-gold">
          <Moon className="h-5 w-5" />
          No workout / rest day
        </h1>
        <WorkoutRestDayForm />
      </section>
    </div>
  );
}
