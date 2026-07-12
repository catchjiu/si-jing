"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function formatMs(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface VoicePlayerProps {
  filePath: string;
  durationMs?: number | null;
  className?: string;
}

/**
 * Mobile Safari often reports wrong/infinite audio.duration for MediaRecorder
 * blobs and keeps "playing" silent padding. Prefer stored durationMs and stop
 * when we hit it.
 */
export function VoicePlayer({
  filePath,
  durationMs,
  className,
}: VoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const knownDurationRef = useRef<number>(durationMs && durationMs > 0 ? durationMs : 0);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(
    durationMs && durationMs > 0 ? durationMs : 0
  );

  useEffect(() => {
    knownDurationRef.current =
      durationMs && durationMs > 0 ? durationMs : knownDurationRef.current;
    if (durationMs && durationMs > 0) setDuration(durationMs);
  }, [durationMs]);

  useEffect(() => {
    let cancelled = false;
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
  }, [filePath]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const stopAtEnd = () => {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        /* ignore seek errors on some mobile codecs */
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
      // Trust recorded duration when present — mobile metadata is often wrong
      const totalMs =
        known > 0
          ? known
          : metaSec > 0
            ? metaSec * 1000
            : 0;

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

    const onEnded = () => stopAtEnd();

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", onTime);
    audio.addEventListener("durationchange", onTime);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("loadedmetadata", onTime);
      audio.removeEventListener("durationchange", onTime);
    };
  }, [url]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || !url) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
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
      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          playsInline
        />
      )}
      <Button
        type="button"
        size="icon"
        variant="outline"
        onClick={() => void toggle()}
        disabled={!url}
        className="size-9 shrink-0 rounded-full border-gold/40 text-gold hover:bg-gold/10"
        aria-label={playing ? "Pause voice note" : "Play voice note"}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gold transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[10px] tabular-nums text-muted-foreground">
          {formatMs(current)} / {formatMs(displayDuration)}
        </p>
      </div>
    </div>
  );
}
