"use client";

import { useEffect, useState } from "react";
import { Clock, Loader2, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { notifyPush } from "@/lib/push-client";
import { postToTopicThread } from "@/lib/inbox";
import { storyPageHref } from "@/lib/inbox-deep-links";
import {
  formatStoryReadWindow,
  getStoryLockKind,
  isStoryWindowExpired,
  pendingStoryAccessRequest,
  splitStoryAtLastTbc,
  storyViewWindowLabel,
  type StoryAccessGrant,
  type StoryAccessRequest,
  type StoryLockKind,
} from "@/lib/story-access";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StoryHtmlView } from "@/components/story/story-rich-text-editor";

type Props = {
  storyId: string;
  storyTitle: string;
  html: string;
  authorId: string;
  status?: string;
  viewWindowMinutes?: number | null;
  viewableUntil?: string | null;
  tbcLocked?: boolean | null;
  grants: StoryAccessGrant[];
  requests: StoryAccessRequest[];
  lockKind: StoryLockKind;
  onChanged: () => void;
};

export function StoryTimedBody({
  storyId,
  storyTitle,
  html,
  authorId,
  status = "published",
  viewWindowMinutes,
  viewableUntil,
  tbcLocked,
  grants,
  requests,
  lockKind,
  onChanged,
}: Props) {
  const { profile, isQueen } = useAuth();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const timed = Boolean(viewableUntil || viewWindowMinutes);
  const expired = isStoryWindowExpired(viewableUntil, now);
  const mine = profile?.id === authorId;
  const liveLock = profile
    ? getStoryLockKind({
        authorId,
        status: "published",
        viewableUntil,
        tbcLocked,
        html,
        viewerId: profile.id,
        grants,
        now,
      })
    : lockKind;
  const myPending = profile
    ? pendingStoryAccessRequest(requests, profile.id)
    : undefined;
  const pendingForAuthor = requests.filter((r) => r.status === "pending");
  const alreadyGranted = grants.some((g) => g.grantee_id !== authorId);
  const { preview, remainder } = splitStoryAtLastTbc(html);

  useEffect(() => {
    if (!viewableUntil || expired) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [viewableUntil, expired]);

  const requestAccess = async () => {
    if (!profile) return;
    setBusy(true);
    const supabase = createClient();
    try {
      if (myPending) {
        toast.message("Access already requested");
        return;
      }
      const existing = requests.find((r) => r.requester_id === profile.id);
      if (existing) {
        const { error } = await supabase
          .from("story_access_requests")
          .update({
            status: "pending",
            responded_at: null,
          })
          .eq("id", existing.id)
          .eq("requester_id", profile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("story_access_requests").insert({
          story_id: storyId,
          requester_id: profile.id,
          status: "pending",
        });
        if (error) throw error;
      }

      toast.success("Access requested");
      void notifyPush({
        title: isQueen ? "Queen requested story access" : "Story access requested",
        body: storyTitle,
        url: storyPageHref(storyId),
        kind: "story",
      });
      void postToTopicThread(supabase, {
        topic: "general",
        senderId: profile.id,
        content: `Requested access to story: ${storyTitle}`,
        attachmentType: "story",
        attachmentId: storyId,
      });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not request access");
    } finally {
      setBusy(false);
    }
  };

  const grantAccess = async (granteeId: string) => {
    if (!profile || !mine) return;
    setBusy(true);
    const supabase = createClient();
    const nowIso = new Date().toISOString();
    try {
      const { error: grantError } = await supabase
        .from("story_access_grants")
        .insert({
          story_id: storyId,
          grantee_id: granteeId,
          granted_by: profile.id,
          granted_at: nowIso,
        });
      if (grantError && grantError.code !== "23505") throw grantError;

      await supabase
        .from("story_access_requests")
        .update({ status: "granted", responded_at: nowIso })
        .eq("story_id", storyId)
        .eq("requester_id", granteeId);

      toast.success("Access granted");
      void notifyPush({
        title: "Story access granted",
        body: storyTitle,
        url: storyPageHref(storyId),
        kind: "story",
      });
      void postToTopicThread(supabase, {
        topic: "general",
        senderId: profile.id,
        content: `Granted access to story: ${storyTitle}`,
        attachmentType: "story",
        attachmentId: storyId,
      });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not grant access");
    } finally {
      setBusy(false);
    }
  };

  const grantToRequesterOrPartner = async () => {
    if (pendingForAuthor[0]) {
      await grantAccess(pendingForAuthor[0].requester_id);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("users")
      .select("id")
      .in("role", ["queen", "slave"])
      .neq("id", authorId)
      .limit(1)
      .maybeSingle();
    if (!data?.id) {
      toast.error("No one to grant access to");
      return;
    }
    await grantAccess(data.id as string);
  };

  const requestButton = myPending ? (
    <p className="text-xs uppercase tracking-wider text-gold/80">
      Access requested
    </p>
  ) : (
    <Button
      type="button"
      className="bg-gold text-void hover:bg-gold-muted"
      disabled={busy}
      onClick={() => void requestAccess()}
    >
      {busy ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Lock className="mr-2 h-4 w-4" />
      )}
      Request access
    </Button>
  );

  return (
    <div className="space-y-4">
      {(timed || tbcLocked || liveLock === "tbc") && (
        <div className="flex flex-wrap items-center gap-2">
          {timed && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] uppercase tracking-wider",
                expired
                  ? "border-rose-400/40 text-rose-300"
                  : "border-gold/40 text-gold"
              )}
            >
              <Clock className="mr-1 h-3 w-3" />
              {viewableUntil
                ? formatStoryReadWindow(viewableUntil, now)
                : storyViewWindowLabel(viewWindowMinutes)}
            </Badge>
          )}
          {(tbcLocked || liveLock === "tbc") && (
            <Badge
              variant="outline"
              className="border-gold/40 text-[10px] uppercase tracking-wider text-gold"
            >
              To be continued
            </Badge>
          )}
          {mine && alreadyGranted && (
            <Badge
              variant="outline"
              className="border-gold/30 text-[10px] uppercase tracking-wider text-gold/80"
            >
              Access granted
            </Badge>
          )}
        </div>
      )}

      {mine &&
        status === "published" &&
        (expired || Boolean(tbcLocked)) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/20 bg-void/40 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">
            {alreadyGranted
              ? tbcLocked
                ? "They can read past the To be continued break."
                : "The window closed. You already unlocked this story for them."
              : pendingForAuthor.length > 0
                ? tbcLocked
                  ? "They asked to keep reading past To be continued."
                  : "They asked to keep reading after the window closed."
                : tbcLocked
                  ? "The rest is locked behind To be continued. You can unlock it for them."
                  : "The reading window is closed. You can still unlock it for them."}
          </p>
          {!alreadyGranted && (
            <Button
              type="button"
              size="sm"
              className="h-7 bg-gold px-2.5 text-xs text-void hover:bg-gold-muted"
              disabled={busy}
              onClick={() => void grantToRequesterOrPartner()}
            >
              {busy ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Unlock className="mr-1 h-3 w-3" />
              )}
              Grant access
            </Button>
          )}
        </div>
      )}

      {liveLock === "full" ? (
        <div className="relative min-h-[12rem] overflow-hidden rounded-lg">
          <div
            className="pointer-events-none max-h-72 select-none overflow-hidden blur-[10px]"
            aria-hidden
          >
            <StoryHtmlView html={html} />
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-void/55 px-4 text-center">
            <Lock className="h-6 w-6 text-gold" />
            <p className="max-w-sm text-sm text-ivory/90">
              The reading window closed. The cover stays, but the story is locked.
            </p>
            {requestButton}
          </div>
        </div>
      ) : liveLock === "tbc" ? (
        <div className="story-prose mx-auto max-w-2xl space-y-4 text-base leading-relaxed text-ivory/90">
          {preview ? <StoryHtmlView html={preview} /> : null}
          <div className="rounded-lg border border-gold/30 bg-void/50 px-4 py-6 text-center">
            <p className="font-heading text-xl italic tracking-wide text-gold">
              To be continued
            </p>
            <p className="mt-2 text-sm text-ivory/80">
              Request access to read what happens next.
            </p>
            <div className="mt-4 flex justify-center">{requestButton}</div>
          </div>
          {remainder ? (
            <div className="relative max-h-48 overflow-hidden rounded-lg">
              <div
                className="pointer-events-none select-none blur-[10px]"
                aria-hidden
              >
                <StoryHtmlView html={remainder} />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent" />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="story-prose mx-auto max-w-2xl text-base leading-relaxed text-ivory/90">
          <StoryHtmlView html={html} />
        </div>
      )}
    </div>
  );
}
