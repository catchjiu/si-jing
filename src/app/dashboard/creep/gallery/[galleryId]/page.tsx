"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Ghost } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { signObjectUrl } from "@/lib/storage/client";
import { creepHubHref } from "@/lib/creep";
import { cn } from "@/lib/utils";
import { RoleSpeech } from "@/components/ui/role-speech";
import { CreepTopicForm } from "@/components/creep/creep-topic-form";
import { CreepUploadForm } from "@/components/creep/creep-upload-form";
import { CreepEntryGallery } from "@/components/creep/creep-entry-gallery";
import type {
  CreepEntry,
  CreepEntryWithSignedUrl,
  CreepGallery,
} from "@/lib/types";

async function withSignedUrls(
  entries: CreepEntry[]
): Promise<CreepEntryWithSignedUrl[]> {
  return Promise.all(
    entries.map(async (entry) => {
      try {
        const signedUrl =
          (await signObjectUrl({
            bucket: "creep",
            path: entry.image_path,
          })) ?? undefined;
        return { ...entry, signedUrl };
      } catch {
        return { ...entry, signedUrl: undefined };
      }
    })
  );
}

export default function CreepGalleryPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
    >
      <CreepGalleryPageInner />
    </Suspense>
  );
}

function CreepGalleryPageInner() {
  const params = useParams<{ galleryId: string }>();
  const searchParams = useSearchParams();
  const galleryId = params.galleryId;
  const focusEntryId = searchParams.get("entry");
  const focusCommentId = searchParams.get("comment");
  const { isQueen, isSlave, profile, loading: authLoading } = useAuth();
  const [gallery, setGallery] = useState<CreepGallery | null>(null);
  const [entries, setEntries] = useState<CreepEntryWithSignedUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const hasEntriesRef = useRef(false);
  hasEntriesRef.current = entries.length > 0 || !!gallery;
  const [editingGallery, setEditingGallery] = useState(false);
  const [editingEntry, setEditingEntry] =
    useState<CreepEntryWithSignedUrl | null>(null);

  const load = useCallback(async () => {
    if (!profile || !galleryId) return;
    if (!hasEntriesRef.current) setLoading(true);
    const supabase = createClient();

    try {
      const [
        { data: galleryRow, error: galleryError },
        { data: entryRows, error: entryError },
      ] = await Promise.all([
        supabase
          .from("creep_galleries")
          .select("*")
          .eq("id", galleryId)
          .maybeSingle(),
        supabase
          .from("creep_entries")
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

      setGallery(galleryRow as CreepGallery);
      const signed = await withSignedUrls((entryRows ?? []) as CreepEntry[]);
      setEntries(signed);

      if (isQueen && !galleryRow.viewed_at) {
        await supabase
          .from("creep_galleries")
          .update({ viewed_at: new Date().toISOString() })
          .eq("id", galleryId);
        setGallery({
          ...(galleryRow as CreepGallery),
          viewed_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load gallery");
    } finally {
      setLoading(false);
    }
  }, [profile, galleryId, isQueen]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  const onDeleted = (id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    if (editingEntry?.id === id) setEditingEntry(null);
  };

  const onUpdated = (entry: CreepEntryWithSignedUrl) => {
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
          href={creepHubHref()}
          className="inline-flex items-center gap-2 text-sm text-gold hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Creep
        </Link>
        <p className="text-sm text-muted-foreground">Gallery not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-heading flex items-center gap-3 text-xl text-gold sm:text-2xl">
            <Ghost className="h-6 w-6" />
            <RoleSpeech text={gallery.title} role="slave" />
          </h2>
          {gallery.description && (
            <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground">
              <RoleSpeech text={gallery.description} role="slave" />
            </p>
          )}
        </div>
        {isSlave &&
          !gallery.is_system &&
          gallery.created_by === profile?.id &&
          !editingGallery && (
            <button
              type="button"
              onClick={() => setEditingGallery(true)}
              className="text-sm text-gold hover:underline"
            >
              Edit gallery
            </button>
          )}
      </div>

      {isSlave && editingGallery && (
        <CreepTopicForm
          editingGallery={gallery}
          onCancelEdit={() => setEditingGallery(false)}
          onUpdated={(updated) => {
            setGallery(updated);
            setEditingGallery(false);
          }}
        />
      )}

      {isSlave && !editingGallery && (
        <CreepUploadForm
          key={editingEntry?.id ?? "create"}
          galleryId={gallery.id}
          galleryTitle={gallery.title}
          editingEntry={editingEntry}
          onCancelEdit={() => setEditingEntry(null)}
          onSuccess={load}
          onUpdated={onUpdated}
        />
      )}

      <section className={cn("space-y-4")}>
        <h3 className="font-heading text-lg text-gold">Gallery</h3>
        <CreepEntryGallery
          entries={entries}
          galleryId={gallery.id}
          galleryTitle={gallery.title}
          initialEntryId={focusEntryId}
          highlightCommentId={focusCommentId}
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
    </div>
  );
}
