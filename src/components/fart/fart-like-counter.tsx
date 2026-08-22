"use client";

import { useCallback, useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  FART_LIKES_KEY,
  fartLikeCooldownRemainingMs,
  fetchFartLikes,
  incrementFartLikes,
  type FartLikesState,
} from "@/lib/fart-likes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function formatWait(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m <= 0) return `${s}s`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function FartLikeCounter({ className }: { className?: string }) {
  const { profile, isSlave, isQueen } = useAuth();
  const [state, setState] = useState<FartLikesState>({
    count: 0,
    lastIncrementAt: null,
    nextAllowedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    const supabase = createClient();
    try {
      setState(await fetchFartLikes(supabase));
    } catch (err) {
      console.error("fart_likes", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel("pair_counters:fart_likes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pair_counters",
          filter: `key=eq.${FART_LIKES_KEY}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();
    const interval = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(interval);
    };
  }, [load]);

  void tick;
  const waitMs = fartLikeCooldownRemainingMs(state);
  const canLike = isSlave && waitMs <= 0 && !busy;

  const sendLike = async () => {
    if (!profile || !canLike) return;
    setBusy(true);
    const supabase = createClient();
    try {
      const next = await incrementFartLikes(supabase);
      setState(next);
      toast.success("Like sent to Queen");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send like");
      void load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-rose-400/25 bg-charcoal/80 p-4 sm:p-5",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Fart likes · all time
          </p>
          <p className="font-heading text-lg text-ivory">Hearts for Queen</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isSlave
              ? "Tap the heart — once every 5 minutes. This count never resets."
              : isQueen
                ? "Lifetime likes from D. This counter never resets."
                : "Lifetime likes. This counter never resets."}
          </p>
        </div>
        <Heart className="size-5 shrink-0 fill-rose-400/80 text-rose-300" />
      </div>

      <p className="mt-3 font-heading text-4xl tabular-nums text-rose-200">
        {loading ? "…" : state.count}
      </p>

      {isSlave ? (
        <Button
          type="button"
          disabled={!canLike}
          onClick={() => void sendLike()}
          className="mt-3 bg-rose-500/90 text-ivory hover:bg-rose-400 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Heart className="mr-2 size-4 fill-current" />
          )}
          {waitMs > 0 ? `Wait ${formatWait(waitMs)}` : "Like"}
        </Button>
      ) : null}
    </div>
  );
}
