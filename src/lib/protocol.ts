import type { SupabaseClient } from "@supabase/supabase-js";

export async function syncProtocolState(supabase: SupabaseClient) {
  await Promise.all([
    supabase.rpc("open_due_check_ins"),
    supabase.rpc("flag_missed_check_ins"),
    supabase.rpc("ensure_ritual_occurrences", { look_ahead_days: 14 }),
    supabase.rpc("flag_missed_rituals"),
    supabase.rpc("complete_expired_punishments"),
  ]);
}
