"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { StoryLockKind } from "@/lib/story-access";

type Props = {
  storyId: string;
  lockKind?: StoryLockKind;
  className?: string;
};

export function StoryListenButton({ storyId, lockKind = "none", className }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    setUrl(null);
    setPlaying(false);
    audioRef.current?.pause();
    audioRef.current = null;
  }, [storyId]);

  const locked = lockKind === "full";

  const ensureAudio = async (): Promise<HTMLAudioElement | null> => {
    if (audioRef.current && url) return audioRef.current;
    setBusy(true);
    try {
      const res = await fetch("/api/story/listen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not create narration");
      }
      const audio = new Audio(data.url);
      audio.preload = "auto";
      audio.addEventListener("ended", () => setPlaying(false));
      audio.addEventListener("pause", () => setPlaying(false));
      audio.addEventListener("play", () => setPlaying(true));
      audioRef.current = audio;
      setUrl(data.url);
      return audio;
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    if (locked) {
      toast.error("Unlock the story to listen");
      return;
    }
    try {
      if (playing && audioRef.current) {
        audioRef.current.pause();
        return;
      }
      const audio = await ensureAudio();
      if (!audio) return;
      await audio.play();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not play story");
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn("h-7 border-gold/25 px-2 text-xs", className)}
      disabled={busy || locked}
      onClick={() => void toggle()}
    >
      {busy ? (
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
      ) : playing ? (
        <Pause className="mr-1 h-3 w-3" />
      ) : url ? (
        <Play className="mr-1 h-3 w-3" />
      ) : (
        <Headphones className="mr-1 h-3 w-3" />
      )}
      {busy ? "Preparing…" : playing ? "Pause" : url ? "Play" : "Listen"}
    </Button>
  );
}
