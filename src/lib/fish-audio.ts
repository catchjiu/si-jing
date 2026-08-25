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

/**
 * `referenceId` is a single voice, or an array indexed by Fish speaker tags
 * (`<|speaker:0|>`, `<|speaker:1|>`, …). Use `[queenId, slaveId]` for dual-voice stories.
 */
export async function fishTextToSpeech(opts: {
  text: string;
  referenceId: string | string[];
}): Promise<FishTtsResult> {
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
      chunk_length: 300,
      prosody: {
        speed: 1,
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
