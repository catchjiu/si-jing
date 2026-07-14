"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { WorshipForm } from "@/components/worship/worship-form";
import { WorshipGallery } from "@/components/worship/worship-gallery";
import { signObjectUrl } from "@/lib/storage/client";
import type { WorshipEntry, WorshipEntryWithSignedUrl } from "@/lib/types";

async function withSignedUrls(
  entries: WorshipEntry[]
): Promise<WorshipEntryWithSignedUrl[]> {
  return Promise.all(
    entries.map(async (entry) => {
      try {
        const signedUrl =
          (await signObjectUrl({
            bucket: "worship",
            path: entry.image_path,
          })) ?? undefined;
        return { ...entry, signedUrl };
      } catch {
        return { ...entry, signedUrl: undefined };
      }
    })
  );
}

export default function WorshipPage() {
  const { isQueen, isSlave, profile, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState<WorshipEntryWithSignedUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<WorshipEntryWithSignedUrl | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from("worship_entries")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const list = (data ?? []) as WorshipEntry[];
      const signed = await withSignedUrls(list);
      setEntries(signed);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not load worship";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  const onDeleted = (id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    if (editing?.id === id) setEditing(null);
  };

  const onUpdated = (entry: WorshipEntryWithSignedUrl) => {
    setEntries((prev) => prev.map((row) => (row.id === entry.id ? entry : row)));
    setEditing(null);
  };

  const onViewed = (id: string) => {
    const now = new Date().toISOString();
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === id ? { ...entry, viewed_at: now } : entry
      )
    );
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
            ? "Photos of you he offers in devotion — with love ratings and comments"
            : "Upload photos of Queen, describe your worship, and rate your love"}
        </p>
      </div>

      {isSlave && (
        <WorshipForm
          key={editing?.id ?? "create"}
          editingEntry={editing}
          onCancelEdit={() => setEditing(null)}
          onSuccess={load}
          onUpdated={onUpdated}
        />
      )}

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">
          {isQueen ? "His worship" : "Your offerings"}
        </h2>
        {loading && entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <WorshipGallery
            entries={entries}
            onDeleted={onDeleted}
            onChanged={load}
            onViewed={onViewed}
            onEdit={
              isSlave
                ? (entry) => {
                    setEditing(entry);
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
