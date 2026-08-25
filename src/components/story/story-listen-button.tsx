"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Headphones, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { storyAudioFilename } from "@/lib/story-audio-filename";
import type { StoryLockKind } from "@/lib/story-access";

type Props = {
  storyId: string;
  title?: string;
  lockKind?: StoryLockKind;
  className?: string;
};

function filenameFromDisposition(header: string | null, fallback: string) {
  if (!header) return fallback;
  const star = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fall through */
    }
  }
  const plain = header.match(/filename\s*=\s*"([^"]+)"/i)
    ?? header.match(/filename\s*=\s*([^;]+)/i);
  return plain?.[1]?.trim() || fallback;
}

async function downloadViaApi(storyId: string, fallbackName: string) {
  const res = await fetch("/api/story/listen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storyId, download: true }),
  });
  if (!res.ok) {
    let message = "Could not download audio";
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const filename = filenameFromDisposition(
    res.headers.get("Content-Disposition"),
    fallbackName
  );
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename.endsWith(".mp3") ? filename : `${filename}.mp3`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function StoryListenButton({
  storyId,
  title,
  lockKind = "none",
  className,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [busy, setBusy] = useState<"listen" | "download" | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const locked = lockKind === "full";
  const preparing = busy !== null;

  const ensureUrl = async (): Promise<string> => {
    if (url) return url;
    const res = await fetch("/api/story/listen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyId }),
    });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      throw new Error(data.error || "Could not create narration");
    }
    setUrl(data.url);
    return data.url;
  };

  const ensureAudio = async (): Promise<HTMLAudioElement | null> => {
    if (audioRef.current && url) return audioRef.current;
    const audioUrl = await ensureUrl();
    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    audio.addEventListener("ended", () => setPlaying(false));
    audio.addEventListener("pause", () => setPlaying(false));
    audio.addEventListener("play", () => setPlaying(true));
    audioRef.current = audio;
    return audio;
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
      setBusy("listen");
      const audio = await ensureAudio();
      if (!audio) return;
      await audio.play();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not play story");
    } finally {
      setBusy(null);
    }
  };

  const onDownload = async () => {
    if (locked) {
      toast.error("Unlock the story to download");
      return;
    }
    try {
      setBusy("download");
      // Same-origin proxy — browser fetch of R2 presign fails with CORS ("Load failed").
      await downloadViaApi(storyId, storyAudioFilename(title, storyId));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not download audio"
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 border-gold/25 px-2 text-xs"
        disabled={preparing || locked}
        onClick={() => void toggle()}
      >
        {busy === "listen" ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : playing ? (
          <Pause className="mr-1 h-3 w-3" />
        ) : url ? (
          <Play className="mr-1 h-3 w-3" />
        ) : (
          <Headphones className="mr-1 h-3 w-3" />
        )}
        {busy === "listen"
          ? "Preparing…"
          : playing
            ? "Pause"
            : url
              ? "Play"
              : "Listen"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 border-gold/25 px-2 text-xs"
        disabled={preparing || locked}
        title="Download MP3"
        aria-label="Download MP3"
        onClick={() => void onDownload()}
      >
        {busy === "download" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Download className="h-3 w-3" />
        )}
        <span className="ml-1">MP3</span>
      </Button>
    </div>
  );
}
