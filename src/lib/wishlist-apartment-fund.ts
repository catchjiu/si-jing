import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

export type QueenApartmentFundEntry = {
  id: string;
  user_id: string;
  amount_ntd: number;
  note: string | null;
  created_at: string;
};

export function formatNtd(amount: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function parseNtdInput(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function sumApartmentFundNtd(entries: QueenApartmentFundEntry[]): number {
  return entries.reduce((sum, row) => sum + Number(row.amount_ntd), 0);
}

export async function listQueenApartmentFundEntries(
  supabase: Supabase
): Promise<QueenApartmentFundEntry[]> {
  const { data, error } = await supabase
    .from("queen_apartment_fund_entries")
    .select("id, user_id, amount_ntd, note, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    amount_ntd: Number(row.amount_ntd),
    note: (row.note as string | null) ?? null,
  }));
}

export async function addQueenApartmentFundEntry(
  supabase: Supabase,
  opts: { userId: string; amountNtd: number; note?: string | null }
): Promise<QueenApartmentFundEntry> {
  const { data, error } = await supabase
    .from("queen_apartment_fund_entries")
    .insert({
      user_id: opts.userId,
      amount_ntd: opts.amountNtd,
      note: opts.note?.trim() || null,
    })
    .select("id, user_id, amount_ntd, note, created_at")
    .single();
  if (error) throw error;
  return {
    ...data,
    amount_ntd: Number(data.amount_ntd),
    note: (data.note as string | null) ?? null,
  };
}
