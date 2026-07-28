"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { HandHeart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { RequestForm } from "@/components/requests/request-form";
import { QueenDirectiveForm } from "@/components/requests/queen-directive-form";
import { RequestCard } from "@/components/requests/request-card";
import { LocationRequestPanel } from "@/components/location/location-request-panel";
import type { DesireRequest } from "@/lib/types";

function RequestsPageInner() {
  const { isQueen, isSlave, profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const focusRequestId = searchParams.get("request");
  const [requests, setRequests] = useState<DesireRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from("requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (isSlave) {
      query = query.or(
        `requested_by.eq.${profile.id},assigned_to.eq.${profile.id}`
      );
    }

    const { data } = await query;
    setRequests((data ?? []) as DesireRequest[]);
    setLoading(false);
  }, [profile, isSlave]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  useEffect(() => {
    if (!focusRequestId || loading) return;
    const el = document.getElementById(`request-${focusRequestId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-gold/50", "ring-offset-2", "ring-offset-void");
    const t = window.setTimeout(() => {
      el.classList.remove(
        "ring-2",
        "ring-gold/50",
        "ring-offset-2",
        "ring-offset-void"
      );
    }, 3200);
    return () => window.clearTimeout(t);
  }, [focusRequestId, loading, requests.length]);

  const pending = requests.filter((r) => r.status === "pending");
  const history = requests.filter((r) => r.status !== "pending");

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading flex items-center gap-3 text-2xl text-ivory sm:text-3xl">
          <HandHeart className="h-7 w-7 text-gold" />
          Requests
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "Petitions from D, your directives to him, and location requests"
            : "Ask Queen, respond to her directives, and share location when asked"}
        </p>
      </div>

      <LocationRequestPanel />

      {isQueen && <QueenDirectiveForm onSuccess={load} />}
      {isSlave && <RequestForm onSuccess={load} />}

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">
          {isQueen ? "Awaiting response" : "Pending"}
          {pending.length > 0 ? ` (${pending.length})` : ""}
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-xl border border-gold/15 bg-charcoal/60 px-6 py-10 text-center text-sm text-muted-foreground">
            {isQueen ? "No open requests." : "No pending requests."}
          </div>
        ) : (
          <ul className="space-y-3">
            {pending.map((r) => (
              <li key={r.id}>
                <RequestCard
                  request={r}
                  isQueen={isQueen}
                  onChanged={load}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-heading text-xl text-gold">History</h2>
          <ul className="space-y-3">
            {history.map((r) => (
              <li key={r.id}>
                <RequestCard request={r} isQueen={isQueen} onChanged={load} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function RequestsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <RequestsPageInner />
    </Suspense>
  );
}
