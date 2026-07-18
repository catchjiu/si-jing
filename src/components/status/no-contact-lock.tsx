"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { clearExpiredNoContact } from "@/lib/no-contact";
import { WorkEndCountdown } from "@/components/status/work-end-countdown";
import { cn } from "@/lib/utils";

type SlaveWriteLock = {
  active: boolean;
  source?: "no_contact" | "contact_restriction";
  title?: string;
  body?: string;
  ends_at?: string | null;
  punishment_id?: string;
};

/** Locks slave UI (read-only browse) for Queen No contact or Contact restriction. */
export function NoContactLock({ children }: { children: React.ReactNode }) {
  const { isSlave, profile, loading } = useAuth();
  const [lock, setLock] = useState<SlaveWriteLock>({ active: false });

  const load = useCallback(async () => {
    if (!isSlave || !profile) {
      setLock({ active: false });
      return;
    }
    const supabase = createClient();
    await clearExpiredNoContact(supabase);
    const { data, error } = await supabase.rpc("get_slave_write_lock");
    if (error) {
      console.error("get_slave_write_lock", error);
      setLock({ active: false });
      return;
    }
    const row = (data ?? {}) as SlaveWriteLock;
    setLock({
      active: Boolean(row.active),
      source: row.source,
      title: row.title,
      body: row.body,
      ends_at: row.ends_at ?? null,
      punishment_id: row.punishment_id,
    });
  }, [isSlave, profile]);

  useEffect(() => {
    if (loading || !profile) return;
    void load();
  }, [loading, profile, load]);

  useEffect(() => {
    if (!isSlave || !profile) return;
    const supabase = createClient();
    const channel = supabase
      .channel("slave-write-lock")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_status" },
        () => {
          void load();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "punishments" },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isSlave, profile, load]);

  if (!isSlave || !lock.active) {
    return <>{children}</>;
  }

  const endMs = lock.ends_at ? new Date(lock.ends_at).getTime() : null;
  const eyebrow =
    lock.source === "contact_restriction" ? "Contact restriction" : "No contact";

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
              {eyebrow}
            </p>
            <p className="font-heading mt-1 text-xl text-ivory">
              {lock.title || "You may not change or add anything"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {lock.body ||
                "Browse only — all actions are locked until this ends."}
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
