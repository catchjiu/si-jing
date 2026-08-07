import type { createClient } from "@/lib/supabase/client";
import type { Tease, TeasePremiereKind, TeaseBurnReason } from "@/lib/types";

type Supabase = ReturnType<typeof createClient>;

export type PremiereEndReason = Extract<
  TeaseBurnReason,
  "played" | "early_exit" | "looked_away" | "missed_window"
>;

export function isPremiere(tease: Pick<Tease, "premiere_kind">): boolean {
  return tease.premiere_kind === "burned" || tease.premiere_kind === "timed";
}

export function isPremiereBurned(
  tease: Pick<Tease, "burned_at" | "expired_at">
): boolean {
  return Boolean(tease.burned_at || tease.expired_at);
}

export function isPremiereTimeReady(unlocksAt: string): boolean {
  return new Date(unlocksAt) <= new Date();
}

export function isPremiereWindowOpen(
  tease: Pick<
    Tease,
    "premiere_kind" | "unlocks_at" | "premiere_closes_at" | "burned_at" | "expired_at"
  >
): boolean {
  if (isPremiereBurned(tease)) return false;
  if (!isPremiereTimeReady(tease.unlocks_at)) return false;
  if (
    tease.premiere_kind === "timed" &&
    tease.premiere_closes_at &&
    new Date(tease.premiere_closes_at) < new Date()
  ) {
    return false;
  }
  return true;
}

export function premiereBadgeLabel(
  kind: TeasePremiereKind | null | undefined
): string | null {
  if (kind === "burned") return "Burned premiere";
  if (kind === "timed") return "Timed premiere";
  return null;
}

export function burnReasonLabel(reason: TeaseBurnReason | null | undefined): string {
  switch (reason) {
    case "played":
      return "Watched — burned";
    case "early_exit":
      return "Left early — burned";
    case "looked_away":
      return "Looked away — burned";
    case "missed_window":
      return "Missed window — burned";
    default:
      return "Burned";
  }
}

export async function startPremiereSession(
  supabase: Supabase,
  teaseId: string
): Promise<void> {
  const { error } = await supabase.rpc("start_premiere_session", {
    p_tease_id: teaseId,
  });
  if (error) throw error;
}

export async function finishPremiereSession(
  supabase: Supabase,
  teaseId: string,
  reason: PremiereEndReason
): Promise<{
  already_burned?: boolean;
  burn_reason?: string;
  penalized?: boolean;
  denial_days?: number;
}> {
  const { data, error } = await supabase.rpc("finish_premiere_session", {
    p_tease_id: teaseId,
    p_reason: reason,
  });
  if (error) throw error;
  return (data ?? {}) as {
    already_burned?: boolean;
    burn_reason?: string;
    penalized?: boolean;
    denial_days?: number;
  };
}

export function computePremiereClosesAt(
  unlocksAt: Date,
  windowMinutes: number
): string {
  return new Date(unlocksAt.getTime() + windowMinutes * 60_000).toISOString();
}
