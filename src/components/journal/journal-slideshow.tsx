"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Pause,
  Play,
} from "lucide-react";
import type { JournalEntryImageWithSignedUrl } from "@/lib/types";
import { SLAVE_PLACE } from "@/lib/partner-locations";
import { hmInZone, ymdInZone } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { GeoMapLinks } from "@/components/location/geo-map-links";
import { Button } from "@/components/ui/button";

const AUTO_MS = 3000;

type JournalSlideshowProps = {
  images: JournalEntryImageWithSignedUrl[];
  className?: string;
};

function formatTakenAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const ymd = ymdInZone(d, SLAVE_PLACE.timeZone);
  const hm = hmInZone(d, SLAVE_PLACE.timeZone);
  return `${ymd} · ${hm} ${SLAVE_PLACE.zoneShort}`;
}

export function JournalSlideshow({ images, className }: JournalSlideshowProps) {
  const slides = images.filter((img) => img.signedUrl);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(slides.length > 1);
  const [pausedByHover, setPausedByHover] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const count = slides.length;
  const current = slides[index] ?? slides[0];

  const go = useCallback(
    (delta: number) => {
      if (count <= 1) return;
      setIndex((i) => (i + delta + count) % count);
    },
    [count]
  );

  useEffect(() => {
    const hoverPaused = pausedByHover && !fullscreen;
    if (!playing || hoverPaused || count <= 1) return;
    const id = window.setInterval(() => go(1), AUTO_MS);
    return () => window.clearInterval(id);
  }, [playing, pausedByHover, fullscreen, count, go]);

  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (fullscreen) {
        if (e.key === "Escape") {
          e.preventDefault();
          setFullscreen(false);
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(-1);
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          go(1);
          return;
        }
        if (e.key === " ") {
          e.preventDefault();
          setPlaying((p) => !p);
          return;
        }
        return;
      }

      const el = containerRef.current;
      if (!el || document.activeElement !== el) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setFullscreen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, go]);

  if (!current?.signedUrl) return null;

  const takenLabel = formatTakenAt(current.taken_at);

  const controls = (
    <>
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-void/70 p-1.5 text-ivory hover:bg-void/90 sm:left-3 sm:p-2"
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-void/70 p-1.5 text-ivory hover:bg-void/90 sm:right-3 sm:p-2"
            aria-label="Next photo"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-void/75 px-2 py-1 sm:bottom-3 sm:gap-2 sm:px-2.5">
        {count > 1 && (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-ivory hover:bg-white/10"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause slideshow" : "Play slideshow"}
            >
              {playing ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </Button>
            <span className="min-w-[3.5rem] text-center text-xs tabular-nums text-ivory/90">
              {index + 1} / {count}
            </span>
          </>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-ivory hover:bg-white/10"
          onClick={() => setFullscreen((f) => !f)}
          aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {fullscreen ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </>
  );

  return (
    <>
      <div
        ref={containerRef}
        tabIndex={0}
        className={cn(
          "outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
          className
        )}
        onMouseEnter={() => setPausedByHover(true)}
        onMouseLeave={() => setPausedByHover(false)}
        onFocus={() => setPausedByHover(true)}
        onBlur={() => setPausedByHover(false)}
      >
        <WatermarkedFrame
          className="rounded-lg border border-gold/15"
          mediaPath={current.image_path}
        >
          <div className="relative bg-void">
            <Image
              src={current.signedUrl}
              alt={`Journal photo ${index + 1} of ${count}`}
              width={960}
              height={640}
              className="h-auto max-h-96 w-full object-contain"
              unoptimized
            />
            {controls}
          </div>
        </WatermarkedFrame>

        {(takenLabel ||
          (current.latitude != null && current.longitude != null)) && (
          <div className="mt-2 space-y-1">
            {takenLabel && (
              <p className="text-xs text-muted-foreground">{takenLabel}</p>
            )}
            {current.latitude != null && current.longitude != null && (
              <GeoMapLinks
                latitude={current.latitude}
                longitude={current.longitude}
                accuracy_m={current.accuracy_m}
                location_source={current.location_source}
              />
            )}
          </div>
        )}
      </div>

      {fullscreen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black"
          role="dialog"
          aria-modal="true"
          aria-label="Journal slideshow fullscreen"
        >
          <div className="relative flex min-h-0 flex-1 items-center justify-center">
            <WatermarkedFrame
              className="h-full w-full"
              mediaPath={current.image_path}
            >
              <div className="relative flex h-full w-full items-center justify-center bg-black">
                <Image
                  src={current.signedUrl}
                  alt={`Journal photo ${index + 1} of ${count}`}
                  width={1600}
                  height={1200}
                  className="max-h-[100dvh] max-w-full object-contain"
                  unoptimized
                />
                {controls}
              </div>
            </WatermarkedFrame>
          </div>
          {takenLabel && (
            <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-void/70 px-2.5 py-1 text-xs text-ivory/90">
              {takenLabel}
            </p>
          )}
        </div>
      )}
    </>
  );
}
