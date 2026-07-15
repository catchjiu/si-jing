"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

type ProofWatermarkProps = {
  className?: string;
  /** Relative width of the image container (default ~28%) */
  sizeClassName?: string;
};

/** Bottom-right ownership mark for submission proof photos. */
export function ProofWatermark({
  className,
  sizeClassName = "w-[28%] max-w-[140px] min-w-[72px]",
}: ProofWatermarkProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute bottom-2 right-2 z-10 select-none",
        sizeClassName,
        className
      )}
    >
      <Image
        src="/brand/proof-watermark.png"
        alt=""
        width={360}
        height={375}
        className="h-auto w-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] opacity-90"
        unoptimized
        priority={false}
      />
    </div>
  );
}
