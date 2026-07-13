"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, ShieldAlert, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TeaseMediaKind } from "@/lib/types";

type ProtectedTeaseViewerProps = {
  mediaUrl: string;
  mediaKind?: TeaseMediaKind;
  durationSeconds: number | null;
  title?: string | null;
  onSessionEnd: (reason: "expired" | "left" | "closed") => void;
  onSuspiciousCapture?: () => void;
  className?: string;
};

/**
 * Best-effort protection for ephemeral teases (image or video).
 * True screenshot blocking is not possible in iOS Safari; we blank on leave,
 * disable save/long-press affordances, and burn timed / one-shot views.
 */
export function ProtectedTeaseViewer({
  mediaUrl,
  mediaKind = "image",
  durationSeconds,
  title,
  onSessionEnd,
  onSuspiciousCapture,
  className,
}: ProtectedTeaseViewerProps) {
  const [blanked, setBlanked] = useState(false);
  const [remaining, setRemaining] = useState(durationSeconds);
  const endedRef = useRef(false);
  const flaggedRef = useRef(false);

  const end = useCallback(
    (reason: "expired" | "left" | "closed") => {
      if (endedRef.current) return;
      endedRef.current = true;
      setBlanked(true);
      onSessionEnd(reason);
    },
    [onSessionEnd]
  );

  const flagAndBlank = useCallback(() => {
    setBlanked(true);
    if (!flaggedRef.current) {
      flaggedRef.current = true;
      onSuspiciousCapture?.();
    }
  }, [onSuspiciousCapture]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        flagAndBlank();
        end("left");
      }
    };
    const onBlur = () => {
      flagAndBlank();
      end("left");
    };
    const onPageHide = () => {
      flagAndBlank();
      end("left");
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [end, flagAndBlank]);

  useEffect(() => {
    if (!durationSeconds || blanked) return;
    setRemaining(durationSeconds);
    const started = Date.now();
    const id = window.setInterval(() => {
      const left = Math.max(
        0,
        durationSeconds - Math.floor((Date.now() - started) / 1000)
      );
      setRemaining(left);
      if (left <= 0) {
        window.clearInterval(id);
        end("expired");
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [durationSeconds, blanked, end]);

  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    document.addEventListener("selectstart", block);
    return () => {
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("selectstart", block);
    };
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col bg-void",
        "select-none [-webkit-touch-callout:none] [-webkit-user-select:none]",
        className
      )}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-between gap-3 border-b border-gold/15 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-heading text-ivory">
            {title || "Tease"}
          </p>
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <ShieldAlert className="size-3" />
            One-shot view · leave blanks the {mediaKind}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {durationSeconds != null && remaining != null && (
            <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 px-2.5 py-1 text-xs text-gold">
              <Timer className="size-3.5" />
              {remaining}s
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-muted"
            onClick={() => end("closed")}
          >
            Close
          </Button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden bg-black">
        {blanked ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Eye className="size-8 text-muted-foreground" />
            <p className="font-heading text-ivory">View ended</p>
            <p className="text-sm text-muted-foreground">
              {durationSeconds
                ? "This timed tease has burned out."
                : "This tease can only be viewed once."}
            </p>
          </div>
        ) : mediaKind === "video" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={mediaUrl}
            controls
            playsInline
            autoPlay
            className="h-full w-full object-contain"
            controlsList="nodownload noremoteplayback"
            disablePictureInPicture
            onContextMenu={(e) => e.preventDefault()}
          />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaUrl}
              alt=""
              draggable={false}
              className="h-full w-full object-contain pointer-events-none select-none [-webkit-touch-callout:none]"
            />
            <div
              className="absolute inset-0"
              onContextMenu={(e) => e.preventDefault()}
              onTouchStart={(e) => {
                if (e.touches.length > 1) e.preventDefault();
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
