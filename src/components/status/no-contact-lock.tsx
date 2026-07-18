"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  clearExpiredNoContact,
  fetchNoContactActive,
} from "@/lib/no-contact";
import { WorkEndCountdown } from "@/components/status/work-end-countdown";
import { cn } from "@/lib/utils";

/** Locks slave UI (read-only browse) while Queen status is No contact. */
export function NoContactLock({ children }: { children: React.ReactNode }) {
  const { isSlave, profile, loading } = useAuth();
  const [active, setActive] = useState(false);
  const [endsAt, setEndsAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSlave || !profile) {
      setActive(false);
      setEndsAt(null);
      return;
    }
    const supabase = createClient();
    await clearExpiredNoContact(supabase);
    const isActive = await fetchNoContactActive(supabase);
    setActive(isActive);
    if (!isActive) {
      setEndsAt(null);
      return;
    }
    const { data } = await supabase.rpc("get_queen_status");
    const row = (Array.isArray(data) ? data[0] : data) as
      | { no_contact_ends_at?: string | null }
      | undefined;
    setEndsAt(row?.no_contact_ends_at ?? null);
  }, [isSlave, profile]);

  useEffect(() => {
    if (loading || !profile) return;
    void load();
  }, [loading, profile, load]);

  useEffect(() => {
    if (!isSlave || !profile) return;
    const supabase = createClient();
    const channel = supabase
      .channel("no-contact-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_status" },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isSlave, profile, load]);

  if (!isSlave || !active) {
    return <>{children}</>;
  }

  const endMs = endsAt ? new Date(endsAt).getTime() : null;

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-red-500/40",
          "bg-gradient-to-br from-red-950/80 via-charcoal to-void p-4 sm:p-5"
        )}
        role="alert"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-500/40 bg-red-950/50">
            <Ban className="h-5 w-5 text-red-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-red-400/80">
              No contact
            </p>
            <p className="font-heading mt-1 text-xl text-ivory">
              You may not change or add anything
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Queen has set No contact. Browse only — all actions are locked
              {endMs ? " until the timer ends." : " until she changes status."}
            </p>
            {endMs ? (
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-red-300/70">
                  Ends in
                </p>
                <WorkEndCountdown
                  endAtMs={endMs}
                  compact
                  onComplete={() => void load()}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div
        className="pointer-events-none select-none opacity-70"
        aria-disabled="true"
      >
        {children}
      </div>
    </div>
  );
}
