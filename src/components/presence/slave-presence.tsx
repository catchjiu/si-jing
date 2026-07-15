"use client";

import { useCallback, useEffect, useState } from "react";
import { Circle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type SlavePresenceProps = {
  slaveId?: string | null;
  className?: string;
};

function presenceTone(lastActiveAt: string | null): {
  label: string;
  className: string;
  live: boolean;
} {
  if (!lastActiveAt) {
    return {
      label: "Never seen",
      className: "border-gold/10 text-muted-foreground",
      live: false,
    };
  }
  const ageMs = Date.now() - new Date(lastActiveAt).getTime();
  if (ageMs < 3 * 60_000) {
    return {
      label: "Online now",
      className: "border-emerald-500/40 bg-emerald-950/30 text-emerald-300",
      live: true,
    };
  }
  if (ageMs < 30 * 60_000) {
    return {
      label: "Recently active",
      className: "border-gold/30 bg-gold/5 text-gold",
      live: false,
    };
  }
  return {
    label: "Away",
    className: "border-gold/10 bg-charcoal/60 text-ivory/70",
    live: false,
  };
}

export function SlavePresence({ slaveId, className }: SlavePresenceProps) {
  const [lastActiveAt, setLastActiveAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    const supabase = createClient();
    let id = slaveId;
    if (!id) {
      const { data } = await supabase
        .from("users")
        .select("id")
        .eq("role", "slave")
        .limit(1)
        .maybeSingle();
      id = data?.id as string | undefined;
    }
    if (!id) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("user_status")
      .select("last_active_at")
      .eq("user_id", id)
      .maybeSingle();
    setLastActiveAt(
      (data?.last_active_at as string | null | undefined) ?? null
    );
    setLoading(false);
  }, [slaveId]);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel("slave-presence")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_status" },
        () => void load()
      )
      .subscribe();
    const tick = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(tick);
    };
  }, [load]);

  const tone = presenceTone(lastActiveAt);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3",
        tone.className,
        className
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin opacity-60" />
      ) : (
        <Circle
          className={cn(
            "h-3 w-3 shrink-0 fill-current",
            tone.live ? "animate-pulse" : "opacity-50"
          )}
        />
      )}
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider opacity-70">D presence</p>
        <p className="font-heading text-lg leading-tight">{tone.label}</p>
        {lastActiveAt && (
          <p className="text-[11px] opacity-70">
            Last active {formatRelative(lastActiveAt)}
          </p>
        )}
      </div>
    </div>
  );
}
