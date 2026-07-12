"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, Check, Unlock, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { PunishmentForm } from "@/components/punishments/punishment-form";
import {
  ContactRestrictionBanner,
  PunishmentCountdown,
} from "@/components/punishments/punishment-countdown";
import { formatDeadline, formatRelative } from "@/lib/format";
import {
  isPunishmentActive,
  PUNISHMENT_TYPE_LABELS,
  tasksRequired,
} from "@/lib/punishments";
import type { Profile, Punishment } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function typeLabel(type: Punishment["punishment_type"]) {
  return PUNISHMENT_TYPE_LABELS[type] ?? type;
}

function statusClass(status: Punishment["status"]) {
  if (status === "active") return "border-red-500/40 text-red-300";
  if (status === "pending") return "border-amber-500/40 text-amber-300";
  if (status === "lifted") return "border-gold/40 text-gold";
  return "border-muted text-muted-foreground";
}

function normalizePunishment(row: Record<string, unknown>): Punishment {
  return {
    ...(row as unknown as Punishment),
    config: (row.config as Punishment["config"]) ?? {},
    acknowledged_at: (row.acknowledged_at as string | null) ?? null,
    clearance_mode:
      (row.clearance_mode as Punishment["clearance_mode"]) ?? "timed",
  };
}

export default function PunishmentsPage() {
  const { isQueen, isSlave, profile, loading: authLoading } = useAuth();
  const [punishments, setPunishments] = useState<Punishment[]>([]);
  const [debtProgress, setDebtProgress] = useState<
    Record<string, { approved: number; required: number }>
  >({});
  const [recipient, setRecipient] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [acking, setAcking] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    await supabase.rpc("complete_expired_punishments");

    let query = supabase
      .from("punishments")
      .select("*")
      .order("created_at", { ascending: false });

    if (isSlave) {
      query = query.eq("issued_to", profile.id);
    }

    const { data } = await query;
    const list = ((data ?? []) as Record<string, unknown>[]).map(
      normalizePunishment
    );
    setPunishments(list);

    const debtIds = list
      .filter(
        (p) =>
          p.punishment_type === "task_debt" &&
          (p.status === "active" || p.status === "completed")
      )
      .map((p) => p.id);

    if (debtIds.length > 0) {
      const { data: tasks } = await supabase
        .from("tasks")
        .select("punishment_id, status")
        .in("punishment_id", debtIds);
      const next: Record<string, { approved: number; required: number }> = {};
      for (const p of list) {
        if (p.punishment_type !== "task_debt") continue;
        const required = tasksRequired(p);
        const approved = (tasks ?? []).filter(
          (t) =>
            t.punishment_id === p.id && (t.status as string) === "approved"
        ).length;
        next[p.id] = { approved, required };
      }
      setDebtProgress(next);
    } else {
      setDebtProgress({});
    }

    setLoading(false);
  }, [profile, isSlave]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  useEffect(() => {
    if (!isQueen) return;
    const findRecipient = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("role", "slave")
        .limit(1)
        .maybeSingle();
      setRecipient((data as Profile | null) ?? null);
    };
    void findRecipient();
  }, [isQueen]);

  const lift = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("punishments")
      .update({
        status: "lifted",
        lifted_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      toast.error("Could not lift punishment");
      return;
    }
    toast.success("Punishment lifted");
    void load();
  };

  const acknowledge = async (id: string) => {
    setAcking(id);
    const supabase = createClient();
    const { error } = await supabase
      .from("punishments")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("id", id);
    setAcking(null);
    if (error) {
      toast.error(error.message || "Could not acknowledge");
      return;
    }
    toast.success("Acknowledged");
    void load();
  };

  const confirmPending = async (p: Punishment) => {
    const supabase = createClient();
    const startsAt = new Date();
    const endsAt = new Date(
      startsAt.getTime() + p.duration_minutes * 60 * 1000
    );
    const { error } = await supabase
      .from("punishments")
      .update({
        status: "active",
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .eq("id", p.id)
      .eq("status", "pending");

    if (error) {
      toast.error("Could not activate punishment");
      return;
    }
    toast.success("Punishment activated");
    void load();
  };

  const dismissPending = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("punishments")
      .update({
        status: "lifted",
        lifted_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending");

    if (error) {
      toast.error("Could not dismiss");
      return;
    }
    toast.success("Suggested punishment dismissed");
    void load();
  };

  const pending = punishments.filter((p) => p.status === "pending");
  const activeList = punishments.filter((p) => isPunishmentActive(p));

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl text-ivory flex items-center gap-3">
          <Ban className="h-7 w-7 text-red-400" />
          Punishments
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "Issue consequences with timed or task-based clearance"
            : "Active and past consequences from Queen"}
        </p>
      </div>

      {isSlave &&
        activeList.map((p) => (
          <ContactRestrictionBanner
            key={p.id}
            punishment={p}
            onExpired={load}
          />
        ))}

      {isQueen && recipient && (
        <PunishmentForm recipientId={recipient.id} onSuccess={load} />
      )}

      {isQueen && pending.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-heading text-xl text-amber-300">
            Pending confirmation
          </h2>
          <ul className="space-y-3">
            {pending.map((p) => (
              <li
                key={p.id}
                className="rounded-xl border border-amber-500/35 bg-charcoal/80 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-heading text-lg text-ivory">
                      {p.title || typeLabel(p.punishment_type)}
                    </p>
                    {p.reason && (
                      <p className="text-sm text-muted-foreground">{p.reason}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Suggested duration: {p.duration_minutes} min
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void confirmPending(p)}
                      className="bg-gold text-void hover:bg-gold-muted"
                    >
                      <Check className="mr-2 h-3.5 w-3.5" />
                      Activate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void dismissPending(p.id)}
                      className="border-muted"
                    >
                      <X className="mr-2 h-3.5 w-3.5" />
                      Dismiss
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">History</h2>
        {punishments.filter((p) => p.status !== "pending").length === 0 ? (
          <div className="rounded-xl border border-gold/15 bg-charcoal/60 px-6 py-12 text-center text-sm text-muted-foreground">
            No punishments yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {punishments
              .filter((p) => p.status !== "pending")
              .map((p) => {
                const active = isPunishmentActive(p);
                const progress = debtProgress[p.id];
                const needsAck =
                  isSlave &&
                  active &&
                  p.punishment_type === "orgasm_ban" &&
                  !p.acknowledged_at;

                return (
                  <li
                    key={p.id}
                    className={cn(
                      "rounded-xl border bg-charcoal/80 p-5",
                      active ? "border-red-500/35" : "border-gold/10"
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-heading text-lg text-ivory">
                            {p.title || typeLabel(p.punishment_type)}
                          </p>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] uppercase tracking-wider",
                              statusClass(p.status)
                            )}
                          >
                            {p.status}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="border-muted text-[10px] uppercase tracking-wider text-muted-foreground"
                          >
                            {typeLabel(p.punishment_type)}
                          </Badge>
                          {p.acknowledged_at && (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/40 text-[10px] uppercase tracking-wider text-emerald-300"
                            >
                              Acknowledged
                            </Badge>
                          )}
                        </div>
                        {p.reason && (
                          <p className="text-sm text-muted-foreground">
                            {p.reason}
                          </p>
                        )}
                        {progress && (
                          <p className="text-sm text-amber-200/90">
                            Task debt progress: {progress.approved}/
                            {progress.required} approved
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Issued {formatRelative(p.created_at)}
                          {p.clearance_mode === "timed"
                            ? ` · ends ${formatDeadline(p.ends_at)}`
                            : " · clears when debt tasks are approved"}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {needsAck && (
                          <Button
                            size="sm"
                            onClick={() => void acknowledge(p.id)}
                            disabled={acking === p.id}
                            className="bg-gold text-void hover:bg-gold-muted"
                          >
                            <Check className="mr-2 h-3.5 w-3.5" />
                            {acking === p.id ? "…" : "Acknowledge"}
                          </Button>
                        )}
                        {isQueen && active && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void lift(p.id)}
                            className="border-gold/40 text-gold hover:bg-gold/10"
                          >
                            <Unlock className="mr-2 h-3.5 w-3.5" />
                            Lift early
                          </Button>
                        )}
                      </div>
                    </div>

                    {active && p.clearance_mode === "timed" && (
                      <div className="mt-4">
                        <PunishmentCountdown endsAt={p.ends_at} size="sm" />
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </section>
    </div>
  );
}
