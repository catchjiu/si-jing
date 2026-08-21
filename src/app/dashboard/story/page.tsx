"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookMarked, Pencil, Sparkles, Trash2, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Profile, Story } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { sanitizeStoryHtml } from "@/lib/sanitize-html";
import { signObjectUrl } from "@/lib/storage/client";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SignedAvatarImage } from "@/components/ui/signed-avatar-image";
import { StoryForm } from "@/components/story/story-form";
import { StoryCommentThread } from "@/components/story/story-comment-thread";
import { StoryHtmlView } from "@/components/story/story-rich-text-editor";
import { StoryCoverButton } from "@/components/story/story-cover-button";
import { StoryExtendDialog } from "@/components/story/story-extend-dialog";

type StoryAuthor = Pick<Profile, "id" | "username" | "role" | "avatar_url">;

type StoryRow = Story & {
  author?: StoryAuthor | null;
  coverSignedUrl?: string | null;
};

function authorInitials(name: string | undefined) {
  return (
    name
      ?.split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

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
  const [promptFirst, setPromptFirst] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [extending, setExtending] = useState<StoryRow | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from("stories")
        .select("*, author:users!author_id(id, username, role, avatar_url)")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      const rows = (data as StoryRow[]) ?? [];
      const withCovers = await Promise.all(
        rows.map(async (story) => {
          if (!story.cover_image_path) return { ...story, coverSignedUrl: null };
          try {
            const url = await signObjectUrl({
              bucket: "stories",
              path: story.cover_image_path,
              expiresIn: 60 * 60,
            });
            return { ...story, coverSignedUrl: url };
          } catch {
            return { ...story, coverSignedUrl: null };
          }
        })
      );
      setStories(withCovers);
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
              ? "Write from a prompt, extend a story with direction, or generate Grok covers"
              : "Prompt a full draft, polish with AI, extend with direction, and generate a cover"}
          </p>
        </div>
        {(isQueen || isSlave) && !showForm && !editingId && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-gold/30"
              onClick={() => {
                setPromptFirst(true);
                setShowForm(true);
              }}
            >
              <WandSparkles className="mr-2 h-4 w-4" />
              Write from prompt
            </Button>
            <Button
              type="button"
              className="bg-gold text-void hover:bg-gold-muted"
              onClick={() => {
                setPromptFirst(false);
                setShowForm(true);
              }}
            >
              <BookMarked className="mr-2 h-4 w-4" />
              New story
            </Button>
          </div>
        )}
      </div>

      {showForm && (
        <StoryForm
          key={promptFirst ? "new-story-prompt" : "new-story"}
          promptFirst={promptFirst}
          onCancel={() => {
            setShowForm(false);
            setPromptFirst(false);
          }}
          onSuccess={(id) => {
            setShowForm(false);
            setPromptFirst(false);
            setHighlightId(id);
            void load();
          }}
        />
      )}

      <section className="space-y-8">
        {stories.length === 0 ? (
          <div className="rounded-xl border border-gold/15 bg-charcoal/60 px-6 py-10 text-center text-sm text-muted-foreground">
            No stories yet. Write the first one.
          </div>
        ) : (
          <ul className="space-y-10">
            {stories.map((story) => {
              const mine = story.author_id === profile?.id;
              const isQueenAuthor = story.author?.role === "queen";
              const canEdit = mine;
              const canDelete = mine || isQueen;
              const isEditing = editingId === story.id;
              const safeHtml = sanitizeStoryHtml(story.body);
              const displayName =
                story.author?.username ??
                (isQueenAuthor ? "Queen Sisi" : "D");

              return (
                <li
                  key={story.id}
                  id={`story-${story.id}`}
                  className={cn(
                    "overflow-hidden rounded-xl border bg-charcoal/80",
                    story.id === highlightId || isEditing
                      ? "border-gold/40"
                      : "border-gold/15"
                  )}
                >
                  {isEditing ? (
                    <div className="p-4 sm:p-5">
                      <StoryForm
                        key={story.id}
                        story={story}
                        onCancel={() => setEditingId(null)}
                        onSuccess={(id) => {
                          setEditingId(null);
                          setHighlightId(id);
                          void load();
                        }}
                      />
                    </div>
                  ) : (
                    <article>
                      {/* Blog cover / heading band */}
                      <div className="relative">
                        {story.coverSignedUrl ? (
                          <div className="relative aspect-[16/9] w-full bg-void">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={story.coverSignedUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent" />
                            <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
                              <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-gold/90">
                                Story
                              </p>
                              <h2 className="font-heading text-2xl text-ivory sm:text-4xl">
                                {story.title}
                              </h2>
                            </div>
                          </div>
                        ) : (
                          <div className="border-b border-gold/10 bg-gradient-to-br from-royal/40 via-charcoal to-void px-4 py-8 sm:px-6 sm:py-10">
                            <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-gold/90">
                              Story
                            </p>
                            <h2 className="font-heading text-2xl text-ivory sm:text-4xl">
                              {story.title}
                            </h2>
                          </div>
                        )}
                      </div>

                      <div className="space-y-5 p-4 sm:p-6">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <Avatar className="shrink-0 ring-1 ring-gold/25">
                              <SignedAvatarImage
                                avatarUrl={story.author?.avatar_url}
                                alt={displayName}
                              />
                              <AvatarFallback
                                className={cn(
                                  "text-[11px]",
                                  isQueenAuthor
                                    ? "bg-gold/20 text-gold"
                                    : "bg-royal text-ivory/90"
                                )}
                              >
                                {authorInitials(displayName)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  "truncate text-sm font-medium",
                                  isQueenAuthor ? "text-gold" : "text-ivory"
                                )}
                              >
                                {displayName}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {isQueenAuthor ? "Queen" : "Slave"} ·{" "}
                                {formatRelative(story.updated_at)}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
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
                            {canEdit && (
                              <>
                                <StoryCoverButton
                                  storyId={story.id}
                                  hasCover={Boolean(story.cover_image_path)}
                                  lastPrompt={story.cover_prompt}
                                  onGenerated={() => void load()}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 border-gold/25 px-2 text-xs"
                                  onClick={() => setExtending(story)}
                                >
                                  <Sparkles className="mr-1 h-3 w-3" />
                                  Extend
                                </Button>
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
                              </>
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

                        <div className="story-prose mx-auto max-w-2xl text-base leading-relaxed text-ivory/90">
                          <StoryHtmlView html={safeHtml} />
                        </div>

                        {story.status === "published" ? (
                          <StoryCommentThread
                            storyId={story.id}
                            storyTitle={story.title}
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Draft — only you can see this until you publish.
                          </p>
                        )}
                      </div>
                    </article>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <StoryExtendDialog
        open={Boolean(extending)}
        onOpenChange={(open) => {
          if (!open) setExtending(null);
        }}
        storyId={extending?.id}
        title={extending?.title ?? ""}
        html={extending?.body ?? ""}
        persist
        onApplied={() => {
          if (extending) setHighlightId(extending.id);
          setExtending(null);
          void load();
        }}
      />
    </div>
  );
}
