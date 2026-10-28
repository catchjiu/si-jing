"use client";

import { useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  QUEEN_LOVE_COOLDOWN_MINUTES_SECONDS,
  QUEEN_LOVE_COOLDOWN_OPTIONS,
  fetchQueenLoveCooldown,
  saveQueenLoveCooldown,
  type QueenLoveCooldownSeconds,
} from "@/lib/queen-love";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function QueenLoveWaitSettings() {
  const { isHomeSlave } = useAuth();
  const [seconds, setSeconds] = useState<QueenLoveCooldownSeconds>(
    QUEEN_LOVE_COOLDOWN_MINUTES_SECONDS
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<QueenLoveCooldownSeconds | null>(null);

  useEffect(() => {
    if (!isHomeSlave) return;
    let cancelled = false;
    const run = async () => {
      const supabase = createClient();
      try {
        const next = await fetchQueenLoveCooldown(supabase);
        if (!cancelled) setSeconds(next);
      } catch (err) {
        console.error("queen_love_cooldown", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [isHomeSlave]);

  if (!isHomeSlave) return null;

  const onSelect = async (next: QueenLoveCooldownSeconds) => {
    if (next === seconds || saving) return;
    setSaving(next);
    const supabase = createClient();
    try {
      setSeconds(await saveQueenLoveCooldown(supabase, next));
      toast.success(
        next === QUEEN_LOVE_COOLDOWN_MINUTES_SECONDS
          ? "Hearts wait set to 5 minutes"
          : "Hearts wait set to 5 seconds"
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save wait duration"
      );
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="rounded-xl border border-gold/15 bg-charcoal/80 p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Hearts for Queen
          </p>
          <h2 className="font-heading text-xl text-ivory">Wait between hearts</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            How long you wait after tapping. Only you can see this.
          </p>
        </div>
        <Heart className="size-5 shrink-0 fill-rose-400/80 text-rose-300" />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {QUEEN_LOVE_COOLDOWN_OPTIONS.map((option) => {
            const selected = seconds === option.seconds;
            return (
              <Button
                key={option.seconds}
                type="button"
                variant={selected ? "default" : "outline"}
                disabled={saving != null}
                onClick={() => void onSelect(option.seconds)}
                className={cn(
                  selected
                    ? "bg-gold text-void hover:bg-gold-muted"
                    : "border-gold/30 text-ivory hover:bg-gold/10"
                )}
              >
                {saving === option.seconds ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : null}
                {option.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
