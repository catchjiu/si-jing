"use client";

import type { ReactNode } from "react";
import { ProofWatermark } from "@/components/submissions/proof-watermark";
import { needsDisplayWatermark } from "@/lib/storage/watermark-display";
import { cn } from "@/lib/utils";

type WatermarkedFrameProps = {
  children: ReactNode;
  className?: string;
  /** Storage path — overlay is skipped when the image is already stamped on upload. */
  mediaPath?: string | null;
  /** Override overlay visibility (defaults from mediaPath). */
  show?: boolean;
  watermarkClassName?: string;
  sizeClassName?: string;
};

/** Relative container for media; adds a CSS watermark only when not baked into the file. */
export function WatermarkedFrame({
  children,
  className,
  mediaPath,
  show,
  watermarkClassName,
  sizeClassName,
}: WatermarkedFrameProps) {
  const showOverlay = show ?? needsDisplayWatermark(mediaPath);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {children}
      {showOverlay ? (
        <ProofWatermark
          className={watermarkClassName}
          sizeClassName={sizeClassName}
        />
      ) : null}
    </div>
  );
}
