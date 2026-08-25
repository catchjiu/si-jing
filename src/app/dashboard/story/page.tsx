"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
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
import {
  clearStoryComposerDraft,
  readStoryComposerDraft,
  writeStoryComposerDraft,
  type StoryComposerDraft,
} from "@/lib/story-draft";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SignedAvatarImage } from "@/components/ui/signed-avatar-image";
import {
  StoryForm,
  type StoryFormDraftFields,
} from "@/components/story/story-form";
import { StoryCommentThread } from "@/components/story/story-comment-thread";
import { StoryCoverButton } from "@/components/story/story-cover-button";
import { StoryExtendDialog } from "@/components/story/story-extend-dialog";
import { StoryListenButton } from "@/components/story/story-listen-button";
import { StoryInsultsPanel } from "@/components/story/story-insults-panel";
import { StoryTimedBody } from "@/components/story/story-timed-body";
import {
  getStoryLockKind,
  storyViewWindowSelectValue,
  type StoryAccessGrant,
  type StoryAccessRequest,
} from "@/lib/story-access";

type StoryAuthor = Pick<Profile, "id" | "username" | "role" | "avatar_url">;

type StoryRow = Story & {
  author?: StoryAuthor | null;
  coverSignedUrl?: string | null;
  access_grants?: StoryAccessGrant[] | null;
  access_requests?: StoryAccessRequest[] | null;
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

function emptyDraftFields(): StoryFormDraftFields {
  return {
    title: "",
    body: "",
    status: "published",
    viewWindow: "none",
    generatePrompt: "",
  };
}

function readInitialComposerDraft(): StoryComposerDraft | null {
  if (typeof window === "undefined") return null;
  return readStoryComposerDraft();
}

function StoryPageInner() {
  const { isQueen, isSlave, profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const focusStoryId = searchParams.get("story");
  const focusCommentId = searchParams.get("comment");
  const autoListenStory = searchParams.get("listen") === "1";

  const [initialDraft] = useState<StoryComposerDraft | null>(
    readInitialComposerDraft
  );
  const restored = initialDraft;

  const [stories, setStories] = useState<StoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const hasLoadedRef = useRef(false);
  const [showForm, setShowForm] = useState(
    () => Boolean(restored?.showForm) && !restored?.editingId
  );
  const [promptFirst, setPromptFirst] = useState(
    () => Boolean(restored?.promptFirst) && !restored?.editingId
  );
  const [editingId, setEditingId] = useState<string | null>(
    () => restored?.editingId ?? null
  );
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [extending, setExtending] = useState<StoryRow | null>(null);
  const [tbcEditingId, setTbcEditingId] = useState<string | null>(
    () => restored?.tbcEditingId ?? null
  );
  const [draftFields, setDraftFields] = useState<StoryFormDraftFields>(() =>
    restored
      ? {
          title: restored.title,
          body: restored.body,
          status: restored.status,
          viewWindow: restored.viewWindow,
          generatePrompt: restored.generatePrompt,
        }
      : emptyDraftFields()
  );
  const [now, setNow] = useState(() => Date.now());
  /** When true, forms should seed from draftFields (session restore). */
  const [seedFromDraft, setSeedFromDraft] = useState(() =>
    Boolean(restored?.editingId || restored?.showForm)
  );

  const handleDraftFieldsChange = useCallback(
    (fields: StoryFormDraftFields) => {
      writeStoryComposerDraft({
        showForm,
        promptFirst,
        editingId,
        tbcEditingId,
        ...fields,
      });
    },
    [showForm, promptFirst, editingId, tbcEditingId]
  );

  const discardComposer = useCallback(() => {
    clearStoryComposerDraft();
    setSeedFromDraft(false);
    setShowForm(false);
    setPromptFirst(false);
    setEditingId(null);
    setTbcEditingId(null);
    setDraftFields(emptyDraftFields());
  }, []);

  const load = useCallback(async () => {
    if (!profile) return;
    // Keep the composer mounted on background refresh — flashing Loading
    // destroys TipTap / form state (and looked like “scroll cleared my story”).
    if (!hasLoadedRef.current) setLoading(true);
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from("stories")
        .select(
          "*, author:users!author_id(id, username, role, avatar_url), access_grants:story_access_grants(*), access_requests:story_access_requests(*)"
        )
        .order("created_at", { ascending: false });

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
      hasLoadedRef.current = true;
      setHasLoaded(true);
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
    const timed = stories.some((s) => s.viewable_until);
    if (!timed) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [stories]);

  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    const channel = supabase
      .channel("story-access")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "story_access_grants" },
        () => void load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "story_access_requests" },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile, load]);

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
    if (editingId === story.id) discardComposer();
    void load();
  };

  const editingStillPresent =
    !editingId || stories.some((story) => story.id === editingId);
  const composerOpen = showForm || (Boolean(editingId) && editingStillPresent);

  if (authLoading || (loading && !hasLoaded)) {
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
          {isSlave && (
            <p className="mt-1 text-sm text-muted-foreground">
              Prompt a full draft, set a reading window, polish with AI, extend
              with direction, generate a cover, and save insults in Queen’s voice
            </p>
          )}
        </div>
        {(isQueen || isSlave) && !composerOpen && (
          <div className="flex flex-wrap gap-2">
            {isSlave && (
              <Button
                type="button"
                variant="outline"
                className="border-gold/30"
                onClick={() => {
                  const fields = emptyDraftFields();
                  setDraftFields(fields);
                  setSeedFromDraft(false);
                  setEditingId(null);
                  setTbcEditingId(null);
                  setPromptFirst(true);
                  setShowForm(true);
                  writeStoryComposerDraft({
                    showForm: true,
                    promptFirst: true,
                    editingId: null,
                    tbcEditingId: null,
                    ...fields,
                  });
                }}
              >
                <WandSparkles className="mr-2 h-4 w-4" />
                Write from prompt
              </Button>
            )}
            <Button
              type="button"
              className="bg-gold text-void hover:bg-gold-muted"
              onClick={() => {
                const fields = emptyDraftFields();
                setDraftFields(fields);
                setSeedFromDraft(false);
                setEditingId(null);
                setTbcEditingId(null);
                setPromptFirst(false);
                setShowForm(true);
                writeStoryComposerDraft({
                  showForm: true,
                  promptFirst: false,
                  editingId: null,
                  tbcEditingId: null,
                  ...fields,
                });
              }}
            >
              <BookMarked className="mr-2 h-4 w-4" />
              New story
            </Button>
          </div>
        )}
      </div>

      {isSlave && <StoryInsultsPanel />}

      {showForm && (
        <StoryForm
          key={promptFirst ? "new-story-prompt" : "new-story"}
          promptFirst={promptFirst}
          draftFields={seedFromDraft ? draftFields : null}
          onDraftFieldsChange={handleDraftFieldsChange}
          onCancel={discardComposer}
          onSuccess={(id) => {
            discardComposer();
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
              const grants = story.access_grants ?? [];
              const requests = story.access_requests ?? [];
              const lockKind = profile
                ? getStoryLockKind({
                    authorId: story.author_id,
                    status: story.status,
                    viewableUntil: story.viewable_until,
                    tbcLocked: story.tbc_locked,
                    html: story.body,
                    viewerId: profile.id,
                    grants,
                    now,
                  })
                : "none";
              const locked = lockKind !== "none";
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
                        key={`${story.id}-${tbcEditingId === story.id ? "tbc" : "edit"}`}
                        story={story}
                        startWithTbc={tbcEditingId === story.id}
                        draftFields={seedFromDraft ? draftFields : null}
                        onDraftFieldsChange={handleDraftFieldsChange}
                        onCancel={discardComposer}
                        onSuccess={(id) => {
                          discardComposer();
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
                            <StoryListenButton
                              key={story.id}
                              storyId={story.id}
                              title={story.title}
                              lockKind={lockKind}
                              autoListen={
                                autoListenStory && focusStoryId === story.id
                              }
                            />
                            {canEdit && (
                              <>
                                <StoryCoverButton
                                  storyId={story.id}
                                  hasCover={Boolean(story.cover_image_path)}
                                  coverImagePath={story.cover_image_path}
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
                                  className="h-7 border-gold/25 px-2 text-xs text-gold"
                                  onClick={() => {
                                    const nextFields: StoryFormDraftFields = {
                                      title: story.title,
                                      body: story.body,
                                      status: story.status,
                                      viewWindow: storyViewWindowSelectValue(
                                        story.view_window_minutes
                                      ),
                                      generatePrompt: "",
                                    };
                                    setDraftFields(nextFields);
                                    setShowForm(false);
                                    setPromptFirst(false);
                                    setSeedFromDraft(false);
                                    setTbcEditingId(story.id);
                                    setEditingId(story.id);
                                    writeStoryComposerDraft({
                                      showForm: false,
                                      promptFirst: false,
                                      editingId: story.id,
                                      tbcEditingId: story.id,
                                      ...nextFields,
                                    });
                                  }}
                                >
                                  TBC
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 border-gold/25 px-2 text-xs"
                                  onClick={() => {
                                    const nextFields: StoryFormDraftFields = {
                                      title: story.title,
                                      body: story.body,
                                      status: story.status,
                                      viewWindow: storyViewWindowSelectValue(
                                        story.view_window_minutes
                                      ),
                                      generatePrompt: "",
                                    };
                                    setDraftFields(nextFields);
                                    setShowForm(false);
                                    setPromptFirst(false);
                                    setSeedFromDraft(false);
                                    setTbcEditingId(null);
                                    setEditingId(story.id);
                                    writeStoryComposerDraft({
                                      showForm: false,
                                      promptFirst: false,
                                      editingId: story.id,
                                      tbcEditingId: null,
                                      ...nextFields,
                                    });
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

                        <StoryTimedBody
                          storyId={story.id}
                          storyTitle={story.title}
                          html={safeHtml}
                          authorId={story.author_id}
                          status={story.status}
                          viewWindowMinutes={story.view_window_minutes}
                          viewableUntil={story.viewable_until}
                          tbcLocked={story.tbc_locked}
                          grants={grants}
                          requests={requests}
                          lockKind={lockKind}
                          onChanged={() => void load()}
                        />

                        {story.status === "published" && !locked ? (
                          <StoryCommentThread
                            storyId={story.id}
                            storyTitle={story.title}
                          />
                        ) : story.status === "published" && locked ? (
                          <p className="text-xs text-muted-foreground">
                            Comments unlock with the story.
                          </p>
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
