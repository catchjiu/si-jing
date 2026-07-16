"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Gift, Loader2, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  filterAlreadySavedQueenPictures,
  fetchQueenPictureSources,
  type QueenPictureSource,
} from "@/lib/queen-picture-sources";
import { cn } from "@/lib/utils";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";

interface QueenPicturesPickerProps {
  galleryId: string;
  selected: QueenPictureSource | null;
  onSelect: (source: QueenPictureSource | null) => void;
  className?: string;
}

export function QueenPicturesPicker({
  galleryId,
  selected,
  onSelect,
  className,
}: QueenPicturesPickerProps) {
  const { profile, isSlave } = useAuth();
  const [items, setItems] = useState<QueenPictureSource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSlave || !profile?.id) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const supabase = createClient();
      const sources = await fetchQueenPictureSources(supabase, profile.id);
      const available = await filterAlreadySavedQueenPictures(
        supabase,
        galleryId,
        sources
      );
      if (!cancelled) {
        setItems(available);
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [galleryId, isSlave, profile?.id]);

  if (!isSlave) return null;

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg border border-gold/15 bg-void/40 px-4 py-10 text-sm text-muted-foreground",
          className
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading Queen&apos;s pictures…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-gold/15 bg-void/40 px-4 py-8 text-center text-sm text-muted-foreground",
          className
        )}
      >
        No rewards or revealed teases to save yet — or they&apos;re already in
        this gallery.
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-xs text-muted-foreground">
        Pick a reward or fully revealed tease from Queen to add to this gallery.
      </p>
      <div className="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
        {items.map((item) => {
          const active =
            selected?.sourceType === item.sourceType &&
            selected?.sourceId === item.sourceId;
          const Icon = item.sourceType === "reward" ? Gift : Sparkles;
          return (
            <button
              key={`${item.sourceType}-${item.sourceId}`}
              type="button"
              onClick={() => onSelect(active ? null : item)}
              className={cn(
                "overflow-hidden rounded-lg border text-left transition-all",
                active
                  ? "border-gold bg-gold/10 ring-1 ring-gold/40"
                  : "border-gold/15 bg-charcoal/60 hover:border-gold/35"
              )}
            >
              <div className="relative aspect-square bg-void">
                {item.signedUrl ? (
                  <WatermarkedFrame className="absolute inset-0">
                    <Image
                      src={item.signedUrl}
                      alt={item.label}
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="120px"
                    />
                  </WatermarkedFrame>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Icon className="h-6 w-6" />
                  </div>
                )}
                <span className="absolute left-1.5 top-1.5 z-20 rounded bg-void/80 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-gold">
                  {item.sourceType === "reward" ? "Reward" : "Tease"}
                </span>
              </div>
              <div className="space-y-0.5 p-2">
                <p className="truncate text-xs font-medium text-ivory">
                  {item.label}
                </p>
                {item.subtitle && (
                  <p className="truncate text-[10px] text-muted-foreground">
                    {item.subtitle}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
