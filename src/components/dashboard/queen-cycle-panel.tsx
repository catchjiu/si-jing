"use client";

import { useCallback, useEffect, useState } from "react";
import { Droplets, HeartHandshake, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  computeCycleInfo,
  defaultQueenCycleSettings,
  loadQueenCycle,
  saveQueenCycle,
  todayCycleDate,
  type QueenCycleInfo,
  type QueenCycleSettings,
} from "@/lib/queen-cycle";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = { className?: string };

export function QueenCyclePanel({ className }: Props) {
  const { profile, isQueen, isSlave } = useAuth();
  const [info, setInfo] = useState<QueenCycleInfo | null>(null);
  const [draft, setDraft] = useState<QueenCycleSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    try {
      const data = await loadQueenCycle(supabase);
      setInfo(data);
      setDraft({
        last_period_start: data.last_period_start,
        cycle_length_days: data.cycle_length_days,
        period_length_days: data.period_length_days,
        remind_slave: data.remind_slave,
      });
    } catch (err) {
      console.error(err);
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!profile) return;
    void load();
  }, [profile, load]);

  const save = async (next: QueenCycleSettings, notifySlave: boolean) => {
    if (!profile || !isQueen) return;
    setSaving(true);
    const supabase = createClient();
    try {
      const updated = await saveQueenCycle(supabase, next, profile.id);
      setInfo(updated);
      setDraft({
        last_period_start: updated.last_period_start,
        cycle_length_days: updated.cycle_length_days,
        period_length_days: updated.period_length_days,
        remind_slave: updated.remind_slave,
      });
      toast.success("Cycle updated");

      if (notifySlave && updated.remind_slave && updated.is_on_period) {
        void import("@/lib/push-client").then(({ notifyPush }) =>
          notifyPush({
            title: "Be extra nice to your Queen",
            body: `Her period · day ${updated.day_in_cycle}. Soften up — comfort, patience, and care.`,
            url: "/dashboard",
            target: "slave",
            kind: "period_active",
          })
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save cycle"
      );
    } finally {
      setSaving(false);
    }
  };

  if (!profile || loading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-gold/15 bg-charcoal/80 p-4 text-sm text-muted-foreground",
          className
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading cycle…
      </div>
    );
  }

  if (!info) return null;

  if (isSlave) {
    return (
      <div
        className={cn(
          "rounded-xl border p-4 sm:p-5",
          info.is_on_period
            ? "border-rose-400/40 bg-rose-950/30"
            : "border-gold/15 bg-charcoal/80",
          className
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border",
              info.is_on_period
                ? "border-rose-400/40 bg-void/40 text-rose-200"
                : "border-gold/25 bg-void/40 text-gold"
            )}
          >
            {info.is_on_period ? (
              <HeartHandshake className="h-5 w-5" />
            ) : (
              <Droplets className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Queen&apos;s cycle
            </p>
            <p className="font-heading text-xl text-ivory">{info.phase_label}</p>
            <p
              className={cn(
                "mt-1 text-sm",
                info.is_on_period ? "text-rose-100/90" : "text-muted-foreground"
              )}
            >
              {info.slave_hint}
            </p>
            {!info.is_on_period ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Next period ~ {info.next_period_start} ({info.days_until_next}{" "}
                day{info.days_until_next === 1 ? "" : "s"})
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-rose-200/70">
                Day {info.day_in_cycle} of ~{info.period_length_days}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!isQueen || !draft) return null;

  return (
    <div
      className={cn(
        "rounded-xl border border-gold/15 bg-charcoal/80 p-4 sm:p-5 space-y-4",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rose-400/30 bg-rose-950/30 text-rose-200">
          <Droplets className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Period tracker
          </p>
          <p className="font-heading text-lg text-ivory">{info.phase_label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {info.is_on_period
              ? "Slave is reminded to be extra nice while you’re on your period."
              : `Next period ~ ${info.next_period_start} · ${info.days_until_next} day${info.days_until_next === 1 ? "" : "s"} left`}
          </p>
          {!info.is_on_period && (
            <p className="mt-1 text-[11px] text-gold/80">
              Last started {info.last_period_start} · cycle day {info.day_in_cycle}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor="period-start">Last start</Label>
          <Input
            id="period-start"
            type="date"
            value={draft.last_period_start}
            onChange={(e) =>
              setDraft((d) =>
                d ? { ...d, last_period_start: e.target.value } : d
              )
            }
            className="border-gold/20 bg-void/60"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cycle-len">Cycle days</Label>
          <Input
            id="cycle-len"
            type="number"
            min={21}
            max={45}
            value={draft.cycle_length_days}
            onChange={(e) =>
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      cycle_length_days: Number(e.target.value) || 28,
                    }
                  : d
              )
            }
            className="border-gold/20 bg-void/60"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="period-len">Period days</Label>
          <Input
            id="period-len"
            type="number"
            min={2}
            max={10}
            value={draft.period_length_days}
            onChange={(e) =>
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      period_length_days: Number(e.target.value) || 7,
                    }
                  : d
              )
            }
            className="border-gold/20 bg-void/60"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={saving}
          className="bg-gold text-void hover:bg-gold-muted"
          onClick={() => void save(draft, true)}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save cycle
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          className="border-rose-400/40 text-rose-200 hover:bg-rose-950/40"
          onClick={() => {
            const next = {
              ...draft,
              last_period_start: todayCycleDate(),
            };
            setDraft(next);
            setInfo(computeCycleInfo(next));
            void save(next, true);
          }}
        >
          Period started today
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          className="border-gold/30 text-muted-foreground hover:bg-void/50 hover:text-ivory"
          onClick={() => {
            if (
              !window.confirm(
                "Reset tracker to last period start July 17 (28-day cycle)?"
              )
            ) {
              return;
            }
            const next = defaultQueenCycleSettings();
            setDraft(next);
            setInfo(computeCycleInfo(next));
            void save(next, false);
          }}
        >
          Reset to July 17
        </Button>
      </div>
    </div>
  );
}
