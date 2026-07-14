"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw, Timer } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatElapsedSince } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const COUNTER_KEY = "last_cum";

type Props = {
  className?: string;
  compact?: boolean;
};

export function LastCumCounter({ className, compact = false }: Props) {
  const { profile } = useAuth();
  const [resetAt, setResetAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("pair_counters")
      .select("reset_at")
      .eq("key", COUNTER_KEY)
      .maybeSingle();

    if (error) {
      console.error("pair_counters", error);
      setLoading(false);
      return;
    }

    setResetAt((data?.reset_at as string | undefined) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel("pair_counters:last_cum")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pair_counters",
          filter: `key=eq.${COUNTER_KEY}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();

    const interval = window.setInterval(() => setTick((t) => t + 1), 60_000);

    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(interval);
    };
  }, [load]);

  const reset = async () => {
    if (!profile) return;
    setResetting(true);
    const supabase = createClient();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("pair_counters")
      .update({ reset_at: now, reset_by: profile.id })
      .eq("key", COUNTER_KEY);

    setResetting(false);
    if (error) {
      toast.error(error.message || "Could not reset counter");
      return;
    }
    setResetAt(now);
    toast.success("Counter reset");
  };

  void tick;

  const elapsed = resetAt ? formatElapsedSince(resetAt) : "—";

  if (compact) {
    return (
      <div
        className={cn(
          "rounded-xl border border-gold/15 bg-charcoal/80 p-3 sm:p-4",
          className
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Last cum
          </p>
          <Timer className="size-3.5 shrink-0 text-gold/70" />
        </div>
        <p className="mt-1.5 font-heading text-2xl tabular-nums text-gold sm:text-3xl">
          {loading ? "…" : elapsed}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || resetting}
          onClick={() => void reset()}
          className="mt-2 h-8 border-gold/30 text-xs text-gold hover:bg-gold/10"
        >
          {resetting ? (
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
          ) : (
            <RotateCcw className="mr-1.5 h-3 w-3" />
          )}
          Reset
        </Button>
      </div>
    );
  }

  return (
    <Card className={cn("border-royal/30 bg-charcoal", className)}>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardDescription>Last cum</CardDescription>
        <Timer className="size-4 text-gold" />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="font-heading text-3xl tabular-nums text-gold">
          {loading ? "…" : elapsed}
        </p>
        <p className="text-xs text-muted-foreground">since last reset</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || resetting}
          onClick={() => void reset()}
          className="border-gold/35 text-gold hover:bg-gold/10"
        >
          {resetting ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
          )}
          Reset counter
        </Button>
      </CardContent>
    </Card>
  );
}
