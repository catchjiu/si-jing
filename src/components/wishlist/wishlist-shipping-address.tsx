"use client";

import { useState } from "react";
import { Check, Copy, MapPin } from "lucide-react";
import { toast } from "sonner";
import { QUEEN_SHIPPING_ADDRESS } from "@/lib/partner-locations";
import { Button } from "@/components/ui/button";

export function WishlistShippingAddress() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(QUEEN_SHIPPING_ADDRESS);
      setCopied(true);
      toast.success("Address copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy address");
    }
  };

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gold/20 bg-charcoal/70 px-4 py-3">
      <div className="flex min-w-0 gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-void/40 text-gold">
          <MapPin className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Ship to Queen
          </p>
          <p className="mt-0.5 text-sm text-ivory">{QUEEN_SHIPPING_ADDRESS}</p>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0 border-gold/30 text-gold"
        onClick={() => void copy()}
      >
        {copied ? (
          <Check className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <Copy className="mr-1.5 h-3.5 w-3.5" />
        )}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
