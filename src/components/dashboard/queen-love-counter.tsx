"use client";

import { useCallback, useEffect, useState } from "react";
import { Heart, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  QUEEN_LOVE_KEY,
  fetchQueenLove,
  incrementQueenLove,
  loveCooldownRemainingMs,
  resetQueenLove,
  type QueenLoveState,
} from "@/lib/queen-love";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Props = {
  className?: string;
  compact?: boolean;
};

function formatWait(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m <= 0) return `${s}s`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function QueenLoveCounter({ className, compact = false }: Props) {
  const { profile, isSlave, isQueen } = useAuth();
  const [state, setState] = useState<QueenLoveState>({
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
      setState(await fetchQueenLove(supabase));
    } catch (err) {
      console.error("queen_love", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel("pair_counters:queen_love")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pair_counters",
          filter: `key=eq.${QUEEN_LOVE_KEY}`,
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
  const waitMs = loveCooldownRemainingMs(state);
  const canSend = isSlave && waitMs <= 0 && !busy;

  const sendLove = async () => {
    if (!profile || !canSend) return;
    setBusy(true);
    const supabase = createClient();
    try {
      const next = await incrementQueenLove(supabase);
      setState(next);
      toast.success("Love sent to Queen");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send love");
      void load();
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!isQueen) return;
    setBusy(true);
    const supabase = createClient();
    try {
      setState(await resetQueenLove(supabase));
      toast.success("Love counter reset");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset");
    } finally {
      setBusy(false);
    }
  };

  if (compact) {
    return (
      <div
        className={cn(
          "rounded-xl border border-rose-400/25 bg-charcoal/80 p-3 sm:p-4",
          className
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Queen love
          </p>
          <Heart className="size-3.5 shrink-0 fill-rose-400/80 text-rose-300" />
        </div>
        <p className="mt-1.5 font-heading text-2xl tabular-nums text-rose-200 sm:text-3xl">
          {loading ? "…" : state.count}
        </p>
        {isSlave ? (
          <Button
            type="button"
            size="sm"
            disabled={!canSend}
            onClick={() => void sendLove()}
            className="mt-2 w-full bg-rose-500/90 text-ivory hover:bg-rose-400 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Heart className="mr-1.5 size-3.5 fill-current" />
            )}
            {waitMs > 0 ? `Wait ${formatWait(waitMs)}` : "Send love"}
          </Button>
        ) : isQueen ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || state.count === 0}
            onClick={() => void reset()}
            className="mt-2 w-full border-rose-400/30"
          >
            {busy ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="mr-1.5 size-3.5" />
            )}
            Reset
          </Button>
        ) : null}
      </div>
    );
  }

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
            Queen love
          </p>
          <p className="font-heading text-lg text-ivory">Hearts for Queen</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isSlave
              ? "Tap the heart — once every 5 minutes."
              : "How many times D has sent you love."}
          </p>
        </div>
        <Heart className="size-5 shrink-0 fill-rose-400/80 text-rose-300" />
      </div>

      <p className="mt-3 font-heading text-4xl tabular-nums text-rose-200">
        {loading ? "…" : state.count}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {isSlave ? (
          <Button
            type="button"
            disabled={!canSend}
            onClick={() => void sendLove()}
            className="bg-rose-500/90 text-ivory hover:bg-rose-400 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Heart className="mr-2 size-4 fill-current" />
            )}
            {waitMs > 0 ? `Wait ${formatWait(waitMs)}` : "Send love"}
          </Button>
        ) : null}
        {isQueen ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy || state.count === 0}
            onClick={() => void reset()}
            className="border-rose-400/30"
          >
            {busy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 size-4" />
            )}
            Reset counter
          </Button>
        ) : null}
      </div>
    </div>
  );
}
