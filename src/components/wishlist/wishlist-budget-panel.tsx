"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  budgetSummaryToSettings,
  fetchPrimarySlaveId,
  fetchWishlistBudget,
  formatUsdFromCents,
  listWishlistPurchases,
  parseUsdInput,
  setWishlistBudget,
  type WishlistBudgetSettings,
  type WishlistBudgetSummary,
  type WishlistPurchaseRow,
} from "@/lib/wishlist-budget";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type WishlistBudgetPanelProps = {
  className?: string;
  /** Bump to reload after a purchase. */
  refreshKey?: number;
};

export function WishlistBudgetPanel({
  className,
  refreshKey = 0,
}: WishlistBudgetPanelProps) {
  const { profile, isQueen, isSlave } = useAuth();
  const [budget, setBudget] = useState<WishlistBudgetSummary | null>(null);
  const [purchases, setPurchases] = useState<WishlistPurchaseRow[]>([]);
  const [slaveId, setSlaveId] = useState<string | null>(null);
  const [settings, setSettings] = useState<WishlistBudgetSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setLoadError(null);
    const supabase = createClient();
    try {
      let userId = profile.id;
      if (isQueen) {
        const id = await fetchPrimarySlaveId(supabase);
        if (!id) {
          setBudget(null);
          setPurchases([]);
          setSlaveId(null);
          setLoadError("No slave account found for spend limits.");
          return;
        }
        userId = id;
        setSlaveId(id);
      } else {
        setSlaveId(profile.id);
      }

      const [data, rows] = await Promise.all([
        fetchWishlistBudget(supabase, userId),
        listWishlistPurchases(supabase, { userId, weekOnly: true }),
      ]);
      setBudget(data);
      setPurchases(rows);
      if (data?.is_slave) {
        setSettings(budgetSummaryToSettings(data));
      }
    } catch (err) {
      setBudget(null);
      setPurchases([]);
      const msg =
        err instanceof Error ? err.message : "Could not load spend limit";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [profile, isQueen]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (!isQueen && !isSlave) return null;

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-gold/15 bg-charcoal/60 px-4 py-3 text-sm text-muted-foreground",
          className
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading spend limit…
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className={cn(
          "rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200",
          className
        )}
      >
        <p className="font-medium">Spend limit unavailable</p>
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
      </div>
    );
  }

  if (!budget?.is_slave) {
    return null;
  }

  const weeklyUsdLimit = budget.weekly_usd_limit_cents ?? 5000;
  const weeklyItemLimit = budget.weekly_item_limit ?? 3;
  const weeklyUsdLeft = budget.weekly_usd_remaining_cents ?? 0;
  const weeklyItemsLeft = budget.weekly_items_remaining ?? 0;
  const creditUsd = budget.credit_usd_cents ?? 0;
  const creditItems = budget.credit_items ?? 0;
  const totalUsd = budget.total_usd_remaining_cents ?? 0;
  const totalItems = budget.total_items_remaining ?? 0;
  const spentSoFarCents = purchases.reduce(
    (sum, row) => sum + (row.price_usd_cents ?? 0),
    0
  );
  const itemsBought = purchases.length;

  const saveLimits = async () => {
    if (!isQueen || !slaveId || !settings) return;
    const weeklyUsd = parseUsdInput(String(settings.weekly_usd_limit));
    const creditUsdVal = parseUsdInput(String(settings.credit_usd));
    if (weeklyUsd == null || creditUsdVal == null) {
      toast.error("Enter valid USD amounts");
      return;
    }
    if (settings.weekly_item_limit < 0 || settings.credit_items < 0) {
      toast.error("Item counts cannot be negative");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    try {
      const updated = await setWishlistBudget(supabase, {
        userId: slaveId,
        weeklyUsdLimit: weeklyUsd,
        weeklyItemLimit: Math.floor(settings.weekly_item_limit),
        creditUsd: creditUsdVal,
        creditItems: Math.floor(settings.credit_items),
      });
      if (updated) {
        setBudget(updated);
        setSettings(budgetSummaryToSettings(updated));
      }
      toast.success("Spend limit updated");
      void load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update spend limit"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-gold/20 bg-charcoal/70 p-4 sm:p-5 space-y-4",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-void/40 text-gold">
          <Wallet className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {isQueen ? "D’s spend limit" : "Your spend limit"}
          </p>
          <p className="font-heading text-lg text-ivory">
            {formatUsdFromCents(totalUsd)} · {totalItems} item
            {totalItems === 1 ? "" : "s"} left
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Weekly allowance {formatUsdFromCents(weeklyUsdLimit)} /{" "}
            {weeklyItemLimit} items · resets Monday (Pacific)
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Remaining this week: {formatUsdFromCents(weeklyUsdLeft)} ·{" "}
            {weeklyItemsLeft} item{weeklyItemsLeft === 1 ? "" : "s"} · Banked:{" "}
            {formatUsdFromCents(creditUsd)} · {creditItems} item
            {creditItems === 1 ? "" : "s"}
          </p>
          {isSlave ? (
            <p className="mt-2 text-[11px] text-gold/90">
              Marking something ordered or fulfilled requires the purchase price
              and counts against this limit.
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-gold/20 bg-void/50 px-3 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Spent so far
          </p>
          <p className="font-heading text-2xl tabular-nums text-gold">
            {formatUsdFromCents(spentSoFarCents)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            This week · of {formatUsdFromCents(weeklyUsdLimit)} weekly
          </p>
        </div>
        <div className="rounded-lg border border-gold/20 bg-void/50 px-3 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Items bought
          </p>
          <p className="font-heading text-2xl tabular-nums text-gold">
            {itemsBought}
            <span className="text-base text-muted-foreground">
              /{weeklyItemLimit}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            This week
          </p>
        </div>
      </div>

      {isQueen && settings ? (
        <div className="space-y-3 rounded-lg border border-gold/15 bg-void/40 p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Adjust allowance
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="weekly-usd">Weekly USD</Label>
              <Input
                id="weekly-usd"
                type="number"
                min={0}
                step="0.01"
                value={settings.weekly_usd_limit}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          weekly_usd_limit: Number(e.target.value) || 0,
                        }
                      : s
                  )
                }
                className="border-gold/20 bg-void/60"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weekly-items">Weekly items</Label>
              <Input
                id="weekly-items"
                type="number"
                min={0}
                step={1}
                value={settings.weekly_item_limit}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          weekly_item_limit: Math.max(
                            0,
                            Math.floor(Number(e.target.value) || 0)
                          ),
                        }
                      : s
                  )
                }
                className="border-gold/20 bg-void/60"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="credit-usd">Banked credit (USD)</Label>
              <Input
                id="credit-usd"
                type="number"
                min={0}
                step="0.01"
                value={settings.credit_usd}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          credit_usd: Number(e.target.value) || 0,
                        }
                      : s
                  )
                }
                className="border-gold/20 bg-void/60"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="credit-items">Banked item credits</Label>
              <Input
                id="credit-items"
                type="number"
                min={0}
                step={1}
                value={settings.credit_items}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          credit_items: Math.max(
                            0,
                            Math.floor(Number(e.target.value) || 0)
                          ),
                        }
                      : s
                  )
                }
                className="border-gold/20 bg-void/60"
              />
            </div>
          </div>
          <Button
            type="button"
            disabled={saving}
            onClick={() => void saveLimits()}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save spend limit
          </Button>
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          This week&apos;s purchases
        </p>
        {purchases.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No purchases recorded this week.
          </p>
        ) : (
          <ul className="space-y-2">
            {purchases.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gold/10 bg-void/40 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-ivory">
                    {row.is_secret
                      ? "Secret gift"
                      : row.item_title?.trim() || "Wishlist item"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatRelative(row.created_at)}
                    {row.is_secret
                      ? " · hidden until Arrived"
                      : row.item_status
                        ? ` · ${row.item_status}`
                        : ""}
                  </p>
                </div>
                <p className="shrink-0 font-medium tabular-nums text-gold">
                  {formatUsdFromCents(row.price_usd_cents)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
