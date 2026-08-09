import {
  FLIRT_DICK_SIZE_MAX_CM,
  FLIRT_DICK_SIZE_MIN_CM,
  type FlirtGuy,
} from "@/lib/types";

export type FlirtScoreInputs = Pick<
  FlirtGuy,
  | "interest_level"
  | "hotness_level"
  | "face_score"
  | "body_score"
  | "dick_size_cm"
>;

/** Map dick cm (5–30) onto 0–100 so it ranks with the other meters. */
export function flirtDickScore100(cm: number): number {
  const clamped = Math.min(
    FLIRT_DICK_SIZE_MAX_CM,
    Math.max(FLIRT_DICK_SIZE_MIN_CM, cm)
  );
  const span = FLIRT_DICK_SIZE_MAX_CM - FLIRT_DICK_SIZE_MIN_CM;
  return Math.round(((clamped - FLIRT_DICK_SIZE_MIN_CM) / span) * 100);
}

/** Average of interest, hotness, face, body, and normalized dick size. */
export function flirtCompositeScore(guy: FlirtScoreInputs): number {
  const parts = [
    guy.interest_level ?? 50,
    guy.hotness_level ?? 50,
    guy.face_score ?? 50,
    guy.body_score ?? 50,
    flirtDickScore100(guy.dick_size_cm ?? 19),
  ];
  const sum = parts.reduce((a, b) => a + b, 0);
  return Math.round(sum / parts.length);
}

export type RankedFlirtGuy<T extends FlirtScoreInputs = FlirtGuy> = {
  guy: T;
  score: number;
  rank: number;
};

export function rankFlirtGuys<T extends FlirtGuy>(guys: T[]): RankedFlirtGuy<T>[] {
  const sorted = [...guys].sort((a, b) => {
    const scoreDiff = flirtCompositeScore(b) - flirtCompositeScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    if (Boolean(b.is_slave) !== Boolean(a.is_slave)) {
      return a.is_slave ? 1 : -1;
    }
    return a.name.localeCompare(b.name);
  });

  let lastScore: number | null = null;
  let lastRank = 0;
  return sorted.map((guy, index) => {
    const score = flirtCompositeScore(guy);
    const rank = score === lastScore ? lastRank : index + 1;
    lastScore = score;
    lastRank = rank;
    return { guy, score, rank };
  });
}
