import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

export type PointsLedgerEntry = {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  entity_type: string | null;
  entity_id: string | null;
  created_by: string | null;
  created_at: string;
};

export async function fetchPointsBalance(
  supabase: Supabase,
  userId?: string
): Promise<number> {
  const { data, error } = await supabase.rpc("points_balance", {
    p_user: userId ?? undefined,
  });
  if (error) {
    console.error("points_balance", error);
    return 0;
  }
  return Number(data ?? 0);
}

export async function fetchPointsLedger(
  supabase: Supabase,
  userId: string,
  limit = 30
): Promise<PointsLedgerEntry[]> {
  const { data, error } = await supabase
    .from("points_ledger")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("points_ledger", error);
    return [];
  }
  return (data ?? []) as PointsLedgerEntry[];
}

export async function adjustPoints(
  supabase: Supabase,
  opts: {
    userId: string;
    delta: number;
    reason: string;
    createdBy: string;
    entityType?: string | null;
    entityId?: string | null;
  }
): Promise<{ error?: string }> {
  if (opts.delta === 0) return { error: "Amount cannot be zero" };
  const { error } = await supabase.from("points_ledger").insert({
    user_id: opts.userId,
    delta: opts.delta,
    reason: opts.reason.trim() || (opts.delta > 0 ? "Queen award" : "Queen deduction"),
    created_by: opts.createdBy,
    entity_type: opts.entityType ?? null,
    entity_id: opts.entityId ?? null,
  });
  return error ? { error: error.message } : {};
}
