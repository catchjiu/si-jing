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

export type TeaseSessionEndReason = "played" | "early_exit" | "looked_away";

type TeaseSessionViewerProps = {
  mediaUrl: string;
  mediaKind?: TeaseMediaKind;
  title?: string | null;
  cameraStream?: MediaStream | null;
  /** One-shot premiere: tab hide / missed tap burns as looked_away */
  premiereMode?: boolean;
  onSessionEnd: (opts: {
    watchMetric: number;
    endReason: TeaseSessionEndReason;
  }) => void;
  onSuspiciousCapture?: () => void;
  className?: string;
};

/**
 * Fullscreen tease session — images auto-end after 5s; videos run to the end,
 * then upload reaction cam. Premieres burn after one play / look-away / early exit.
 */
export function TeaseSessionViewer({
  mediaUrl,
  mediaKind = "image",
  title,
  cameraStream,
  premiereMode = false,
  onSessionEnd,
  onSuspiciousCapture,
  className,
}: TeaseSessionViewerProps) {
  const [blanked, setBlanked] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(
    mediaKind === "video" ? 0 : Math.ceil(TEASE_VIEW_AUTO_END_MS / 1000)
  );
  const [stillWatching, setStillWatching] = useState(false);
  const [stillWatchingLeft, setStillWatchingLeft] = useState(8);
  const endedRef = useRef(false);
  const flaggedRef = useRef(false);
  const visibleMsRef = useRef(0);
  const visibleSinceRef = useRef<number | null>(null);
  const hiddenSinceRef = useRef<number | null>(null);
  const onSessionEndRef = useRef(onSessionEnd);
  const onSuspiciousCaptureRef = useRef(onSuspiciousCapture);
  const mediaKindRef = useRef(mediaKind);
  const premiereModeRef = useRef(premiereMode);
  const endingViaButtonRef = useRef(false);
  const stillWatchingActiveRef = useRef(false);

  onSessionEndRef.current = onSessionEnd;
  onSuspiciousCaptureRef.current = onSuspiciousCapture;
  mediaKindRef.current = mediaKind;
  premiereModeRef.current = premiereMode;

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
      stillWatchingActiveRef.current = false;
      setStillWatching(false);
      setBlanked(true);
      let endReason: TeaseSessionEndReason = "played";
      if (premiereModeRef.current) {
        if (reason === "left") endReason = "looked_away";
        else if (reason === "closed") endReason = "early_exit";
        else endReason = "played";
      }
      onSessionEndRef.current({
        watchMetric: watchMetric(reason === "auto"),
        endReason,
      });
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
    hiddenSinceRef.current = null;
    stillWatchingActiveRef.current = false;
    setStillWatching(false);
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

  // Premiere: leaving the tab >3s = looked away
  useEffect(() => {
    if (!premiereMode || blanked) return;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        tallyVisible();
        hiddenSinceRef.current = Date.now();
      } else {
        const hiddenFor =
          hiddenSinceRef.current != null
            ? Date.now() - hiddenSinceRef.current
            : 0;
        hiddenSinceRef.current = null;
        visibleSinceRef.current = Date.now();
        if (hiddenFor > 3000) {
          end("left");
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [blanked, end, premiereMode, tallyVisible]);

  // Premiere video: random “Still watching?” prompts
  useEffect(() => {
    if (!premiereMode || blanked || mediaKind !== "video") return;

    let promptTimer: number | null = null;
    let deadlineTimer: number | null = null;
    let tickTimer: number | null = null;

    const schedulePrompt = () => {
      const delay = 45_000 + Math.floor(Math.random() * 45_000);
      promptTimer = window.setTimeout(() => {
        if (endedRef.current) return;
        stillWatchingActiveRef.current = true;
        setStillWatching(true);
        setStillWatchingLeft(8);
        tickTimer = window.setInterval(() => {
          setStillWatchingLeft((s) => {
            if (s <= 1) return 0;
            return s - 1;
          });
        }, 1000);
        deadlineTimer = window.setTimeout(() => {
          if (stillWatchingActiveRef.current && !endedRef.current) {
            end("left");
          }
        }, 8000);
      }, delay);
    };

    schedulePrompt();
    return () => {
      if (promptTimer != null) window.clearTimeout(promptTimer);
      if (deadlineTimer != null) window.clearTimeout(deadlineTimer);
      if (tickTimer != null) window.clearInterval(tickTimer);
    };
  }, [blanked, end, mediaKind, mediaUrl, premiereMode]);

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

  const confirmStillWatching = () => {
    stillWatchingActiveRef.current = false;
    setStillWatching(false);
  };

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
            {title || (premiereMode ? "Premiere" : "Tease")}
          </p>
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <ShieldAlert className="size-3" />
            {blanked
              ? premiereMode
                ? "Premiere ended…"
                : "Sending reaction to Queen…"
              : premiereMode
                ? mediaKind === "video"
                  ? "One-shot premiere · stay on this screen"
                  : `One-shot premiere · auto-ends in ${secondsLeft}s`
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
            {premiereMode ? "Leave (burns)" : "Send now"}
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
        {stillWatching && !blanked && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-void/80 p-6">
            <div className="w-full max-w-sm space-y-4 rounded-xl border border-gold/30 bg-charcoal p-5 text-center">
              <p className="font-heading text-xl text-gold">Still watching?</p>
              <p className="text-sm text-muted-foreground">
                Tap within {stillWatchingLeft}s or this premiere burns.
              </p>
              <Button
                type="button"
                className="w-full bg-gold text-void hover:bg-gold-muted"
                onClick={confirmStillWatching}
              >
                I&apos;m here
              </Button>
            </div>
          </div>
        )}
        {blanked ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Eye className="size-8 text-muted-foreground" />
            <p className="font-heading text-ivory">View ended</p>
            <p className="text-sm text-muted-foreground">
              {premiereMode
                ? "This premiere is burned — no replay"
                : "Sending reaction — open again anytime"}
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
