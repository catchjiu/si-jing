"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Gift } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RewardWithSignedUrl } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RewardCommentThread } from "@/components/rewards/reward-comment-thread";
import { GeoMapLinks } from "@/components/location/geo-map-links";

interface RewardGalleryProps {
  rewards: RewardWithSignedUrl[];
  onViewed?: (id: string) => void;
  className?: string;
}

export function RewardGallery({
  rewards,
  onViewed,
  className,
}: RewardGalleryProps) {
  const { isSlave, profile } = useAuth();
  const [active, setActive] = useState<RewardWithSignedUrl | null>(null);

  const markViewed = useCallback(
    async (reward: RewardWithSignedUrl) => {
      if (!isSlave || !profile || reward.viewed_at) return;
      if (reward.sent_to !== profile.id) return;

      const supabase = createClient();
      await supabase
        .from("rewards")
        .update({ viewed_at: new Date().toISOString() })
        .eq("id", reward.id);

      onViewed?.(reward.id);
    },
    [isSlave, profile, onViewed]
  );

  const open = (reward: RewardWithSignedUrl) => {
    setActive(reward);
    void markViewed(reward);
  };

  if (rewards.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-gold/15 bg-charcoal/60 px-6 py-12 text-center",
          className
        )}
      >
        <Gift className="mx-auto mb-3 h-8 w-8 text-gold/40" />
        <p className="text-sm text-muted-foreground">No rewards yet.</p>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
          className
        )}
      >
        {rewards.map((reward) => (
          <button
            key={reward.id}
            type="button"
            onClick={() => open(reward)}
            className={cn(
              "group overflow-hidden rounded-xl border bg-charcoal/80 text-left transition-all duration-300",
              reward.viewed_at
                ? "border-gold/15 hover:border-gold/30"
                : "border-gold/40 glow-gold hover:border-gold"
            )}
          >
            <div className="relative aspect-[4/5] bg-void">
              {reward.signedUrl ? (
                <Image
                  src={reward.signedUrl}
                  alt={reward.title || "Reward"}
                  fill
                  unoptimized
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, 33vw"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Gift className="h-8 w-8" />
                </div>
              )}
              {!reward.viewed_at && isSlave && (
                <span className="absolute left-2 top-2 rounded-full bg-gold px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-void">
                  New
                </span>
              )}
            </div>
            <div className="space-y-1 p-3">
              <p className="truncate font-heading text-ivory">
                {reward.title || "A gift from Queen"}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatRelative(reward.created_at)}
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
                {active.signedUrl && (
                  <Image
                    src={active.signedUrl}
                    alt={active.title || "Reward"}
                    fill
                    unoptimized
                    className="object-contain"
                    sizes="100vw"
                  />
                )}
              </div>
              <div className="space-y-4 p-5">
                <DialogHeader>
                  <DialogTitle className="font-heading text-gold">
                    {active.title || "A gift from Queen"}
                  </DialogTitle>
                  {active.message && (
                    <DialogDescription className="text-ivory/80 whitespace-pre-wrap">
                      {active.message}
                    </DialogDescription>
                  )}
                </DialogHeader>
                <p className="text-xs text-muted-foreground">
                  {formatRelative(active.created_at)}
                </p>
                <GeoMapLinks
                  latitude={active.latitude}
                  longitude={active.longitude}
                  accuracy_m={active.accuracy_m}
                  location_source={active.location_source}
                />
                <RewardCommentThread
                  rewardId={active.id}
                  rewardTitle={active.title}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function useRewardSignedUrls(rewards: RewardWithSignedUrl[]) {
  const [items, setItems] = useState<RewardWithSignedUrl[]>(rewards);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const supabase = createClient();
      const enriched = await Promise.all(
        rewards.map(async (r) => {
          const { data } = await supabase.storage
            .from("rewards")
            .createSignedUrl(r.image_path, 3600);
          return { ...r, signedUrl: data?.signedUrl };
        })
      );
      if (!cancelled) setItems(enriched);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [rewards]);

  return items;
}
