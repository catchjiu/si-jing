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

export type ShopItem = {
  id: string;
  created_by: string;
  title: string;
  description: string | null;
  price: number;
  image_path: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ShopPurchase = {
  id: string;
  item_id: string;
  purchased_by: string;
  price_paid: number;
  status: "pending" | "fulfilled" | "cancelled";
  queen_note: string | null;
  ledger_id: string | null;
  created_at: string;
  fulfilled_at: string | null;
};

export type ShopPurchaseWithItem = ShopPurchase & {
  item?: ShopItem | null;
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
  }
): Promise<{ error?: string }> {
  if (opts.delta === 0) return { error: "Amount cannot be zero" };
  const { error } = await supabase.from("points_ledger").insert({
    user_id: opts.userId,
    delta: opts.delta,
    reason: opts.reason.trim() || (opts.delta > 0 ? "Queen award" : "Queen deduction"),
    created_by: opts.createdBy,
  });
  return error ? { error: error.message } : {};
}

export async function purchaseShopItem(
  supabase: Supabase,
  itemId: string
): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase.rpc("purchase_shop_item", {
    p_item_id: itemId,
  });
  if (error) return { error: error.message };
  return { id: data as string };
}
