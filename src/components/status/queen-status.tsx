"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Briefcase,
  CalendarHeart,
  CircleDot,
  Loader2,
  Moon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { QueenAvailability } from "@/lib/types";
import { fetchQueenWorkingUntil } from "@/lib/queen-work-schedule";
import type { WorkingUntilInfo } from "@/lib/queen-work-schedule";
import { QueenWorkScheduleDialog } from "@/components/status/queen-work-schedule";
import { WorkEndCountdown } from "@/components/status/work-end-countdown";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";

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

  useEffect(() => {
    if (!profile || !isQueen) return;
    const supabase = createClient();
    void supabase
      .from("user_status")
      .select("availability")
      .eq("user_id", profile.id)
      .maybeSingle()
      .then(({ data }) => {
        const a = data?.availability as QueenAvailability | null | undefined;
        if (a) setValue(a);
        setLoaded(true);
      });
  }, [profile, isQueen]);

  if (!isQueen) return null;

  const save = async (next: QueenAvailability) => {
    if (!profile || next === value) return;
    setSaving(true);
    setValue(next);
    const supabase = createClient();
    const { error } = await supabase.from("user_status").upsert({
      user_id: profile.id,
      availability: next,
      availability_source: "manual",
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast.error("Could not update status");
      return;
    }
    toast.success(`Status: ${availabilityMeta(next).label}`);
    onUpdated?.();
  };

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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {QUEEN_AVAILABILITY.map((opt) => {
            const Icon = opt.icon;
            const active = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={saving}
                onClick={() => void save(opt.value)}
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
            }
          | undefined;
        if (row?.queen_id) {
          setQueenId(row.queen_id);
          setAvailability(row.availability ?? "available");
          setUpdatedAt(row.updated_at);
          setLastActiveAt(row.last_active_at);
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
        .select("availability, updated_at, last_active_at")
        .eq("user_id", id)
        .maybeSingle();
      if (cancelled) return;
      setAvailability(
        (status?.availability as QueenAvailability | null | undefined) ??
          "available"
      );
      setUpdatedAt((status?.updated_at as string | null | undefined) ?? null);
      setLastActiveAt(
        (status?.last_active_at as string | null | undefined) ?? null
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

  const displayMeta = availabilityMeta(availability ?? "available");
  const DisplayIcon = displayMeta.icon;
  const isWorking = availability === "working";

  const cardClassName = cn(
    "flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition-opacity",
    displayMeta.className,
    isWorking && "cursor-pointer hover:opacity-90 active:opacity-80",
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
            <WorkEndCountdown endAtMs={workingUntil.endAtMs} compact />
            <p className="text-xs opacity-80">
              {username} is working until {workingUntil.label}
            </p>
          </div>
        ) : (
          <p className="text-xs opacity-80">{displayMeta.hint}</p>
        )}
        {isWorking ? (
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
      {isWorking ? (
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
