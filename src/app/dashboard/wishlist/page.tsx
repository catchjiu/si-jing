"use client";

import { useCallback, useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { WishlistForm } from "@/components/wishlist/wishlist-form";
import { WishlistGallery } from "@/components/wishlist/wishlist-gallery";
import type { WishlistItem, WishlistItemWithSignedUrl } from "@/lib/types";

async function withSignedUrls(
  items: WishlistItem[]
): Promise<WishlistItemWithSignedUrl[]> {
  const supabase = createClient();
  return Promise.all(
    items.map(async (item) => {
      const { data } = await supabase.storage
        .from("wishlist")
        .createSignedUrl(item.image_path, 3600);
      return { ...item, signedUrl: data?.signedUrl };
    })
  );
}

export default function WishlistPage() {
  const { isQueen, isSlave, profile, loading: authLoading } = useAuth();
  const [items, setItems] = useState<WishlistItemWithSignedUrl[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("wishlist_items")
      .select("*")
      .order("created_at", { ascending: false });

    const list = (data ?? []) as WishlistItem[];
    const signed = await withSignedUrls(list);
    setItems(signed);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  const onDeleted = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  if (authLoading || loading) {
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
            ? "Pictures of things you like — so he can know you better"
            : "Things Queen likes — study her taste"}
        </p>
      </div>

      {isQueen && <WishlistForm onSuccess={load} />}

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">
          {isSlave ? "Her wishlist" : "Items"}
        </h2>
        <WishlistGallery items={items} onDeleted={onDeleted} />
      </section>
    </div>
  );
}
