"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Headphones, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { storyAudioFilename } from "@/lib/story-audio-filename";
import type { StoryLockKind } from "@/lib/story-access";

type Props = {
  storyId: string;
  title: string;
  lockKind: StoryLockKind;
  className?: string;
  /** When true (e.g. opened from a “ready” notification), play as soon as audio is available. */
  autoListen?: boolean;
};

type ListenStatus = "idle" | "queued" | "running" | "ready" | "failed";

type ListenJson =
  | { status: "ready"; cached?: boolean }
  | { status: "idle" }
  | { status: "queued" | "running"; jobId: string }
  | { status: "failed"; error?: string | null; jobId?: string };

function listenErrorMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : fallback;
  if (/load failed|failed to fetch|networkerror|aborterror/i.test(raw)) {
    return "Connection interrupted — listen keeps preparing in the background. We'll notify you when it's ready.";
  }
  return raw;
}

async function fetchListenStatus(storyId: string): Promise<ListenJson> {
  const res = await fetch(
    `/api/story/listen?storyId=${encodeURIComponent(storyId)}`,
    { method: "GET", credentials: "same-origin", cache: "no-store" }
  );
  const data = (await res.json().catch(() => ({}))) as ListenJson & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Could not check listen status"
    );
  }
  return data;
}

async function requestListen(storyId: string): Promise<ListenJson> {
  const res = await fetch("/api/story/listen", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storyId }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as ListenJson & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Could not start listen"
    );
  }
  return data;
}

async function fetchListenBlob(
  storyId: string
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch("/api/story/listen", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storyId, download: true }),
    cache: "no-store",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      status?: string;
    };
    throw new Error(
      typeof data.error === "string" ? data.error : "Could not download audio"
    );
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/i.exec(disposition);
  const filename = match?.[1] || "story.mp3";
  return { blob, filename };
}

export function StoryListenButton({
  storyId,
  title,
  lockKind,
  className,
  autoListen = false,
}: Props) {
  const [busy, setBusy] = useState<"request" | "play" | "download" | null>(
    null
  );
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<ListenStatus>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchListenStatus(storyId);
        if (cancelled) return;
        if (next.status === "ready") {
          setStatus("ready");
          setReady(true);
        } else if (next.status === "queued" || next.status === "running") {
          setStatus(next.status);
        } else if (next.status === "failed") {
          setStatus("failed");
        }
      } catch {
        /* ignore — button still works on demand */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  useEffect(() => {
    if (status !== "queued" && status !== "running") return;
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const next = await fetchListenStatus(storyId);
          if (next.status === "ready") {
            setStatus("ready");
            setReady(true);
            toast.success("Story audio is ready — tap Play", { duration: 5000 });
          } else if (next.status === "failed") {
            setStatus("failed");
            toast.error(next.error || "Listen preparation failed");
          } else if (next.status === "queued" || next.status === "running") {
            setStatus(next.status);
          }
        } catch {
          /* keep polling */
        }
      })();
    }, 4000);
    return () => window.clearInterval(id);
  }, [status, storyId]);

  const ensureAudio = async (): Promise<HTMLAudioElement> => {
    if (audioRef.current && objectUrlRef.current) return audioRef.current;
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
    setStatus("ready");
    return audio;
  };

  useEffect(() => {
    if (!autoListen || lockKind === "full" || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void (async () => {
      try {
        setBusy("play");
        const next = await requestListen(storyId);
        if (next.status === "ready") {
          setStatus("ready");
          const audio = await ensureAudio();
          await audio.play();
        } else if (next.status === "queued" || next.status === "running") {
          setStatus(next.status);
          toast.message("Still preparing — you'll get a notification", {
            duration: 4000,
          });
        }
      } catch (err) {
        toast.error(listenErrorMessage(err, "Could not play story"));
      } finally {
        setBusy(null);
      }
    })();
    // ensureAudio closes over storyId; autoListen runs once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoListen, storyId, lockKind]);

  const locked = lockKind === "full";
  const preparing = busy !== null;
  const pending = status === "queued" || status === "running";

  const onRequestOrPlay = async () => {
    if (locked) {
      toast.error("Unlock the story to listen");
      return;
    }
    try {
      if (playing && audioRef.current) {
        audioRef.current.pause();
        return;
      }

      if (ready || status === "ready") {
        setBusy("play");
        const audio = await ensureAudio();
        await audio.play();
        return;
      }

      if (pending) {
        toast.message("Still preparing — feel free to leave; we'll notify you", {
          duration: 4000,
        });
        return;
      }

      setBusy("request");
      const next = await requestListen(storyId);
      if (next.status === "ready") {
        setStatus("ready");
        const audio = await ensureAudio();
        await audio.play();
        return;
      }
      if (next.status === "queued" || next.status === "running") {
        setStatus(next.status);
        toast.success("Preparing in the background — we'll notify you when ready", {
          duration: 5000,
        });
        return;
      }
      const failMsg =
        next.status === "failed" ? next.error : null;
      throw new Error(failMsg || "Could not start listen");
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
      if (!ready && status !== "ready") {
        const next = await requestListen(storyId);
        if (next.status === "queued" || next.status === "running") {
          setStatus(next.status);
          toast.success(
            "Preparing in the background — download when the notification arrives",
            { duration: 5000 }
          );
          return;
        }
        if (next.status !== "ready") {
          const failMsg =
            next.status === "failed" ? next.error : null;
          throw new Error(failMsg || "Audio is not ready yet");
        }
        setStatus("ready");
      }

      const { blob, filename } = await fetchListenBlob(storyId);
      if (!objectUrlRef.current) {
        objectUrlRef.current = URL.createObjectURL(blob);
        setReady(true);
      }
      const objectUrl = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = filename.endsWith(".mp3")
          ? filename
          : storyAudioFilename(title, storyId);
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

  const label = (() => {
    if (busy === "request" || busy === "play") return "Working…";
    if (playing) return "Pause";
    if (pending) return "Queued";
    if (ready || status === "ready") return "Play";
    return "Listen";
  })();

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 border-gold/25 px-2 text-xs"
        disabled={preparing || locked}
        onClick={() => void onRequestOrPlay()}
      >
        {busy === "request" || busy === "play" ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : playing ? (
          <Pause className="mr-1 h-3 w-3" />
        ) : ready || status === "ready" ? (
          <Play className="mr-1 h-3 w-3" />
        ) : pending ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <Headphones className="mr-1 h-3 w-3" />
        )}
        {label}
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
