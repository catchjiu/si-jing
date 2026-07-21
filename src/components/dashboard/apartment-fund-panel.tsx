"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  addApartmentFundDeposit,
  formatNtd,
  getApartmentFundTotal,
  listApartmentFundEntries,
  parseNtdInput,
  type ApartmentFundEntry,
} from "@/lib/apartment-fund";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ApartmentFundPanelProps = {
  className?: string;
};

export function ApartmentFundPanel({ className }: ApartmentFundPanelProps) {
  const { isQueen, isSlave } = useAuth();
  const [entries, setEntries] = useState<ApartmentFundEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [amountInput, setAmountInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    try {
      const [rows, sum] = await Promise.all([
        listApartmentFundEntries(supabase),
        getApartmentFundTotal(supabase),
      ]);
      setEntries(rows);
      setTotal(sum);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load apartment fund"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isQueen && !isSlave) return;
    const supabase = createClient();
    const channel = supabase
      .channel("queen_apartment_fund_entries")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "queen_apartment_fund_entries",
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isQueen, isSlave, load]);

  if (!isQueen && !isSlave) return null;

  const onDeposit = async () => {
    const amount = parseNtdInput(amountInput);
    if (amount == null) {
      toast.error("Enter a valid amount in NTD");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    try {
      await addApartmentFundDeposit(supabase, amount);
      setAmountInput("");
      toast.success(`Added ${formatNtd(amount)} to the apartment fund`);
      void load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not record deposit"
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-gold/15 bg-charcoal/60 px-4 py-3 text-sm text-muted-foreground",
          className
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading apartment fund…
      </div>
    );
  }

  return (
    <div
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
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {isQueen ? "Apartment fund · D" : "Queen's apartment fund"}
          </p>
          <p className="font-heading text-lg text-ivory">{formatNtd(total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isSlave
              ? "Record each transfer toward her apartment savings."
              : "Total D has set aside for your apartment."}
          </p>
        </div>
      </div>

      {isSlave ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="apartment-fund-amount">Amount (NTD)</Label>
            <Input
              id="apartment-fund-amount"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              placeholder="4000"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="border-gold/20 bg-void/60"
            />
          </div>
          <Button
            type="button"
            disabled={submitting}
            onClick={() => void onDeposit()}
            className="bg-gold text-void hover:bg-gold-muted sm:mb-0.5"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Add to fund
          </Button>
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Recent deposits
        </p>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deposits yet.</p>
        ) : (
          <ul className="space-y-2">
            {entries.slice(0, 8).map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gold/10 bg-void/40 px-3 py-2 text-sm"
              >
                <p className="text-[11px] text-muted-foreground">
                  {formatRelative(row.created_at)}
                </p>
                <p className="shrink-0 font-medium tabular-nums text-gold">
                  {formatNtd(row.amount_ntd)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
