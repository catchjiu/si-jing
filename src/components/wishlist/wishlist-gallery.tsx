"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ExternalLink, Heart, Loader2, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import { removeObject } from "@/lib/storage/client";
import { WISHLIST_STATUS_LABELS, wishlistStatusClass } from "@/lib/wishlist";
import { formatRoleSpeech } from "@/lib/role-speech";
import { cn } from "@/lib/utils";
import type { WishlistItemWithSignedUrl, WishlistStatus } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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

interface WishlistGalleryProps {
  items: WishlistItemWithSignedUrl[];
  onDeleted?: (id: string) => void;
  onEdit?: (item: WishlistItemWithSignedUrl) => void;
  onChanged?: () => void;
  className?: string;
}

export function WishlistGallery({
  items,
  onDeleted,
  onEdit,
  onChanged,
  className,
}: WishlistGalleryProps) {
  const { isQueen, isSlave } = useAuth();
  const [active, setActive] = useState<WishlistItemWithSignedUrl | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [fulfillmentNotes, setFulfillmentNotes] = useState("");
  const [statusDraft, setStatusDraft] = useState<WishlistStatus>("new");

  const openItem = (item: WishlistItemWithSignedUrl) => {
    setActive(item);
    setStatusDraft(item.status ?? "new");
    setFulfillmentNotes(item.fulfillment_notes ?? "");
    if (isSlave && item.status === "new") {
      void markSeen(item);
    }
  };

  const markSeen = async (item: WishlistItemWithSignedUrl) => {
    const supabase = createClient();
    await supabase
      .from("wishlist_items")
      .update({
        status: "seen",
        seen_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    onChanged?.();
  };

  const saveFulfillment = async () => {
    if (!isSlave || !active) return;
    setStatusBusy(true);
    const supabase = createClient();
    const updates = {
      status: statusDraft,
      fulfillment_notes: fulfillmentNotes.trim()
        ? formatRoleSpeech(fulfillmentNotes.trim(), "slave")
        : null,
      fulfilled_at:
        statusDraft === "fulfilled"
          ? active.fulfilled_at ?? new Date().toISOString()
          : active.fulfilled_at,
    };
    const { error } = await supabase
      .from("wishlist_items")
      .update(updates)
      .eq("id", active.id);
    setStatusBusy(false);
    if (error) {
      toast.error("Could not update status");
      return;
    }
    toast.success("Wishlist updated");
    setActive({ ...active, ...updates } as WishlistItemWithSignedUrl);
    onChanged?.();
  };

  const emptyMessage = isQueen
    ? "Add items you love so he can study your taste."
    : "Queen has not shared wishlist items yet.";

  const handleDelete = async () => {
    if (!isQueen || !active) return;
    setDeleting(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from("wishlist_items")
        .delete()
        .eq("id", active.id);
      if (error) throw error;

      try {
        await removeObject({ bucket: "wishlist", path: active.image_path });
      } catch {
        // Row is gone; storage cleanup is best-effort
      }

      toast.success("Wishlist item removed");
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
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => openItem(item)}
            className="group overflow-hidden rounded-xl border border-gold/15 bg-charcoal/80 text-left transition-all duration-300 hover:border-gold/30"
          >
            <div className="relative aspect-[4/5] bg-void">
              {item.signedUrl ? (
                <Image
                  src={item.signedUrl}
                  alt={item.title || "Wishlist item"}
                  fill
                  unoptimized
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, 33vw"
                />
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
              <p className="text-xs text-muted-foreground">
                {formatRelative(item.created_at)}
              </p>
            </div>
          </button>
        ))}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-gold/20 bg-charcoal p-0">
          {active && (
            <>
              <div className="relative aspect-[4/5] max-h-[50vh] w-full bg-void">
                {active.signedUrl ? (
                  <Image
                    src={active.signedUrl}
                    alt={active.title || "Wishlist item"}
                    fill
                    unoptimized
                    className="object-contain"
                    sizes="100vw"
                  />
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
                      text={active.title || "Wishlist item"}
                      role="queen"
                    />
                  </DialogTitle>
                  {active.notes && (
                    <DialogDescription className="text-ivory/80 whitespace-pre-wrap">
                      <RoleSpeech text={active.notes} role="queen" />
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
                  {isSlave && (
                    <>
                      <div className="space-y-2">
                        <Label>Status</Label>
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
                      <div className="space-y-2">
                        <Label>Fulfillment notes</Label>
                        <Textarea
                          value={fulfillmentNotes}
                          onChange={(e) => setFulfillmentNotes(e.target.value)}
                          rows={2}
                          placeholder="Ordered from… arrived on…"
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
                        Save status
                      </Button>
                    </>
                  )}
                </div>

                {isQueen && (
                  <div className="flex flex-wrap gap-2">
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
