"use client";

import Image from "next/image";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CreepMediaKind } from "@/lib/types";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";

export function isCreepVideo(
  mediaKind: CreepMediaKind | string | null | undefined
): boolean {
  return mediaKind === "video";
}

type CreepMediaProps = {
  signedUrl: string;
  alt: string;
  mediaKind?: CreepMediaKind | string | null;
  mediaPath?: string | null;
  className?: string;
  variant?: "tile" | "detail" | "preview";
};

export function CreepMedia({
  signedUrl,
  alt,
  mediaKind = "image",
  mediaPath,
  className,
  variant = "tile",
}: CreepMediaProps) {
  const video = isCreepVideo(mediaKind);

  if (video) {
    return (
      <div
        className={cn(
          "relative h-full w-full bg-void",
          (variant === "tile" || variant === "detail") && "absolute inset-0",
          className
        )}
      >
        <video
          src={signedUrl}
          className={cn(
            "h-full w-full",
            variant === "tile" ? "object-cover" : "object-contain",
            variant === "tile" &&
              "transition-transform duration-300 group-hover:scale-105"
          )}
          muted
          playsInline
          preload="metadata"
          controls={variant === "detail" || variant === "preview"}
        />
        {variant === "tile" && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-void/25">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/40 bg-void/70 text-gold">
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            </span>
          </span>
        )}
      </div>
    );
  }

  if (variant === "preview") {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={signedUrl}
        alt={alt}
        className={cn("max-h-80 w-full object-contain bg-void", className)}
      />
    );
  }

  return (
    <WatermarkedFrame
      className={cn("absolute inset-0", className)}
      mediaPath={mediaPath}
    >
      <Image
        src={signedUrl}
        alt={alt}
        fill
        unoptimized
        className={cn(
          variant === "tile" ? "object-cover" : "object-contain",
          variant === "tile" &&
            "transition-transform duration-300 group-hover:scale-105"
        )}
        sizes={
          variant === "detail"
            ? "100vw"
            : "(max-width: 640px) 100vw, 33vw"
        }
      />
    </WatermarkedFrame>
  );
}
