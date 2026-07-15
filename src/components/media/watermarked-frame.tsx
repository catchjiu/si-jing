"use client";

import type { ReactNode } from "react";
import { ProofWatermark } from "@/components/submissions/proof-watermark";
import { cn } from "@/lib/utils";

type WatermarkedFrameProps = {
  children: ReactNode;
  className?: string;
  /** Hide overlay (e.g. tiny thumbnails). Default shows mark. */
  show?: boolean;
  watermarkClassName?: string;
  sizeClassName?: string;
};

/** Relative container that stamps the proof watermark on displayed media. */
export function WatermarkedFrame({
  children,
  className,
  show = true,
  watermarkClassName,
  sizeClassName,
}: WatermarkedFrameProps) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      {children}
      {show ? (
        <ProofWatermark
          className={watermarkClassName}
          sizeClassName={sizeClassName}
        />
      ) : null}
    </div>
  );
}
