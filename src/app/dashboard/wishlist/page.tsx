"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { WishlistForm } from "@/components/wishlist/wishlist-form";
import { WishlistGallery } from "@/components/wishlist/wishlist-gallery";
import { WishlistShippingAddress } from "@/components/wishlist/wishlist-shipping-address";
import { WishlistSizeChart } from "@/components/wishlist/wishlist-size-chart";
import { WishlistBudgetPanel } from "@/components/wishlist/wishlist-budget-panel";
import { WishlistApartmentFundPanel } from "@/components/wishlist/wishlist-apartment-fund-panel";
import { WishlistTotalSpentPanel } from "@/components/wishlist/wishlist-total-spent-panel";
import {
  fetchWishlistItems,
  isWishlistGiftBought,
  sumRevealedGiftSpendUsd,
} from "@/lib/wishlist";
import {
  formatGiftRatingAverage,
  GiftRatingStars,
} from "@/components/wishlist/gift-rating-stars";
import { signObjectUrl } from "@/lib/storage/client";
import type { WishlistItem, WishlistItemWithSignedUrl } from "@/lib/types";

async function withSignedUrls(
  items: WishlistItem[]
): Promise<WishlistItemWithSignedUrl[]> {
  return Promise.all(
    items.map(async (item) => {
      if (!item.image_path || item.is_secret) {
        return { ...item, signedUrl: undefined };
      }
      try {
        const signedUrl =
          (await signObjectUrl({
            bucket: "wishlist",
            path: item.image_path,
          })) ?? undefined;
        return { ...item, signedUrl };
      } catch {
        return { ...item, signedUrl: undefined };
      }
    })
  );
}

function WishlistPageInner() {
  const { isQueen, isSlave, profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const focusItemId = searchParams.get("item");
  const focusCommentId = searchParams.get("comment");
  const focusVoiceId = searchParams.get("voice");
  const [items, setItems] = useState<WishlistItemWithSignedUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingQueen, setEditingQueen] =
    useState<WishlistItemWithSignedUrl | null>(null);
  const [editingGift, setEditingGift] =
    useState<WishlistItemWithSignedUrl | null>(null);
  const [budgetRefresh, setBudgetRefresh] = useState(0);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();

    try {
      const list = await fetchWishlistItems(supabase);
      const signed = await withSignedUrls(list);
      setItems(signed);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not load wishlist";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  const queenItems = useMemo(
    () => items.filter((item) => (item.item_kind ?? "queen_taste") === "queen_taste"),
    [items]
  );
  const giftIdeaItems = useMemo(
    () =>
      items.filter(
        (item) => item.item_kind === "slave_gift" && !isWishlistGiftBought(item)
      ),
    [items]
  );
  const giftsBoughtItems = useMemo(
    () => items.filter((item) => isWishlistGiftBought(item)),
    [items]
  );
  const giftsBoughtRating = useMemo(
    () => formatGiftRatingAverage(giftsBoughtItems),
    [giftsBoughtItems]
  );
  const totalSpentOnQueenUsd = useMemo(
    () => sumRevealedGiftSpendUsd(items),
    [items]
  );

  const onDeleted = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (editingQueen?.id === id) setEditingQueen(null);
    if (editingGift?.id === id) setEditingGift(null);
  };

  const onUpdated = (item: WishlistItemWithSignedUrl) => {
    setItems((prev) => prev.map((row) => (row.id === item.id ? item : row)));
    if (item.item_kind === "slave_gift") {
      setEditingGift(null);
    } else {
      setEditingQueen(null);
    }
  };

  if (authLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl text-ivory flex items-center gap-3">
          <Heart className="h-7 w-7 text-gold" />
          Wishlist
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "Her taste, secret gifts from D, and gifts already bought for You"
            : "Her taste to study, gift ideas, and gifts you’ve bought for Queen"}
        </p>
      </div>

      <WishlistApartmentFundPanel />

      <WishlistTotalSpentPanel
        totalUsd={totalSpentOnQueenUsd}
        giftCount={giftsBoughtItems.length}
      />

      <WishlistShippingAddress />

      <WishlistSizeChart />

      <WishlistBudgetPanel refreshKey={budgetRefresh} />

      {isQueen && (
        <WishlistForm
          key={editingQueen?.id ?? "queen-create"}
          variant="queen_taste"
          editingItem={editingQueen}
          onCancelEdit={() => setEditingQueen(null)}
          onSuccess={load}
          onUpdated={onUpdated}
        />
      )}

      {isSlave && (
        <WishlistForm
          key={editingGift?.id ?? "gift-create"}
          variant="slave_gift"
          editingItem={editingGift}
          onCancelEdit={() => setEditingGift(null)}
          onSuccess={load}
          onUpdated={onUpdated}
          onBudgetChange={() => setBudgetRefresh((n) => n + 1)}
        />
      )}

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">
          {isSlave ? "Her wishlist" : "Her taste"}
        </h2>
        {loading && queenItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <WishlistGallery
            items={queenItems}
            itemKind="queen_taste"
            onDeleted={onDeleted}
            onChanged={load}
            onBudgetChange={() => setBudgetRefresh((n) => n + 1)}
            focusItemId={focusItemId}
            focusCommentId={focusCommentId}
            focusVoiceId={focusVoiceId}
            onEdit={
              isQueen
                ? (item) => {
                    setEditingQueen(item);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                : undefined
            }
          />
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">
          {isSlave ? "Your gift ideas" : "Gifts from D"}
        </h2>
        {loading && giftIdeaItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <WishlistGallery
            items={giftIdeaItems}
            itemKind="slave_gift"
            onDeleted={onDeleted}
            onChanged={load}
            onBudgetChange={() => setBudgetRefresh((n) => n + 1)}
            focusItemId={focusItemId}
            focusCommentId={focusCommentId}
            focusVoiceId={focusVoiceId}
            onEdit={
              isSlave
                ? (item) => {
                    setEditingGift(item);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                : undefined
            }
          />
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">
          Gifts bought for Queen
        </h2>
        <p className="text-sm text-muted-foreground">
          Arrived and collected — fully visible.
        </p>
        {giftsBoughtRating && giftsBoughtItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <GiftRatingStars
              rating={
                giftsBoughtRating.ratedCount > 0
                  ? Math.round(giftsBoughtRating.average)
                  : null
              }
              size="md"
            />
            <p className="text-sm text-ivory/90">
              {giftsBoughtRating.ratedCount > 0
                ? `${giftsBoughtRating.average.toFixed(1)} / 5 · ${giftsBoughtRating.ratedCount} of ${giftsBoughtRating.total} rated`
                : "No ratings yet"}
            </p>
          </div>
        )}
        {loading && giftsBoughtItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <WishlistGallery
            items={giftsBoughtItems}
            itemKind="slave_gift"
            onDeleted={onDeleted}
            onChanged={load}
            onBudgetChange={() => setBudgetRefresh((n) => n + 1)}
            focusItemId={focusItemId}
            focusCommentId={focusCommentId}
            focusVoiceId={focusVoiceId}
            onEdit={
              isSlave
                ? (item) => {
                    setEditingGift(item);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                : undefined
            }
          />
        )}
      </section>
    </div>
  );
}

export default function WishlistPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <WishlistPageInner />
    </Suspense>
  );
}
