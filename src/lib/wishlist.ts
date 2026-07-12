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
