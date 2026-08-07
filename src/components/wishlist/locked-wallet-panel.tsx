"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Lock, Loader2, Unlock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  fetchLockedWalletEnabled,
  listWalletSpendRequests,
  reviewWalletSpendRequest,
  setLockedWalletEnabled,
  type WalletSpendRequest,
} from "@/lib/locked-wallet";
import { formatUsdFromCents } from "@/lib/wishlist-budget";
import { formatNtd } from "@/lib/wishlist-apartment-fund";
import { formatRelative } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type LockedWalletPanelProps = {
  className?: string;
  onChanged?: () => void;
};

export function LockedWalletPanel({
  className,
  onChanged,
}: LockedWalletPanelProps) {
  const { isQueen, isSlave } = useAuth();
  const [locked, setLocked] = useState(false);
  const [requests, setRequests] = useState<WalletSpendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    try {
      const [enabled, rows] = await Promise.all([
        fetchLockedWalletEnabled(supabase),
        listWalletSpendRequests(supabase, {
          pendingOnly: isQueen ? true : false,
        }),
      ]);
      setLocked(enabled);
      setRequests(
        isQueen ? rows.filter((r) => r.status === "pending") : rows.slice(0, 8)
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load wallet");
    } finally {
      setLoading(false);
    }
  }, [isQueen]);

  useEffect(() => {
    if (isQueen || isSlave) void load();
  }, [isQueen, isSlave, load]);

  const toggle = async () => {
    if (!isQueen) return;
    setToggling(true);
    const supabase = createClient();
    try {
      const next = await setLockedWalletEnabled(supabase, !locked);
      setLocked(next);
      toast.success(next ? "Wallet locked" : "Wallet unlocked");
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not toggle");
    } finally {
      setToggling(false);
    }
  };

  const review = async (id: string, approve: boolean) => {
    setReviewing(id);
    const supabase = createClient();
    try {
      await reviewWalletSpendRequest(supabase, id, approve);
      toast.success(approve ? "Approved" : "Denied");
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: approve ? "Wallet beg approved" : "Wallet beg denied",
          body: approve
            ? "Queen approved your spend request."
            : "Queen denied your spend request.",
          url: "/dashboard/wishlist",
          target: "slave",
          kind: approve ? "wallet_spend_approved" : "wallet_spend_denied",
        })
      );
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Review failed");
    } finally {
      setReviewing(null);
    }
  };

  if (!isQueen && !isSlave) return null;

  return (
    <section
      className={cn(
        "space-y-4 rounded-xl border border-gold/20 bg-charcoal/80 p-5",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading flex items-center gap-2 text-xl text-gold">
            {locked ? (
              <Lock className="h-5 w-5" />
            ) : (
              <Unlock className="h-5 w-5" />
            )}
            Locked wallet
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {locked
              ? isQueen
                ? "D can only beg — approve purchases and apartment fund adds one tap at a time."
                : "Your wallet is locked. You can add ideas, but spending needs Queen’s approval."
              : isQueen
                ? "Turn on to force D to beg before any wishlist spend or apartment fund add."
                : "You can buy and contribute normally."}
          </p>
        </div>
        {isQueen && (
          <Button
            type="button"
            size="sm"
            variant={locked ? "default" : "outline"}
            className={
              locked
                ? "bg-gold text-void hover:bg-gold-muted"
                : "border-gold/30"
            }
            disabled={toggling || loading}
            onClick={() => void toggle()}
          >
            {toggling ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : locked ? (
              <Unlock className="mr-2 h-3.5 w-3.5" />
            ) : (
              <Lock className="mr-2 h-3.5 w-3.5" />
            )}
            {locked ? "Unlock" : "Lock wallet"}
          </Button>
        )}
        {!isQueen && (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] uppercase tracking-wider",
              locked ? "border-gold/50 text-gold" : "border-muted text-muted-foreground"
            )}
          >
            {locked ? "Locked" : "Open"}
          </Badge>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isQueen ? "No pending begs." : "No recent wallet requests."}
        </p>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li
              key={r.id}
              className="space-y-2 rounded-lg border border-gold/15 bg-void/40 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px] uppercase">
                  {r.kind === "wishlist_purchase"
                    ? "Wishlist buy"
                    : "Apartment fund"}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] uppercase",
                    r.status === "pending"
                      ? "border-gold/50 text-gold"
                      : r.status === "approved"
                        ? "border-emerald-500/40 text-emerald-300"
                        : "border-red-500/40 text-red-300"
                  )}
                >
                  {r.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatRelative(r.created_at)}
                </span>
              </div>
              <p className="text-sm text-ivory/90">
                {r.kind === "wishlist_purchase"
                  ? `${formatUsdFromCents(Math.round((r.price_usd ?? 0) * 100))} → ${r.target_status}`
                  : formatNtd(r.amount_ntd ?? 0)}
              </p>
              {r.beg_message && (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  “{r.beg_message}”
                </p>
              )}
              {isQueen && r.status === "pending" && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-gold text-void hover:bg-gold-muted"
                    disabled={reviewing === r.id}
                    onClick={() => void review(r.id, true)}
                  >
                    {reviewing === r.id ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-gold/30"
                    disabled={reviewing === r.id}
                    onClick={() => void review(r.id, false)}
                  >
                    Deny
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
