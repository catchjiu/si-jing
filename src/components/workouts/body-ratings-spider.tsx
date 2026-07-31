"use client";

import {
  BODY_PARTS,
  BODY_PART_LABELS,
  type WorkoutBodyPart,
} from "@/lib/workout-exercises";
import { cn } from "@/lib/utils";

const AXES = BODY_PARTS.length;
const ANGLE_OFFSET = -Math.PI / 2;

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  index: number
): [number, number] {
  const angle = ANGLE_OFFSET + (index * 2 * Math.PI) / AXES;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function scorePoints(
  cx: number,
  cy: number,
  maxRadius: number,
  scores: Record<WorkoutBodyPart, number>
): string {
  return BODY_PARTS.map((part, i) => {
    const score = Math.min(100, Math.max(0, scores[part] ?? 0));
    const r = (score / 100) * maxRadius;
    const [x, y] = polarToCartesian(cx, cy, r, i);
    return `${x},${y}`;
  }).join(" ");
}

export function BodyRatingsSpider({
  scores,
  highlight = null,
  onSelectPart,
  size = 220,
}: {
  scores: Record<WorkoutBodyPart, number>;
  highlight?: WorkoutBodyPart | null;
  onSelectPart?: (p: WorkoutBodyPart) => void;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size * 0.32;
  const labelRadius = size * 0.44;

  const avg =
    BODY_PARTS.reduce((sum, p) => sum + (scores[p] ?? 0), 0) / BODY_PARTS.length;
  const fillOpacity = 0.08 + (avg / 100) * 0.35;

  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="animate-fade-in"
      role="img"
      aria-label="Body part ratings spider chart"
    >
      {gridLevels.map((level) => (
        <polygon
          key={level}
          points={BODY_PARTS.map((_, i) => {
            const [x, y] = polarToCartesian(cx, cy, maxRadius * level, i);
            return `${x},${y}`;
          }).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          className="text-gold/15"
        />
      ))}

      {BODY_PARTS.map((part, i) => {
        const [x, y] = polarToCartesian(cx, cy, maxRadius, i);
        const active = highlight === part;
        return (
          <line
            key={part}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="currentColor"
            strokeWidth={active ? 1.5 : 1}
            className={cn(
              "transition-colors",
              active ? "text-gold/60" : "text-gold/20",
              onSelectPart && "cursor-pointer"
            )}
            onClick={() => onSelectPart?.(part)}
          />
        );
      })}

      <polygon
        points={scorePoints(cx, cy, maxRadius, scores)}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        className="text-gold transition-[opacity,stroke-opacity] duration-500 ease-out"
        style={{ fillOpacity, strokeOpacity: 0.7 + (avg / 100) * 0.3 }}
      />

      {BODY_PARTS.map((part, i) => {
        const [x, y] = polarToCartesian(cx, cy, labelRadius, i);
        const active = highlight === part;
        const score = scores[part] ?? 0;
        return (
          <g
            key={part}
            className={cn(onSelectPart && "cursor-pointer")}
            onClick={() => onSelectPart?.(part)}
          >
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className={cn(
                "select-none text-[10px] uppercase tracking-wide transition-colors",
                active ? "fill-gold font-medium" : "fill-ivory/60"
              )}
            >
              {BODY_PART_LABELS[part]}
            </text>
            <text
              x={x}
              y={y + 12}
              textAnchor="middle"
              dominantBaseline="middle"
              className={cn(
                "select-none font-heading text-[11px] transition-colors",
                active ? "fill-gold" : "fill-gold/70"
              )}
            >
              {score}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
