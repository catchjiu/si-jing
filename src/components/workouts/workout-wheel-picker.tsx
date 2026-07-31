"use client";

import { useCallback, useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const ITEM_HEIGHT = 36;
const VISIBLE_HEIGHT = 140;
const PADDING = (VISIBLE_HEIGHT - ITEM_HEIGHT) / 2;

export function WorkoutWheelPicker({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (value: number) => void;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const ticking = useRef(false);

  const scrollToValue = useCallback(
    (v: number, smooth = false) => {
      const idx = options.indexOf(v);
      if (idx < 0 || !scrollRef.current) return;
      scrollRef.current.scrollTo({
        top: idx * ITEM_HEIGHT,
        behavior: smooth ? "smooth" : "auto",
      });
    },
    [options]
  );

  useEffect(() => {
    scrollToValue(value);
  }, [value, scrollToValue]);

  const handleScroll = useCallback(() => {
    if (ticking.current || !scrollRef.current) return;
    ticking.current = true;
    requestAnimationFrame(() => {
      ticking.current = false;
      const el = scrollRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = Math.min(Math.max(idx, 0), options.length - 1);
      const next = options[clamped];
      if (next !== undefined && next !== value) {
        onChange(next);
      }
    });
  }, [options, value, onChange]);

  const handleScrollEnd = useCallback(() => {
    if (!scrollRef.current) return;
    const idx = Math.round(scrollRef.current.scrollTop / ITEM_HEIGHT);
    const clamped = Math.min(Math.max(idx, 0), options.length - 1);
    scrollRef.current.scrollTo({ top: clamped * ITEM_HEIGHT, behavior: "smooth" });
    const next = options[clamped];
    if (next !== undefined && next !== value) {
      onChange(next);
    }
  }, [options, value, onChange]);

  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative h-[140px] overflow-hidden rounded-lg border border-gold/20 bg-void/60">
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 border-y border-gold/30 bg-gold/5"
          style={{ height: ITEM_HEIGHT }}
        />
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            scrollSnapType: "y mandatory",
            paddingTop: PADDING,
            paddingBottom: PADDING,
          }}
          onScroll={handleScroll}
          onPointerUp={handleScrollEnd}
          onTouchEnd={handleScrollEnd}
        >
          {options.map((opt) => {
            const active = opt === value;
            return (
              <button
                key={opt}
                type="button"
                className={cn(
                  "flex h-9 w-full shrink-0 items-center justify-center scroll-snap-center font-heading text-lg transition-colors",
                  active ? "text-gold" : "text-ivory/30"
                )}
                style={{ height: ITEM_HEIGHT }}
                onClick={() => {
                  onChange(opt);
                  scrollToValue(opt, true);
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
