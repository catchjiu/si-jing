import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

export const WISHLIST_WEEKLY_USD_LIMIT = 50;
export const WISHLIST_WEEKLY_ITEM_LIMIT = 3;
export const WISHLIST_DEFAULT_CREDIT_USD = 200;
export const WISHLIST_DEFAULT_CREDIT_ITEMS = 12;

export type WishlistBudgetSummary = {
  is_slave: boolean;
  week_start?: string;
  weekly_usd_limit_cents?: number;
  weekly_item_limit?: number;
  weekly_usd_used_cents?: number;
  weekly_items_used?: number;
  weekly_usd_remaining_cents?: number;
  weekly_items_remaining?: number;
  credit_usd_cents?: number;
  credit_items?: number;
  total_usd_remaining_cents?: number;
  total_items_remaining?: number;
  resets_on?: string;
};

export type WishlistPurchaseRow = {
  id: string;
  wishlist_item_id: string;
  price_usd_cents: number;
  week_start: string;
  from_weekly_usd_cents: number;
  from_credit_usd_cents: number;
  from_weekly_items: number;
  from_credit_items: number;
  created_at: string;
  item_title: string | null;
  item_status: string | null;
  item_kind: string | null;
  image_path: string | null;
  arrived_at?: string | null;
  is_secret?: boolean;
};

export type WishlistBudgetSettings = {
  weekly_usd_limit: number;
  weekly_item_limit: number;
  credit_usd: number;
  credit_items: number;
};

export function formatUsdFromCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function parseUsdInput(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function budgetSummaryToSettings(
  budget: WishlistBudgetSummary
): WishlistBudgetSettings {
  return {
    weekly_usd_limit:
      (budget.weekly_usd_limit_cents ?? WISHLIST_WEEKLY_USD_LIMIT * 100) / 100,
    weekly_item_limit: budget.weekly_item_limit ?? WISHLIST_WEEKLY_ITEM_LIMIT,
    credit_usd: (budget.credit_usd_cents ?? 0) / 100,
    credit_items: budget.credit_items ?? 0,
  };
}

export async function fetchWishlistBudget(
  supabase: Supabase,
  userId?: string
): Promise<WishlistBudgetSummary | null> {
  const { data, error } = await supabase.rpc("get_wishlist_budget", {
    p_user_id: userId ?? undefined,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") return null;
  return data as WishlistBudgetSummary;
}

export async function fetchPrimarySlaveId(
  supabase: Supabase
): Promise<string | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("role", "slave")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

export async function recordWishlistPurchase(
  supabase: Supabase,
  opts: {
    itemId: string;
    priceUsd: number;
    status: "ordered" | "fulfilled";
    fulfillmentNotes?: string | null;
  }
): Promise<WishlistBudgetSummary | null> {
  const { data, error } = await supabase.rpc("record_wishlist_purchase", {
    p_item_id: opts.itemId,
    p_price_usd: opts.priceUsd,
    p_status: opts.status,
    p_fulfillment_notes: opts.fulfillmentNotes ?? null,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") return null;
  return data as WishlistBudgetSummary;
}

export async function setWishlistBudget(
  supabase: Supabase,
  opts: {
    userId: string;
    weeklyUsdLimit?: number;
    weeklyItemLimit?: number;
    creditUsd?: number;
    creditItems?: number;
  }
): Promise<WishlistBudgetSummary | null> {
  const { data, error } = await supabase.rpc("set_wishlist_budget", {
    p_user_id: opts.userId,
    p_weekly_usd_limit: opts.weeklyUsdLimit ?? null,
    p_weekly_item_limit: opts.weeklyItemLimit ?? null,
    p_credit_usd: opts.creditUsd ?? null,
    p_credit_items: opts.creditItems ?? null,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") return null;
  return data as WishlistBudgetSummary;
}

export async function listWishlistPurchases(
  supabase: Supabase,
  opts?: { userId?: string; weekOnly?: boolean }
): Promise<WishlistPurchaseRow[]> {
  const { data, error } = await supabase.rpc("list_wishlist_purchases", {
    p_user_id: opts?.userId ?? undefined,
    p_week_only: opts?.weekOnly ?? true,
  });
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data as WishlistPurchaseRow[];
}

export function hasRecordedPurchasePrice(
  existingPrice: number | null | undefined
): boolean {
  return existingPrice != null && existingPrice > 0;
}

export function purchaseStatusNeedsPrice(
  status: string,
  existingPrice: number | null | undefined,
  alreadyPurchased?: boolean
): boolean {
  if (alreadyPurchased || hasRecordedPurchasePrice(existingPrice)) return false;
  return status === "ordered" || status === "fulfilled";
}
