"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ExternalLink, Heart, Loader2, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import { removeObject } from "@/lib/storage/client";
import { cn } from "@/lib/utils";
import type { WishlistItemWithSignedUrl } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GeoMapLinks } from "@/components/location/geo-map-links";

interface WishlistGalleryProps {
  items: WishlistItemWithSignedUrl[];
  onDeleted?: (id: string) => void;
  onEdit?: (item: WishlistItemWithSignedUrl) => void;
  className?: string;
}

export function WishlistGallery({
  items,
  onDeleted,
  onEdit,
  className,
}: WishlistGalleryProps) {
  const { isQueen } = useAuth();
  const [active, setActive] = useState<WishlistItemWithSignedUrl | null>(null);
  const [deleting, setDeleting] = useState(false);

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
            onClick={() => setActive(item)}
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
              <p className="truncate font-heading text-ivory">
                {item.title || "Wishlist item"}
              </p>
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
                    {active.title || "Wishlist item"}
                  </DialogTitle>
                  {active.notes && (
                    <DialogDescription className="text-ivory/80 whitespace-pre-wrap">
                      {active.notes}
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
