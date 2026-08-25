"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Profile, Story } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { sanitizeStoryHtml } from "@/lib/sanitize-html";
import { signObjectUrl } from "@/lib/storage/client";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SignedAvatarImage } from "@/components/ui/signed-avatar-image";
import { StoryCommentThread } from "@/components/story/story-comment-thread";
import { StoryListenButton } from "@/components/story/story-listen-button";
import { StoryTimedBody } from "@/components/story/story-timed-body";
import {
  getStoryLockKind,
  type StoryAccessGrant,
  type StoryAccessRequest,
} from "@/lib/story-access";
import { storyPageHref } from "@/lib/inbox-deep-links";

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

export default function StoryReadPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
    >
      <StoryReadInner />
    </Suspense>
  );
}

function StoryReadInner() {
  const { profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const storyId = searchParams.get("story")?.trim() || "";

  const [story, setStory] = useState<StoryRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    if (!profile || !storyId) {
      setLoading(false);
      setMissing(!storyId);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from("stories")
        .select(
          "*, author:users!author_id(id, username, role, avatar_url), access_grants:story_access_grants(*), access_requests:story_access_requests(*)"
        )
        .eq("id", storyId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setStory(null);
        setMissing(true);
        return;
      }

      const row = data as StoryRow;
      let coverSignedUrl: string | null = null;
      if (row.cover_image_path) {
        try {
          coverSignedUrl = await signObjectUrl({
            bucket: "stories",
            path: row.cover_image_path,
            expiresIn: 60 * 60,
          });
        } catch {
          coverSignedUrl = null;
        }
      }
      setMissing(false);
      setStory({ ...row, coverSignedUrl });
    } catch {
      setStory(null);
      setMissing(true);
    } finally {
      setLoading(false);
    }
  }, [profile, storyId]);

  useEffect(() => {
    if (authLoading) return;
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [authLoading, load]);

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (missing || !story) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Story not found.</p>
        <Link
          href="/dashboard/story"
          className="inline-flex items-center gap-1.5 text-sm text-gold hover:text-gold-muted"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to stories
        </Link>
      </div>
    );
  }

  const displayName = story.author?.username || "Unknown";
  const isQueenAuthor = story.author?.role === "queen";
  const grants = story.access_grants ?? [];
  const requests = story.access_requests ?? [];
  const safeHtml = sanitizeStoryHtml(story.body);
  const lockKind = getStoryLockKind({
    authorId: story.author_id,
    status: story.status,
    viewableUntil: story.viewable_until,
    tbcLocked: story.tbc_locked,
    html: safeHtml,
    viewerId: profile?.id ?? "",
    grants,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={storyPageHref(story.id)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-gold"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Stories
        </Link>
        <StoryListenButton
          storyId={story.id}
          title={story.title}
          lockKind={lockKind}
        />
      </div>

      <article className="overflow-hidden rounded-xl border border-gold/15 bg-charcoal/40">
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
                <h1 className="font-heading text-2xl text-ivory sm:text-4xl">
                  {story.title}
                </h1>
              </div>
            </div>
          ) : (
            <div className="border-b border-gold/10 bg-gradient-to-br from-royal/40 via-charcoal to-void px-4 py-8 sm:px-6 sm:py-10">
              <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-gold/90">
                Story
              </p>
              <h1 className="font-heading text-2xl text-ivory sm:text-4xl">
                {story.title}
              </h1>
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
                  {formatRelative(story.created_at)}
                </p>
              </div>
            </div>
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
            fullView
          />

          <StoryCommentThread storyId={story.id} storyTitle={story.title} />
        </div>
      </article>
    </div>
  );
}
