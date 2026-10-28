import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

export const QUEEN_LOVE_KEY = "queen_love";
export const QUEEN_LOVE_COOLDOWN_MINUTES_SECONDS = 300;
export const QUEEN_LOVE_COOLDOWN_FAST_SECONDS = 5;
export const QUEEN_LOVE_COOLDOWN_MS =
  QUEEN_LOVE_COOLDOWN_MINUTES_SECONDS * 1000;
export const QUEEN_LOVE_TIMEZONE = "Asia/Taipei";

export type QueenLoveCooldownSeconds =
  | typeof QUEEN_LOVE_COOLDOWN_MINUTES_SECONDS
  | typeof QUEEN_LOVE_COOLDOWN_FAST_SECONDS;

export const QUEEN_LOVE_COOLDOWN_OPTIONS: {
  seconds: QueenLoveCooldownSeconds;
  label: string;
}[] = [
  { seconds: QUEEN_LOVE_COOLDOWN_MINUTES_SECONDS, label: "5 minutes" },
  { seconds: QUEEN_LOVE_COOLDOWN_FAST_SECONDS, label: "5 seconds" },
];

export type QueenLoveState = {
  count: number;
  lastIncrementAt: string | null;
  nextAllowedAt: string | null;
  dayDate: string | null;
  dailyAverage: number;
  daysTracked: number;
  timezone: string;
  cooldownSeconds: QueenLoveCooldownSeconds;
};

export function normalizeQueenLoveCooldown(
  raw: unknown
): QueenLoveCooldownSeconds {
  return Number(raw) === QUEEN_LOVE_COOLDOWN_FAST_SECONDS
    ? QUEEN_LOVE_COOLDOWN_FAST_SECONDS
    : QUEEN_LOVE_COOLDOWN_MINUTES_SECONDS;
}

export function queenLoveCooldownMs(
  seconds: QueenLoveCooldownSeconds
): number {
  return seconds * 1000;
}

export function queenLoveCooldownCopy(
  seconds: QueenLoveCooldownSeconds
): string {
  return seconds === QUEEN_LOVE_COOLDOWN_FAST_SECONDS
    ? "once every 5 seconds"
    : "once every 5 minutes";
}

function normalizeQueenLove(
  row: Record<string, unknown> | null
): QueenLoveState {
  const cooldownSeconds = normalizeQueenLoveCooldown(row?.cooldown_seconds);
  const last = (row?.last_increment_at as string | null) ?? null;
  const nextFromRpc = (row?.next_allowed_at as string | null) ?? null;
  const next =
    nextFromRpc ??
    (last != null
      ? new Date(
          new Date(last).getTime() + queenLoveCooldownMs(cooldownSeconds)
        ).toISOString()
      : null);
  return {
    count: Math.max(0, Number(row?.count ?? 0) || 0),
    lastIncrementAt: last,
    nextAllowedAt: next,
    dayDate: (row?.day_date as string | null) ?? null,
    dailyAverage: Number(row?.daily_average ?? 0) || 0,
    daysTracked: Math.max(0, Number(row?.days_tracked ?? 0) || 0),
    timezone: (row?.timezone as string | null) || QUEEN_LOVE_TIMEZONE,
    cooldownSeconds,
  };
}

export function loveCooldownRemainingMs(
  state: QueenLoveState,
  now = Date.now()
): number {
  if (!state.nextAllowedAt) return 0;
  return Math.max(0, new Date(state.nextAllowedAt).getTime() - now);
}

export async function fetchQueenLove(
  supabase: Supabase
): Promise<QueenLoveState> {
  const { data, error } = await supabase.rpc("get_queen_love");
  if (error) throw error;
  return normalizeQueenLove((data ?? {}) as Record<string, unknown>);
}

export async function incrementQueenLove(
  supabase: Supabase
): Promise<QueenLoveState> {
  const { data, error } = await supabase.rpc("increment_queen_love");
  if (error) throw error;
  return normalizeQueenLove((data ?? {}) as Record<string, unknown>);
}

export async function resetQueenLove(
  supabase: Supabase
): Promise<QueenLoveState> {
  const { data, error } = await supabase.rpc("reset_queen_love");
  if (error) throw error;
  return normalizeQueenLove((data ?? {}) as Record<string, unknown>);
}

export async function fetchQueenLoveCooldown(
  supabase: Supabase
): Promise<QueenLoveCooldownSeconds> {
  const { data, error } = await supabase.rpc("get_queen_love_cooldown");
  if (error) throw error;
  return normalizeQueenLoveCooldown(
    (data as Record<string, unknown> | null)?.seconds
  );
}

export async function saveQueenLoveCooldown(
  supabase: Supabase,
  seconds: QueenLoveCooldownSeconds
): Promise<QueenLoveCooldownSeconds> {
  const { data, error } = await supabase.rpc("set_queen_love_cooldown", {
    p_seconds: seconds,
  });
  if (error) throw error;
  return normalizeQueenLoveCooldown(
    (data as Record<string, unknown> | null)?.seconds
  );
}
