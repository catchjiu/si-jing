import type { createClient } from "@/lib/supabase/client";
import type { WishlistItem } from "@/lib/types";

type Supabase = ReturnType<typeof createClient>;

export const WISHLIST_STATUS_LABELS = {
  new: "New",
  seen: "Seen",
  ordered: "Ordered",
  fulfilled: "Fulfilled",
} as const;

export function wishlistStatusClass(status: string): string {
  if (status === "fulfilled") return "border-emerald-500/40 text-emerald-300";
  if (status === "ordered") return "border-gold/40 text-gold";
  if (status === "seen") return "border-ivory/30 text-ivory/70";
  return "border-muted text-muted-foreground";
}

export function isWishlistSecretForQueen(
  item: Pick<WishlistItem, "item_kind" | "arrived_at" | "is_secret">,
  isQueen: boolean
): boolean {
  if (item.is_secret != null) return Boolean(item.is_secret);
  return (
    isQueen &&
    item.item_kind === "slave_gift" &&
    item.arrived_at == null
  );
}

export async function fetchWishlistItems(
  supabase: Supabase
): Promise<WishlistItem[]> {
  const { data, error } = await supabase.rpc("fetch_wishlist_items");
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data as WishlistItem[];
}

export async function markWishlistArrived(
  supabase: Supabase,
  itemId: string
): Promise<{ id: string; arrived_at: string; status: string }> {
  const { data, error } = await supabase.rpc("mark_wishlist_arrived", {
    p_item_id: itemId,
  });
  if (error) throw error;
  return data as { id: string; arrived_at: string; status: string };
}

export { WISHLIST_WEEKLY_USD_LIMIT, WISHLIST_WEEKLY_ITEM_LIMIT } from "@/lib/wishlist-budget";
