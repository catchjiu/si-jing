/**
 * Best-effort screen capture detection for tease viewing in mobile Safari.
 *
 * iOS does not expose screenshot / screen-recording APIs to web pages. We combine
 * every signal Safari gives us: visibility, blur, viewport shifts (screenshot
 * preview / recording indicator / app switcher), focus polling, and touch cancel.
 */

export type CaptureReason =
  | "visibility-hidden"
  | "window-blur"
  | "page-hide"
  | "page-freeze"
  | "viewport-shift"
  | "viewport-poll"
  | "focus-lost"
  | "touch-interrupted"
  | "orientation-change";

export type TeaseCaptureGuardOptions = {
  onCapture: (reason: CaptureReason) => void;
  /** Skip blur-triggered capture (e.g. intentional close button). */
  shouldIgnoreBlur?: () => boolean;
};

type ViewportSnapshot = {
  height: number;
  width: number;
  offsetTop: number;
  offsetLeft: number;
  innerHeight: number;
};

const IOS_POLL_MS = 220;
const BASELINE_SETTLE_MS = 350;
/** Screenshot preview / app switcher / recording chrome on iOS. */
const VIEWPORT_HEIGHT_DELTA_PX = 52;
const VIEWPORT_OFFSET_DELTA_PX = 14;

export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function readViewport(): ViewportSnapshot {
  const vv = window.visualViewport;
  return {
    height: vv?.height ?? window.innerHeight,
    width: vv?.width ?? window.innerWidth,
    offsetTop: vv?.offsetTop ?? 0,
    offsetLeft: vv?.offsetLeft ?? 0,
    innerHeight: window.innerHeight,
  };
}

function viewportShifted(
  baseline: ViewportSnapshot,
  current: ViewportSnapshot
): boolean {
  const heightDelta = Math.abs(current.height - baseline.height);
  const offsetDelta = Math.abs(current.offsetTop - baseline.offsetTop);
  const innerDelta = Math.abs(current.innerHeight - baseline.innerHeight);

  return (
    heightDelta >= VIEWPORT_HEIGHT_DELTA_PX ||
    offsetDelta >= VIEWPORT_OFFSET_DELTA_PX ||
    innerDelta >= VIEWPORT_HEIGHT_DELTA_PX
  );
}

/** Attach capture heuristics; returns a detach function. */
export function attachTeaseCaptureGuard(
  options: TeaseCaptureGuardOptions
): () => void {
  const ios = isAppleMobile();
  let fired = false;
  let baseline: ViewportSnapshot | null = null;
  let baselineTimer: number | undefined;
  let pollTimer: number | undefined;
  let hadFocus = typeof document !== "undefined" ? document.hasFocus() : true;

  const fire = (reason: CaptureReason) => {
    if (fired) return;
    fired = true;
    options.onCapture(reason);
  };

  const onVis = () => {
    if (document.visibilityState === "hidden") fire("visibility-hidden");
  };

  const onBlur = () => {
    if (options.shouldIgnoreBlur?.()) return;
    fire("window-blur");
  };

  const onPageHide = () => fire("page-hide");
  const onFreeze = () => fire("page-freeze");

  const onViewportChange = () => {
    if (!baseline) return;
    const current = readViewport();
    if (viewportShifted(baseline, current)) fire("viewport-shift");
  };

  const onTouchInterrupted = () => fire("touch-interrupted");

  const onOrientation = () => {
    if (!ios) return;
    fire("orientation-change");
  };

  const poll = () => {
    if (document.hidden) {
      fire("viewport-poll");
      return;
    }

    const focused = document.hasFocus();
    if (hadFocus && !focused) fire("focus-lost");
    hadFocus = focused;

    if (baseline) {
      const current = readViewport();
      if (viewportShifted(baseline, current)) fire("viewport-poll");
    }
  };

  baselineTimer = window.setTimeout(() => {
    baseline = readViewport();
  }, BASELINE_SETTLE_MS);

  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("blur", onBlur);
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("freeze", onFreeze);
  window.addEventListener("orientationchange", onOrientation);
  window.visualViewport?.addEventListener("resize", onViewportChange);
  window.visualViewport?.addEventListener("scroll", onViewportChange);
  document.addEventListener("touchcancel", onTouchInterrupted, {
    passive: true,
  });
  window.addEventListener("pointercancel", onTouchInterrupted, {
    passive: true,
  });

  if (ios) {
    pollTimer = window.setInterval(poll, IOS_POLL_MS);
  }

  return () => {
    if (baselineTimer != null) window.clearTimeout(baselineTimer);
    if (pollTimer != null) window.clearInterval(pollTimer);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("freeze", onFreeze);
    window.removeEventListener("orientationchange", onOrientation);
    window.visualViewport?.removeEventListener("resize", onViewportChange);
    window.visualViewport?.removeEventListener("scroll", onViewportChange);
    document.removeEventListener("touchcancel", onTouchInterrupted);
    window.removeEventListener("pointercancel", onTouchInterrupted);
  };
}
