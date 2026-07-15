import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueenAvailability } from "@/lib/types";

export type PrimaryQueenStatus = {
  id: string;
  username: string;
  availability: QueenAvailability | null;
  updatedAt: string | null;
  lastActiveAt: string | null;
};

type QueenStatusRow = {
  queen_id: string;
  username: string;
  availability: string | null;
  updated_at: string | null;
  last_active_at: string | null;
};

/** Primary Queen (oldest account) — avoids picking test queen2 by accident. */
export async function fetchPrimaryQueenStatus(
  supabase: SupabaseClient
): Promise<PrimaryQueenStatus | null> {
  const { data, error } = await supabase.rpc("get_queen_status");

  if (!error && data) {
    const row = (Array.isArray(data) ? data[0] : data) as
      | QueenStatusRow
      | undefined;
    if (row?.queen_id) {
      return {
        id: row.queen_id,
        username: row.username ?? "Queen",
        availability: (row.availability as QueenAvailability | null) ?? null,
        updatedAt: row.updated_at,
        lastActiveAt: row.last_active_at,
      };
    }
  }

  const { data: queen } = await supabase
    .from("users")
    .select("id, username")
    .eq("role", "queen")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!queen?.id) return null;

  const { data: status } = await supabase
    .from("user_status")
    .select("availability, updated_at, last_active_at")
    .eq("user_id", queen.id)
    .maybeSingle();

  return {
    id: queen.id as string,
    username: (queen.username as string) ?? "Queen",
    availability:
      (status?.availability as QueenAvailability | null | undefined) ?? null,
    updatedAt: (status?.updated_at as string | null | undefined) ?? null,
    lastActiveAt:
      (status?.last_active_at as string | null | undefined) ?? null,
  };
}
