import {
  audioBufferToWav,
  inferAudioMime,
  normalizeVoiceBlob,
  pickRecorderMimeType,
  readAudioDurationMs,
} from "@/lib/voice-format";

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|qt|avi|hevc|h265|hev|ogv)$/i;
const AUDIO_EXT = /\.(m4a|aac|wav|mp3|caf|ogg|oga|webm)$/i;
const MAX_CAPTURE_MS = 90_000;

export function isVideoMediaFile(file: { name?: string; type?: string }): boolean {
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  if (type.startsWith("video/")) return true;
  if (type.startsWith("audio/")) return false;
  return VIDEO_EXT.test(name) && !name.endsWith(".m4a");
}

export function isFartMediaUpload(file: { name?: string; type?: string }): boolean {
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  if (type.startsWith("audio/") || type.startsWith("video/")) return true;
  return AUDIO_EXT.test(name) || VIDEO_EXT.test(name);
}

async function decodeFileAsWav(file: Blob): Promise<Blob> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const raw = await file.arrayBuffer();
    const buffer = await ctx.decodeAudioData(raw.slice(0));
    return audioBufferToWav(buffer);
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

function waitForEvent(target: EventTarget, event: string, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out reading the video"));
    }, timeoutMs);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("Could not read the video"));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      target.removeEventListener(event, onOk);
      target.removeEventListener("error", onErr);
    };
    target.addEventListener(event, onOk, { once: true });
    target.addEventListener("error", onErr, { once: true });
  });
}

async function captureAudioFromVideo(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";
  video.controls = false;
  video.muted = false;
  video.volume = 1;
  video.src = url;
  video.style.position = "fixed";
  video.style.left = "-9999px";
  video.style.width = "1px";
  video.style.height = "1px";
  document.body.appendChild(video);

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  let ctx: AudioContext | null = null;

  try {
    await waitForEvent(video, "loadedmetadata", 12_000);
    if (video.videoWidth === 0) {
      return normalizeVoiceBlob(file, file.name);
    }

    ctx = new AudioCtx();
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);

    const source = ctx.createMediaElementSource(video);
    const silent = ctx.createGain();
    silent.gain.value = 0;
    const dest = ctx.createMediaStreamDestination();
    source.connect(dest);
    source.connect(silent);
    silent.connect(ctx.destination);

    const recMime = pickRecorderMimeType();
    const recorder = recMime
      ? new MediaRecorder(dest.stream, { mimeType: recMime })
      : new MediaRecorder(dest.stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        if (chunks.length === 0) {
          reject(new Error("No audio track found in this video"));
          return;
        }
        resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.onerror = () => reject(new Error("Audio capture failed"));
    });

    const capMs = Math.min(
      MAX_CAPTURE_MS,
      Number.isFinite(video.duration) && video.duration > 0
        ? Math.ceil(video.duration * 1000) + 250
        : MAX_CAPTURE_MS
    );
    recorder.start(250);
    await video.play();
    await Promise.race([
      waitForEvent(video, "ended", capMs + 4_000),
      new Promise<void>((resolve) => window.setTimeout(resolve, capMs)),
    ]);
    if (!video.paused) video.pause();
    if (recorder.state !== "inactive") recorder.stop();
    const recorded = await stopped;
    return normalizeVoiceBlob(recorded, "fart.wav");
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
    if (ctx) await ctx.close().catch(() => undefined);
  }
}

/** Turn a video or audio file into a playable audio blob (WAV when needed). */
export async function extractFartAudio(file: File): Promise<{
  blob: Blob;
  durationMs: number;
  fileName: string;
  fromVideo: boolean;
}> {
  const fromVideo = isVideoMediaFile(file);
  let blob: Blob;

  if (!fromVideo) {
    blob = await normalizeVoiceBlob(file, file.name);
  } else {
    try {
      blob = await decodeFileAsWav(file);
    } catch {
      blob = await captureAudioFromVideo(file);
    }
  }

  const durationMs = (await readAudioDurationMs(blob)) || 200;
  const mime = inferAudioMime({ name: file.name, type: blob.type });
  const fileName = fromVideo
    ? file.name.replace(VIDEO_EXT, "") + ".wav"
    : file.name;
  return {
    blob: blob.type ? blob : new Blob([blob], { type: mime }),
    durationMs,
    fileName,
    fromVideo,
  };
}
