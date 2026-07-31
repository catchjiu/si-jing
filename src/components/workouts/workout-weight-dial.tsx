"use client";

import { cn } from "@/lib/utils";

export function WorkoutWeightDial({
  weight,
  unit = "kg",
  setLabel,
}: {
  weight: number;
  unit?: string;
  setLabel: string;
}) {
  const size = 200;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const arcLength = 0.65;
  const circumference = 2 * Math.PI * radius;
  const arcSpan = circumference * arcLength;
  const arcOffset = circumference * ((1 - arcLength) / 2);

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-center text-[11px] uppercase tracking-widest text-muted-foreground">
        {setLabel}
      </p>
      <div className={cn("relative glow-gold")}>
        <svg
          width={size}
          height={size}
          className="-rotate-[117deg] animate-fade-in"
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeDasharray={`${arcSpan} ${circumference - arcSpan}`}
            strokeDashoffset={-arcOffset}
            strokeLinecap="round"
            className="text-gold/25"
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeDasharray={`${arcSpan * 0.4} ${circumference}`}
            strokeDashoffset={-arcOffset}
            strokeLinecap="round"
            className="text-gold transition-[stroke-dasharray] duration-300"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            key={weight}
            className="font-heading text-5xl text-gold animate-rise"
          >
            {weight}
          </span>
          <span className="text-sm uppercase tracking-wider text-muted-foreground">
            {unit}
          </span>
        </div>
      </div>
    </div>
  );
}
