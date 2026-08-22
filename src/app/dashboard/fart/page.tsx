"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Wind } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { FartTrackerPanel } from "@/components/fart/fart-tracker-panel";
import { FartLikeCounter } from "@/components/fart/fart-like-counter";

export default function FartTrackerPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <FartTrackerPageInner />
    </Suspense>
  );
}

function FartTrackerPageInner() {
  const { isQueen, isSlave, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const focusId = searchParams.get("fart");

  if (authLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading flex items-center gap-3 text-2xl text-ivory sm:text-3xl">
          <Wind className="h-7 w-7 text-gold" />
          Fart Tracker
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "Record an audio note of your fart. D gets a push when you save it."
            : isSlave
              ? "Queen’s fart log — play each entry when she records one."
              : "Queen’s fart log."}
        </p>
      </div>
      <FartLikeCounter />
      <FartTrackerPanel focusId={focusId} />
    </div>
  );
}
