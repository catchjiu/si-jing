import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

export async function fetchNoContactActive(
  supabase: Supabase
): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_no_contact_active");
  if (error) {
    console.error("is_no_contact_active", error);
    return false;
  }
  return Boolean(data);
}
