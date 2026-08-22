import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

export const FART_LIKES_KEY = "fart_likes";
export const FART_LIKE_COOLDOWN_MS = 5 * 60 * 1000;

export type FartLikesState = {
  count: number;
  lastIncrementAt: string | null;
  nextAllowedAt: string | null;
};

function normalizeFartLikes(
  row: Record<string, unknown> | null
): FartLikesState {
  const last = (row?.last_increment_at as string | null) ?? null;
  const nextFromRpc = (row?.next_allowed_at as string | null) ?? null;
  const next =
    nextFromRpc ??
    (last != null
      ? new Date(new Date(last).getTime() + FART_LIKE_COOLDOWN_MS).toISOString()
      : null);
  return {
    count: Math.max(0, Number(row?.count ?? 0) || 0),
    lastIncrementAt: last,
    nextAllowedAt: next,
  };
}

export function fartLikeCooldownRemainingMs(
  state: FartLikesState,
  now = Date.now()
): number {
  if (!state.nextAllowedAt) return 0;
  return Math.max(0, new Date(state.nextAllowedAt).getTime() - now);
}

export async function fetchFartLikes(
  supabase: Supabase
): Promise<FartLikesState> {
  const { data, error } = await supabase.rpc("get_fart_likes");
  if (error) throw error;
  return normalizeFartLikes((data ?? {}) as Record<string, unknown>);
}

export async function incrementFartLikes(
  supabase: Supabase
): Promise<FartLikesState> {
  const { data, error } = await supabase.rpc("increment_fart_likes");
  if (error) throw error;
  return normalizeFartLikes((data ?? {}) as Record<string, unknown>);
}
