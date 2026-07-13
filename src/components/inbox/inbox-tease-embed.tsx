"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, Loader2, Lock, Sparkles, Timer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatDeadline } from "@/lib/format";
import { signObjectUrl } from "@/lib/storage/client";
import type { Tease } from "@/lib/types";
import { RoleSpeech } from "@/components/ui/role-speech";
import { cn } from "@/lib/utils";

function blurStyle(amount: number): CSSProperties {
  const clamped = Math.max(0, Math.min(100, amount));
  const px = (clamped / 100) * 40;
  return {
    filter: px > 0 ? `blur(${px.toFixed(1)}px)` : undefined,
    transform: px > 0 ? "scale(1.02)" : undefined,
  };
}

function isTimeUnlocked(unlocksAt: string) {
  return new Date(unlocksAt) <= new Date();
}

type Props = {
  teaseId: string;
  className?: string;
};

/** Inline tease card for inbox — shows veiled image/video in chat. */
export function InboxTeaseEmbed({ teaseId, className }: Props) {
  const { isQueen, isSlave } = useAuth();
  const [tease, setTease] = useState<Tease | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("teases")
      .select("*")
      .eq("id", teaseId)
      .maybeSingle();

    if (error || !data) {
      setTease(null);
      setSignedUrl(null);
      setLoading(false);
      return;
    }

    const row = data as Tease;
    setTease(row);

    const burned = !!row.expired_at;
    const timeReady = isTimeUnlocked(row.unlocks_at);
    const isVideo = row.media_kind === "video";
    const canSign =
      !!row.image_path &&
      (isQueen || (timeReady && !burned)) &&
      !(
        isSlave &&
        !row.is_blurred &&
        (row.view_duration_seconds || isVideo)
      );

    if (canSign && row.image_path) {
      const url = await signObjectUrl({
        bucket: "teases",
        path: row.image_path,
        expiresIn: isQueen ? 3600 : 600,
      });
      setSignedUrl(url);
    } else {
      setSignedUrl(null);
    }
    setLoading(false);
  }, [teaseId, isQueen, isSlave]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`inbox-tease:${teaseId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "teases",
          filter: `id=eq.${teaseId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [teaseId, load]);

  if (loading) {
    return (
      <div
        className={cn(
          "mt-2 flex h-40 items-center justify-center rounded-lg border border-gold/20 bg-void/50",
          className
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tease) {
    return (
      <Link
        href="/dashboard/teases"
        className={cn(
          "mt-2 flex items-center gap-2 rounded-lg border border-gold/30 bg-void/50 px-3 py-2.5 text-sm text-ivory hover:border-gold/50",
          className
        )}
      >
        <Sparkles className="h-4 w-4 text-gold" />
        Open tease
      </Link>
    );
  }

  const burned = !!tease.expired_at;
  const timeReady = isTimeUnlocked(tease.unlocks_at);
  const isVideo = tease.media_kind === "video";
  const visuallyBlurred = !!tease.image_path && tease.is_blurred && !burned;
  const amount = tease.blur_amount ?? 20;
  const showMedia =
    !!signedUrl &&
    (visuallyBlurred ||
      isQueen ||
      (!tease.view_duration_seconds && !isVideo));
  const needsProtectedOpen =
    isSlave &&
    !!tease.image_path &&
    timeReady &&
    !burned &&
    !tease.is_blurred &&
    (!!tease.view_duration_seconds || isVideo);

  return (
    <div
      className={cn(
        "mt-2 overflow-hidden rounded-lg border border-gold/30 bg-void/60",
        className
      )}
    >
      <div className="relative aspect-[4/5] max-h-72 bg-void overflow-hidden select-none">
        {burned && isSlave ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <Timer className="h-7 w-7 text-muted-foreground" />
            <p className="font-heading text-sm text-ivory">Burned out</p>
          </div>
        ) : !timeReady && !isQueen ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <Lock className="h-7 w-7 text-gold/50" />
            <p className="font-heading text-sm text-ivory">
              {tease.title || "Locked tease"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Available {formatDeadline(tease.unlocks_at)}
            </p>
          </div>
        ) : needsProtectedOpen ? (
          <Link
            href="/dashboard/teases"
            className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center transition-colors hover:bg-gold/5"
          >
            <Eye className="h-7 w-7 text-gold" />
            <p className="font-heading text-sm text-ivory">
              {tease.title || "Ready to view"}
            </p>
            <p className="text-[11px] text-gold">
              {isVideo
                ? "One-shot video · open Teases"
                : `${tease.view_duration_seconds}s timed · open Teases`}
            </p>
          </Link>
        ) : showMedia && signedUrl ? (
          <>
            {isVideo ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={signedUrl}
                controls
                playsInline
                className="absolute inset-0 h-full w-full object-cover transition duration-500"
                style={visuallyBlurred ? blurStyle(amount) : undefined}
                controlsList="nodownload"
              />
            ) : (
              <Image
                src={signedUrl}
                alt={tease.title || "Tease"}
                fill
                unoptimized
                className="object-cover transition duration-500"
                style={visuallyBlurred ? blurStyle(amount) : undefined}
                sizes="400px"
              />
            )}
            {visuallyBlurred && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-void/85 to-transparent p-3 text-center">
                <p className="text-[11px] text-ivory/90">
                  {isQueen
                    ? `${amount}% blur for D${isVideo ? " · video" : ""}`
                    : isVideo
                      ? "Veiled video · waiting for Queen to reveal"
                      : "Veiled · waiting for Queen to reveal"}
                </p>
              </div>
            )}
          </>
        ) : tease.image_path ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <Sparkles className="h-7 w-7 text-gold/50" />
            <p className="text-xs text-muted-foreground">
              {isVideo ? "Video tease" : "Tease image"}
            </p>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <Sparkles className="h-7 w-7 text-gold" />
            <p className="font-heading text-sm text-ivory">
              {tease.title || "Tease"}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-1 border-t border-gold/15 px-3 py-2">
        {tease.title && (
          <p className="text-sm font-medium text-ivory">
            <RoleSpeech text={tease.title} role="queen" />
          </p>
        )}
        {tease.message && (
          <p className="line-clamp-2 text-xs text-ivory/75">
            <RoleSpeech text={tease.message} role="queen" />
          </p>
        )}
        <Link
          href="/dashboard/teases"
          className="inline-flex items-center gap-1 text-[11px] text-gold hover:underline"
        >
          <Sparkles className="h-3 w-3" />
          Open in Teases
        </Link>
      </div>
    </div>
  );
}
