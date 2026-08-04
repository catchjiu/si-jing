"use client";

import { Suspense } from "react";
import { Lock } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { DenialLedgerPanel } from "@/components/denial/denial-ledger-panel";

export default function DenialPage() {
  const { loading: authLoading, isQueen, isSlave } = useAuth();

  if (authLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-3 font-heading text-3xl text-ivory">
          <Lock className="h-7 w-7 text-gold" />
          Denial
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "Assign edge debt and denial days. Orgasm permission stays locked until the ledger is clear."
            : isSlave
              ? "Log edges anytime with proof. Debt logs count toward what you owe; extra logs are kept in the edge log."
              : "Edge debt and denial ledger."}
        </p>
      </div>
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading ledger…</p>
        }
      >
        <DenialLedgerPanel />
      </Suspense>
    </div>
  );
}
