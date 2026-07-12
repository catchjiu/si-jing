"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

const MOOD_EMOJIS = [
  { min: 1, emoji: "😔", label: "Low" },
  { min: 20, emoji: "😐", label: "Neutral" },
  { min: 40, emoji: "🙂", label: "Okay" },
  { min: 60, emoji: "😊", label: "Good" },
  { min: 80, emoji: "🔥", label: "Energized" },
];

function emojiForLevel(level: number): string {
  let pick = MOOD_EMOJIS[0];
  for (const m of MOOD_EMOJIS) {
    if (level >= m.min) pick = m;
  }
  return pick.emoji;
}

function labelForLevel(level: number): string {
  let pick = MOOD_EMOJIS[0];
  for (const m of MOOD_EMOJIS) {
    if (level >= m.min) pick = m;
  }
  return pick.label;
}

interface MoodPickerProps {
  className?: string;
  onUpdated?: () => void;
}

export function MoodPicker({ className, onUpdated }: MoodPickerProps) {
  const { profile, isSlave } = useAuth();
  const [level, setLevel] = useState(50);
  const [emoji, setEmoji] = useState("😐");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile || !isSlave) return;
    const supabase = createClient();
    void supabase
      .from("user_status")
      .select("*")
      .eq("user_id", profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setLevel(data.mood_level);
          setEmoji(data.mood_emoji);
        }
        setLoaded(true);
      });
  }, [profile, isSlave]);

  const save = async (newLevel: number) => {
    if (!profile || !isSlave) return;
    const newEmoji = emojiForLevel(newLevel);
    setLevel(newLevel);
    setEmoji(newEmoji);
    setSaving(true);
    const supabase = createClient();
    const row = {
      user_id: profile.id,
      mood_level: newLevel,
      mood_emoji: newEmoji,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("user_status").upsert(row);
    setSaving(false);
    if (error) {
      toast.error("Could not save mood");
      return;
    }
    onUpdated?.();
  };

  if (!isSlave) return null;

  return (
    <div
      className={cn(
        "rounded-xl border border-gold/15 bg-charcoal/80 p-4 sm:p-5 space-y-4",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label className="text-ivory">How are you feeling?</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Queen sees this on her command center
          </p>
        </div>
        <span className="text-4xl" aria-hidden>
          {emoji}
        </span>
      </div>

      {loaded && (
        <>
          <p className="font-heading text-xl text-gold">{labelForLevel(level)}</p>
          <Slider
            value={[level]}
            onValueCommit={(v) => void save(v[0] ?? 50)}
            onValueChange={(v) => {
              const n = v[0] ?? 50;
              setLevel(n);
              setEmoji(emojiForLevel(n));
            }}
            min={1}
            max={100}
            step={1}
            aria-label="Mood level"
            className="py-2 **:data-[slot=slider-range]:bg-gold **:data-[slot=slider-thumb]:border-gold **:data-[slot=slider-thumb]:bg-gold"
          />
          {saving && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </p>
          )}
        </>
      )}
    </div>
  );
}

interface MoodDisplayProps {
  moodLevel: number;
  moodEmoji: string;
  username?: string;
  updatedAt?: string;
  className?: string;
}

export function MoodDisplay({
  moodLevel,
  moodEmoji,
  username,
  updatedAt,
  className,
}: MoodDisplayProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gold/15 bg-charcoal/80 p-4 flex items-center gap-4",
        className
      )}
    >
      <span className="text-4xl" aria-hidden>
        {moodEmoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {username ? `${username}'s mood` : "Mood"}
        </p>
        <p className="font-heading text-lg text-ivory">
          {labelForLevel(moodLevel)}{" "}
          <span className="text-gold tabular-nums">{moodLevel}/100</span>
        </p>
        {updatedAt && (
          <p className="text-xs text-muted-foreground">
            Updated {new Date(updatedAt).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
