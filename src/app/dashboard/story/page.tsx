"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookMarked, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Profile, Story } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { sanitizeStoryHtml } from "@/lib/sanitize-html";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StoryForm } from "@/components/story/story-form";
import { StoryCommentThread } from "@/components/story/story-comment-thread";
import { StoryHtmlView } from "@/components/story/story-rich-text-editor";

type StoryRow = Story & {
  author?: Pick<Profile, "id" | "username" | "role"> | null;
};

export default function StoryPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <StoryPageInner />
    </Suspense>
  );
}

function StoryPageInner() {
  const { isQueen, isSlave, profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const focusStoryId = searchParams.get("story");
  const focusCommentId = searchParams.get("comment");

  const [stories, setStories] = useState<StoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from("stories")
        .select("*, author:users!author_id(id, username, role)")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setStories((data as StoryRow[]) ?? []);
    } catch (err) {
      console.error("Failed to load stories", err);
      toast.error("Could not load stories");
      setStories([]);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  useEffect(() => {
    if (!focusStoryId || loading) return;
    setHighlightId(focusStoryId);
    const el = document.getElementById(`story-${focusStoryId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (focusCommentId) {
      window.setTimeout(() => {
        document
          .getElementById(`story-comment-${focusCommentId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 350);
    }
  }, [focusStoryId, focusCommentId, loading, stories]);

  const editingStory = useMemo(
    () => stories.find((s) => s.id === editingId) ?? null,
    [stories, editingId]
  );

  const removeStory = async (story: StoryRow) => {
    if (!profile) return;
    const canDelete = story.author_id === profile.id || isQueen;
    if (!canDelete) return;
    if (!window.confirm(`Delete “${story.title}”?`)) return;

    const supabase = createClient();
    const { error } = await supabase.from("stories").delete().eq("id", story.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Story deleted");
    if (editingId === story.id) setEditingId(null);
    void load();
  };

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading flex items-center gap-3 text-2xl text-ivory sm:text-3xl">
            <BookMarked className="h-7 w-7 text-gold" />
            Story
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isQueen
              ? "Write or read shared stories — comment when something moves you"
              : "Write stories with rich text, polish with Claude, share with Queen"}
          </p>
        </div>
        {(isQueen || isSlave) && !showForm && !editingId && (
          <Button
            type="button"
            className="bg-gold text-void hover:bg-gold-muted"
            onClick={() => setShowForm(true)}
          >
            <BookMarked className="mr-2 h-4 w-4" />
            New story
          </Button>
        )}
      </div>

      {(showForm || editingStory) && (
        <StoryForm
          story={editingStory}
          onCancel={() => {
            setShowForm(false);
            setEditingId(null);
          }}
          onSuccess={(id) => {
            setShowForm(false);
            setEditingId(null);
            setHighlightId(id);
            void load();
          }}
        />
      )}

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">Stories</h2>
        {stories.length === 0 ? (
          <div className="rounded-xl border border-gold/15 bg-charcoal/60 px-6 py-10 text-center text-sm text-muted-foreground">
            No stories yet. Write the first one.
          </div>
        ) : (
          <ul className="space-y-4">
            {stories.map((story) => {
              const mine = story.author_id === profile?.id;
              const isQueenAuthor = story.author?.role === "queen";
              const canEdit = mine;
              const canDelete = mine || isQueen;
              const isEditing = editingId === story.id;
              const safeHtml = sanitizeStoryHtml(story.body);

              if (isEditing) return null;

              return (
                <li
                  key={story.id}
                  id={`story-${story.id}`}
                  className={cn(
                    "rounded-xl border bg-charcoal/80 p-4 sm:p-5",
                    story.id === highlightId
                      ? "border-gold/40"
                      : "border-gold/15"
                  )}
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-lg text-ivory">
                      {story.title}
                    </h3>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] uppercase tracking-wider",
                        story.status === "draft"
                          ? "border-muted text-muted-foreground"
                          : "border-gold/40 text-gold"
                      )}
                    >
                      {story.status}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] uppercase tracking-wider",
                        isQueenAuthor
                          ? "border-gold/40 text-gold"
                          : "border-royal/50 text-ivory/80"
                      )}
                    >
                      {story.author?.username ??
                        (isQueenAuthor ? "Queen" : "D")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatRelative(story.updated_at)}
                    </span>
                    <div className="ml-auto flex gap-1">
                      {canEdit && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 border-gold/25 px-2 text-xs"
                          onClick={() => {
                            setShowForm(false);
                            setEditingId(story.id);
                          }}
                        >
                          <Pencil className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                          onClick={() => void removeStory(story)}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>

                  <StoryHtmlView html={safeHtml} />

                  {story.status === "published" ? (
                    <div className="mt-4">
                      <StoryCommentThread
                        storyId={story.id}
                        storyTitle={story.title}
                      />
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-muted-foreground">
                      Draft — only you can see this until you publish.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
