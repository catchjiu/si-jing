"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Briefcase, Copy, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  WORK_DAY_LABELS,
  QUEEN_WORK_TIMEZONE,
  applyQueenWorkSchedules,
  emptyWeekDraft,
  fetchWeekSchedule,
  formatWeekRange,
  formatWorkDayInQueenZone,
  formatWorkDayInSlaveZone,
  isCurrentlyInWorkWindow,
  mondayOfWeek,
  rowsToDraft,
  saveWeekSchedule,
  shiftWeek,
  type QueenWorkDayDraft,
} from "@/lib/queen-work-schedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Queen-only: set working hours for a calendar week; auto-applies Working status. */
export function QueenWorkScheduleCard({ className }: { className?: string }) {
  const { profile, isQueen } = useAuth();
  const timezone = QUEEN_WORK_TIMEZONE;
  const thisMonday = useMemo(() => mondayOfWeek(new Date(), timezone), [timezone]);
  const [weekStart, setWeekStart] = useState(thisMonday);
  const [days, setDays] = useState<QueenWorkDayDraft[]>(emptyWeekDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!profile || !isQueen) return;
    setLoading(true);
    const supabase = createClient();
    try {
      const rows = await fetchWeekSchedule(supabase, profile.id, weekStart);
      setDays(rows.length > 0 ? rowsToDraft(rows) : emptyWeekDraft());
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load work schedule"
      );
    } finally {
      setLoading(false);
    }
  }, [profile, isQueen, weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isQueen) return null;

  const updateDay = (index: number, patch: Partial<QueenWorkDayDraft>) => {
    setDays((prev) =>
      prev.map((d) => (d.dayOfWeek === index ? { ...d, ...patch } : d))
    );
  };

  const onSave = async () => {
    if (!profile) return;
    for (const d of days) {
      if (!d.enabled) continue;
      if (!d.startTime || !d.endTime) {
        toast.error("Each work day needs a start and end time");
        return;
      }
      if (d.endTime <= d.startTime) {
        toast.error("End time must be after start time");
        return;
      }
    }

    setSaving(true);
    const supabase = createClient();
    try {
      await saveWeekSchedule(supabase, {
        userId: profile.id,
        weekStart,
        timezone,
        days,
      });
      await applyQueenWorkSchedules(supabase);
      toast.success("Work schedule saved — status follows these hours");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save schedule"
      );
    } finally {
      setSaving(false);
    }
  };

  const copyFromLastWeek = async () => {
    if (!profile) return;
    const prev = shiftWeek(weekStart, -1);
    const supabase = createClient();
    try {
      const rows = await fetchWeekSchedule(supabase, profile.id, prev);
      if (rows.length === 0) {
        toast.message("No schedule found for last week");
        return;
      }
      setDays(rowsToDraft(rows));
      toast.message("Copied last week — save to apply");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not copy last week"
      );
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-gold/15 bg-charcoal/80 p-6 space-y-4",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 bg-royal/30">
            <Briefcase className="h-5 w-5 text-gold" />
          </div>
          <div>
            <h2 className="font-heading text-xl text-ivory">Work schedule</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Set hours for this week in California time. During them, your
              status becomes <span className="text-gold">Working</span>{" "}
              automatically — D sees the equivalent Taipei time.
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Times in Pacific (Santa Cruz) · shown to D in Taipei
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-gold/25"
          onClick={() => setWeekStart((w) => shiftWeek(w, -1))}
        >
          Prev
        </Button>
        <p className="min-w-[10rem] text-center text-sm text-ivory">
          {formatWeekRange(weekStart)}
          {weekStart === thisMonday ? (
            <span className="ml-2 text-[10px] uppercase tracking-wider text-gold">
              This week
            </span>
          ) : null}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-gold/25"
          onClick={() => setWeekStart((w) => shiftWeek(w, 1))}
        >
          Next
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => setWeekStart(thisMonday)}
        >
          Today
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => void copyFromLastWeek()}
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Copy last week
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {WORK_DAY_LABELS.map(({ index, label, short }) => {
            const day = days.find((d) => d.dayOfWeek === index)!;
            return (
              <li
                key={index}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5",
                  day.enabled
                    ? "border-gold/25 bg-gold/5"
                    : "border-gold/10 bg-void/40"
                )}
              >
                <label className="flex min-w-[6.5rem] items-center gap-2 text-sm text-ivory">
                  <input
                    type="checkbox"
                    checked={day.enabled}
                    onChange={(e) =>
                      updateDay(index, { enabled: e.target.checked })
                    }
                    className="accent-[var(--gold,#d4af37)]"
                  />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{short}</span>
                </label>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-muted-foreground">
                      Start (PT)
                    </Label>
                    <Input
                      type="time"
                      disabled={!day.enabled}
                      value={day.startTime}
                      onChange={(e) =>
                        updateDay(index, { startTime: e.target.value })
                      }
                      className="h-9 w-[7.5rem] border-gold/20 bg-void/60"
                    />
                  </div>
                  <span className="mt-4 text-muted-foreground">–</span>
                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-muted-foreground">
                      End (PT)
                    </Label>
                    <Input
                      type="time"
                      disabled={!day.enabled}
                      value={day.endTime}
                      onChange={(e) =>
                        updateDay(index, { endTime: e.target.value })
                      }
                      className="h-9 w-[7.5rem] border-gold/20 bg-void/60"
                    />
                  </div>
                  {day.enabled ? (
                    <p className="w-full text-[10px] text-muted-foreground sm:ml-2 sm:w-auto sm:self-end sm:pb-2">
                      D: {formatWorkDayInSlaveZone(weekStart, index, day.startTime)}{" "}
                      –{" "}
                      {formatWorkDayInSlaveZone(weekStart, index, day.endTime)}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Button
        type="button"
        disabled={saving || loading}
        onClick={() => void onSave()}
        className="bg-gold text-void hover:bg-gold-muted"
      >
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving…
          </>
        ) : (
          "Save schedule"
        )}
      </Button>
    </div>
  );
}

/** Read-only work schedule dialog for slaves (and anyone viewing Queen's hours). */
export function QueenWorkScheduleDialog({
  open,
  onOpenChange,
  queenId,
  username = "Queen",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queenId: string | null;
  username?: string;
}) {
  const timezone = QUEEN_WORK_TIMEZONE;
  const thisMonday = useMemo(() => mondayOfWeek(new Date(), timezone), [timezone]);
  const [weekStart, setWeekStart] = useState(thisMonday);
  const [days, setDays] = useState<QueenWorkDayDraft[]>(emptyWeekDraft);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWeekStart(thisMonday);
  }, [open, thisMonday]);

  useEffect(() => {
    if (!open || !queenId) {
      setDays(emptyWeekDraft());
      return;
    }
    let cancelled = false;
    setLoading(true);
    const supabase = createClient();
    void fetchWeekSchedule(supabase, queenId, weekStart)
      .then((rows) => {
        if (cancelled) return;
        setDays(rows.length > 0 ? rowsToDraft(rows) : emptyWeekDraft());
      })
      .catch(() => {
        if (!cancelled) setDays(emptyWeekDraft());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, queenId, weekStart]);

  const enabledDays = days.filter((d) => d.enabled);
  const isThisWeek = weekStart === thisMonday;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-gold/20 bg-charcoal sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-gold">
            {username}&apos;s work schedule
          </DialogTitle>
          <DialogDescription>
            Hours in Pacific (Santa Cruz). Your local times shown in Taipei.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-gold/25"
            onClick={() => setWeekStart((w) => shiftWeek(w, -1))}
          >
            Prev
          </Button>
          <p className="min-w-[10rem] flex-1 text-center text-sm text-ivory">
            {formatWeekRange(weekStart)}
            {isThisWeek ? (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-gold">
                This week
              </span>
            ) : null}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-gold/25"
            onClick={() => setWeekStart((w) => shiftWeek(w, 1))}
          >
            Next
          </Button>
          {weekStart !== thisMonday ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setWeekStart(thisMonday)}
            >
              Today
            </Button>
          ) : null}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : enabledDays.length === 0 ? (
          <p className="rounded-lg border border-gold/10 bg-void/40 px-4 py-6 text-center text-sm text-muted-foreground">
            No work hours set for this week.
          </p>
        ) : (
          <ul className="space-y-2">
            {WORK_DAY_LABELS.map(({ index, label, short }) => {
              const day = days.find((d) => d.dayOfWeek === index);
              if (!day?.enabled) return null;
              const active = isCurrentlyInWorkWindow(day, weekStart);
              return (
                <li
                  key={index}
                  className={cn(
                    "rounded-lg border px-3 py-2.5",
                    active
                      ? "border-gold/50 bg-gold/15"
                      : "border-gold/25 bg-gold/5"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ivory">
                      <span className="hidden sm:inline">{label}</span>
                      <span className="sm:hidden">{short}</span>
                    </span>
                    {active ? (
                      <span className="text-[10px] uppercase tracking-wider text-gold">
                        Now
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-ivory/90">
                    {formatWorkDayInQueenZone(weekStart, index, day.startTime)}{" "}
                    – {formatWorkDayInQueenZone(weekStart, index, day.endTime)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    You:{" "}
                    {formatWorkDayInSlaveZone(weekStart, index, day.startTime)}{" "}
                    – {formatWorkDayInSlaveZone(weekStart, index, day.endTime)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
