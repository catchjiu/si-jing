import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

export type ApartmentFundEntry = {
  id: string;
  user_id: string;
  amount_ntd: number;
  created_at: string;
};

export function formatNtd(amount: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function parseNtdInput(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export async function listApartmentFundEntries(
  supabase: Supabase,
  limit = 20
): Promise<ApartmentFundEntry[]> {
  const { data, error } = await supabase
    .from("queen_apartment_fund_entries")
    .select("id, user_id, amount_ntd, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    amount_ntd: Number(row.amount_ntd),
    created_at: row.created_at as string,
  }));
}

export async function getApartmentFundTotal(
  supabase: Supabase
): Promise<number> {
  const { data, error } = await supabase
    .from("queen_apartment_fund_entries")
    .select("amount_ntd");
  if (error) throw error;
  return (data ?? []).reduce(
    (sum, row) => sum + Number(row.amount_ntd ?? 0),
    0
  );
}

export async function addApartmentFundDeposit(
  supabase: Supabase,
  amountNtd: number
): Promise<ApartmentFundEntry> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("queen_apartment_fund_entries")
    .insert({
      user_id: user.id,
      amount_ntd: amountNtd,
    })
    .select("id, user_id, amount_ntd, created_at")
    .single();
  if (error) throw error;
  return {
    id: data.id as string,
    user_id: data.user_id as string,
    amount_ntd: Number(data.amount_ntd),
    created_at: data.created_at as string,
  };
}
