"use client";

import { Gift } from "lucide-react";
import { formatUsdFromCents } from "@/lib/wishlist-budget";
import { cn } from "@/lib/utils";

type WishlistTotalSpentPanelProps = {
  totalUsd: number;
  giftCount: number;
  className?: string;
};

export function WishlistTotalSpentPanel({
  totalUsd,
  giftCount,
  className,
}: WishlistTotalSpentPanelProps) {
  const formattedTotal = formatUsdFromCents(Math.round(totalUsd * 100));
  const giftLabel =
    giftCount === 1 ? "1 revealed gift" : `${giftCount} revealed gifts`;

  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gold/20 bg-charcoal/70 px-4 py-3",
        className
      )}
    >
      <div className="flex min-w-0 gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-void/40 text-gold">
          <Gift className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Total spent on Queen
          </p>
          <p className="mt-0.5 font-heading text-xl tabular-nums text-ivory">
            {formattedTotal}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            USD · {giftLabel}
          </p>
        </div>
      </div>
    </div>
  );
}
