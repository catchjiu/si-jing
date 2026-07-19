import type { SupabaseClient } from "@supabase/supabase-js";

export async function syncProtocolState(supabase: SupabaseClient) {
  await Promise.all([
    supabase.rpc("open_due_check_ins"),
    supabase.rpc("flag_missed_check_ins"),
    supabase.rpc("complete_expired_punishments"),
    supabase.rpc("ensure_queen_love_day_rollover"),
  ]);
}
