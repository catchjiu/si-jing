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
  availability: QueenAvailability | null | undefined;
  updatedAt?: string | null;
  lastActiveAt?: string | null;
  username?: string;
  className?: string;
}

/** Shown on slave dashboard — Queen's current availability. */
export function QueenStatusDisplay({
  availability,
  updatedAt,
  lastActiveAt: initialLastActiveAt = null,
  username = "Queen",
  className,
}: QueenStatusDisplayProps) {
  const meta = availabilityMeta(availability ?? "available");
  const Icon = meta.icon;
  const [lastActiveAt, setLastActiveAt] = useState<string | null>(
    initialLastActiveAt
  );
  const [, setTick] = useState(0);

  useEffect(() => {
    setLastActiveAt(initialLastActiveAt);
  }, [initialLastActiveAt]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const load = async () => {
      const { data: queen } = await supabase
        .from("users")
        .select("id")
        .eq("role", "queen")
        .limit(1)
        .maybeSingle();
      if (!queen?.id || cancelled) return;
      const { data } = await supabase
        .from("user_status")
        .select("last_active_at")
        .eq("user_id", queen.id)
        .maybeSingle();
      if (!cancelled) {
        setLastActiveAt(
          (data?.last_active_at as string | null | undefined) ?? null
        );
      }
    };

    void load();
    const channel = supabase
      .channel("queen-presence")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_status" },
        () => void load()
      )
      .subscribe();
    const tick = window.setInterval(() => setTick((t) => t + 1), 30_000);

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      window.clearInterval(tick);
    };
  }, []);

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl border px-4 py-3",
        meta.className,
        className
      )}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-current/30 bg-void/30">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider opacity-70">
          {username}&apos;s status
        </p>
        <p className="font-heading text-xl">{meta.label}</p>
        <p className="text-xs opacity-80">{meta.hint}</p>
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
    </div>
  );
}
