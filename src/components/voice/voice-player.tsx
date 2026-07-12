"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { isLikelyUnplayableOnIos } from "@/lib/voice-format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function formatMs(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function isIosLike() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

interface VoicePlayerProps {
  filePath: string;
  durationMs?: number | null;
  className?: string;
}

/**
 * Prefer stored durationMs — mobile metadata is often wrong.
 * Old .webm notes won't play on iOS; new uploads are wav/m4a.
 */
export function VoicePlayer({
  filePath,
  durationMs,
  className,
}: VoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const knownDurationRef = useRef<number>(
    durationMs && durationMs > 0 ? durationMs : 0
  );
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(
    durationMs && durationMs > 0 ? durationMs : 0
  );
  const [failed, setFailed] = useState(false);

  const iosBlocked =
    isIosLike() && isLikelyUnplayableOnIos(filePath);

  useEffect(() => {
    knownDurationRef.current =
      durationMs && durationMs > 0 ? durationMs : knownDurationRef.current;
    if (durationMs && durationMs > 0) setDuration(durationMs);
  }, [durationMs]);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setUrl(null);
    setPlaying(false);
    setProgress(0);
    setCurrent(0);

    if (iosBlocked) return;

    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase.storage
        .from("voice")
        .createSignedUrl(filePath, 3600);
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [filePath, iosBlocked]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const stopAtEnd = () => {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
      setPlaying(false);
      setProgress(0);
      setCurrent(0);
    };

    const onTime = () => {
      const known = knownDurationRef.current;
      const metaSec =
        audio.duration && Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : 0;
      const totalMs =
        known > 0 ? known : metaSec > 0 ? metaSec * 1000 : 0;

      if (totalMs > 0 && known <= 0) {
        knownDurationRef.current = totalMs;
        setDuration(totalMs);
      } else if (known > 0) {
        setDuration(known);
      }

      const elapsedMs = audio.currentTime * 1000;
      if (totalMs > 0 && elapsedMs >= totalMs - 40) {
        stopAtEnd();
        return;
      }

      const capped = totalMs > 0 ? Math.min(elapsedMs, totalMs) : elapsedMs;
      setCurrent(capped);
      setProgress(totalMs > 0 ? Math.min(100, (capped / totalMs) * 100) : 0);
    };

    const onError = () => {
      setFailed(true);
      setPlaying(false);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", stopAtEnd);
    audio.addEventListener("loadedmetadata", onTime);
    audio.addEventListener("durationchange", onTime);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", stopAtEnd);
      audio.removeEventListener("loadedmetadata", onTime);
      audio.removeEventListener("durationchange", onTime);
      audio.removeEventListener("error", onError);
    };
  }, [url]);

  const toggle = async () => {
    if (iosBlocked) {
      toast.error("This older voice note can’t play on iPhone — new ones will");
      return;
    }
    const audio = audioRef.current;
    if (!audio || !url) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    try {
      await audio.play();
      setPlaying(true);
      setFailed(false);
    } catch {
      setPlaying(false);
      setFailed(true);
      toast.error("Could not play this voice note");
    }
  };

  const displayDuration = duration || durationMs || 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-gold/20 bg-void/50 px-3 py-2",
        className
      )}
    >
      {url && !iosBlocked && (
        <audio ref={audioRef} src={url} preload="metadata" playsInline />
      )}
      <Button
        type="button"
        size="icon"
        variant="outline"
        onClick={() => void toggle()}
        disabled={(!url && !iosBlocked) || failed}
        className="size-9 shrink-0 rounded-full border-gold/40 text-gold hover:bg-gold/10"
        aria-label={playing ? "Pause voice note" : "Play voice note"}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <div className="min-w-0 flex-1 space-y-1">
        {iosBlocked || failed ? (
          <p className="text-[11px] text-muted-foreground">
            {iosBlocked
              ? "Can’t play on iPhone (old WebM format)"
              : "Playback failed"}
          </p>
        ) : (
          <>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gold transition-[width] duration-100"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] tabular-nums text-muted-foreground">
              {formatMs(current)} / {formatMs(displayDuration)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
