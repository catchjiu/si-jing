"use client";

import { useEffect, useRef } from "react";
import { Video } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  stream: MediaStream | null;
  className?: string;
};

/** Small PiP preview while reaction video records for Queen. */
export function TeaseReactionCameraPip({ stream, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    void el.play().catch(() => undefined);
    return () => {
      el.srcObject = null;
    };
  }, [stream]);

  if (!stream) return null;

  return (
    <div
      className={cn(
        "relative pointer-events-none overflow-hidden rounded-lg border-2 border-gold/50 bg-void shadow-lg",
        className
      )}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="h-full w-full scale-x-[-1] object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-void/80 px-2 py-1">
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-red-500" />
        </span>
        <Video className="size-3 text-gold" />
        <span className="text-[9px] uppercase tracking-wider text-ivory/90">
          Recording for Queen
        </span>
      </div>
    </div>
  );
}
