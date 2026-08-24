const VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/hevc",
  "video/h265",
  "video/x-m4v",
  "video/ogg",
  "application/ogg",
  "audio/ogg",
] as const;
const VIDEO_ACCEPT_EXTS = [
  ".mp4",
  ".m4v",
  ".mov",
  ".webm",
  ".hevc",
  ".h265",
  ".hev",
  ".ogg",
  ".ogv",
  ".oga",
] as const;
const VIDEO_EXT =
  /\.(mp4|m4v|mov|webm|qt|avi|hevc|h265|hev|ogg|ogv|oga)$/i;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const COMPRESS_THRESHOLD = 15 * 1024 * 1024;

/** MIME types + extensions for `<input accept>`. */
export const VIDEO_ACCEPT = [...VIDEO_TYPES, ...VIDEO_ACCEPT_EXTS].join(",");

export function isAcceptedVideoUpload(file: {
  name?: string;
  type?: string;
}): boolean {
  const type = (file.type || "").toLowerCase().split(";")[0]?.trim() ?? "";
  if ((VIDEO_TYPES as readonly string[]).includes(type)) return true;
  if (type.startsWith("video/")) return true;
  return VIDEO_EXT.test(file.name || "");
}

export type PreparedVideo = {
  file: File;
  durationSec: number;
  compressed: boolean;
};

function loadVideoMetadata(file: File): Promise<{ durationSec: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({ durationSec: video.duration || 0 });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read video file"));
    };
    video.src = url;
  });
}

/**
 * Re-encode a video at reduced resolution/bitrate via canvas + MediaRecorder.
 * Best-effort; falls back to original file if unsupported or encoding fails.
 */
async function tryCompressVideo(file: File): Promise<File | null> {
  if (!isAcceptedVideoUpload(file)) {
    return null;
  }
  if (typeof MediaRecorder === "undefined") return null;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Video load failed"));
    });

    const maxEdge = 1280;
    const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(2, Math.round(video.videoWidth * scale));
    const height = Math.max(2, Math.round(video.videoHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const stream = canvas.captureStream(24);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : null;
    if (!mimeType) return null;

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 1_500_000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const done = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        if (chunks.length === 0) reject(new Error("No video data"));
        else resolve(new Blob(chunks, { type: mimeType.split(";")[0] }));
      };
      recorder.onerror = () => reject(new Error("Recording failed"));
    });

    recorder.start(200);
    await video.play();

    const draw = () => {
      if (video.ended || video.paused) return;
      ctx.drawImage(video, 0, 0, width, height);
      requestAnimationFrame(draw);
    };
    draw();

    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });
    recorder.stop();
    stream.getTracks().forEach((t) => t.stop());

    const blob = await done;
    if (blob.size >= file.size) return null;

    const base = file.name.replace(/\.[^.]+$/, "") || "video";
    return new File([blob], `${base}.webm`, {
      type: "video/webm",
      lastModified: Date.now(),
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
    video.pause();
  }
}

/**
 * Validate and optionally compress a video before R2 upload.
 */
export async function prepareVideoForUpload(file: File): Promise<PreparedVideo> {
  if (!isAcceptedVideoUpload(file)) {
    throw new Error(
      "Unsupported video format — use MP4, HEVC, WebM, MOV, or OGG"
    );
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error("Video too large (max 50 MB)");
  }

  let durationSec = 0;
  try {
    const meta = await loadVideoMetadata(file);
    durationSec = meta.durationSec;
  } catch {
    // HEVC/OGG may not decode in this browser; still allow the original file.
    return { file, durationSec: 0, compressed: false };
  }

  if (file.size <= COMPRESS_THRESHOLD) {
    return { file, durationSec, compressed: false };
  }

  const compressed = await tryCompressVideo(file);
  if (compressed && compressed.size < file.size) {
    return { file: compressed, durationSec, compressed: true };
  }

  return { file, durationSec, compressed: false };
}

export { VIDEO_TYPES, VIDEO_ACCEPT_EXTS, MAX_VIDEO_BYTES };
