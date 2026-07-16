"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Crown, Loader2, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import { removeObject } from "@/lib/storage/client";
import {
  isOwnedWorshipUpload,
  worshipEntryStorageBucket,
} from "@/lib/worship-storage";
import { loveColor, loveLabel } from "@/lib/worship";
import { cn } from "@/lib/utils";
import type { WorshipEntryWithSignedUrl } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GeoMapLinks } from "@/components/location/geo-map-links";
import { RoleSpeech } from "@/components/ui/role-speech";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { WorshipCommentThread } from "@/components/worship/worship-comment-thread";

interface WorshipGalleryProps {
  entries: WorshipEntryWithSignedUrl[];
  galleryId: string;
  initialEntryId?: string | null;
  highlightPhotoCommentId?: string | null;
  onDeleted?: (id: string) => void;
  onEdit?: (entry: WorshipEntryWithSignedUrl) => void;
  onChanged?: () => void;
  onViewed?: (id: string) => void;
  className?: string;
}

export function WorshipGallery({
  entries,
  galleryId,
  initialEntryId = null,
  highlightPhotoCommentId = null,
  onDeleted,
  onEdit,
  onChanged,
  onViewed,
  className,
}: WorshipGalleryProps) {
  const { isQueen, isSlave, profile } = useAuth();
  const [active, setActive] = useState<WorshipEntryWithSignedUrl | null>(null);
  const [deleting, setDeleting] = useState(false);
  const initialEntryHandled = useRef<string | null>(null);

  const markViewed = useCallback(
    async (entry: WorshipEntryWithSignedUrl) => {
      if (!isQueen || entry.viewed_at) return;

      const supabase = createClient();
      await supabase
        .from("worship_entries")
        .update({ viewed_at: new Date().toISOString() })
        .eq("id", entry.id);

      onViewed?.(entry.id);
      onChanged?.();
    },
    [isQueen, onViewed, onChanged]
  );

  const openEntry = (entry: WorshipEntryWithSignedUrl) => {
    setActive(entry);
    void markViewed(entry);
  };

  useEffect(() => {
    if (!initialEntryId) return;
    if (initialEntryHandled.current === initialEntryId) return;
    const entry = entries.find((row) => row.id === initialEntryId);
    if (!entry) return;
    initialEntryHandled.current = initialEntryId;
    setActive(entry);
    void markViewed(entry);
  }, [initialEntryId, entries, markViewed]);

  useEffect(() => {
    if (!initialEntryId) return;
    const el = document.getElementById(`worship-entry-${initialEntryId}`);
    if (!el) return;
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [initialEntryId, entries.length]);

  const canDelete =
    (isQueen && active) ||
    (isSlave && active && profile && active.created_by === profile.id);

  const handleDelete = async () => {
    if (!canDelete || !active) return;
    setDeleting(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from("worship_entries")
        .delete()
        .eq("id", active.id);
      if (error) throw error;

      try {
        if (isOwnedWorshipUpload(active)) {
          await removeObject({
            bucket: worshipEntryStorageBucket(active),
            path: active.image_path,
          });
        }
      } catch {
        // Row is gone; storage cleanup is best-effort
      }

      toast.success("Worship removed");
      onDeleted?.(active.id);
      setActive(null);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not delete worship";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  if (entries.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-gold/15 bg-charcoal/60 px-6 py-12 text-center",
          className
        )}
      >
        <Crown className="mx-auto mb-3 h-8 w-8 text-gold/40" />
        <p className="text-sm text-muted-foreground">
          {isSlave
            ? "Add your first photo to this gallery."
            : "No photos in this gallery yet."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}
      >
        {entries.map((entry) => (
          <button
            key={entry.id}
            id={`worship-entry-${entry.id}`}
            type="button"
            onClick={() => openEntry(entry)}
            className={cn(
              "group overflow-hidden rounded-xl border bg-charcoal/80 text-left transition-all duration-300",
              isQueen && !entry.viewed_at
                ? "border-gold/40 glow-gold hover:border-gold"
                : "border-gold/15 hover:border-gold/30"
            )}
          >
            <div className="relative aspect-[4/5] bg-void">
              {entry.signedUrl ? (
                <WatermarkedFrame
                  className="absolute inset-0"
                  mediaPath={entry.image_path}
                >
                  <Image
                    src={entry.signedUrl}
                    alt={entry.title || "Worship"}
                    fill
                    unoptimized
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, 33vw"
                  />
                </WatermarkedFrame>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Crown className="h-8 w-8" />
                </div>
              )}
              {isQueen && !entry.viewed_at && (
                <span className="absolute left-2 top-2 rounded-full bg-gold px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-void">
                  New
                </span>
              )}
              <span
                className={cn(
                  "absolute bottom-2 left-2 z-20 rounded-full bg-void/80 px-2 py-0.5 text-[10px] font-medium tabular-nums",
                  loveColor(entry.love_level)
                )}
              >
                {entry.love_level}
              </span>
            </div>
            <div className="space-y-1 p-3">
              <p className="truncate font-heading text-ivory">
                {entry.title || "Worship"}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-gold/80">
                {loveLabel(entry.love_level)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatRelative(entry.created_at)}
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
                  <WatermarkedFrame
                    className="absolute inset-0"
                    sizeClassName="w-[22%] max-w-[160px] min-w-[80px]"
                    mediaPath={active.image_path}
                  >
                    <Image
                      src={active.signedUrl}
                      alt={active.title || "Worship"}
                      fill
                      unoptimized
                      className="object-contain"
                      sizes="100vw"
                    />
                  </WatermarkedFrame>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Crown className="h-10 w-10" />
                  </div>
                )}
              </div>
              <div className="space-y-4 p-5">
                <DialogHeader>
                  <DialogTitle className="font-heading text-gold">
                    <RoleSpeech
                      text={active.title || "Worship"}
                      role="slave"
                    />
                  </DialogTitle>
                  {active.description && (
                    <DialogDescription className="text-ivory/80 whitespace-pre-wrap">
                      <RoleSpeech text={active.description} role="slave" />
                    </DialogDescription>
                  )}
                </DialogHeader>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] uppercase tracking-wider border-gold/30",
                      loveColor(active.love_level)
                    )}
                  >
                    {loveLabel(active.love_level)} · {active.love_level}/100
                  </Badge>
                  {active.viewed_at && isSlave && (
                    <span className="text-xs text-muted-foreground">
                      Queen viewed {formatRelative(active.viewed_at)}
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  Offered {formatRelative(active.created_at)}
                </p>

                <GeoMapLinks
                  latitude={active.latitude}
                  longitude={active.longitude}
                  accuracy_m={active.accuracy_m}
                  location_source={active.location_source}
                />

                <WorshipCommentThread
                  worshipId={active.id}
                  galleryId={galleryId}
                  worshipTitle={active.title}
                  highlightCommentId={highlightPhotoCommentId}
                />

                {(onEdit || canDelete) && (
                  <div className="flex flex-wrap gap-2">
                    {onEdit && isSlave && active.created_by === profile?.id && (
                      <Button
                        type="button"
                        variant="outline"
                        className="border-gold/40 text-gold hover:bg-gold/10"
                        onClick={() => {
                          onEdit(active);
                          setActive(null);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    )}
                    {canDelete && (
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
                    )}
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
