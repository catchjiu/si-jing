"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TeaseReactionCameraPip } from "@/components/teases/tease-reaction-camera-pip";
import type { TeaseMediaKind } from "@/lib/types";

type TeaseSessionViewerProps = {
  mediaUrl: string;
  mediaKind?: TeaseMediaKind;
  title?: string | null;
  cameraStream?: MediaStream | null;
  onSessionEnd: (opts: { watchMetric: number }) => void;
  onSuspiciousCapture?: () => void;
  className?: string;
};

/**
 * Fullscreen tease session — ends on close or leave, uploads reaction cam,
 * but the tease stays available until Queen blurs it again.
 */
export function TeaseSessionViewer({
  mediaUrl,
  mediaKind = "image",
  title,
  cameraStream,
  onSessionEnd,
  onSuspiciousCapture,
  className,
}: TeaseSessionViewerProps) {
  const [blanked, setBlanked] = useState(false);
  const endedRef = useRef(false);
  const flaggedRef = useRef(false);
  const sessionStartedAt = useRef(Date.now());
  const visibleMsRef = useRef(0);
  const visibleSinceRef = useRef<number | null>(Date.now());

  const tallyVisible = useCallback(() => {
    if (visibleSinceRef.current != null) {
      visibleMsRef.current += Date.now() - visibleSinceRef.current;
      visibleSinceRef.current = null;
    }
  }, []);

  const resumeVisible = useCallback(() => {
    if (document.visibilityState === "visible" && visibleSinceRef.current == null) {
      visibleSinceRef.current = Date.now();
    }
  }, []);

  const watchMetric = useCallback((): number => {
    tallyVisible();
    if (mediaKind === "video") return 1;
    return Math.max(1, Math.round(visibleMsRef.current / 1000));
  }, [mediaKind, tallyVisible]);

  const end = useCallback(
    (reason: "left" | "closed") => {
      if (endedRef.current) return;
      endedRef.current = true;
      setBlanked(true);
      onSessionEnd({ watchMetric: watchMetric() });
      void reason;
    },
    [onSessionEnd, watchMetric]
  );

  const flagAndBlank = useCallback(() => {
    setBlanked(true);
    if (!flaggedRef.current) {
      flaggedRef.current = true;
      onSuspiciousCapture?.();
    }
  }, [onSuspiciousCapture]);

  useEffect(() => {
    sessionStartedAt.current = Date.now();
    visibleMsRef.current = 0;
    visibleSinceRef.current =
      document.visibilityState === "visible" ? Date.now() : null;

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        tallyVisible();
        flagAndBlank();
        end("left");
      } else {
        resumeVisible();
      }
    };
    const onBlur = () => {
      tallyVisible();
      flagAndBlank();
      end("left");
    };
    const onPageHide = () => {
      tallyVisible();
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
  }, [end, flagAndBlank, resumeVisible, tallyVisible]);

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
            Reaction cam recording · watch again anytime until Queen hides it
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-muted"
          onClick={() => end("closed")}
        >
          End view
        </Button>
      </div>

      <div className="relative flex-1 overflow-hidden bg-black">
        {cameraStream && (
          <TeaseReactionCameraPip
            stream={cameraStream}
            className="absolute right-3 top-3 z-10 h-24 w-20 sm:h-28 sm:w-24"
          />
        )}
        {blanked ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Eye className="size-8 text-muted-foreground" />
            <p className="font-heading text-ivory">View ended</p>
            <p className="text-sm text-muted-foreground">
              Open again anytime — Queen still has it revealed
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
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl}
            alt={title || "Tease"}
            className="h-full w-full object-contain"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
          />
        )}
      </div>
    </div>
  );
}

/** @deprecated Use TeaseSessionViewer */
export const ProtectedTeaseViewer = TeaseSessionViewer;
