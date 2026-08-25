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
  const plain =
    header.match(/filename\s*=\s*"([^"]+)"/i) ??
    header.match(/filename\s*=\s*([^;]+)/i);
  return plain?.[1]?.trim() || fallback;
}

function isInterruptedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message;
  return (
    err.name === "AbortError" ||
    m === "Load failed" ||
    m === "Failed to fetch" ||
    /networkerror|aborted|interrupted|the user aborted/i.test(m)
  );
}

function listenErrorMessage(err: unknown, fallback: string): string {
  if (isInterruptedError(err)) {
    return "Audio was interrupted — keep this page open and tap again";
  }
  return err instanceof Error ? err.message : fallback;
}

/** Same-origin MP3 blob — avoids Safari R2/CORS “Load failed” on play + download. */
async function fetchListenBlob(storyId: string): Promise<{
  blob: Blob;
  filename: string;
}> {
  const res = await fetch("/api/story/listen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storyId, download: true }),
  });
  if (!res.ok) {
    let message = "Could not create narration";
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  if (blob.size < 32) throw new Error("Could not create narration");
  const filename = filenameFromDisposition(
    res.headers.get("Content-Disposition"),
    storyAudioFilename(undefined, storyId)
  );
  return { blob, filename };
}

export function StoryListenButton({
  storyId,
  title,
  lockKind = "none",
  className,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [busy, setBusy] = useState<"listen" | "download" | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!busy) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        toast.message("Stay on this page while audio prepares", {
          duration: 3000,
        });
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [busy]);

  const locked = lockKind === "full";
  const preparing = busy !== null;

  const ensureAudio = async (): Promise<HTMLAudioElement> => {
    if (audioRef.current && objectUrlRef.current) return audioRef.current;

    toast.message("Preparing voiceover — keep this page open", {
      duration: 4000,
    });
    const { blob } = await fetchListenBlob(storyId);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(blob);
    objectUrlRef.current = objectUrl;

    const audio = new Audio(objectUrl);
    audio.preload = "auto";
    audio.addEventListener("ended", () => setPlaying(false));
    audio.addEventListener("pause", () => setPlaying(false));
    audio.addEventListener("play", () => setPlaying(true));
    audioRef.current = audio;
    setReady(true);
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
      await audio.play();
    } catch (err) {
      toast.error(listenErrorMessage(err, "Could not play story"));
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
      toast.message("Preparing MP3 — keep this page open", { duration: 4000 });
      const { blob, filename } = objectUrlRef.current
        ? {
            blob: await (await fetch(objectUrlRef.current)).blob(),
            filename: storyAudioFilename(title, storyId),
          }
        : await fetchListenBlob(storyId).then(async (r) => {
            if (!objectUrlRef.current) {
              objectUrlRef.current = URL.createObjectURL(r.blob);
              setReady(true);
            }
            return {
              blob: r.blob,
              filename:
                r.filename.endsWith(".mp3")
                  ? r.filename
                  : storyAudioFilename(title, storyId),
            };
          });

      const objectUrl = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = filename.endsWith(".mp3")
          ? filename
          : `${filename}.mp3`;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (err) {
      toast.error(listenErrorMessage(err, "Could not download audio"));
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
        ) : ready ? (
          <Play className="mr-1 h-3 w-3" />
        ) : (
          <Headphones className="mr-1 h-3 w-3" />
        )}
        {busy === "listen"
          ? "Preparing…"
          : playing
            ? "Pause"
            : ready
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
