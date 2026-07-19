"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  rating: number | null | undefined;
  onRate?: (stars: number) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  showEmptyHint?: boolean;
};

export function GiftRatingStars({
  rating,
  onRate,
  disabled = false,
  size = "md",
  className,
  showEmptyHint = false,
}: Props) {
  const value = rating != null && rating >= 1 && rating <= 5 ? rating : 0;
  const interactive = Boolean(onRate) && !disabled;
  const iconClass = size === "sm" ? "size-3.5" : "size-5";

  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      role={interactive ? "radiogroup" : "img"}
      aria-label={
        value > 0 ? `${value} out of 5 stars` : "Not rated yet"
      }
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        const Comp = interactive ? "button" : "span";
        return (
          <Comp
            key={star}
            type={interactive ? "button" : undefined}
            disabled={disabled}
            onClick={interactive ? () => onRate?.(star) : undefined}
            className={cn(
              "inline-flex items-center justify-center rounded-sm transition-colors",
              interactive &&
                "hover:scale-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold/50",
              disabled && "opacity-60"
            )}
            aria-label={interactive ? `Rate ${star} stars` : undefined}
            aria-checked={interactive ? filled && star === value : undefined}
            role={interactive ? "radio" : undefined}
          >
            <Star
              className={cn(
                iconClass,
                filled
                  ? "fill-gold text-gold"
                  : "fill-transparent text-muted-foreground/50"
              )}
            />
          </Comp>
        );
      })}
      {showEmptyHint && value === 0 ? (
        <span className="ml-1.5 text-xs text-muted-foreground">
          Not rated yet
        </span>
      ) : null}
    </div>
  );
}

export function formatGiftRatingAverage(
  items: { queen_rating?: number | null }[]
): { average: number; ratedCount: number; total: number } | null {
  const rated = items.filter(
    (i) => i.queen_rating != null && i.queen_rating >= 1 && i.queen_rating <= 5
  );
  if (items.length === 0) return null;
  if (rated.length === 0) {
    return { average: 0, ratedCount: 0, total: items.length };
  }
  const sum = rated.reduce((acc, i) => acc + Number(i.queen_rating), 0);
  return {
    average: sum / rated.length,
    ratedCount: rated.length,
    total: items.length,
  };
}
