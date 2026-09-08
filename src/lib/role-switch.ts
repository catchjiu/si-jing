import type { SupabaseClient } from "@supabase/supabase-js";

export type SwitchPairRolesResult = {
  switched: boolean;
  home_queen_id: string;
  home_slave_id: string;
};

export async function switchPairRoles(
  supabase: SupabaseClient
): Promise<SwitchPairRolesResult> {
  const { data, error } = await supabase.rpc("switch_pair_roles");
  if (error) throw error;

  const row = (data ?? {}) as Partial<SwitchPairRolesResult>;
  if (
    typeof row.switched !== "boolean" ||
    typeof row.home_queen_id !== "string" ||
    typeof row.home_slave_id !== "string"
  ) {
    throw new Error("Unexpected switch_pair_roles response");
  }

  return {
    switched: row.switched,
    home_queen_id: row.home_queen_id,
    home_slave_id: row.home_slave_id,
  };
}
