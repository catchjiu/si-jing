"use client";

import { useEffect, useState } from "react";
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

export function FartRatingPanel({ entry, onSaved }: Props) {
  const { isSlave } = useAuth();
  const [loudness, setLoudness] = useState(entry.loudness ?? 50);
  const [hotness, setHotness] = useState(entry.hotness ?? 50);
  const [saving, setSaving] = useState(false);
  const rated = entry.loudness != null && entry.hotness != null;

  useEffect(() => {
    setLoudness(entry.loudness ?? 50);
    setHotness(entry.hotness ?? 50);
  }, [entry.id, entry.loudness, entry.hotness]);

  const save = async () => {
    if (!isSlave) return;
    setSaving(true);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("fart_entries")
        .update({
          loudness,
          hotness,
        })
        .eq("id", entry.id);
      if (error) throw error;
      toast.success("Rating saved");
      onSaved({
        loudness,
        hotness,
        rated_at: new Date().toISOString(),
      });
      void notifyPush({
        title: "D rated a fart",
        body: `Loudness ${loudness}% · Hotness ${hotness}%`,
        url: fartPageHref(entry.id),
        target: "queen",
        kind: "fart",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save rating");
    } finally {
      setSaving(false);
    }
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
          onValueChange={(v) => setLoudness(v[0] ?? 0)}
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
          onValueChange={(v) => setHotness(v[0] ?? 0)}
          className={cn("[&_[data-slot=slider-range]]:bg-rose-400/80")}
        />
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-gold/25"
        disabled={saving}
        onClick={() => void save()}
      >
        {saving ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : null}
        {rated ? "Update rating" : "Save rating"}
      </Button>
    </div>
  );
}
