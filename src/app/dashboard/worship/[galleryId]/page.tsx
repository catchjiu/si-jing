"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Crown } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { WorshipTopicForm } from "@/components/worship/worship-topic-form";
import { WorshipForm } from "@/components/worship/worship-form";
import { WorshipGallery } from "@/components/worship/worship-gallery";
import { WorshipGalleryCommentThread } from "@/components/worship/worship-gallery-comment-thread";
import { signWorshipEntryUrl } from "@/lib/worship-storage";
import { cn } from "@/lib/utils";
import { RoleSpeech } from "@/components/ui/role-speech";
import type {
  WorshipEntry,
  WorshipEntryWithSignedUrl,
  WorshipGalleryTopic,
} from "@/lib/types";

async function withSignedUrls(
  entries: WorshipEntry[]
): Promise<WorshipEntryWithSignedUrl[]> {
  return Promise.all(
    entries.map(async (entry) => {
      try {
        const signedUrl =
          (await signWorshipEntryUrl(entry)) ?? undefined;
        return { ...entry, signedUrl };
      } catch {
        return { ...entry, signedUrl: undefined };
      }
    })
  );
}

export default function WorshipGalleryPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <WorshipGalleryPageInner />
    </Suspense>
  );
}

function WorshipGalleryPageInner() {
  const params = useParams<{ galleryId: string }>();
  const searchParams = useSearchParams();
  const galleryId = params.galleryId;
  const focusEntryId = searchParams.get("entry");
  const focusGalleryCommentId = searchParams.get("galleryComment");
  const focusPhotoCommentId = searchParams.get("photoComment");
  const focusCommentsSection = searchParams.get("section") === "comments";
  const { isQueen, isSlave, profile, loading: authLoading } = useAuth();
  const [gallery, setGallery] = useState<WorshipGalleryTopic | null>(null);
  const [entries, setEntries] = useState<WorshipEntryWithSignedUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingGallery, setEditingGallery] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WorshipEntryWithSignedUrl | null>(null);

  const load = useCallback(async () => {
    if (!profile || !galleryId) return;
    setLoading(true);
    const supabase = createClient();

    try {
      const [{ data: galleryRow, error: galleryError }, { data: entryRows, error: entryError }] =
        await Promise.all([
          supabase
            .from("worship_galleries")
            .select("*")
            .eq("id", galleryId)
            .maybeSingle(),
          supabase
            .from("worship_entries")
            .select("*")
            .eq("gallery_id", galleryId)
            .order("created_at", { ascending: false }),
        ]);

      if (galleryError) throw galleryError;
      if (!galleryRow) {
        setGallery(null);
        setEntries([]);
        return;
      }
      if (entryError) throw entryError;

      setGallery(galleryRow as WorshipGalleryTopic);
      const signed = await withSignedUrls((entryRows ?? []) as WorshipEntry[]);
      setEntries(signed);

      if (isQueen && !galleryRow.viewed_at) {
        await supabase
          .from("worship_galleries")
          .update({ viewed_at: new Date().toISOString() })
          .eq("id", galleryId);
        setGallery({
          ...(galleryRow as WorshipGalleryTopic),
          viewed_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not load gallery";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [profile, galleryId, isQueen]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  useEffect(() => {
    if (!focusCommentsSection || loading) return;
    const el = document.getElementById("gallery-comments");
    if (!el) return;
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [focusCommentsSection, focusGalleryCommentId, loading]);

  const onDeleted = (id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    if (editingEntry?.id === id) setEditingEntry(null);
  };

  const onUpdated = (entry: WorshipEntryWithSignedUrl) => {
    setEntries((prev) => prev.map((row) => (row.id === entry.id ? entry : row)));
    setEditingEntry(null);
  };

  const onViewed = (id: string) => {
    const now = new Date().toISOString();
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === id ? { ...entry, viewed_at: now } : entry
      )
    );
  };

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!gallery) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/worship"
          className="inline-flex items-center gap-2 text-sm text-gold hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to galleries
        </Link>
        <p className="text-sm text-muted-foreground">Gallery not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link
          href="/dashboard/worship"
          className="inline-flex items-center gap-2 text-sm text-gold hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          All galleries
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl text-ivory flex items-center gap-3">
              <Crown className="h-7 w-7 text-gold" />
              <RoleSpeech text={gallery.topic} role="slave" />
            </h1>
            {gallery.description && (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground whitespace-pre-wrap">
                <RoleSpeech text={gallery.description} role="slave" />
              </p>
            )}
          </div>
          {isSlave && gallery.created_by === profile?.id && !editingGallery && (
            <button
              type="button"
              onClick={() => setEditingGallery(true)}
              className="text-sm text-gold hover:underline"
            >
              Edit gallery
            </button>
          )}
        </div>
      </div>

      {isSlave && editingGallery && (
        <WorshipTopicForm
          editingGallery={gallery}
          onCancelEdit={() => setEditingGallery(false)}
          onUpdated={(updated) => {
            setGallery(updated);
            setEditingGallery(false);
          }}
        />
      )}

      {isSlave && !editingGallery && (
        <WorshipForm
          key={editingEntry?.id ?? "create"}
          galleryId={gallery.id}
          galleryTopic={gallery.topic}
          editingEntry={editingEntry}
          onCancelEdit={() => setEditingEntry(null)}
          onSuccess={load}
          onUpdated={onUpdated}
        />
      )}

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">Photos</h2>
        <WorshipGallery
          entries={entries}
          galleryId={gallery.id}
          initialEntryId={focusEntryId}
          highlightPhotoCommentId={focusPhotoCommentId}
          onDeleted={onDeleted}
          onChanged={load}
          onViewed={onViewed}
          onEdit={
            isSlave
              ? (entry) => {
                  setEditingEntry(entry);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              : undefined
          }
        />
      </section>

      <section
        id="gallery-comments"
        className={cn(
          "rounded-xl border border-gold/15 bg-charcoal/60 p-5"
        )}
      >
        <WorshipGalleryCommentThread
          galleryId={gallery.id}
          galleryTopic={gallery.topic}
          highlightCommentId={focusGalleryCommentId}
        />
      </section>
    </div>
  );
}
