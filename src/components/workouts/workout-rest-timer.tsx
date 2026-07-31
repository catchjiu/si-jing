"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRESETS = [60, 90, 120] as const;

export function WorkoutRestTimer({
  seconds,
  total,
  onDismiss,
  onPreset,
  running,
}: {
  seconds: number;
  total: number;
  onDismiss: () => void;
  onPreset: (s: 60 | 90 | 120) => void;
  running: boolean;
}) {
  const clamped = Math.max(0, seconds);
  const progress = total > 0 ? clamped / total : 0;
  const size = 72;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - progress * circumference;
  const center = size / 2;

  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  const display = mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}`;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-gold/20 bg-charcoal/80 px-4 py-3 glow-gold">
      <div className="relative shrink-0">
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-void/80"
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn(
              "text-gold transition-[stroke-dashoffset] duration-1000 ease-linear",
              !running && "duration-0"
            )}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-heading text-lg text-gold">
          {display}
        </span>
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-2">
        {PRESETS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPreset(s)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
              total === s && running
                ? "border-gold bg-gold/15 text-gold"
                : "border-gold/20 text-muted-foreground hover:border-gold/40 hover:text-ivory"
            )}
          >
            {s}s
          </button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onDismiss}
          className="ml-auto text-muted-foreground hover:text-ivory"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
