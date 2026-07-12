"use client";

import { useCallback, useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { WishlistForm } from "@/components/wishlist/wishlist-form";
import { WishlistGallery } from "@/components/wishlist/wishlist-gallery";
import { signObjectUrl } from "@/lib/storage/client";
import type { WishlistItem, WishlistItemWithSignedUrl } from "@/lib/types";

async function withSignedUrls(
  items: WishlistItem[]
): Promise<WishlistItemWithSignedUrl[]> {
  return Promise.all(
    items.map(async (item) => {
      try {
        const signedUrl =
          (await signObjectUrl({
            bucket: "wishlist",
            path: item.image_path,
          })) ?? undefined;
        return { ...item, signedUrl };
      } catch {
        // Keep the row even if signing fails — never drop persisted items
        return { ...item, signedUrl: undefined };
      }
    })
  );
}

export default function WishlistPage() {
  const { isQueen, isSlave, profile, loading: authLoading } = useAuth();
  const [items, setItems] = useState<WishlistItemWithSignedUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<WishlistItemWithSignedUrl | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from("wishlist_items")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const list = (data ?? []) as WishlistItem[];
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

  const onDeleted = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (editing?.id === id) setEditing(null);
  };

  const onUpdated = (item: WishlistItemWithSignedUrl) => {
    setItems((prev) => prev.map((row) => (row.id === item.id ? item : row)));
    setEditing(null);
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
            ? "Pictures of things you like — he tracks seen, ordered, and fulfilled"
            : "Things Queen likes — mark status and notes as you study or fulfill them"}
        </p>
      </div>

      {isQueen && (
        <WishlistForm
          key={editing?.id ?? "create"}
          editingItem={editing}
          onCancelEdit={() => setEditing(null)}
          onSuccess={load}
          onUpdated={onUpdated}
        />
      )}

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">
          {isSlave ? "Her wishlist" : "Items"}
        </h2>
        {loading && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <WishlistGallery
            items={items}
            onDeleted={onDeleted}
            onChanged={load}
            onEdit={(item) => {
              setEditing(item);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}
      </section>
    </div>
  );
}
