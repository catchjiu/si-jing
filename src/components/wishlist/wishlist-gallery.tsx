"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  ExternalLink,
  Gift,
  Heart,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import { removeObject } from "@/lib/storage/client";
import {
  WISHLIST_STATUS_LABELS,
  isWishlistSecretForQueen,
  markWishlistArrived,
  wishlistStatusClass,
} from "@/lib/wishlist";
import {
  parseUsdInput,
  hasRecordedPurchasePrice,
  purchaseStatusNeedsPrice,
  recordWishlistPurchase,
  formatUsdFromCents,
} from "@/lib/wishlist-budget";
import { formatRoleSpeech } from "@/lib/role-speech";
import { cn } from "@/lib/utils";
import type {
  WishlistItemKind,
  WishlistItemWithSignedUrl,
  WishlistStatus,
} from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GeoMapLinks } from "@/components/location/geo-map-links";
import { RoleSpeech } from "@/components/ui/role-speech";
import { WishlistCommentThread } from "@/components/wishlist/wishlist-comment-thread";

interface WishlistGalleryProps {
  items: WishlistItemWithSignedUrl[];
  itemKind: WishlistItemKind;
  onDeleted?: (id: string) => void;
  onEdit?: (item: WishlistItemWithSignedUrl) => void;
  onChanged?: () => void;
  onBudgetChange?: () => void;
  className?: string;
}

export function WishlistGallery({
  items,
  itemKind,
  onDeleted,
  onEdit,
  onChanged,
  onBudgetChange,
  className,
}: WishlistGalleryProps) {
  const { isQueen, isSlave, profile } = useAuth();
  const isSlaveGift = itemKind === "slave_gift";
  const speechRole = isSlaveGift ? "slave" : "queen";
  const [active, setActive] = useState<WishlistItemWithSignedUrl | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [arrivingId, setArrivingId] = useState<string | null>(null);
  const [fulfillmentNotes, setFulfillmentNotes] = useState("");
  const [statusDraft, setStatusDraft] = useState<WishlistStatus>("new");
  const [purchasePrice, setPurchasePrice] = useState("");

  const openItem = (item: WishlistItemWithSignedUrl) => {
    if (isWishlistSecretForQueen(item, isQueen)) return;
    setActive(item);
    setStatusDraft(item.status ?? "new");
    setFulfillmentNotes(item.fulfillment_notes ?? "");
    setPurchasePrice(
      item.purchase_price_usd != null ? String(item.purchase_price_usd) : ""
    );
    if (isSlave && !isSlaveGift && item.status === "new") {
      void markSeen(item);
    }
  };

  const markArrived = async (item: WishlistItemWithSignedUrl) => {
    if (!isQueen) return;
    setArrivingId(item.id);
    const supabase = createClient();
    try {
      await markWishlistArrived(supabase, item.id);
      toast.success("Gift revealed");
      onChanged?.();
      onBudgetChange?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not mark as arrived"
      );
    } finally {
      setArrivingId(null);
    }
  };

  const markSeen = async (item: WishlistItemWithSignedUrl) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("wishlist_items")
      .update({
        status: "seen",
        seen_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    if (error) return;
    onChanged?.();
  };

  const saveFulfillment = async () => {
    if (!isSlave || !active) return;
    const notes = fulfillmentNotes.trim()
      ? formatRoleSpeech(fulfillmentNotes.trim(), "slave")
      : null;
    const alreadyPurchased = hasRecordedPurchasePrice(
      active.purchase_price_usd
    );
    const needsPrice = purchaseStatusNeedsPrice(
      statusDraft,
      active.purchase_price_usd,
      alreadyPurchased
    );

    if (needsPrice) {
      const priceUsd = parseUsdInput(purchasePrice);
      if (priceUsd == null || priceUsd <= 0) {
        toast.error("Enter the purchase price (USD)");
        return;
      }
    }

    setStatusBusy(true);
    const supabase = createClient();

    try {
      if (needsPrice) {
        const priceUsd = parseUsdInput(purchasePrice);
        if (priceUsd == null || priceUsd <= 0) {
          toast.error("Enter the purchase price (USD)");
          return;
        }
        await recordWishlistPurchase(supabase, {
          itemId: active.id,
          priceUsd,
          status: statusDraft as "ordered" | "fulfilled",
          fulfillmentNotes: notes,
        });
        toast.success("Purchase recorded — budget updated");
        onBudgetChange?.();
      } else {
        if (
          (statusDraft === "ordered" || statusDraft === "fulfilled") &&
          !alreadyPurchased
        ) {
          toast.error("Enter the purchase price (USD)");
          return;
        }
        const updates = {
          status: statusDraft,
          fulfillment_notes: notes,
          fulfilled_at:
            statusDraft === "fulfilled"
              ? active.fulfilled_at ?? new Date().toISOString()
              : active.fulfilled_at,
        };
        const { error } = await supabase
          .from("wishlist_items")
          .update(updates)
          .eq("id", active.id);
        if (error) throw error;
        toast.success("Wishlist updated");
        setActive({ ...active, ...updates } as WishlistItemWithSignedUrl);
      }
      onChanged?.();
      setActive(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update status"
      );
    } finally {
      setStatusBusy(false);
    }
  };

  const emptyMessage = isSlaveGift
    ? isSlave
      ? "Suggest something you want to buy her."
      : "D has not suggested gift ideas yet."
    : isQueen
      ? "Add items you love so he can study your taste."
      : "Queen has not shared wishlist items yet.";

  const canDelete =
    (isQueen && active) ||
    (isSlave &&
      isSlaveGift &&
      active &&
      profile &&
      active.created_by === profile.id);

  const handleDelete = async () => {
    if (!canDelete || !active) return;
    setDeleting(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from("wishlist_items")
        .delete()
        .eq("id", active.id);
      if (error) throw error;

      if (active.image_path) {
        try {
          await removeObject({ bucket: "wishlist", path: active.image_path });
        } catch {
          // Row is gone; storage cleanup is best-effort
        }
      }

      toast.success(
        isSlaveGift ? "Gift idea removed" : "Wishlist item removed"
      );
      onDeleted?.(active.id);
      setActive(null);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not delete wishlist item";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-gold/15 bg-charcoal/60 px-6 py-12 text-center",
          className
        )}
      >
        <Heart className="mx-auto mb-3 h-8 w-8 text-gold/40" />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}
      >
        {items.map((item) => {
          const secret = isWishlistSecretForQueen(item, isQueen);
          if (secret) {
            return (
              <div
                key={item.id}
                className="overflow-hidden rounded-xl border border-gold/25 bg-charcoal/80"
              >
                <div className="relative flex aspect-[4/5] flex-col items-center justify-center gap-3 bg-void px-4 text-center">
                  <Gift className="h-10 w-10 text-gold/70" />
                  <p className="font-heading text-xl text-ivory">Secret</p>
                  <p className="text-xs text-muted-foreground">
                    A gift from D — reveal when it arrives
                  </p>
                  {item.purchase_price_usd != null &&
                    item.purchase_price_usd > 0 && (
                      <p className="text-sm text-gold/90">
                        {formatUsdFromCents(
                          Math.round(item.purchase_price_usd * 100)
                        )}
                      </p>
                    )}
                </div>
                <div className="space-y-2 p-3">
                  <Badge
                    variant="outline"
                    className="border-gold/40 text-[9px] uppercase tracking-wider text-gold"
                  >
                    Secret
                  </Badge>
                  <Button
                    type="button"
                    className="w-full bg-gold text-void hover:bg-gold-muted"
                    disabled={arrivingId === item.id}
                    onClick={() => void markArrived(item)}
                  >
                    {arrivingId === item.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Gift className="mr-2 h-4 w-4" />
                    )}
                    Arrived
                  </Button>
                </div>
              </div>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => openItem(item)}
              className="group overflow-hidden rounded-xl border border-gold/15 bg-charcoal/80 text-left transition-all duration-300 hover:border-gold/30"
            >
              <div className="relative aspect-[4/5] bg-void">
                {item.signedUrl && item.image_path ? (
                  <WatermarkedFrame
                    className="absolute inset-0"
                    mediaPath={item.image_path}
                  >
                    <Image
                      src={item.signedUrl}
                      alt={item.title || "Wishlist item"}
                      fill
                      unoptimized
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(max-width: 640px) 100vw, 33vw"
                    />
                  </WatermarkedFrame>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Heart className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div className="space-y-1 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-heading text-ivory">
                    {item.title || "Wishlist item"}
                  </p>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 text-[9px] uppercase tracking-wider",
                      wishlistStatusClass(item.status ?? "new")
                    )}
                  >
                    {WISHLIST_STATUS_LABELS[item.status ?? "new"]}
                  </Badge>
                </div>
                {isSlaveGift && (
                  <p className="text-[10px] uppercase tracking-wider text-gold/80">
                    Gift idea
                  </p>
                )}
                {item.purchase_price_usd != null &&
                  item.purchase_price_usd > 0 && (
                    <p className="text-xs text-gold/90">
                      {formatUsdFromCents(
                        Math.round(item.purchase_price_usd * 100)
                      )}
                    </p>
                  )}
                <p className="text-xs text-muted-foreground">
                  {formatRelative(item.created_at)}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-gold/20 bg-charcoal p-0">
          {active && (
            <>
              <div className="relative aspect-[4/5] max-h-[50vh] w-full bg-void">
                {active.signedUrl && active.image_path ? (
                  <WatermarkedFrame
                    className="absolute inset-0"
                    sizeClassName="w-[22%] max-w-[160px] min-w-[80px]"
                    mediaPath={active.image_path}
                  >
                    <Image
                      src={active.signedUrl}
                      alt={active.title || "Wishlist item"}
                      fill
                      unoptimized
                      className="object-contain"
                      sizes="100vw"
                    />
                  </WatermarkedFrame>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Heart className="h-10 w-10" />
                  </div>
                )}
              </div>
              <div className="space-y-4 p-5">
                <DialogHeader>
                  <DialogTitle className="font-heading text-gold">
                    <RoleSpeech
                      text={active.title || (isSlaveGift ? "Gift idea" : "Wishlist item")}
                      role={speechRole}
                    />
                  </DialogTitle>
                  {active.notes && (
                    <DialogDescription className="text-ivory/80 whitespace-pre-wrap">
                      <RoleSpeech text={active.notes} role={speechRole} />
                    </DialogDescription>
                  )}
                </DialogHeader>
                <p className="text-xs text-muted-foreground">
                  {formatRelative(active.created_at)}
                </p>
                {active.link_url && (
                  <a
                    href={active.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-gold hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View link
                  </a>
                )}
                <GeoMapLinks
                  latitude={active.latitude}
                  longitude={active.longitude}
                  accuracy_m={active.accuracy_m}
                  location_source={active.location_source}
                />

                <div className="rounded-lg border border-gold/15 bg-void/40 p-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] uppercase tracking-wider",
                        wishlistStatusClass(active.status ?? "new")
                      )}
                    >
                      {WISHLIST_STATUS_LABELS[active.status ?? "new"]}
                    </Badge>
                    {active.fulfilled_at && (
                      <span className="text-xs text-muted-foreground">
                        Fulfilled {formatRelative(active.fulfilled_at)}
                      </span>
                    )}
                  </div>
                  {active.fulfillment_notes && (
                    <p className="text-sm text-ivory/80 whitespace-pre-wrap">
                      <RoleSpeech
                        text={active.fulfillment_notes}
                        role="slave"
                      />
                    </p>
                  )}
                  {hasRecordedPurchasePrice(active.purchase_price_usd) ? (
                    <p className="text-sm text-gold">
                      Paid{" "}
                      {formatUsdFromCents(
                        Math.round((active.purchase_price_usd ?? 0) * 100)
                      )}
                      {active.purchased_at
                        ? ` · ${formatRelative(active.purchased_at)}`
                        : ""}
                    </p>
                  ) : null}
                  {isSlave && (
                    <>
                      <div className="space-y-2">
                        <Label>
                          {isSlaveGift ? "Purchase status" : "Status"}
                        </Label>
                        <Select
                          value={statusDraft}
                          onValueChange={(v) =>
                            setStatusDraft(v as WishlistStatus)
                          }
                        >
                          <SelectTrigger className="border-gold/20 bg-void/60">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(
                              Object.keys(WISHLIST_STATUS_LABELS) as WishlistStatus[]
                            ).map((s) => (
                              <SelectItem key={s} value={s}>
                                {WISHLIST_STATUS_LABELS[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {!hasRecordedPurchasePrice(active.purchase_price_usd) &&
                        (statusDraft === "ordered" ||
                          statusDraft === "fulfilled" ||
                          active.status === "ordered" ||
                          active.status === "fulfilled") && (
                          <div className="space-y-2 rounded-lg border border-gold/30 bg-gold/5 p-3">
                            <Label htmlFor="wishlist-purchase-price">
                              Cost (USD) — required
                            </Label>
                            <Input
                              id="wishlist-purchase-price"
                              type="text"
                              inputMode="decimal"
                              placeholder="e.g. 49.99"
                              value={purchasePrice}
                              onChange={(e) => setPurchasePrice(e.target.value)}
                              className="border-gold/30 bg-void/60"
                              autoFocus
                            />
                            <p className="text-[11px] text-muted-foreground">
                              Required for Ordered / Fulfilled. Counts against
                              this week&apos;s spend limit.
                            </p>
                          </div>
                        )}
                      <div className="space-y-2">
                        <Label>
                          {isSlaveGift ? "Purchase notes" : "Fulfillment notes"}
                        </Label>
                        <Textarea
                          value={fulfillmentNotes}
                          onChange={(e) => setFulfillmentNotes(e.target.value)}
                          rows={2}
                          placeholder={
                            isSlaveGift
                              ? "Ordered from… plan to give on…"
                              : "Ordered from… arrived on…"
                          }
                          className="border-gold/20 bg-void/60"
                        />
                      </div>
                      <Button
                        type="button"
                        disabled={statusBusy}
                        onClick={() => void saveFulfillment()}
                        className="bg-gold text-void hover:bg-gold-muted"
                      >
                        {statusBusy && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {purchaseStatusNeedsPrice(
                          statusDraft,
                          active.purchase_price_usd
                        )
                          ? "Save & record cost"
                          : "Save status"}
                      </Button>
                    </>
                  )}
                </div>

                <WishlistCommentThread
                  wishlistId={active.id}
                  wishlistTitle={active.title}
                />

                {(isQueen || (isSlave && isSlaveGift && active?.created_by === profile?.id)) &&
                  (onEdit || canDelete) && (
                  <div className="flex flex-wrap gap-2">
                    {onEdit && (
                      <Button
                        type="button"
                        variant="outline"
                        className="border-gold/40 text-gold hover:bg-gold/10"
                        onClick={() => {
                          onEdit?.(active);
                          setActive(null);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={deleting}
                      onClick={() => void handleDelete()}
                    >
                      {deleting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
