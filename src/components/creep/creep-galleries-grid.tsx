"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { FolderOpen, Ghost, Loader2, Trash2, Wind } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import { creepGalleryHref, creepFartHref } from "@/lib/creep";
import { cn } from "@/lib/utils";
import type { CreepGalleryWithMeta } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { RoleSpeech } from "@/components/ui/role-speech";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { CreepMedia, isCreepVideo } from "@/components/creep/creep-media";

type Props = {
  galleries: CreepGalleryWithMeta[];
  onDeleted?: (id: string) => void;
  onChanged?: () => void;
  className?: string;
};

export function CreepGalleriesGrid({
  galleries,
  onDeleted,
  onChanged,
  className,
}: Props) {
  const { isQueen, isSlave, profile } = useAuth();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (
    e: React.MouseEvent,
    gallery: CreepGalleryWithMeta
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (gallery.is_system) return;
    if (!isSlave && !isQueen) return;
    if (isSlave && gallery.created_by !== profile?.id) return;
    if (
      !window.confirm(
        `Delete "${gallery.title}" and all photos inside? This cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingId(gallery.id);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("creep_galleries")
        .delete()
        .eq("id", gallery.id);
      if (error) throw error;
      toast.success("Gallery removed");
      onDeleted?.(gallery.id);
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not delete gallery"
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      <Link
        href={creepFartHref()}
        className="group overflow-hidden rounded-xl border border-gold/15 bg-charcoal/80 text-left transition-all duration-300 hover:border-gold/30"
      >
        <div className="relative flex aspect-[4/3] items-center justify-center bg-void">
          <Wind className="h-10 w-10 text-gold/70" />
        </div>
        <div className="space-y-1 p-3">
          <p className="truncate font-heading text-ivory">Fart Tracker</p>
          <p className="text-xs text-muted-foreground">
            Recordings, ratings, and comments
          </p>
        </div>
      </Link>

      {galleries.length === 0 ? (
        <div className="rounded-xl border border-gold/15 bg-charcoal/60 px-6 py-12 text-center sm:col-span-1 lg:col-span-2">
          <FolderOpen className="mx-auto mb-3 h-8 w-8 text-gold/40" />
          <p className="text-sm text-muted-foreground">
            {isSlave
              ? "Galleries will show here — Stretch Marks and Panties load with Creep."
              : "No Creep galleries yet."}
          </p>
        </div>
      ) : (
        galleries.map((gallery) => {
          const hasNew = isQueen && gallery.unviewedCount > 0;
          const canDelete =
            !gallery.is_system &&
            ((isSlave && gallery.created_by === profile?.id) || isQueen);

          return (
            <div key={gallery.id} className="group relative">
              <Link
                href={creepGalleryHref(gallery.id)}
                className={cn(
                  "block overflow-hidden rounded-xl border bg-charcoal/80 text-left transition-all duration-300",
                  hasNew
                    ? "border-gold/40 glow-gold hover:border-gold"
                    : "border-gold/15 hover:border-gold/30"
                )}
              >
                <div className="relative aspect-[4/3] bg-void">
                  {gallery.coverSignedUrl ? (
                    isCreepVideo(gallery.coverMediaKind) ? (
                      <CreepMedia
                        signedUrl={gallery.coverSignedUrl}
                        alt={gallery.title}
                        mediaKind="video"
                        variant="tile"
                      />
                    ) : (
                      <WatermarkedFrame className="absolute inset-0">
                        <Image
                          src={gallery.coverSignedUrl}
                          alt={gallery.title}
                          fill
                          unoptimized
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                          sizes="(max-width: 640px) 100vw, 33vw"
                        />
                      </WatermarkedFrame>
                    )
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Ghost className="h-8 w-8" />
                      <span className="text-xs">No media yet</span>
                    </div>
                  )}
                  {hasNew && (
                    <span className="absolute left-2 top-2 z-20 rounded-full bg-gold px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-void">
                      New
                    </span>
                  )}
                  <span className="absolute bottom-2 left-2 z-20 rounded-full bg-void/80 px-2 py-0.5 text-[10px] font-medium text-ivory">
                    {gallery.entryCount}{" "}
                    {gallery.entryCount === 1 ? "item" : "items"}
                  </span>
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate font-heading text-ivory">
                    <RoleSpeech text={gallery.title} role="slave" />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {gallery.is_system
                      ? "Built-in gallery"
                      : `Added ${formatRelative(gallery.created_at)}`}
                  </p>
                </div>
              </Link>
              {canDelete && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute right-2 top-2 z-20 h-8 w-8 bg-void/70 text-muted-foreground hover:bg-red-500/20 hover:text-red-400"
                  disabled={deletingId === gallery.id}
                  aria-label="Delete gallery"
                  onClick={(e) => void handleDelete(e, gallery)}
                >
                  {deletingId === gallery.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
