"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TeaseReactionCameraPip } from "@/components/teases/tease-reaction-camera-pip";
import {
  TEASE_VIEW_AUTO_END_MS,
  teaseAutoEndWatchMetric,
} from "@/lib/tease-views";
import type { TeaseMediaKind } from "@/lib/types";
import { useTeaseCaptureGuard } from "@/hooks/use-tease-capture-guard";

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
 * Fullscreen tease session — images auto-end after 5s; videos run to the end,
 * then upload reaction cam. The tease stays available until Queen blurs it again.
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
  const [secondsLeft, setSecondsLeft] = useState(
    mediaKind === "video" ? 0 : Math.ceil(TEASE_VIEW_AUTO_END_MS / 1000)
  );
  const endedRef = useRef(false);
  const flaggedRef = useRef(false);
  const visibleMsRef = useRef(0);
  const visibleSinceRef = useRef<number | null>(null);
  const onSessionEndRef = useRef(onSessionEnd);
  const onSuspiciousCaptureRef = useRef(onSuspiciousCapture);
  const mediaKindRef = useRef(mediaKind);
  const endingViaButtonRef = useRef(false);

  onSessionEndRef.current = onSessionEnd;
  onSuspiciousCaptureRef.current = onSuspiciousCapture;
  mediaKindRef.current = mediaKind;

  const tallyVisible = useCallback(() => {
    if (visibleSinceRef.current != null) {
      visibleMsRef.current += Date.now() - visibleSinceRef.current;
      visibleSinceRef.current = null;
    }
  }, []);

  const watchMetric = useCallback(
    (auto = false): number => {
      if (auto) return teaseAutoEndWatchMetric(mediaKindRef.current);
      tallyVisible();
      if (mediaKindRef.current === "video") return 1;
      return Math.max(1, Math.round(visibleMsRef.current / 1000));
    },
    [tallyVisible]
  );

  const end = useCallback(
    (reason: "left" | "closed" | "auto") => {
      if (endedRef.current) return;
      endedRef.current = true;
      setBlanked(true);
      onSessionEndRef.current({
        watchMetric: watchMetric(reason === "auto"),
      });
      void reason;
    },
    [watchMetric]
  );

  const flagAndBlank = useCallback(() => {
    setBlanked(true);
    if (!flaggedRef.current) {
      flaggedRef.current = true;
      onSuspiciousCaptureRef.current?.();
    }
  }, []);

  const handleSuspiciousCapture = useCallback(() => {
    if (endedRef.current) return;
    tallyVisible();
    flagAndBlank();
    end("left");
  }, [end, flagAndBlank, tallyVisible]);

  useTeaseCaptureGuard({
    active: !blanked,
    onCapture: handleSuspiciousCapture,
    shouldIgnoreBlur: () => endingViaButtonRef.current,
  });

  useEffect(() => {
    endedRef.current = false;
    flaggedRef.current = false;
    visibleMsRef.current = 0;
    visibleSinceRef.current =
      document.visibilityState === "visible" ? Date.now() : null;
    setBlanked(false);
    setSecondsLeft(
      mediaKindRef.current === "video"
        ? 0
        : Math.ceil(TEASE_VIEW_AUTO_END_MS / 1000)
    );
  }, [mediaUrl, mediaKind]);

  useEffect(() => {
    if (mediaKind === "video") return;

    const countdown = window.setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    const autoEnd = window.setTimeout(() => {
      end("auto");
    }, TEASE_VIEW_AUTO_END_MS);

    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(autoEnd);
    };
  }, [end, mediaUrl, mediaKind]);

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
            {blanked
              ? "Sending reaction to Queen…"
              : mediaKind === "video"
                ? "Protected view · reaction sends when video ends"
                : `Protected view · auto-sending in ${secondsLeft}s`}
          </p>
        </div>
        {!blanked && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-muted"
            onPointerDown={() => {
              endingViaButtonRef.current = true;
            }}
            onClick={() => {
              end("closed");
              endingViaButtonRef.current = false;
            }}
          >
            Send now
          </Button>
        )}
      </div>

      <div className="relative flex-1 overflow-hidden bg-black">
        {cameraStream && !blanked && (
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
              Sending reaction — open again anytime
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
            onEnded={() => end("auto")}
          />
        ) : (
          // eslint-disable-next-line jsx-a11y/no-img-element
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
