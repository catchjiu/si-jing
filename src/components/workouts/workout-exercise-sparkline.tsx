"use client";

import { cn } from "@/lib/utils";

const WIDTH = 64;
const HEIGHT = 24;
const PAD = 2;

function buildPath(values: number[]): { line: string; area: string } | null {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = WIDTH - PAD * 2;
  const innerH = HEIGHT - PAD * 2;

  const points = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * innerW;
    const y = PAD + innerH - ((v - min) / range) * innerH;
    return { x, y };
  });

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${points[points.length - 1].x},${HEIGHT} L${points[0].x},${HEIGHT} Z`;

  return { line, area };
}

export function WorkoutExerciseSparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  const path = buildPath(values);

  if (!path) {
    return (
      <svg
        width={WIDTH}
        height={HEIGHT}
        className={cn("shrink-0", className)}
        aria-hidden
      >
        <line
          x1={PAD}
          y1={HEIGHT / 2}
          x2={WIDTH - PAD}
          y2={HEIGHT / 2}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="3 3"
          className="text-ivory/20"
        />
      </svg>
    );
  }

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path d={path.area} className="fill-gold/15" />
      <path
        d={path.line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-gold"
      />
    </svg>
  );
}
