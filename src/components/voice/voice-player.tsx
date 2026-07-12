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

export function VoicePlayer({
  filePath,
  durationMs,
  className,
}: VoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationMs ?? 0);

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

    const onTime = () => {
      setCurrent(audio.currentTime * 1000);
      if (audio.duration && Number.isFinite(audio.duration)) {
        setDuration(audio.duration * 1000);
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      setCurrent(0);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", onTime);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("loadedmetadata", onTime);
    };
  }, [url]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || !url) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      await audio.play();
      setPlaying(true);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-gold/20 bg-void/50 px-3 py-2",
        className
      )}
    >
      {url && <audio ref={audioRef} src={url} preload="metadata" />}
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
          {formatMs(current)} / {formatMs(duration || durationMs || 0)}
        </p>
      </div>
    </div>
  );
}
