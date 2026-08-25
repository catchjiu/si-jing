import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "child_process";
import type { StoryListenSegment, StorySpeaker } from "@/lib/story-listen";

export type FishTtsResult = {
  audio: Buffer;
  contentType: string;
};

function fishApiKey(): string {
  const key =
    process.env.FISH_API_KEY?.trim() ||
    process.env.FISH_AUDIO_API_KEY?.trim() ||
    "";
  if (!key) {
    throw Object.assign(new Error("FISH_API_KEY is not configured"), {
      status: 503,
    });
  }
  return key;
}

export function fishSlaveVoiceId(): string {
  const id =
    process.env.FISH_SLAVE_VOICE_ID?.trim() ||
    process.env.FISH_AUDIO_SLAVE_VOICE_ID?.trim() ||
    "";
  if (!id) {
    throw Object.assign(new Error("FISH_SLAVE_VOICE_ID is not configured"), {
      status: 503,
    });
  }
  return id;
}

export function fishQueenVoiceId(): string {
  const id =
    process.env.FISH_QUEEN_VOICE_ID?.trim() ||
    process.env.FISH_AUDIO_QUEEN_VOICE_ID?.trim() ||
    "";
  if (!id) {
    throw Object.assign(new Error("FISH_QUEEN_VOICE_ID is not configured"), {
      status: 503,
    });
  }
  return id;
}

export function fishTtsModel(): string {
  return process.env.FISH_TTS_MODEL?.trim() || "s2.1-pro";
}

function clamp01(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function clampSpeed(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(2, Math.max(0.5, n));
}

/** Lower = more consistent timbre (default 0.3; Fish default is 0.7). */
export function fishTtsTemperature(): number {
  const raw = process.env.FISH_TTS_TEMPERATURE?.trim();
  if (!raw) return 0.3;
  return clamp01(Number(raw), 0.3);
}

/** Nucleus sampling; keep moderately tight for voice stability. */
export function fishTtsTopP(): number {
  const raw = process.env.FISH_TTS_TOP_P?.trim();
  if (!raw) return 0.75;
  return clamp01(Number(raw), 0.75);
}

/** Queen speaking rate (1.0 = normal). Override with FISH_QUEEN_TTS_SPEED. */
export function fishQueenSpeed(): number {
  const raw = process.env.FISH_QUEEN_TTS_SPEED?.trim();
  if (!raw) return 1.0;
  return clampSpeed(Number(raw), 1.0);
}

export function fishSlaveSpeed(): number {
  const raw = process.env.FISH_SLAVE_TTS_SPEED?.trim();
  if (!raw) return 1;
  return clampSpeed(Number(raw), 1);
}

/** Include in audio cache keys when TTS sampling knobs change. */
export function fishTtsStabilityKey(): string {
  return [
    `t=${fishTtsTemperature()}`,
    `p=${fishTtsTopP()}`,
    "cond=1",
    "chunk=300",
    "split=1",
    `qs=${fishQueenSpeed()}`,
    `ss=${fishSlaveSpeed()}`,
  ].join(",");
}

/**
 * Single-voice TTS. Prefer this over multi-speaker so each clone can use its
 * own speed/prosody (Queen’s model often sounds dragged at speed 1.0).
 */
export async function fishTextToSpeech(opts: {
  text: string;
  referenceId: string;
  speed?: number;
}): Promise<FishTtsResult> {
  const temperature = fishTtsTemperature();
  const topP = fishTtsTopP();
  const speed = clampSpeed(opts.speed ?? 1, 1);

  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${fishApiKey()}`,
      "Content-Type": "application/json",
      model: fishTtsModel(),
    },
    body: JSON.stringify({
      text: opts.text,
      reference_id: opts.referenceId,
      format: "mp3",
      mp3_bitrate: 128,
      latency: "normal",
      normalize: true,
      // Fish API requires chunk_length in [100, 300].
      chunk_length: 300,
      min_chunk_length: 80,
      condition_on_previous_chunks: true,
      temperature,
      top_p: topP,
      repetition_penalty: 1.2,
      prosody: {
        speed,
        volume: 0,
        normalize_loudness: true,
      },
    }),
  });

  if (!res.ok) {
    let message = `Fish Audio failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      const text = await res.text().catch(() => "");
      if (text) message = text.slice(0, 240);
    }
    throw Object.assign(new Error(message), {
      status: res.status === 401 || res.status === 402 ? 503 : 502,
    });
  }

  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.length < 32) {
    throw Object.assign(new Error("Fish Audio returned empty audio"), {
      status: 502,
    });
  }
  return {
    audio,
    contentType: res.headers.get("content-type") || "audio/mpeg",
  };
}

function mergeConsecutiveSegments(
  segments: StoryListenSegment[]
): StoryListenSegment[] {
  const out: StoryListenSegment[] = [];
  for (const seg of segments) {
    const text = seg.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.speaker === seg.speaker) {
      last.text = `${last.text} ${text}`;
    } else {
      out.push({ speaker: seg.speaker, text });
    }
  }
  return out;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `ffmpeg failed (${code}): ${err.slice(-400) || "unknown error"}`
          )
        );
      }
    });
  });
}

async function concatMp3Buffers(parts: Buffer[]): Promise<Buffer> {
  if (parts.length === 0) {
    throw Object.assign(new Error("No audio parts to join"), { status: 502 });
  }
  if (parts.length === 1) return parts[0];

  const dir = await mkdtemp(join(tmpdir(), "fish-join-"));
  try {
    const listLines: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const file = join(dir, `part-${i}.mp3`);
      await writeFile(file, parts[i]);
      listLines.push(`file '${file.replace(/'/g, "'\\''")}'`);
    }
    const listFile = join(dir, "list.txt");
    const outFile = join(dir, "out.mp3");
    await writeFile(listFile, listLines.join("\n"), "utf8");
    await runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      outFile,
    ]);
    return await readFile(outFile);
  } catch (err) {
    // Coolify images without ffmpeg: crude MP3 concat still plays in browsers.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "ENOENT"
    ) {
      console.warn(
        "ffmpeg not found — concatenating MP3 parts without re-encode"
      );
      return Buffer.concat(parts);
    }
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Dual-voice story audio: synthesize Queen and slave turns separately
 * (each speaker can use its own speed), then concatenate.
 */
export async function fishStoryDialogueToSpeech(opts: {
  segments: StoryListenSegment[];
  queenVoiceId: string;
  slaveVoiceId: string;
}): Promise<FishTtsResult> {
  const runs = mergeConsecutiveSegments(opts.segments);
  if (runs.length === 0) {
    throw Object.assign(new Error("Nothing to speak"), { status: 400 });
  }

  const speedFor = (speaker: StorySpeaker) =>
    speaker === "queen" ? fishQueenSpeed() : fishSlaveSpeed();
  const voiceFor = (speaker: StorySpeaker) =>
    speaker === "queen" ? opts.queenVoiceId : opts.slaveVoiceId;

  const parts: Buffer[] = [];
  for (const run of runs) {
    const { audio } = await fishTextToSpeech({
      text: run.text,
      referenceId: voiceFor(run.speaker),
      speed: speedFor(run.speaker),
    });
    parts.push(audio);
  }

  return {
    audio: await concatMp3Buffers(parts),
    contentType: "audio/mpeg",
  };
}
