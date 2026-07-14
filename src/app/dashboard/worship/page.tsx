"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { WorshipTopicForm } from "@/components/worship/worship-topic-form";
import { WorshipGalleriesGrid } from "@/components/worship/worship-galleries-grid";
import { loadWorshipGalleriesWithMeta } from "@/lib/worship-galleries";
import type { WorshipGalleryTopicWithMeta } from "@/lib/types";

export default function WorshipPage() {
  const { isQueen, isSlave, profile, loading: authLoading } = useAuth();
  const [galleries, setGalleries] = useState<WorshipGalleryTopicWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from("worship_galleries")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const withMeta = await loadWorshipGalleriesWithMeta(
        supabase,
        data ?? []
      );
      setGalleries(withMeta);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not load worship galleries";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  const onDeleted = (id: string) => {
    setGalleries((prev) => prev.filter((g) => g.id !== id));
  };

  if (authLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl text-ivory flex items-center gap-3">
          <Crown className="h-7 w-7 text-gold" />
          Worship
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "Themed galleries of you he builds in devotion"
            : "Create topic galleries and fill each with photos of Queen"}
        </p>
      </div>

      {isSlave && (
        <WorshipTopicForm
          onSuccess={() => void load()}
        />
      )}

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">
          {isQueen ? "His galleries" : "Your galleries"}
        </h2>
        {loading && galleries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <WorshipGalleriesGrid
            galleries={galleries}
            onDeleted={onDeleted}
            onChanged={load}
          />
        )}
      </section>
    </div>
  );
}
