"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { format } from "date-fns";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  addQueenApartmentFundEntry,
  canEditApartmentFundEntry,
  formatNtd,
  listQueenApartmentFundEntries,
  parseNtdInput,
  sumApartmentFundNtd,
  updateQueenApartmentFundEntry,
  type QueenApartmentFundEntry,
} from "@/lib/wishlist-apartment-fund";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const LONG_PRESS_MS = 480;
const MOVE_CANCEL_PX = 10;

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
  const [noteInput, setNoteInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingEntry, setEditingEntry] = useState<QueenApartmentFundEntry | null>(
    null
  );
  const [editAmountInput, setEditAmountInput] = useState("");
  const [editNoteInput, setEditNoteInput] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const longPressRef = useRef<{
    timer: number | null;
    startX: number;
    startY: number;
    entryId: string | null;
    fired: boolean;
  }>({ timer: null, startX: 0, startY: 0, entryId: null, fired: false });

  const totalNtd = useMemo(() => sumApartmentFundNtd(entries), [entries]);
  const canEditAny = isQueen || isSlave;

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

  const clearLongPress = useCallback(() => {
    const ref = longPressRef.current;
    if (ref.timer != null) {
      window.clearTimeout(ref.timer);
      ref.timer = null;
    }
  }, []);

  useEffect(() => () => clearLongPress(), [clearLongPress]);

  const canEditRow = useCallback(
    (row: QueenApartmentFundEntry) =>
      canEditApartmentFundEntry(row, {
        isQueen,
        isSlave,
        userId: profile?.id,
      }),
    [isQueen, isSlave, profile?.id]
  );

  const openEdit = useCallback((row: QueenApartmentFundEntry) => {
    setEditingEntry(row);
    setEditAmountInput(String(row.amount_ntd));
    setEditNoteInput(row.note ?? "");
  }, []);

  const onRowPointerDown = (
    e: ReactPointerEvent,
    row: QueenApartmentFundEntry
  ) => {
    if (!canEditRow(row) || e.button !== 0) return;
    clearLongPress();
    const ref = longPressRef.current;
    ref.startX = e.clientX;
    ref.startY = e.clientY;
    ref.entryId = row.id;
    ref.fired = false;
    ref.timer = window.setTimeout(() => {
      ref.fired = true;
      openEdit(row);
    }, LONG_PRESS_MS);
  };

  const onRowPointerMove = (e: ReactPointerEvent) => {
    const ref = longPressRef.current;
    if (ref.timer == null) return;
    const dx = Math.abs(e.clientX - ref.startX);
    const dy = Math.abs(e.clientY - ref.startY);
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) clearLongPress();
  };

  const onRowPointerUp = () => {
    clearLongPress();
  };

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
        note: noteInput,
      });
      setEntries((prev) => [row, ...prev]);
      setAmountInput("");
      setNoteInput("");
      toast.success("Added to Queen's apartment fund");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not add to apartment fund"
      );
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editingEntry) return;
    const amount = parseNtdInput(editAmountInput);
    if (amount == null) {
      toast.error("Enter an amount greater than zero (NTD)");
      return;
    }
    setEditSaving(true);
    const supabase = createClient();
    try {
      const updated = await updateQueenApartmentFundEntry(
        supabase,
        editingEntry.id,
        {
          amountNtd: amount,
          note: editNoteInput,
        }
      );
      setEntries((prev) =>
        prev.map((row) => (row.id === updated.id ? updated : row))
      );
      setEditingEntry(null);
      toast.success("Contribution updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update contribution"
      );
    } finally {
      setEditSaving(false);
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
    <>
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
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submitEntry();
            }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Add to fund
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apartment-fund-note">Note (optional)</Label>
              <Textarea
                id="apartment-fund-note"
                rows={2}
                maxLength={200}
                placeholder="What this deposit is for"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                className="border-gold/20 bg-void/60 resize-none"
                disabled={saving}
              />
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            D adds money here toward Queen&apos;s apartment.
          </p>
        )}

        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Contributions
            </p>
            {canEditAny && entries.length > 0 ? (
              <p className="text-[10px] text-muted-foreground/80">
                Long-press to edit
              </p>
            ) : null}
          </div>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No contributions yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {entries.map((row) => {
                const editable = canEditRow(row);
                return (
                  <li
                    key={row.id}
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-lg border border-gold/10 bg-void/40 px-3 py-2 text-sm select-none touch-manipulation",
                      editable && "cursor-pointer active:bg-void/60"
                    )}
                    onPointerDown={(e) => onRowPointerDown(e, row)}
                    onPointerMove={onRowPointerMove}
                    onPointerUp={onRowPointerUp}
                    onPointerCancel={clearLongPress}
                    onPointerLeave={clearLongPress}
                    onContextMenu={(e) => {
                      if (!editable) return;
                      e.preventDefault();
                      openEdit(row);
                    }}
                  >
                    <div className="min-w-0">
                      <p className="text-muted-foreground tabular-nums">
                        {format(new Date(row.created_at), "MMM d, yyyy")}
                      </p>
                      {row.note ? (
                        <p className="mt-0.5 text-xs text-ivory/90">{row.note}</p>
                      ) : null}
                    </div>
                    <p className="shrink-0 font-medium tabular-nums text-gold">
                      {formatNtd(row.amount_ntd)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <Dialog
        open={!!editingEntry}
        onOpenChange={(open) => {
          if (!open && !editSaving) setEditingEntry(null);
        }}
      >
        <DialogContent className="max-w-sm border-gold/20 bg-charcoal">
          <DialogHeader>
            <DialogTitle className="font-heading text-gold">
              Edit contribution
            </DialogTitle>
            {editingEntry ? (
              <DialogDescription>
                {format(new Date(editingEntry.created_at), "MMM d, yyyy")}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="edit-apartment-fund-amount">Amount (NTD)</Label>
              <Input
                id="edit-apartment-fund-amount"
                type="text"
                inputMode="decimal"
                value={editAmountInput}
                onChange={(e) => setEditAmountInput(e.target.value)}
                className="border-gold/20 bg-void/60"
                disabled={editSaving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-apartment-fund-note">Note (optional)</Label>
              <Textarea
                id="edit-apartment-fund-note"
                rows={2}
                maxLength={200}
                placeholder="What this deposit is for"
                value={editNoteInput}
                onChange={(e) => setEditNoteInput(e.target.value)}
                className="border-gold/20 bg-void/60 resize-none"
                disabled={editSaving}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                className="border-gold/30 text-gold"
                disabled={editSaving}
                onClick={() => setEditingEntry(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={editSaving}
                className="bg-gold text-void hover:bg-gold-muted"
              >
                {editSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
