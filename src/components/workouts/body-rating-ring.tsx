"use client";

import { cn } from "@/lib/utils";

export function BodyRatingRing({
  value,
  size = 140,
  label = "Overall",
}: {
  value: number;
  size?: number;
  label?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const center = size / 2;

  return (
    <div
      className={cn(
        "relative inline-flex flex-col items-center",
        clamped > 0 && "glow-gold"
      )}
    >
      <svg width={size} height={size} className="-rotate-90 animate-fade-in">
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
          className="text-gold transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        aria-hidden
      >
        <span className="font-heading text-3xl text-gold">{clamped}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}
