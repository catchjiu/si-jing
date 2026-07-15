"use client";

import { useEffect, useRef } from "react";
import {
  attachTeaseCaptureGuard,
  type CaptureReason,
} from "@/lib/tease-capture-guard";

type Options = {
  /** When false, listeners are detached. */
  active: boolean;
  onCapture: (reason: CaptureReason) => void;
  shouldIgnoreBlur?: () => boolean;
};

/** React wrapper for {@link attachTeaseCaptureGuard}. */
export function useTeaseCaptureGuard({
  active,
  onCapture,
  shouldIgnoreBlur,
}: Options) {
  const onCaptureRef = useRef(onCapture);
  const shouldIgnoreBlurRef = useRef(shouldIgnoreBlur);

  onCaptureRef.current = onCapture;
  shouldIgnoreBlurRef.current = shouldIgnoreBlur;

  useEffect(() => {
    if (!active) return;

    return attachTeaseCaptureGuard({
      onCapture: (reason) => onCaptureRef.current(reason),
      shouldIgnoreBlur: () => shouldIgnoreBlurRef.current?.() ?? false,
    });
  }, [active]);
}
