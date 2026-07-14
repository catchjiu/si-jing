import type { SupabaseClient } from "@supabase/supabase-js";
import { presignAndUpload } from "@/lib/storage/client";

export const TEASE_REACTION_MAX_MS = 8_000;

export function pickVideoRecorderMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "video/mp4",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/quicktime",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export function extensionForVideoMime(mime: string): string {
  if (mime.includes("mp4") || mime.includes("quicktime")) return "mp4";
  return "webm";
}

export function isTeaseReactionCaptureSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined" &&
    !!pickVideoRecorderMimeType()
  );
}

function blobType(mime: string): string {
  return mime.split(";")[0];
}

export class TeaseReactionRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mime = "";
  private startedAt = 0;
  private maxTimer: number | null = null;
  private finalized = false;
  private finalizePromise: Promise<void> | null = null;

  get activeStream(): MediaStream | null {
    return this.stream;
  }

  getRecordedMime(): string {
    return this.mime;
  }

  async start(): Promise<MediaStream> {
    this.dispose();

    const mime = pickVideoRecorderMimeType();
    if (!mime) {
      throw new Error("Video recording is not supported in this browser");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    });

    const recorder = new MediaRecorder(stream, { mimeType: mime });
    this.chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.mime = mime;
    this.stream = stream;
    this.recorder = recorder;
    this.startedAt = Date.now();
    this.finalized = false;
    this.finalizePromise = null;
    recorder.start(100);

    this.maxTimer = window.setTimeout(() => {
      void this.finalizeMediaRecorder();
    }, TEASE_REACTION_MAX_MS);

    return stream;
  }

  attachPreview(videoEl: HTMLVideoElement | null) {
    if (!videoEl || !this.stream) return;
    videoEl.srcObject = this.stream;
    void videoEl.play().catch(() => undefined);
  }

  private async finalizeMediaRecorder(): Promise<void> {
    if (this.finalized) return;
    if (this.finalizePromise) {
      await this.finalizePromise;
      return;
    }

    this.finalizePromise = new Promise<void>((resolve) => {
      const recorder = this.recorder;
      if (!recorder || recorder.state === "inactive") {
        this.finalized = true;
        resolve();
        return;
      }

      const done = () => {
        this.finalized = true;
        resolve();
      };

      recorder.addEventListener("stop", done, { once: true });
      try {
        if (recorder.state === "recording") {
          recorder.requestData();
        }
        recorder.stop();
      } catch {
        done();
      }
    });

    await this.finalizePromise;
    this.finalizePromise = null;

    if (this.maxTimer) {
      window.clearTimeout(this.maxTimer);
      this.maxTimer = null;
    }

    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }

  async stopRecording(): Promise<Blob | null> {
    await this.finalizeMediaRecorder();
    if (!this.chunks.length) return null;
    return new Blob(this.chunks, { type: blobType(this.mime) });
  }

  dispose() {
    if (this.maxTimer) {
      window.clearTimeout(this.maxTimer);
      this.maxTimer = null;
    }
    try {
      if (this.recorder && this.recorder.state !== "inactive") {
        this.recorder.stop();
      }
    } catch {
      // ignore
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.mime = "";
    this.finalized = false;
    this.finalizePromise = null;
  }

  getDurationMs(): number {
    return Math.max(200, Date.now() - this.startedAt);
  }
}

export async function uploadTeaseReactionCapture(
  supabase: SupabaseClient,
  opts: {
    teaseId: string;
    viewerId: string;
    blob: Blob;
    durationMs: number;
    mime: string;
    watchMetric?: number;
  }
): Promise<string> {
  const ext = extensionForVideoMime(opts.mime);
  const path = await presignAndUpload({
    bucket: "tease_reactions",
    file: opts.blob,
    contentType: opts.blob.type || opts.mime.split(";")[0],
    ext,
    relativePath: `${opts.viewerId}/${opts.teaseId}/${Date.now()}.${ext}`,
  });

  const { error } = await supabase.from("tease_view_captures").insert({
    tease_id: opts.teaseId,
    viewer_id: opts.viewerId,
    video_path: path,
    duration_ms: opts.durationMs,
    watch_metric: opts.watchMetric ?? null,
  });

  if (error) throw error;
  return path;
}
