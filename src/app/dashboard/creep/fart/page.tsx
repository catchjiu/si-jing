"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Wind } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { FartTrackerPanel } from "@/components/fart/fart-tracker-panel";
import { FartLikeCounter } from "@/components/fart/fart-like-counter";

export default function CreepFartPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
    >
      <CreepFartPageInner />
    </Suspense>
  );
}

function CreepFartPageInner() {
  const { isQueen, isSlave, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const focusId = searchParams.get("fart");
  const focusCommentId = searchParams.get("comment");

  if (authLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading flex items-center gap-2 text-xl text-gold">
          <Wind className="h-5 w-5" />
          Fart Tracker
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "Record, or upload audio or video — sound is extracted automatically. D rates loudness and hotness, and you can both comment."
            : isSlave
              ? "Play Queen’s farts, rate loudness and hotness, and leave a comment."
              : "Queen’s fart log."}
        </p>
      </div>
      <FartLikeCounter />
      <FartTrackerPanel focusId={focusId} focusCommentId={focusCommentId} />
    </div>
  );
}
