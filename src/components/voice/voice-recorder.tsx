"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mic, Square, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { VoiceEntityType } from "@/lib/types";
import type { CapturedVoice } from "@/lib/voice";
import { uploadVoiceNote } from "@/lib/voice";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function formatMs(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function pickMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];
  if (typeof MediaRecorder === "undefined") return null;
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

interface VoiceRecorderProps {
  entityType?: VoiceEntityType;
  entityId?: string;
  onUploaded?: () => void;
  /** Record only — parent uploads later (e.g. with a new reward). */
  captureOnly?: boolean;
  onCaptured?: (voice: CapturedVoice | null) => void;
  className?: string;
  compact?: boolean;
}

export function VoiceRecorder({
  entityType,
  entityId,
  onUploaded,
  captureOnly = false,
  onCaptured,
  className,
  compact = false,
}: VoiceRecorderProps) {
  const { profile } = useAuth();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined"
    );
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, [previewUrl]);

  const start = async () => {
    if (!profile) {
      toast.error("Sign in to record");
      return;
    }
    const mime = pickMimeType();
    if (!mime) {
      toast.error("Voice recording is not supported in this browser");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const next = new Blob(chunksRef.current, { type: mime });
        const durationMs = Date.now() - startRef.current;
        setBlob(next);
        setPreviewUrl(URL.createObjectURL(next));
        stream.getTracks().forEach((t) => t.stop());
        if (captureOnly) {
          onCaptured?.({ blob: next, durationMs });
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      startRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setElapsed(Date.now() - startRef.current);
      }, 200);
    } catch {
      toast.error("Microphone permission denied");
    }
  };

  const stop = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const clear = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(null);
    setPreviewUrl(null);
    setElapsed(0);
    if (captureOnly) onCaptured?.(null);
  };

  const upload = async () => {
    if (!profile || !blob || !entityType || !entityId) return;
    setUploading(true);
    const supabase = createClient();

    try {
      await uploadVoiceNote(supabase, {
        userId: profile.id,
        entityType,
        entityId,
        blob,
        durationMs: elapsed || null,
      });
      toast.success("Voice message sent");
      clear();
      onUploaded?.();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not upload voice message";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  if (!supported) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        Voice recording needs a modern browser with microphone access.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border border-gold/15 bg-charcoal/70 p-3 sm:p-4",
        className
      )}
    >
      {!compact && (
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Voice message
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!recording && !blob && (
          <Button
            type="button"
            onClick={() => void start()}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            <Mic className="mr-2 size-4" />
            Record
          </Button>
        )}

        {recording && (
          <>
            <Button
              type="button"
              variant="destructive"
              onClick={stop}
              className="animate-pulse"
            >
              <Square className="mr-2 size-4" />
              Stop · {formatMs(elapsed)}
            </Button>
            <span className="text-xs text-red-300">Recording…</span>
          </>
        )}

        {blob && !recording && (
          <>
            {previewUrl && (
              <audio controls src={previewUrl} className="h-9 max-w-full" />
            )}
            {!captureOnly && (
              <Button
                type="button"
                onClick={() => void upload()}
                disabled={uploading}
                className="bg-gold text-void hover:bg-gold-muted"
              >
                {uploading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 size-4" />
                )}
                Send
              </Button>
            )}
            {captureOnly && (
              <span className="text-xs text-gold/80">Attached · {formatMs(elapsed)}</span>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={clear}
              disabled={uploading}
              className="border-muted"
            >
              <Trash2 className="mr-2 size-4" />
              Discard
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
