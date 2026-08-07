"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Heart, ImagePlus, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { resolveImageLocation } from "@/lib/location";
import { presignAndUpload, removeObject, signObjectUrl } from "@/lib/storage/client";
import { formatRoleSpeech } from "@/lib/role-speech";
import { WISHLIST_STATUS_LABELS } from "@/lib/wishlist";
import {
  parseUsdInput,
  purchaseStatusCountsAgainstBudget,
  purchaseStatusNeedsPrice,
  recordWishlistPurchase,
} from "@/lib/wishlist-budget";
import {
  fetchLockedWalletEnabled,
  requestWishlistPurchaseApproval,
} from "@/lib/locked-wallet";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  WishlistItemKind,
  WishlistItemWithSignedUrl,
  WishlistStatus,
} from "@/lib/types";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface WishlistFormProps {
  variant?: WishlistItemKind;
  editingItem?: WishlistItemWithSignedUrl | null;
  onCancelEdit?: () => void;
  onSuccess?: () => void;
  onUpdated?: (item: WishlistItemWithSignedUrl) => void;
  onBudgetChange?: () => void;
  className?: string;
}


async function recordOrBegPurchase(
  supabase: ReturnType<typeof createClient>,
  opts: {
    itemId: string;
    priceUsd: number;
    status: "ordered" | "fulfilled" | "revealed";
    title?: string | null;
  }
) {
  const locked = await fetchLockedWalletEnabled(supabase);
  if (locked) {
    await requestWishlistPurchaseApproval(supabase, {
      itemId: opts.itemId,
      priceUsd: opts.priceUsd,
      status: opts.status,
      begMessage: opts.title ? `Please approve: ${opts.title}` : null,
    });
    void import("@/lib/push-client").then(({ notifyPush }) =>
      notifyPush({
        title: "Wallet beg",
        body: opts.title
          ? `D wants approval to buy: ${opts.title}`
          : "D wants approval to buy a wishlist item",
        url: "/dashboard/wishlist",
        target: "queen",
        kind: "wallet_spend_request",
      })
    );
    return "begged" as const;
  }
  await recordWishlistPurchase(supabase, {
    itemId: opts.itemId,
    priceUsd: opts.priceUsd,
    status: opts.status,
    fulfillmentNotes: null,
  });
  return "recorded" as const;
}

export function WishlistForm({
  variant = "queen_taste",
  editingItem = null,
  onCancelEdit,
  onSuccess,
  onUpdated,
  onBudgetChange,
  className,
}: WishlistFormProps) {
  const { profile, isQueen, isSlave } = useAuth();
  const isSlaveGift = variant === "slave_gift";
  const canUseForm = isSlaveGift ? isSlave : isQueen;
  const speechRole = isSlaveGift ? "slave" : "queen";
  const isEditing = !!editingItem;
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [status, setStatus] = useState<WishlistStatus>(
    isSlaveGift ? "idea" : "new"
  );
  const [price, setPrice] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTitle(editingItem?.title ?? "");
    setNotes(editingItem?.notes ?? "");
    setLinkUrl(editingItem?.link_url ?? "");
    setStatus(
      (editingItem?.status as WishlistStatus | undefined) ??
        (isSlaveGift ? "idea" : "new")
    );
    setPrice(
      editingItem?.purchase_price_usd != null
        ? String(editingItem.purchase_price_usd)
        : ""
    );
    setFile(null);
    setPreview(null);

    if (!editingItem) {
      setExistingImageUrl(null);
      return;
    }

    if (editingItem.signedUrl) {
      setExistingImageUrl(editingItem.signedUrl);
      return;
    }

    if (!editingItem.image_path) {
      setExistingImageUrl(null);
      return;
    }

    void signObjectUrl({
      bucket: "wishlist",
      path: editingItem.image_path,
    }).then((url) => {
      if (!cancelled) setExistingImageUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [editingItem, isSlaveGift]);

  const setImage = useCallback(
    (next: File | null) => {
      if (preview) URL.revokeObjectURL(preview);
      setFile(next);
      setPreview(next ? URL.createObjectURL(next) : null);
    },
    [preview]
  );

  const pickFile = (incoming: FileList | File[] | null) => {
    const candidate = incoming?.[0];
    if (!candidate) return;
    if (!ACCEPTED_TYPES.includes(candidate.type)) {
      toast.error("Use a JPG, PNG, WebP, or GIF image");
      return;
    }
    if (candidate.size > MAX_FILE_SIZE) {
      toast.error("Image must be under 10MB");
      return;
    }
    setImage(candidate);
  };

  const resetGiftFields = () => {
    setTitle("");
    setNotes("");
    setLinkUrl("");
    setStatus("idea");
    setPrice("");
    setImage(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUseForm || !profile) {
      toast.error(
        isSlaveGift
          ? "Only D can suggest gift ideas"
          : "Only the Queen can manage wishlist items"
      );
      return;
    }
    if (!isEditing && !file) {
      toast.error("Attach an item image");
      return;
    }

    const trimmedLink = linkUrl.trim();
    if (trimmedLink) {
      try {
        new URL(trimmedLink);
      } catch {
        toast.error("Enter a valid link URL (including https://)");
        return;
      }
    }

    let priceUsd: number | null = null;
    if (isSlaveGift && purchaseStatusNeedsPrice(status, null, false, null)) {
      priceUsd = parseUsdInput(price);
      if (priceUsd == null || priceUsd <= 0) {
        toast.error(
          status === "idea"
            ? "Enter the planned price (USD)"
            : "Enter the purchase price (USD)"
        );
        return;
      }
    }

    setSubmitting(true);
    const supabase = createClient();

    try {
      let imagePath = editingItem?.image_path ?? null;
      let latitude = editingItem?.latitude ?? null;
      let longitude = editingItem?.longitude ?? null;
      let accuracy_m = editingItem?.accuracy_m ?? null;
      let location_source = editingItem?.location_source ?? null;
      let signedUrl = editingItem?.signedUrl;

      if (file) {
        const geo = await resolveImageLocation(file);
        if (geo) {
          toast.message(
            geo.source === "exif"
              ? "Photo location from image metadata"
              : "Photo location from device GPS"
          );
        }
        const uploadFile = await downsizeImageIfNeeded(file);
        if (uploadFile.size < file.size) {
          toast.message(
            `Image compressed to ${(uploadFile.size / 1024 / 1024).toFixed(2)} MB`
          );
        }
        const ext = uploadFile.name.split(".").pop() || "jpg";
        const previousPath = imagePath;
        imagePath = await presignAndUpload({
          bucket: "wishlist",
          file: uploadFile,
          contentType: uploadFile.type || "image/jpeg",
          ext,
          relativePath: `${profile.id}/${Date.now()}.${ext}`,
        });
        latitude = geo?.latitude ?? null;
        longitude = geo?.longitude ?? null;
        accuracy_m = geo?.accuracy_m ?? null;
        location_source = geo?.source ?? null;
        signedUrl =
          (await signObjectUrl({
            bucket: "wishlist",
            path: imagePath,
          })) ?? undefined;

        if (isEditing && previousPath && previousPath !== imagePath) {
          try {
            await removeObject({ bucket: "wishlist", path: previousPath });
          } catch {
            // Best-effort cleanup of replaced image
          }
        }
      }

      if (!imagePath) {
        throw new Error("Image is required");
      }

      const baseFields = {
        title: title.trim()
          ? formatRoleSpeech(title.trim(), speechRole)
          : null,
        notes: notes.trim()
          ? formatRoleSpeech(notes.trim(), speechRole)
          : null,
        link_url: trimmedLink || null,
        image_path: imagePath,
        latitude,
        longitude,
        accuracy_m,
        location_source,
      };

      if (isEditing && editingItem) {
        if (
          isSlaveGift &&
          purchaseStatusCountsAgainstBudget(status) &&
          priceUsd != null
        ) {
          const { error } = await supabase
            .from("wishlist_items")
            .update(baseFields)
            .eq("id", editingItem.id);
          if (error) throw error;

          const result = await recordOrBegPurchase(supabase, {
            itemId: editingItem.id,
            priceUsd,
            status: status as "ordered" | "fulfilled" | "revealed",
            title: title.trim() || editingItem.title,
          });
          toast.success(
            result === "begged"
              ? "Beg sent — waiting for Queen to approve"
              : status === "revealed"
                ? "Gift revealed — visible under Gifts bought for Queen"
                : "Gift updated — budget recorded"
          );
          if (result === "begged") {
            onBudgetChange?.();
            onCancelEdit?.();
            return;
          }
          onBudgetChange?.();
          onUpdated?.({
            ...editingItem,
            ...baseFields,
            status,
            purchase_price_usd: priceUsd,
            purchased_at: editingItem.purchased_at ?? new Date().toISOString(),
            arrived_at:
              status === "revealed"
                ? editingItem.arrived_at ?? new Date().toISOString()
                : editingItem.arrived_at,
            signedUrl: signedUrl ?? existingImageUrl ?? undefined,
          });
        } else {
          const nowIso = new Date().toISOString();
          const giftFields = isSlaveGift
            ? {
                status,
                purchase_price_usd:
                  status === "idea" && priceUsd != null
                    ? priceUsd
                    : editingItem.purchase_price_usd ?? null,
                purchased_at:
                  status === "idea" ? null : editingItem.purchased_at ?? null,
                fulfilled_at:
                  status === "fulfilled" || status === "revealed"
                    ? editingItem.fulfilled_at ?? nowIso
                    : editingItem.fulfilled_at,
                arrived_at:
                  status === "revealed"
                    ? editingItem.arrived_at ?? nowIso
                    : editingItem.arrived_at,
              }
            : {};

          const { data, error } = await supabase
            .from("wishlist_items")
            .update({
              ...baseFields,
              ...giftFields,
            })
            .eq("id", editingItem.id)
            .select("*")
            .single();

          if (error) throw error;

          toast.success(
            isSlaveGift ? "Gift idea updated" : "Wishlist item updated"
          );
          onUpdated?.({
            ...(data as WishlistItemWithSignedUrl),
            signedUrl: signedUrl ?? existingImageUrl ?? undefined,
          });
        }
        onCancelEdit?.();
      } else {
        const insertStatus = isSlaveGift ? status : "new";
        const { data, error: insertError } = await supabase
          .from("wishlist_items")
          .insert({
            created_by: profile.id,
            item_kind: variant,
            ...baseFields,
            status: insertStatus,
            ...(isSlaveGift && status === "idea" && priceUsd != null
              ? {
                  purchase_price_usd: priceUsd,
                  purchased_at: null,
                }
              : {}),
          })
          .select("*")
          .single();

        if (insertError) throw insertError;

        if (
          isSlaveGift &&
          data &&
          purchaseStatusCountsAgainstBudget(status) &&
          priceUsd != null
        ) {
          const result = await recordOrBegPurchase(supabase, {
            itemId: data.id as string,
            priceUsd,
            status: status as "ordered" | "fulfilled" | "revealed",
            title: title.trim() || null,
          });
          onBudgetChange?.();
          toast.success(
            result === "begged"
              ? "Gift saved — beg sent for Queen to approve purchase"
              : "Gift idea added for Queen"
          );
        } else {
          toast.success(
            isSlaveGift ? "Gift idea added for Queen" : "Wishlist item added"
          );
        }
        if (isSlaveGift) {
          void import("@/lib/push-client").then(({ notifyPush }) =>
            notifyPush({
              title: "Gift idea on wishlist",
              // Keep secret — Queen must not see the item name until Arrived/Reveal.
              body: "D suggested a gift for you",
              url: "/dashboard/wishlist",
              target: "queen",
              kind: "wishlist_gift_add",
            })
          );
        }
        if (isSlaveGift) resetGiftFields();
        else {
          setTitle("");
          setNotes("");
          setLinkUrl("");
          setImage(null);
        }
        onSuccess?.();
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not save wishlist item";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!canUseForm) return null;

  const displayPreview = preview || existingImageUrl;
  const showGiftStatus = isSlaveGift;
  const needsPrice = showGiftStatus && purchaseStatusNeedsPrice(status, null);
  const formTitle = isEditing
    ? isSlaveGift
      ? "Edit gift idea"
      : "Edit wishlist item"
    : isSlaveGift
      ? "Suggest a gift"
      : "Add to wishlist";
  const formSubtitle = isEditing
    ? "Update details or replace the photo"
    : isSlaveGift
      ? "Something you want to buy her — status, cost, photo, and notes"
      : "Share something you like so he can know your taste";

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "space-y-5 rounded-xl border border-gold/20 bg-charcoal/80 p-6",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 bg-royal/30">
            <Heart className="h-5 w-5 text-gold" />
          </div>
          <div>
            <h3 className="font-heading text-xl text-ivory">{formTitle}</h3>
            <p className="text-xs text-muted-foreground">{formSubtitle}</p>
          </div>
        </div>
        {isEditing && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancelEdit}
            className="text-muted-foreground hover:text-ivory"
          >
            Cancel
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="wishlist-title">Title (optional)</Label>
        <Input
          id="wishlist-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isSlaveGift ? "What would you buy her?" : "What is it?"}
          className="border-gold/20 bg-void/60"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="wishlist-notes">Notes (optional)</Label>
        <Textarea
          id="wishlist-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={
            isSlaveGift
              ? "Why she’d love it, when you plan to buy…"
              : "Why you like it, size, color…"
          }
          rows={3}
          className="border-gold/20 bg-void/60"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="wishlist-link">Link (optional)</Label>
        <Input
          id="wishlist-link"
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://…"
          className="border-gold/20 bg-void/60"
        />
      </div>

      {showGiftStatus ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as WishlistStatus)}
            >
              <SelectTrigger className="border-gold/20 bg-void/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(WISHLIST_STATUS_LABELS) as WishlistStatus[]).map(
                  (s) => (
                    <SelectItem key={s} value={s}>
                      {WISHLIST_STATUS_LABELS[s]}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
          {needsPrice ? (
            <div className="space-y-2">
              <Label htmlFor="wishlist-form-price">
                {status === "idea" ? "Planned price (USD)" : "Cost (USD)"}
              </Label>
              <Input
                id="wishlist-form-price"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 49.99"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="border-gold/20 bg-void/60"
              />
              <p className="text-[11px] text-muted-foreground">
                {status === "idea"
                  ? "Does not spend the weekly limit until Ordered or Fulfilled."
                  : "Counts against this week’s spend limit."}
              </p>
            </div>
          ) : (
            <div className="hidden sm:block" />
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>{isEditing ? "Item image (optional replace)" : "Item image"}</Label>
        {displayPreview ? (
          <div className="relative overflow-hidden rounded-lg border border-gold/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayPreview}
              alt="Wishlist preview"
              className="max-h-80 w-full object-contain bg-void"
            />
            <div className="absolute right-2 top-2 flex gap-2">
              {file && (
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  className="rounded-full bg-void/80 p-1.5 text-ivory hover:text-gold"
                  aria-label="Remove new image"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <label className="cursor-pointer rounded-full bg-void/80 px-2.5 py-1.5 text-xs text-ivory hover:text-gold">
                Replace
                <input
                  type="file"
                  accept={ACCEPTED_TYPES.join(",")}
                  className="sr-only"
                  onChange={(e) => pickFile(e.target.files)}
                />
              </label>
            </div>
          </div>
        ) : (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              pickFile(e.dataTransfer.files);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 transition-colors",
              dragActive
                ? "border-gold bg-gold/10"
                : "border-gold/25 bg-void/40 hover:border-gold/50"
            )}
          >
            <ImagePlus className="h-8 w-8 text-gold/70" />
            <span className="text-sm text-muted-foreground">
              Drop an image or click to choose
            </span>
            <input
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              className="sr-only"
              onChange={(e) => pickFile(e.target.files)}
            />
          </label>
        )}
      </div>

      <Button
        type="submit"
        disabled={submitting || (!isEditing && !file)}
        className="w-full bg-gold text-void hover:bg-gold-muted"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isEditing ? "Saving…" : "Adding…"}
          </>
        ) : (
          <>
            <Heart className="mr-2 h-4 w-4" />
            {isEditing ? "Save changes" : isSlaveGift ? "Suggest gift" : "Add to wishlist"}
          </>
        )}
      </Button>
    </form>
  );
}
