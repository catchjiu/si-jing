import type { createClient } from "@/lib/supabase/client";
import type { WishlistItem } from "@/lib/types";

type Supabase = ReturnType<typeof createClient>;

export const WISHLIST_STATUS_LABELS = {
  new: "New",
  seen: "Seen",
  idea: "Idea",
  ordered: "Ordered",
  fulfilled: "Fulfilled",
  revealed: "Revealed",
} as const;

export function wishlistStatusClass(status: string): string {
  if (status === "revealed") return "border-emerald-500/40 text-emerald-300";
  if (status === "fulfilled") return "border-emerald-500/40 text-emerald-300";
  if (status === "ordered") return "border-gold/40 text-gold";
  if (status === "idea") return "border-sky-400/40 text-sky-200";
  if (status === "seen") return "border-ivory/30 text-ivory/70";
  return "border-muted text-muted-foreground";
}

/** Queen secret-card action: purchased gifts use Arrived; ideas use Reveal. */
export function wishlistRevealButtonLabel(status: string | null | undefined): string {
  if (status === "ordered" || status === "fulfilled" || status === "revealed") {
    return "Arrived";
  }
  return "Reveal";
}

export function isWishlistGiftBought(
  item: Pick<WishlistItem, "item_kind" | "status">
): boolean {
  return item.item_kind === "slave_gift" && item.status === "revealed";
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
): Promise<{
  id: string;
  arrived_at: string;
  status: string;
  title?: string | null;
  notified?: boolean;
}> {
  const { data, error } = await supabase.rpc("mark_wishlist_arrived", {
    p_item_id: itemId,
  });
  if (error) throw error;
  return data as {
    id: string;
    arrived_at: string;
    status: string;
    title?: string | null;
    notified?: boolean;
  };
}

export async function rateWishlistGift(
  supabase: Supabase,
  itemId: string,
  rating: number
): Promise<{ id: string; queen_rating: number; queen_rated_at: string }> {
  const { data, error } = await supabase.rpc("rate_wishlist_gift", {
    p_item_id: itemId,
    p_rating: rating,
  });
  if (error) throw error;
  return data as {
    id: string;
    queen_rating: number;
    queen_rated_at: string;
  };
}

export { WISHLIST_WEEKLY_USD_LIMIT, WISHLIST_WEEKLY_ITEM_LIMIT } from "@/lib/wishlist-budget";
