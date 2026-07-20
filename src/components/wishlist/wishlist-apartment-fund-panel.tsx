"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  addQueenApartmentFundEntry,
  formatNtd,
  listQueenApartmentFundEntries,
  parseNtdInput,
  sumApartmentFundNtd,
  type QueenApartmentFundEntry,
} from "@/lib/wishlist-apartment-fund";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type WishlistApartmentFundPanelProps = {
  className?: string;
};

export function WishlistApartmentFundPanel({
  className,
}: WishlistApartmentFundPanelProps) {
  const { isQueen, isSlave, profile } = useAuth();
  const [entries, setEntries] = useState<QueenApartmentFundEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [saving, setSaving] = useState(false);

  const totalNtd = useMemo(() => sumApartmentFundNtd(entries), [entries]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const supabase = createClient();
    try {
      const rows = await listQueenApartmentFundEntries(supabase);
      setEntries(rows);
    } catch (err) {
      setEntries([]);
      const msg =
        err instanceof Error ? err.message : "Could not load apartment fund";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isQueen || isSlave) void load();
  }, [isQueen, isSlave, load]);

  const submitEntry = async () => {
    if (!profile) return;
    const amount = parseNtdInput(amountInput);
    if (amount == null) {
      toast.error("Enter an amount greater than zero (NTD)");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    try {
      const row = await addQueenApartmentFundEntry(supabase, {
        userId: profile.id,
        amountNtd: amount,
      });
      setEntries((prev) => [row, ...prev]);
      setAmountInput("");
      toast.success("Added to Queen's apartment fund");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not add to apartment fund"
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isQueen && !isSlave) return null;

  if (loading) {
    return (
      <section
        className={cn(
          "flex items-center gap-2 rounded-xl border border-gold/15 bg-charcoal/60 px-4 py-3 text-sm text-muted-foreground",
          className
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading Queen&apos;s apartment fund…
      </section>
    );
  }

  if (loadError) {
    return (
      <section
        className={cn(
          "rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200",
          className
        )}
      >
        <p className="font-medium">Queen&apos;s apartment fund unavailable</p>
        <p className="mt-1 text-xs text-red-200/80">{loadError}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3 border-red-400/40 text-red-200"
          onClick={() => void load()}
        >
          Retry
        </Button>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "rounded-xl border border-gold/20 bg-charcoal/70 p-4 sm:p-5 space-y-4",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-void/40 text-gold">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-xl text-gold">
            Queen&apos;s apartment fund
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Taiwan New Dollars (NTD)
          </p>
          <p className="mt-2 font-heading text-2xl tabular-nums text-ivory">
            Total {formatNtd(totalNtd)}
          </p>
        </div>
      </div>

      {isSlave ? (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void submitEntry();
          }}
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="apartment-fund-amount">Add amount (NTD)</Label>
            <Input
              id="apartment-fund-amount"
              type="text"
              inputMode="decimal"
              placeholder="e.g. 5000"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="border-gold/20 bg-void/60"
              disabled={saving}
            />
          </div>
          <Button
            type="submit"
            disabled={saving}
            className="bg-gold text-void hover:bg-gold-muted sm:shrink-0"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Add to fund
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          D adds money here toward Queen&apos;s apartment.
        </p>
      )}

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Contributions
        </p>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No contributions yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gold/10 bg-void/40 px-3 py-2 text-sm"
              >
                <p className="text-muted-foreground tabular-nums">
                  {format(new Date(row.created_at), "MMM d, yyyy")}
                </p>
                <p className="shrink-0 font-medium tabular-nums text-gold">
                  {formatNtd(row.amount_ntd)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
