import type { SupabaseClient } from "@supabase/supabase-js";
import { presignAndUpload } from "@/lib/storage/client";

export const TEASE_REACTION_MAX_MS = 8_000;

const CAMERA_RELEASE_MS = 350;
const CHUNK_WAIT_MS = 2_000;

export function pickVideoRecorderMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isSafari =
    /safari/i.test(ua) && !/chrome|chromium|android/i.test(ua);
  const candidates = isSafari
    ? ["video/mp4", "video/quicktime", "video/webm;codecs=vp8", "video/webm"]
    : [
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4",
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

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

/** Let the browser fully release the camera before opening it again. */
export async function releaseCameraPause() {
  await sleep(CAMERA_RELEASE_MS);
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
    await this.dispose();

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
    recorder.start(250);

    this.maxTimer = window.setTimeout(() => {
      void this.finalizeMediaRecorder();
    }, TEASE_REACTION_MAX_MS);

    return stream;
  }

  private async waitForChunks(): Promise<void> {
    const deadline = Date.now() + CHUNK_WAIT_MS;
    while (!this.chunks.length && Date.now() < deadline) {
      await sleep(50);
    }
  }

  private async finalizeMediaRecorder(): Promise<void> {
    if (this.finalized) {
      await this.waitForChunks();
      return;
    }
    if (this.finalizePromise) {
      await this.finalizePromise;
      return;
    }

    this.finalizePromise = (async () => {
      const recorder = this.recorder;
      if (!recorder || recorder.state === "inactive") {
        this.finalized = true;
        await this.waitForChunks();
        return;
      }

      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          this.finalized = true;
          resolve();
        };

        recorder.addEventListener(
          "stop",
          () => {
            window.setTimeout(done, 200);
          },
          { once: true }
        );

        try {
          if (recorder.state === "recording") {
            recorder.requestData();
          }
          recorder.stop();
        } catch {
          done();
        }

        window.setTimeout(done, CHUNK_WAIT_MS);
      });

      await this.waitForChunks();

      if (this.maxTimer) {
        window.clearTimeout(this.maxTimer);
        this.maxTimer = null;
      }

      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.recorder = null;
    })();

    await this.finalizePromise;
    this.finalizePromise = null;
  }

  async stopRecording(): Promise<Blob | null> {
    await this.finalizeMediaRecorder();
    await this.waitForChunks();
    if (!this.chunks.length) return null;
    return new Blob(this.chunks, { type: blobType(this.mime) });
  }

  async dispose() {
    if (this.maxTimer) {
      window.clearTimeout(this.maxTimer);
      this.maxTimer = null;
    }
    if (this.recorder && this.recorder.state !== "inactive") {
      await this.finalizeMediaRecorder();
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
