import type { WorkoutBodyPart } from "@/lib/workout-exercises";
import { QUEEN_WORK_TIMEZONE } from "@/lib/partner-locations";

export type WorkoutSetLike = {
  exercise_name: string;
  body_part: WorkoutBodyPart;
  reps: number;
  weight: number;
  performed_at?: string;
};

export type NewSet = WorkoutSetLike;

export function weekStartMonday(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: QUEEN_WORK_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(d);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  if (!year || !month || !day || !weekday) {
    throw new Error("Could not resolve local date");
  }

  const asUtc = new Date(`${year}-${month}-${day}T12:00:00Z`);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const dow = map[weekday] ?? 0;
  asUtc.setUTCDate(asUtc.getUTCDate() - dow);
  return asUtc.toISOString().slice(0, 10);
}

export function sessionVolume(sets: { reps: number; weight: number }[]): number {
  return sets.reduce((sum, s) => sum + s.reps * s.weight, 0);
}

export function formatVolume(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} lbs`;
}

export function exerciseKey(bodyPart: WorkoutBodyPart, name: string): string {
  return `${bodyPart}::${name}`;
}

export function detectPr(
  sets: NewSet[],
  priorMaxByKey: Map<string, number>
): { key: string; isPr: boolean }[] {
  const sessionMax = new Map<string, number>();

  for (const set of sets) {
    const key = exerciseKey(set.body_part, set.exercise_name);
    const prev = sessionMax.get(key) ?? 0;
    if (set.weight > prev) {
      sessionMax.set(key, set.weight);
    }
  }

  return sets.map((set) => {
    const key = exerciseKey(set.body_part, set.exercise_name);
    const priorMax = priorMaxByKey.get(key) ?? 0;
    const bestInSession = sessionMax.get(key) ?? set.weight;
    const isPr = set.weight === bestInSession && set.weight > priorMax;
    return { key, isPr };
  });
}

export function buildSparklineSeries(
  history: { at: string; weight: number }[],
  limit = 8
): number[] {
  const sorted = [...history].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );
  return sorted.slice(-limit).map((h) => h.weight);
}

export function durationMinutes(
  startedAt: string | null,
  endedAt: string | null
): number | null {
  if (!startedAt || !endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return null;
  return Math.round(ms / (1000 * 60));
}
