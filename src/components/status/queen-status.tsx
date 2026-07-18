"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Briefcase,
  CalendarHeart,
  CircleDot,
  Loader2,
  Moon,
  PhoneOff,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { QueenAvailability } from "@/lib/types";
import {
  applyQueenWorkSchedules,
  fetchQueenWorkingUntil,
} from "@/lib/queen-work-schedule";
import type { WorkingUntilInfo } from "@/lib/queen-work-schedule";
import { QueenWorkScheduleDialog } from "@/components/status/queen-work-schedule";
import { WorkEndCountdown } from "@/components/status/work-end-countdown";
import { notifyPush } from "@/lib/push-client";
import {
  NO_CONTACT_DURATION_PRESETS,
  clearExpiredNoContact,
  formatNoContactDuration,
  noContactEndsAtIso,
  resolveNoContactMinutes,
} from "@/lib/no-contact";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NO_CONTACT_PUSH_TAG = "no-contact";

export const QUEEN_AVAILABILITY: {
  value: QueenAvailability;
  label: string;
  hint: string;
  icon: typeof CircleDot;
  className: string;
}[] = [
  {
    value: "available",
    label: "Available",
    hint: "Free to engage",
    icon: CircleDot,
    className: "border-emerald-500/40 bg-emerald-950/30 text-emerald-300",
  },
  {
    value: "working",
    label: "Working",
    hint: "Focused — limited attention",
    icon: Briefcase,
    className: "border-gold/40 bg-gold/10 text-gold",
  },
  {
    value: "busy",
    label: "Busy",
    hint: "Do not disturb lightly",
    icon: Moon,
    className: "border-amber-500/40 bg-amber-950/30 text-amber-200",
  },
  {
    value: "dating",
    label: "Dating",
    hint: "With Queen — wait your turn",
    icon: CalendarHeart,
    className: "border-rose-400/40 bg-rose-950/30 text-rose-200",
  },
  {
    value: "no_contact",
    label: "No contact",
    hint: "Slave locked — no changes or additions",
    icon: PhoneOff,
    className: "border-red-500/40 bg-red-950/30 text-red-300",
  },
];

export function availabilityMeta(value: QueenAvailability | null | undefined) {
  return (
    QUEEN_AVAILABILITY.find((o) => o.value === value) ?? QUEEN_AVAILABILITY[0]
  );
}

interface QueenStatusPickerProps {
  className?: string;
  onUpdated?: () => void;
}

/** Queen-only: quick availability toggle. */
export function QueenStatusPicker({
  className,
  onUpdated,
}: QueenStatusPickerProps) {
  const { profile, isQueen } = useAuth();
  const [value, setValue] = useState<QueenAvailability>("available");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workingUntil, setWorkingUntil] = useState<WorkingUntilInfo | null>(
    null
  );
  const [noContactEndsAt, setNoContactEndsAt] = useState<string | null>(null);
  const [draftingNoContact, setDraftingNoContact] = useState(false);
  const [durationPreset, setDurationPreset] = useState("60");
  const [customDays, setCustomDays] = useState("0");
  const [customHours, setCustomHours] = useState("1");
  const [customMinutes, setCustomMinutes] = useState("0");

  const reloadStatus = useCallback(async () => {
    if (!profile || !isQueen) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("user_status")
      .select("availability, no_contact_ends_at")
      .eq("user_id", profile.id)
      .maybeSingle();
    const a = data?.availability as QueenAvailability | null | undefined;
    if (a) setValue(a);
    setNoContactEndsAt(
      a === "no_contact"
        ? ((data?.no_contact_ends_at as string | null | undefined) ?? null)
        : null
    );
    if (a !== "no_contact") setDraftingNoContact(false);
  }, [profile, isQueen]);

  useEffect(() => {
    if (!profile || !isQueen) return;
    void reloadStatus().then(() => setLoaded(true));
  }, [profile, isQueen, reloadStatus]);

  useEffect(() => {
    if (!profile || !isQueen || value !== "working") {
      setWorkingUntil(null);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    void fetchQueenWorkingUntil(supabase, profile.id)
      .then((info) => {
        if (!cancelled) setWorkingUntil(info);
      })
      .catch(() => {
        if (!cancelled) setWorkingUntil(null);
      });
    return () => {
      cancelled = true;
    };
  }, [profile, isQueen, value]);

  const onWorkShiftEnd = useCallback(async () => {
    if (!profile) return;
    const supabase = createClient();
    try {
      await applyQueenWorkSchedules(supabase);
      await reloadStatus();
      onUpdated?.();
    } catch {
      // best-effort
    }
  }, [profile, reloadStatus, onUpdated]);

  const onNoContactTimerEnd = useCallback(async () => {
    if (!profile) return;
    const supabase = createClient();
    try {
      const cleared = await clearExpiredNoContact(supabase);
      await reloadStatus();
      onUpdated?.();
      if (cleared > 0) {
        void notifyPush({
          title: "No contact lifted",
          body: "The timed No contact period ended. You may engage.",
          url: "/dashboard",
          target: "slave",
          kind: "no_contact_lifted",
          tag: NO_CONTACT_PUSH_TAG,
          renotify: true,
        });
      }
    } catch {
      // best-effort
    }
  }, [profile, reloadStatus, onUpdated]);

  if (!isQueen) return null;

  const save = async (
    next: QueenAvailability,
    opts?: { noContactEndsAt?: string | null; durationMinutes?: number | null }
  ) => {
    if (!profile) return;
    if (next !== "no_contact" && next === value) return;
    const prev = value;
    setSaving(true);
    if (next !== "no_contact") setValue(next);
    const supabase = createClient();
    const endsAt =
      next === "no_contact" ? (opts?.noContactEndsAt ?? null) : null;
    const { error } = await supabase.from("user_status").upsert({
      user_id: profile.id,
      availability: next,
      availability_source: "manual",
      no_contact_ends_at: endsAt,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      setValue(prev);
      toast.error("Could not update status");
      return;
    }
    setValue(next);
    setNoContactEndsAt(endsAt);
    setDraftingNoContact(false);
    const durationLabel =
      next === "no_contact"
        ? formatNoContactDuration(opts?.durationMinutes ?? null)
        : "";
    toast.success(
      next === "no_contact"
        ? `No contact ${durationLabel}`
        : `Status: ${availabilityMeta(next).label}`
    );
    onUpdated?.();

    if (next === "no_contact") {
      void notifyPush({
        title: "No contact",
        body: `Queen set No contact ${durationLabel}. You cannot change or add anything.`,
        url: "/dashboard",
        target: "slave",
        kind: "no_contact",
        tag: NO_CONTACT_PUSH_TAG,
        requireInteraction: true,
        renotify: true,
      });
    } else if (prev === "no_contact") {
      void notifyPush({
        title: "No contact lifted",
        body: `Queen is ${availabilityMeta(next).label.toLowerCase()} again. You may engage.`,
        url: "/dashboard",
        target: "slave",
        kind: "no_contact_lifted",
        tag: NO_CONTACT_PUSH_TAG,
        renotify: true,
      });
    }
  };

  const applyNoContact = async () => {
    const minutes = resolveNoContactMinutes({
      preset: durationPreset,
      customDays,
      customHours,
      customMinutes,
    });
    if (durationPreset === "custom" && minutes == null) {
      toast.error("Enter a custom duration greater than zero");
      return;
    }
    if (
      durationPreset !== "indefinite" &&
      durationPreset !== "0" &&
      durationPreset !== "custom" &&
      minutes == null
    ) {
      toast.error("Choose how long No contact lasts");
      return;
    }
    await save("no_contact", {
      noContactEndsAt: noContactEndsAtIso(minutes),
      durationMinutes: minutes,
    });
  };

  const pickStatus = (next: QueenAvailability) => {
    if (next === "no_contact") {
      setDraftingNoContact(true);
      return;
    }
    setDraftingNoContact(false);
    void save(next);
  };

  const showNoContactPanel = draftingNoContact || value === "no_contact";
  const noContactEndMs = noContactEndsAt
    ? new Date(noContactEndsAt).getTime()
    : null;

  return (
    <div
      className={cn(
        "rounded-xl border border-gold/15 bg-charcoal/80 p-4 sm:p-5",
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Your status
          </p>
          <p className="font-heading text-lg text-ivory">Quick status</p>
        </div>
        {saving && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {!loaded ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {QUEEN_AVAILABILITY.map((opt) => {
              const Icon = opt.icon;
              const active =
                opt.value === "no_contact"
                  ? value === "no_contact" || draftingNoContact
                  : value === opt.value && !draftingNoContact;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={saving}
                  onClick={() => pickStatus(opt.value)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-all",
                    active
                      ? opt.className
                      : "border-gold/10 bg-void/40 text-ivory/60 hover:border-gold/25 hover:text-ivory"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{opt.label}</span>
                </button>
              );
            })}
          </div>

          {showNoContactPanel ? (
            <div className="mt-3 space-y-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-red-300/80">
                  No contact duration
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Choose any length — or leave it on until you lift it.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-ivory/80">How long</Label>
                <Select
                  value={durationPreset}
                  onValueChange={setDurationPreset}
                >
                  <SelectTrigger className="border-red-500/25 bg-void/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NO_CONTACT_DURATION_PRESETS.map((p) => (
                      <SelectItem
                        key={p.label}
                        value={
                          p.minutes === -1
                            ? "custom"
                            : p.minutes === 0
                              ? "indefinite"
                              : String(p.minutes)
                        }
                      >
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {durationPreset === "custom" ? (
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Days</Label>
                    <Input
                      type="number"
                      min={0}
                      value={customDays}
                      onChange={(e) => setCustomDays(e.target.value)}
                      className="border-red-500/25 bg-void/60"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Hours</Label>
                    <Input
                      type="number"
                      min={0}
                      value={customHours}
                      onChange={(e) => setCustomHours(e.target.value)}
                      className="border-red-500/25 bg-void/60"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Mins</Label>
                    <Input
                      type="number"
                      min={0}
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(e.target.value)}
                      className="border-red-500/25 bg-void/60"
                    />
                  </div>
                </div>
              ) : null}
              <Button
                type="button"
                disabled={saving}
                onClick={() => void applyNoContact()}
                className="w-full bg-red-500 text-ivory hover:bg-red-400"
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {value === "no_contact"
                  ? "Update No contact timer"
                  : "Start No contact"}
              </Button>
              {value === "no_contact" && noContactEndMs ? (
                <div className="space-y-1.5 border-t border-red-500/20 pt-3">
                  <p className="text-[10px] uppercase tracking-wider text-red-300/80">
                    Ends in
                  </p>
                  <WorkEndCountdown
                    endAtMs={noContactEndMs}
                    compact
                    onComplete={() => void onNoContactTimerEnd()}
                  />
                </div>
              ) : value === "no_contact" ? (
                <p className="text-xs text-red-200/80">
                  Active until you lift it.
                </p>
              ) : null}
            </div>
          ) : null}

          {value === "working" && workingUntil ? (
            <div className="mt-3 space-y-1.5 rounded-lg border border-gold/15 bg-void/40 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Shift ends in
              </p>
              <WorkEndCountdown
                endAtMs={workingUntil.endAtMs}
                compact
                onComplete={() => void onWorkShiftEnd()}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

interface QueenStatusDisplayProps {
  queenId?: string | null;
  availability: QueenAvailability | null | undefined;
  updatedAt?: string | null;
  lastActiveAt?: string | null;
  username?: string;
  className?: string;
}

/** Shown on slave dashboard — Queen's current availability. */
export function QueenStatusDisplay({
  queenId: initialQueenId = null,
  availability: initialAvailability,
  updatedAt: initialUpdatedAt,
  lastActiveAt: initialLastActiveAt = null,
  username = "Queen",
  className,
}: QueenStatusDisplayProps) {
  const [queenId, setQueenId] = useState<string | null>(initialQueenId);
  const [availability, setAvailability] = useState<QueenAvailability | null>(
    initialAvailability ?? "available"
  );
  const [updatedAt, setUpdatedAt] = useState<string | null>(
    initialUpdatedAt ?? null
  );
  const [lastActiveAt, setLastActiveAt] = useState<string | null>(
    initialLastActiveAt
  );
  const [workingUntil, setWorkingUntil] = useState<WorkingUntilInfo | null>(
    null
  );
  const [noContactEndsAt, setNoContactEndsAt] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    setQueenId(initialQueenId);
    setAvailability(initialAvailability ?? "available");
    setUpdatedAt(initialUpdatedAt ?? null);
    setLastActiveAt(initialLastActiveAt);
  }, [
    initialQueenId,
    initialAvailability,
    initialUpdatedAt,
    initialLastActiveAt,
  ]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const load = async () => {
      await clearExpiredNoContact(supabase);
      const { data, error } = await supabase.rpc("get_queen_status");
      if (cancelled) return;

      if (!error && data) {
        const row = (Array.isArray(data) ? data[0] : data) as
          | {
              queen_id: string;
              username: string;
              availability: QueenAvailability | null;
              updated_at: string | null;
              last_active_at: string | null;
              no_contact_ends_at?: string | null;
            }
          | undefined;
        if (row?.queen_id) {
          setQueenId(row.queen_id);
          setAvailability(row.availability ?? "available");
          setUpdatedAt(row.updated_at);
          setLastActiveAt(row.last_active_at);
          setNoContactEndsAt(
            row.availability === "no_contact"
              ? (row.no_contact_ends_at ?? null)
              : null
          );
          return;
        }
      }

      let id = queenId ?? initialQueenId;
      if (!id) {
        const { data: queen } = await supabase
          .from("users")
          .select("id")
          .eq("role", "queen")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        id = (queen?.id as string | undefined) ?? null;
        if (!id || cancelled) return;
        setQueenId(id);
      }

      const { data: status } = await supabase
        .from("user_status")
        .select("availability, updated_at, last_active_at, no_contact_ends_at")
        .eq("user_id", id)
        .maybeSingle();
      if (cancelled) return;
      const nextAvailability =
        (status?.availability as QueenAvailability | null | undefined) ??
        "available";
      setAvailability(nextAvailability);
      setUpdatedAt((status?.updated_at as string | null | undefined) ?? null);
      setLastActiveAt(
        (status?.last_active_at as string | null | undefined) ?? null
      );
      setNoContactEndsAt(
        nextAvailability === "no_contact"
          ? ((status?.no_contact_ends_at as string | null | undefined) ?? null)
          : null
      );
    };

    void load();
    const channel = supabase
      .channel(`queen-status-${queenId ?? initialQueenId ?? "primary"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_status",
          ...(queenId ?? initialQueenId
            ? { filter: `user_id=eq.${queenId ?? initialQueenId}` }
            : {}),
        },
        () => void load()
      )
      .subscribe();
    const tick = window.setInterval(() => setTick((t) => t + 1), 30_000);

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      window.clearInterval(tick);
    };
  }, [initialQueenId, queenId]);

  useEffect(() => {
    if (availability !== "working" || !queenId) {
      setWorkingUntil(null);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    void fetchQueenWorkingUntil(supabase, queenId)
      .then((info) => {
        if (!cancelled) setWorkingUntil(info);
      })
      .catch(() => {
        if (!cancelled) setWorkingUntil(null);
      });
    return () => {
      cancelled = true;
    };
  }, [availability, queenId]);

  const onWorkShiftEnd = useCallback(async () => {
    if (!queenId) return;
    const supabase = createClient();
    try {
      await applyQueenWorkSchedules(supabase);
      const { data: status } = await supabase
        .from("user_status")
        .select("availability, updated_at, last_active_at, no_contact_ends_at")
        .eq("user_id", queenId)
        .maybeSingle();
      if (status) {
        const next =
          (status.availability as QueenAvailability | null | undefined) ??
          "available";
        setAvailability(next);
        setUpdatedAt((status.updated_at as string | null | undefined) ?? null);
        setLastActiveAt(
          (status.last_active_at as string | null | undefined) ?? null
        );
        setNoContactEndsAt(
          next === "no_contact"
            ? ((status.no_contact_ends_at as string | null | undefined) ?? null)
            : null
        );
      }
      setWorkingUntil(null);
    } catch {
      // best-effort
    }
  }, [queenId]);

  const onNoContactTimerEnd = useCallback(async () => {
    const supabase = createClient();
    try {
      await clearExpiredNoContact(supabase);
      const { data, error } = await supabase.rpc("get_queen_status");
      if (!error && data) {
        const row = (Array.isArray(data) ? data[0] : data) as
          | {
              availability: QueenAvailability | null;
              updated_at: string | null;
              last_active_at: string | null;
              no_contact_ends_at?: string | null;
            }
          | undefined;
        if (row) {
          setAvailability(row.availability ?? "available");
          setUpdatedAt(row.updated_at);
          setLastActiveAt(row.last_active_at);
          setNoContactEndsAt(
            row.availability === "no_contact"
              ? (row.no_contact_ends_at ?? null)
              : null
          );
        }
      }
    } catch {
      // best-effort
    }
  }, []);

  const displayMeta = availabilityMeta(availability ?? "available");
  const DisplayIcon = displayMeta.icon;
  const isWorking = availability === "working";
  const isNoContact = availability === "no_contact";
  const noContactEndMs = noContactEndsAt
    ? new Date(noContactEndsAt).getTime()
    : null;
  const showScheduleLink = availability === "available" || isWorking;

  const cardClassName = cn(
    "flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition-opacity",
    displayMeta.className,
    showScheduleLink && "cursor-pointer hover:opacity-90 active:opacity-80",
    className
  );

  const cardBody = (
    <>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-current/30 bg-void/30">
        <DisplayIcon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider opacity-70">
          {username}&apos;s status
        </p>
        <p className="font-heading text-xl">{displayMeta.label}</p>
        {isWorking && workingUntil ? (
          <div className="mt-2 space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider opacity-70">
              Shift ends in
            </p>
            <WorkEndCountdown
              endAtMs={workingUntil.endAtMs}
              compact
              onComplete={() => void onWorkShiftEnd()}
            />
            <p className="text-xs opacity-80">
              {username} is working until {workingUntil.label}
            </p>
          </div>
        ) : isNoContact ? (
          <div className="mt-2 space-y-1.5">
            <p className="text-xs opacity-80">{displayMeta.hint}</p>
            {noContactEndMs ? (
              <>
                <p className="text-[10px] uppercase tracking-wider opacity-70">
                  Ends in
                </p>
                <WorkEndCountdown
                  endAtMs={noContactEndMs}
                  compact
                  onComplete={() => void onNoContactTimerEnd()}
                />
              </>
            ) : (
              <p className="text-xs opacity-80">Until Queen lifts it.</p>
            )}
          </div>
        ) : (
          <p className="text-xs opacity-80">{displayMeta.hint}</p>
        )}
        {showScheduleLink ? (
          <p className="mt-0.5 text-[10px] opacity-60">Tap for work schedule</p>
        ) : null}
        {lastActiveAt ? (
          <p className="mt-0.5 text-[10px] opacity-60">
            Last active {formatRelative(lastActiveAt)}
          </p>
        ) : updatedAt ? (
          <p className="mt-0.5 text-[10px] opacity-60">
            Updated {formatRelative(updatedAt)}
          </p>
        ) : null}
      </div>
    </>
  );

  return (
    <>
      {showScheduleLink ? (
        <button
          type="button"
          className={cardClassName}
          onClick={() => setScheduleOpen(true)}
          aria-label={`View ${username}'s work schedule`}
        >
          {cardBody}
        </button>
      ) : (
        <div className={cardClassName}>{cardBody}</div>
      )}

      <QueenWorkScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        queenId={queenId}
        username={username}
      />
    </>
  );
}
