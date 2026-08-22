/** Prefer formats iOS can play; fall back to webm/ogg on Chromium. */
export function pickRecorderMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "audio/mp4",
    "audio/aac",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export function extensionForMime(mime: string): string {
  const type = mime.toLowerCase();
  if (
    type.includes("mp4") ||
    type.includes("aac") ||
    type.includes("m4a")
  ) {
    return "m4a";
  }
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("caf")) return "caf";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  return "webm";
}

/** iPhone Voice Memos are usually .m4a and often arrive with an empty MIME type. */
export function inferAudioMime(file: { name?: string; type?: string }): string {
  const type = (file.type || "").toLowerCase().split(";")[0]?.trim() ?? "";
  if (
    type.includes("mp4") ||
    type.includes("m4a") ||
    type.includes("aac")
  ) {
    return type || "audio/mp4";
  }
  if (type.includes("wav")) return "audio/wav";
  if (type.includes("mpeg") || type.includes("mp3")) return "audio/mpeg";
  if (type.includes("caf")) return "audio/x-caf";
  if (type.includes("webm")) return "audio/webm";
  if (type.includes("ogg")) return "audio/ogg";

  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".m4a") || name.endsWith(".mp4") || name.endsWith(".aac")) {
    return "audio/mp4";
  }
  if (name.endsWith(".wav")) return "audio/wav";
  if (name.endsWith(".mp3")) return "audio/mpeg";
  if (name.endsWith(".caf")) return "audio/x-caf";
  if (name.endsWith(".webm")) return "audio/webm";
  if (name.endsWith(".ogg")) return "audio/ogg";
  return type || "application/octet-stream";
}

export function isIosVoiceMemoUpload(file: { name?: string; type?: string }): boolean {
  const mime = inferAudioMime(file);
  const name = (file.name || "").toLowerCase();
  return (
    mime.startsWith("audio/") ||
    name.endsWith(".m4a") ||
    name.endsWith(".mp4") ||
    name.endsWith(".aac") ||
    name.endsWith(".wav") ||
    name.endsWith(".caf") ||
    name.endsWith(".mp3")
  );
}

export function readAudioDurationMs(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = "metadata";
    const finish = (ms: number) => {
      URL.revokeObjectURL(url);
      resolve(ms);
    };
    audio.onloadedmetadata = () => {
      const sec = audio.duration;
      finish(
        Number.isFinite(sec) && sec > 0 ? Math.round(sec * 1000) : 0
      );
    };
    audio.onerror = () => finish(0);
    audio.src = url;
  });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/** Encode AudioBuffer as 16-bit mono/stereo WAV (plays on iOS Safari). */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const samples = buffer.length;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i] ?? 0));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

/**
 * Convert recorder output to something iOS can play.
 * Chromium webm/ogg → WAV; mp4/aac left as-is.
 */
export async function normalizeVoiceBlob(
  blob: Blob,
  fileName?: string
): Promise<Blob> {
  const type = inferAudioMime({
    name: fileName,
    type: blob.type,
  }).toLowerCase();
  if (
    type.includes("mp4") ||
    type.includes("aac") ||
    type.includes("m4a") ||
    type.includes("wav") ||
    type.includes("mpeg") ||
    type.includes("mp3") ||
    type.includes("caf")
  ) {
    if (!blob.type || blob.type === "application/octet-stream") {
      return new Blob([blob], { type });
    }
    return blob;
  }

  // webm/ogg: decode on the recording browser, re-encode as WAV for iPhone
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const raw = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(raw.slice(0));
    return audioBufferToWav(audioBuffer);
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

export function isLikelyUnplayableOnIos(filePath: string): boolean {
  return /\.(webm|ogg)(\?|$)/i.test(filePath);
}
