import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

export const QUEEN_LOVE_KEY = "queen_love";
export const QUEEN_LOVE_COOLDOWN_MS = 5 * 60 * 1000;

export type QueenLoveState = {
  count: number;
  lastIncrementAt: string | null;
  nextAllowedAt: string | null;
};

export function normalizeQueenLove(row: {
  count?: number | null;
  last_increment_at?: string | null;
} | null): QueenLoveState {
  const last = row?.last_increment_at ?? null;
  const next =
    last != null
      ? new Date(new Date(last).getTime() + QUEEN_LOVE_COOLDOWN_MS).toISOString()
      : null;
  return {
    count: Math.max(0, Number(row?.count ?? 0) || 0),
    lastIncrementAt: last,
    nextAllowedAt: next,
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
  const { data, error } = await supabase
    .from("pair_counters")
    .select("count, last_increment_at")
    .eq("key", QUEEN_LOVE_KEY)
    .maybeSingle();
  if (error) throw error;
  return normalizeQueenLove(data);
}

export async function incrementQueenLove(
  supabase: Supabase
): Promise<QueenLoveState> {
  const { data, error } = await supabase.rpc("increment_queen_love");
  if (error) throw error;
  const row = (data ?? {}) as {
    count?: number;
    last_increment_at?: string;
    next_allowed_at?: string;
  };
  return {
    count: Number(row.count ?? 0),
    lastIncrementAt: row.last_increment_at ?? null,
    nextAllowedAt: row.next_allowed_at ?? null,
  };
}

export async function resetQueenLove(
  supabase: Supabase
): Promise<QueenLoveState> {
  const { data, error } = await supabase.rpc("reset_queen_love");
  if (error) throw error;
  return {
    count: Number((data as { count?: number } | null)?.count ?? 0),
    lastIncrementAt: null,
    nextAllowedAt: null,
  };
}
