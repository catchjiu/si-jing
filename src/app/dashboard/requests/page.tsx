"use client";

import { useCallback, useEffect, useState } from "react";
import { HandHeart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { RequestForm } from "@/components/requests/request-form";
import { RequestCard } from "@/components/requests/request-card";
import type { DesireRequest } from "@/lib/types";

export default function RequestsPage() {
  const { isQueen, isSlave, profile, loading: authLoading } = useAuth();
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
      query = query.eq("requested_by", profile.id);
    }

    const { data } = await query;
    setRequests((data ?? []) as DesireRequest[]);
    setLoading(false);
  }, [profile, isSlave]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

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
            ? "Petitions from D — desire shown on each"
            : "Ask Queen for what you need, and how badly"}
        </p>
      </div>

      {isSlave && <RequestForm onSuccess={load} />}

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">
          {isQueen ? "Awaiting your word" : "Pending"}
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
