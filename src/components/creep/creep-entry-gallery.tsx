"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Ghost, Loader2, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import { removeObject } from "@/lib/storage/client";
import { creepGalleryPageHref } from "@/lib/inbox-deep-links";
import { cn } from "@/lib/utils";
import type { CreepEntryWithSignedUrl } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RoleSpeech } from "@/components/ui/role-speech";
import { CreepMedia } from "@/components/creep/creep-media";
import { CreepCommentThread } from "@/components/creep/creep-comment-thread";
import { ShareLinkButton } from "@/components/ui/share-link-button";

type Props = {
  entries: CreepEntryWithSignedUrl[];
  galleryId: string;
  galleryTitle?: string | null;
  initialEntryId?: string | null;
  highlightCommentId?: string | null;
  onDeleted?: (id: string) => void;
  onEdit?: (entry: CreepEntryWithSignedUrl) => void;
  onChanged?: () => void;
  onViewed?: (id: string) => void;
  className?: string;
};

export function CreepEntryGallery({
  entries,
  galleryId,
  galleryTitle,
  initialEntryId = null,
  highlightCommentId = null,
  onDeleted,
  onEdit,
  onChanged,
  onViewed,
  className,
}: Props) {
  const { isQueen, isSlave, profile } = useAuth();
  const [active, setActive] = useState<CreepEntryWithSignedUrl | null>(null);
  const [deleting, setDeleting] = useState(false);
  const initialEntryHandled = useRef<string | null>(null);

  const markViewed = useCallback(
    async (entry: CreepEntryWithSignedUrl) => {
      if (!isQueen || entry.viewed_at) return;
      const supabase = createClient();
      await supabase
        .from("creep_entries")
        .update({ viewed_at: new Date().toISOString() })
        .eq("id", entry.id);
      onViewed?.(entry.id);
      onChanged?.();
    },
    [isQueen, onViewed, onChanged]
  );

  const openEntry = (entry: CreepEntryWithSignedUrl) => {
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

  const canDelete =
    (isQueen && active) ||
    (isSlave && active && profile && active.created_by === profile.id);

  const handleDelete = async () => {
    if (!canDelete || !active) return;
    setDeleting(true);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("creep_entries")
        .delete()
        .eq("id", active.id);
      if (error) throw error;
      try {
        await removeObject({ bucket: "creep", path: active.image_path });
      } catch {
        // row is gone
      }
      toast.success("Removed");
      onDeleted?.(active.id);
      setActive(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
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
        <Ghost className="mx-auto mb-3 h-8 w-8 text-gold/40" />
        <p className="text-sm text-muted-foreground">
          {isSlave
            ? "Add your first photo or video to this gallery."
            : "No photos or videos in this gallery yet."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
        {entries.map((entry) => (
          <button
            key={entry.id}
            id={`creep-entry-${entry.id}`}
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
                <CreepMedia
                  signedUrl={entry.signedUrl}
                  alt={entry.title || galleryTitle || "Creep"}
                  mediaKind={entry.media_kind ?? "image"}
                  mediaPath={entry.image_path}
                  variant="tile"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Ghost className="h-8 w-8" />
                </div>
              )}
              {isQueen && !entry.viewed_at && (
                <span className="absolute left-2 top-2 z-20 rounded-full bg-gold px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-void">
                  New
                </span>
              )}
            </div>
            <div className="space-y-1 p-3">
              <p className="truncate font-heading text-ivory">
                {entry.title || galleryTitle || "Upload"}
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
                  <CreepMedia
                    signedUrl={active.signedUrl}
                    alt={active.title || galleryTitle || "Creep"}
                    mediaKind={active.media_kind ?? "image"}
                    mediaPath={active.image_path}
                    variant="detail"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Ghost className="h-10 w-10" />
                  </div>
                )}
              </div>
              <div className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <DialogHeader className="flex-1 space-y-1.5 text-left">
                    <DialogTitle className="font-heading text-gold">
                      <RoleSpeech
                        text={active.title || galleryTitle || "Upload"}
                        role="slave"
                      />
                    </DialogTitle>
                    {active.description && (
                      <DialogDescription className="whitespace-pre-wrap text-ivory/80">
                        <RoleSpeech text={active.description} role="slave" />
                      </DialogDescription>
                    )}
                  </DialogHeader>
                  <ShareLinkButton
                    path={creepGalleryPageHref(galleryId, {
                      entryId: active.id,
                    })}
                    successMessage="Link copied"
                  />
                </div>

                {active.viewed_at && isSlave && (
                  <p className="text-xs text-muted-foreground">
                    Queen viewed {formatRelative(active.viewed_at)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Added {formatRelative(active.created_at)}
                </p>

                <CreepCommentThread
                  entryId={active.id}
                  galleryId={galleryId}
                  galleryTitle={galleryTitle}
                  highlightCommentId={
                    active.id === initialEntryId ? highlightCommentId : null
                  }
                />

                {(onEdit || canDelete) && (
                  <div className="flex flex-wrap gap-2">
                    {onEdit &&
                      isSlave &&
                      active.created_by === profile?.id && (
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
