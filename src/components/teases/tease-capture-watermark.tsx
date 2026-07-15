"use client";

import { isAppleMobile } from "@/lib/tease-capture-guard";

/** Diagonal timestamp watermark — deters screenshots on iOS where detection is limited. */
export function TeaseCaptureWatermark() {
  if (!isAppleMobile()) return null;

  const stamp = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden select-none"
    >
      <div className="absolute inset-0 opacity-[0.14]">
        {Array.from({ length: 6 }).map((_, row) => (
          <div
            key={row}
            className="flex whitespace-nowrap"
            style={{ transform: `translateY(${row * 72 - 24}px) rotate(-18deg)` }}
          >
            {Array.from({ length: 4 }).map((__, col) => (
              <span
                key={col}
                className="mx-8 text-[11px] font-medium tracking-wide text-ivory"
              >
                Protected · {stamp}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
