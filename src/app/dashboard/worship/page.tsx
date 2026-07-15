"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { WorshipTopicForm } from "@/components/worship/worship-topic-form";
import { WorshipAssignmentForm } from "@/components/worship/worship-assignment-form";
import { WorshipAssignmentsList } from "@/components/worship/worship-assignments-list";
import { WorshipGalleriesGrid } from "@/components/worship/worship-galleries-grid";
import { loadWorshipGalleriesWithMeta } from "@/lib/worship-galleries";
import type {
  WorshipAssignment,
  WorshipGalleryTopicWithMeta,
} from "@/lib/types";

export default function WorshipPage() {
  const { isQueen, isSlave, profile, loading: authLoading } = useAuth();
  const [galleries, setGalleries] = useState<WorshipGalleryTopicWithMeta[]>([]);
  const [assignments, setAssignments] = useState<WorshipAssignment[]>([]);
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();

    try {
      const [galleryRes, assignmentRes] = await Promise.all([
        supabase
          .from("worship_galleries")
          .select("*")
          .order("updated_at", { ascending: false }),
        supabase
          .from("worship_assignments")
          .select("*")
          .order("due_at", { ascending: true }),
      ]);

      if (galleryRes.error) throw galleryRes.error;
      if (assignmentRes.error) throw assignmentRes.error;

      const withMeta = await loadWorshipGalleriesWithMeta(
        supabase,
        galleryRes.data ?? []
      );
      setGalleries(withMeta);
      setAssignments((assignmentRes.data ?? []) as WorshipAssignment[]);

      const counts: Record<string, number> = {};
      for (const g of withMeta) {
        counts[g.id] = g.entryCount;
      }
      setEntryCounts(counts);
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

  const openAssignments = assignments.filter(
    (a) => a.status === "open" || a.status === "overdue"
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl text-ivory flex items-center gap-3">
          <Crown className="h-7 w-7 text-gold" />
          Worship
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "Themed galleries of you he builds in devotion — assign topics with deadlines"
            : "Create topic galleries and fill each with photos of Queen"}
        </p>
      </div>

      {isQueen && <WorshipAssignmentForm onSuccess={() => void load()} />}

      {isSlave && <WorshipTopicForm onSuccess={() => void load()} />}

      {(openAssignments.length > 0 || (isQueen && assignments.length > 0)) && (
        <section className="space-y-4">
          <h2 className="font-heading text-xl text-gold">Assignments</h2>
          <WorshipAssignmentsList
            assignments={isQueen ? assignments : openAssignments}
            entryCounts={entryCounts}
          />
        </section>
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
