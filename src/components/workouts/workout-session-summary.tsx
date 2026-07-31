"use client";

import { formatVolume } from "@/lib/workout-stats";
import { cn } from "@/lib/utils";

function MetricTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg border px-3 py-2.5",
        highlight
          ? "border-gold/30 bg-gold/5"
          : "border-gold/15 bg-void/40"
      )}
    >
      <span className="font-heading text-lg text-gold">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function WorkoutSessionSummary({
  volume,
  setCount,
  exerciseCount,
  durationMin,
  prCount,
}: {
  volume: number;
  setCount: number;
  exerciseCount: number;
  durationMin: number | null;
  prCount?: number;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <MetricTile label="Volume" value={formatVolume(volume)} />
      <MetricTile label="Sets" value={setCount} />
      <MetricTile label="Exercises" value={exerciseCount} />
      {durationMin != null && (
        <MetricTile label="Mins" value={durationMin} />
      )}
      {prCount != null && prCount > 0 && (
        <MetricTile label="PRs" value={prCount} highlight />
      )}
    </div>
  );
}
