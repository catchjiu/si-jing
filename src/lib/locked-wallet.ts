import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

export const LOCKED_WALLET_KEY = "locked_wallet";

export type WalletSpendKind = "wishlist_purchase" | "apartment_fund";
export type WalletSpendStatus = "pending" | "approved" | "denied";

export type WalletSpendRequest = {
  id: string;
  requested_by: string;
  kind: WalletSpendKind;
  status: WalletSpendStatus;
  wishlist_item_id: string | null;
  price_usd: number | null;
  target_status: string | null;
  fulfillment_notes: string | null;
  amount_ntd: number | null;
  note: string | null;
  beg_message: string | null;
  review_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export async function fetchLockedWalletEnabled(
  supabase: Supabase
): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_wallet_locked");
  if (error) {
    // Fallback to pair_settings read
    const { data: row } = await supabase
      .from("pair_settings")
      .select("value")
      .eq("key", LOCKED_WALLET_KEY)
      .maybeSingle();
    return Boolean(
      row?.value &&
        typeof row.value === "object" &&
        (row.value as { enabled?: boolean }).enabled
    );
  }
  return Boolean(data);
}

export async function setLockedWalletEnabled(
  supabase: Supabase,
  enabled: boolean
): Promise<boolean> {
  const { data, error } = await supabase.rpc("set_locked_wallet", {
    p_enabled: enabled,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function listWalletSpendRequests(
  supabase: Supabase,
  opts?: { pendingOnly?: boolean }
): Promise<WalletSpendRequest[]> {
  let query = supabase
    .from("wallet_spend_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (opts?.pendingOnly) query = query.eq("status", "pending");
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as WalletSpendRequest[]).map((r) => ({
    ...r,
    price_usd: r.price_usd == null ? null : Number(r.price_usd),
    amount_ntd: r.amount_ntd == null ? null : Number(r.amount_ntd),
  }));
}

export async function requestWishlistPurchaseApproval(
  supabase: Supabase,
  opts: {
    itemId: string;
    priceUsd: number;
    status: "ordered" | "fulfilled" | "revealed";
    fulfillmentNotes?: string | null;
    begMessage?: string | null;
  }
): Promise<string> {
  const { data, error } = await supabase.rpc("request_wallet_spend", {
    p_kind: "wishlist_purchase",
    p_wishlist_item_id: opts.itemId,
    p_price_usd: opts.priceUsd,
    p_target_status: opts.status,
    p_fulfillment_notes: opts.fulfillmentNotes ?? null,
    p_beg_message: opts.begMessage ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function requestApartmentFundApproval(
  supabase: Supabase,
  opts: {
    amountNtd: number;
    note?: string | null;
    begMessage?: string | null;
  }
): Promise<string> {
  const { data, error } = await supabase.rpc("request_wallet_spend", {
    p_kind: "apartment_fund",
    p_amount_ntd: opts.amountNtd,
    p_note: opts.note ?? null,
    p_beg_message: opts.begMessage ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function reviewWalletSpendRequest(
  supabase: Supabase,
  requestId: string,
  approve: boolean,
  reviewComment?: string | null
): Promise<void> {
  const { error } = await supabase.rpc("review_wallet_spend", {
    p_request_id: requestId,
    p_approve: approve,
    p_review_comment: reviewComment?.trim() || null,
  });
  if (error) throw error;
}
