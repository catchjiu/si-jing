import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

export const QUEEN_LOVE_KEY = "queen_love";
export const QUEEN_LOVE_COOLDOWN_MS = 5 * 60 * 1000;
export const QUEEN_LOVE_TIMEZONE = "Asia/Taipei";

export type QueenLoveState = {
  count: number;
  lastIncrementAt: string | null;
  nextAllowedAt: string | null;
  dayDate: string | null;
  dailyAverage: number;
  daysTracked: number;
  timezone: string;
};

function normalizeQueenLove(row: Record<string, unknown> | null): QueenLoveState {
  const last = (row?.last_increment_at as string | null) ?? null;
  const nextFromRpc = (row?.next_allowed_at as string | null) ?? null;
  const next =
    nextFromRpc ??
    (last != null
      ? new Date(new Date(last).getTime() + QUEEN_LOVE_COOLDOWN_MS).toISOString()
      : null);
  return {
    count: Math.max(0, Number(row?.count ?? 0) || 0),
    lastIncrementAt: last,
    nextAllowedAt: next,
    dayDate: (row?.day_date as string | null) ?? null,
    dailyAverage: Number(row?.daily_average ?? 0) || 0,
    daysTracked: Math.max(0, Number(row?.days_tracked ?? 0) || 0),
    timezone: (row?.timezone as string | null) || QUEEN_LOVE_TIMEZONE,
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
