"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { Crown, FolderOpen, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import { loveLabel } from "@/lib/worship";
import { cn } from "@/lib/utils";
import type { WorshipGalleryTopicWithMeta } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RoleSpeech } from "@/components/ui/role-speech";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { WorshipMedia, isWorshipVideo } from "@/components/worship/worship-media";

interface WorshipGalleriesGridProps {
  galleries: WorshipGalleryTopicWithMeta[];
  onDeleted?: (id: string) => void;
  onChanged?: () => void;
  className?: string;
}

export function WorshipGalleriesGrid({
  galleries,
  onDeleted,
  onChanged,
  className,
}: WorshipGalleriesGridProps) {
  const { isQueen, isSlave, profile } = useAuth();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (
    e: React.MouseEvent,
    gallery: WorshipGalleryTopicWithMeta
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSlave || gallery.created_by !== profile?.id) return;
    if (
      !window.confirm(
        `Delete "${gallery.topic}" and all photos inside? This cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingId(gallery.id);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from("worship_galleries")
        .delete()
        .eq("id", gallery.id);
      if (error) throw error;

      toast.success("Gallery removed");
      onDeleted?.(gallery.id);
      onChanged?.();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not delete gallery";
      toast.error(msg);
    } finally {
      setDeletingId(null);
    }
  };

  if (galleries.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-gold/15 bg-charcoal/60 px-6 py-12 text-center",
          className
        )}
      >
        <FolderOpen className="mx-auto mb-3 h-8 w-8 text-gold/40" />
        <p className="text-sm text-muted-foreground">
          {isSlave
            ? "Create your first gallery — a topic to collect photos of Queen."
            : "D has not created worship galleries yet."}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}
    >
      {galleries.map((gallery) => {
        const hasNew =
          isQueen &&
          (!gallery.viewed_at || gallery.unviewedCount > 0);

        return (
          <div key={gallery.id} className="group relative">
            <Link
              href={`/dashboard/worship/${gallery.id}`}
              className={cn(
                "block overflow-hidden rounded-xl border bg-charcoal/80 text-left transition-all duration-300",
                hasNew
                  ? "border-gold/40 glow-gold hover:border-gold"
                  : "border-gold/15 hover:border-gold/30"
              )}
            >
              <div className="relative aspect-[4/3] bg-void">
                {gallery.coverSignedUrl ? (
                  isWorshipVideo(gallery.coverMediaKind) ? (
                    <WorshipMedia
                      signedUrl={gallery.coverSignedUrl}
                      alt={gallery.topic}
                      mediaKind="video"
                      variant="tile"
                    />
                  ) : (
                    <WatermarkedFrame className="absolute inset-0">
                      <Image
                        src={gallery.coverSignedUrl}
                        alt={gallery.topic}
                        fill
                        unoptimized
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        sizes="(max-width: 640px) 100vw, 33vw"
                      />
                    </WatermarkedFrame>
                  )
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Crown className="h-8 w-8" />
                    <span className="text-xs">No media yet</span>
                  </div>
                )}
                {hasNew && (
                  <span className="absolute left-2 top-2 z-20 rounded-full bg-gold px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-void">
                    New
                  </span>
                )}
                <span className="absolute bottom-2 left-2 z-20 rounded-full bg-void/80 px-2 py-0.5 text-[10px] font-medium text-ivory">
                  {gallery.entryCount} photo{gallery.entryCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className="space-y-1 p-3">
                <p className="truncate font-heading text-ivory">
                  <RoleSpeech text={gallery.topic} role="slave" />
                </p>
                {gallery.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    <RoleSpeech text={gallery.description} role="slave" />
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {gallery.avgLoveLevel != null && (
                    <Badge
                      variant="outline"
                      className="text-[9px] uppercase tracking-wider border-gold/30 text-gold/90"
                    >
                      {loveLabel(gallery.avgLoveLevel)}
                    </Badge>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatRelative(gallery.updated_at)}
                  </p>
                </div>
              </div>
            </Link>
            {isSlave && gallery.created_by === profile?.id && (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute right-2 top-2 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                disabled={deletingId === gallery.id}
                onClick={(e) => void handleDelete(e, gallery)}
                aria-label="Delete gallery"
              >
                {deletingId === gallery.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
