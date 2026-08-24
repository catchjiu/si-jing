"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { loadCreepGalleriesWithMeta } from "@/lib/creep-galleries";
import type { CreepGalleryWithMeta } from "@/lib/types";
import { CreepGalleriesGrid } from "@/components/creep/creep-galleries-grid";
import { CreepTopicForm } from "@/components/creep/creep-topic-form";

export default function CreepHubPage() {
  const { profile, isSlave, loading: authLoading } = useAuth();
  const [galleries, setGalleries] = useState<CreepGalleryWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("creep_galleries")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Could not load Creep");
      setGalleries([]);
      setLoading(false);
      return;
    }
    const withMeta = await loadCreepGalleriesWithMeta(
      supabase,
      data ?? []
    );
    setGalleries(withMeta);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  if (authLoading || (loading && galleries.length === 0)) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      {isSlave && (
        <CreepTopicForm
          existingSlugs={galleries.map((g) => g.slug)}
          onSuccess={() => void load()}
        />
      )}
      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">Inside Creep</h2>
        <CreepGalleriesGrid
          galleries={galleries}
          onDeleted={(id) =>
            setGalleries((prev) => prev.filter((g) => g.id !== id))
          }
          onChanged={load}
        />
      </section>
    </div>
  );
}
