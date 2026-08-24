"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { FartEntry } from "@/lib/types";
import { hotnessLabel, loudnessLabel } from "@/lib/fart";
import { fartPageHref } from "@/lib/inbox-deep-links";
import { notifyPush } from "@/lib/push-client";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { FlirtLevelMeter } from "@/components/flirt/flirt-interest-slider";

type Props = {
  entry: FartEntry;
  onSaved: (next: Pick<FartEntry, "loudness" | "hotness" | "rated_at">) => void;
};

function clampScore(n: number) {
  return Math.min(100, Math.max(0, Math.round(Number.isFinite(n) ? n : 0)));
}

export function FartRatingPanel({ entry, onSaved }: Props) {
  const { isSlave } = useAuth();
  const [loudness, setLoudness] = useState(entry.loudness ?? 50);
  const [hotness, setHotness] = useState(entry.hotness ?? 50);
  const [saving, setSaving] = useState(false);
  const loudnessRef = useRef(loudness);
  const hotnessRef = useRef(hotness);
  const saveTimer = useRef<number | null>(null);
  const saveGen = useRef(0);
  const notifiedRef = useRef(entry.rated_at != null);
  const rated = entry.loudness != null && entry.hotness != null;
  loudnessRef.current = loudness;
  hotnessRef.current = hotness;

  useEffect(() => {
    setLoudness(entry.loudness ?? 50);
    setHotness(entry.hotness ?? 50);
    notifiedRef.current = entry.rated_at != null;
  }, [entry.id]);

  useEffect(() => {
    return () => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const persist = async (
    nextLoudness: number,
    nextHotness: number,
    opts?: { toast?: boolean }
  ) => {
    if (!isSlave) return;
    const loud = clampScore(nextLoudness);
    const hot = clampScore(nextHotness);
    const firstRating = entry.loudness == null && entry.hotness == null;
    const gen = ++saveGen.current;
    setSaving(true);
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from("fart_entries")
        .update({
          loudness: loud,
          hotness: hot,
        })
        .eq("id", entry.id)
        .select("loudness, hotness, rated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Could not save rating");
      if (gen !== saveGen.current) return;
      if (opts?.toast) toast.success("Rating saved");
      onSaved({
        loudness: data.loudness,
        hotness: data.hotness,
        rated_at: data.rated_at,
      });
      if (firstRating && !notifiedRef.current) {
        notifiedRef.current = true;
        void notifyPush({
          title: "D rated a fart",
          body: `Loudness ${loud}% · Hotness ${hot}%`,
          url: fartPageHref(entry.id),
          target: "queen",
          kind: "fart",
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save rating");
    } finally {
      if (gen === saveGen.current) setSaving(false);
    }
  };

  const schedulePersist = (nextLoudness: number, nextHotness: number) => {
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist(nextLoudness, nextHotness);
    }, 350);
  };

  if (!isSlave) {
    if (!rated) {
      return (
        <p className="text-xs text-muted-foreground">
          D has not rated loudness or hotness yet.
        </p>
      );
    }
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <FlirtLevelMeter
          label={`Loudness · ${loudnessLabel(entry.loudness ?? 0)}`}
          value={entry.loudness ?? 0}
        />
        <FlirtLevelMeter
          label={`Hotness · ${hotnessLabel(entry.hotness ?? 0)}`}
          value={entry.hotness ?? 0}
          barClassName="bg-rose-400/80"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-gold/15 bg-void/30 p-3">
      <p className="text-[11px] uppercase tracking-wider text-gold/80">
        Your rating
      </p>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`fart-loudness-${entry.id}`} className="text-sm text-ivory">
            Loudness
          </Label>
          <span className="text-xs text-gold">
            {loudness}% · {loudnessLabel(loudness)}
          </span>
        </div>
        <Slider
          id={`fart-loudness-${entry.id}`}
          min={0}
          max={100}
          step={1}
          value={[loudness]}
          disabled={saving}
          onValueChange={(v) => {
            const n = clampScore(v[0] ?? 0);
            setLoudness(n);
            schedulePersist(n, hotnessRef.current);
          }}
          onValueCommit={(v) => {
            const n = clampScore(v[0] ?? 0);
            setLoudness(n);
            if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
            void persist(n, hotnessRef.current);
          }}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`fart-hotness-${entry.id}`} className="text-sm text-ivory">
            Hotness
          </Label>
          <span className="text-xs text-gold">
            {hotness}% · {hotnessLabel(hotness)}
          </span>
        </div>
        <Slider
          id={`fart-hotness-${entry.id}`}
          min={0}
          max={100}
          step={1}
          value={[hotness]}
          disabled={saving}
          onValueChange={(v) => {
            const n = clampScore(v[0] ?? 0);
            setHotness(n);
            schedulePersist(loudnessRef.current, n);
          }}
          onValueCommit={(v) => {
            const n = clampScore(v[0] ?? 0);
            setHotness(n);
            if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
            void persist(loudnessRef.current, n);
          }}
          className={cn("[&_[data-slot=slider-range]]:bg-rose-400/80")}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-gold/25"
          disabled={saving}
          onClick={() =>
            void persist(loudnessRef.current, hotnessRef.current, { toast: true })
          }
        >
          {saving ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : null}
          {rated ? "Update rating" : "Save rating"}
        </Button>
        {saving ? (
          <span className="text-[11px] text-muted-foreground">Saving…</span>
        ) : rated ? (
          <span className="text-[11px] text-gold/80">Saved</span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            Moves save automatically
          </span>
        )}
      </div>
    </div>
  );
}
