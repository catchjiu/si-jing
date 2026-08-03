"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  BODY_PARTS,
  BODY_PART_LABELS,
  type WorkoutBodyPart,
} from "@/lib/workout-exercises";
import type { BodyRatingSnapshot } from "@/lib/types";
import { BodyRatingRing } from "@/components/workouts/body-rating-ring";
import { BodyRatingsSpider } from "@/components/workouts/body-ratings-spider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SWIPE_THRESHOLD = 48;

type Scores = {
  overall: number;
} & Record<WorkoutBodyPart, number>;

function scoresFromSnapshot(row: BodyRatingSnapshot): Scores {
  return {
    overall: row.overall,
    arms: row.arms,
    shoulders: row.shoulders,
    chest: row.chest,
    abs: row.abs,
    back: row.back,
    butt: row.butt,
  };
}

function formatWeekLabel(weekStart: string, ratedAt: string) {
  try {
    const week = new Date(`${weekStart}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const rated = new Date(ratedAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return { week, rated };
  } catch {
    return { week: weekStart, rated: ratedAt };
  }
}

export function BodyRatingHistory({
  snapshots,
  className,
}: {
  snapshots: BodyRatingSnapshot[];
  className?: string;
}) {
  const sorted = useMemo(
    () =>
      [...snapshots].sort((a, b) => b.week_start.localeCompare(a.week_start)),
    [snapshots]
  );

  const [index, setIndex] = useState(0);
  const [highlight, setHighlight] = useState<WorkoutBodyPart | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const startX = useRef(0);
  const startY = useRef(0);
  const pointerId = useRef<number | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    setIndex(0);
  }, [snapshots]);

  const current = sorted[index] ?? null;
  const scores = useMemo(
    () => (current ? scoresFromSnapshot(current) : null),
    [current]
  );

  const partScores = useMemo(() => {
    if (!scores) return {} as Record<WorkoutBodyPart, number>;
    const o = {} as Record<WorkoutBodyPart, number>;
    for (const p of BODY_PARTS) o[p] = scores[p];
    return o;
  }, [scores]);

  const goNewer = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const goOlder = useCallback(() => {
    setIndex((i) => Math.min(sorted.length - 1, i + 1));
  }, [sorted.length]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (sorted.length <= 1) return;
    pointerId.current = e.pointerId;
    startX.current = e.clientX;
    startY.current = e.clientY;
    draggingRef.current = false;
    setDragging(false);
    setOffset(0);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointerId.current !== e.pointerId || sorted.length <= 1) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (!draggingRef.current && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      draggingRef.current = true;
      setDragging(true);
    }
    if (draggingRef.current) {
      const atStart = index === 0 && dx > 0;
      const atEnd = index === sorted.length - 1 && dx < 0;
      const resisted = atStart || atEnd ? dx * 0.35 : dx;
      setOffset(Math.max(-120, Math.min(120, resisted)));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (pointerId.current !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    pointerId.current = null;

    if (draggingRef.current) {
      if (offset <= -SWIPE_THRESHOLD) goOlder();
      else if (offset >= SWIPE_THRESHOLD) goNewer();
    }

    draggingRef.current = false;
    setDragging(false);
    setOffset(0);
  };

  if (!current || !scores) {
    return (
      <p className={cn("text-center text-sm text-muted-foreground", className)}>
        Queen has not rated you yet.
      </p>
    );
  }

  const { week, rated } = formatWeekLabel(current.week_start, current.rated_at);
  const isMostRecent = index === 0;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-gold hover:bg-gold/10"
          disabled={index === 0}
          onClick={goNewer}
          aria-label="Newer rating"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <div className="min-w-0 flex-1 text-center">
          {isMostRecent && (
            <p className="text-[10px] uppercase tracking-wider text-gold/80">
              Most recent
            </p>
          )}
          <p className="truncate font-heading text-sm text-ivory">{week}</p>
          <p className="text-[10px] text-muted-foreground">
            {sorted.length > 1
              ? `${index + 1} of ${sorted.length} · rated ${rated}`
              : `Rated ${rated}`}
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-gold hover:bg-gold/10"
          disabled={index >= sorted.length - 1}
          onClick={goOlder}
          aria-label="Older rating"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <div
        className="touch-pan-y select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className={cn(
            "flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-center",
            !dragging && "transition-transform duration-200"
          )}
          style={{ transform: `translateX(${offset}px)` }}
        >
          <BodyRatingRing value={scores.overall} />
          <BodyRatingsSpider
            scores={partScores}
            highlight={highlight}
            onSelectPart={setHighlight}
          />
        </div>
      </div>

      {sorted.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {sorted.map((snap, i) => (
            <button
              key={snap.id}
              type="button"
              aria-label={`Rating ${i + 1}`}
              onClick={() => setIndex(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? "w-4 bg-gold" : "w-1.5 bg-gold/30 hover:bg-gold/50"
              )}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {BODY_PARTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setHighlight(p)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              highlight === p
                ? "border-gold bg-gold/15 text-gold"
                : "border-gold/20 text-muted-foreground"
            )}
          >
            {BODY_PART_LABELS[p]} · {scores[p]}
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Overall {scores.overall}/100 · updated by Queen
        {sorted.length > 1 ? " · swipe for history" : ""}
      </p>
    </div>
  );
}
