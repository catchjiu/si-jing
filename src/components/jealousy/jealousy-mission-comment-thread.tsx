"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { JealousyMissionComment, Profile } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { formatRoleSpeech } from "@/lib/role-speech";
import {
  highlightMessageElement,
  inboxAnchors,
  jealousyPageHref,
} from "@/lib/inbox-deep-links";
import { postToTopicThread } from "@/lib/inbox";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RoleSpeech } from "@/components/ui/role-speech";

type Props = {
  missionId: string;
  missionLabel?: string | null;
  highlightCommentId?: string | null;
  className?: string;
};

export function JealousyMissionCommentThread({
  missionId,
  missionLabel,
  highlightCommentId = null,
  className,
}: Props) {
  const { profile, isQueen, isSlave } = useAuth();
  const [messages, setMessages] = useState<JealousyMissionComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("jealousy_mission_comments")
      .select("*, author:users!author_id(id, username, role)")
      .eq("mission_id", missionId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Could not load comments");
      setLoading(false);
      return;
    }
    setMessages((data as JealousyMissionComment[]) ?? []);
    setLoading(false);
  }, [missionId]);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel(`jealousy-mission-comments:${missionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jealousy_mission_comments",
          filter: `mission_id=eq.${missionId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [missionId, load]);

  useEffect(() => {
    if (!highlightCommentId || loading) return;
    const timer = window.setTimeout(() => {
      highlightMessageElement(highlightCommentId);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [highlightCommentId, loading, messages.length]);

  const removeComment = async (message: JealousyMissionComment) => {
    if (!profile) return;
    const canDelete = message.author_id === profile.id || isQueen;
    if (!canDelete) return;
    if (!window.confirm("Delete this comment?")) return;

    setDeletingId(message.id);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("jealousy_mission_comments")
        .delete()
        .eq("id", message.id);
      if (error) throw error;
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      toast.success("Comment deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setDeletingId(null);
    }
  };

  const send = async () => {
    if (!profile || !draft.trim()) return;
    setSending(true);
    const supabase = createClient();
    const text = formatRoleSpeech(draft.trim(), profile.role);
    try {
      const { data, error } = await supabase
        .from("jealousy_mission_comments")
        .insert({
          mission_id: missionId,
          author_id: profile.id,
          content: text,
        })
        .select("id")
        .single();
      if (error) throw error;

      const commentId = data.id as string;
      setDraft("");
      void load();
      void postToTopicThread(supabase, {
        topic: "general",
        senderId: profile.id,
        content: text,
        attachmentType: "jealousy_mission",
        attachmentId: missionId,
        attachmentAnchor: inboxAnchors.jealousyMissionComment(
          missionId,
          commentId
        ),
      });
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: isSlave
            ? "Comment on jealousy mission"
            : "Queen replied on jealousy mission",
          body: `${missionLabel || "Mission"}${text ? `: ${text.slice(0, 80)}` : ""}`,
          url: jealousyPageHref(missionId, { commentId }),
          target: isSlave ? "queen" : "slave",
          kind: "jealousy_mission_comment",
        })
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSending(false);
    }
  };

  if (!isQueen && !isSlave) return null;

  return (
    <div
      className={cn(
        "space-y-4 rounded-xl border border-gold/15 bg-charcoal/60 p-4",
        className
      )}
    >
      <h3 className="font-heading text-lg text-gold">Comments</h3>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading comments…</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => {
            const mine = m.author_id === profile?.id;
            const author = m.author as Pick<
              Profile,
              "id" | "username" | "role"
            > | null;
            const isQueenAuthor = author?.role === "queen";
            const canDelete = mine || isQueen;
            return (
              <li
                key={m.id}
                id={`inbox-focus-${m.id}`}
                className={cn(
                  "rounded-lg border px-3 py-2",
                  mine
                    ? "ml-3 border-gold/25 bg-gold/5"
                    : "mr-3 border-royal/40 bg-royal/15"
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      isQueenAuthor ? "text-gold" : "text-ivory/80"
                    )}
                  >
                    {author?.username ?? "Someone"}
                    {isQueenAuthor ? " · Queen" : ""}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">
                      {formatRelative(m.created_at)}
                    </span>
                    {canDelete && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                        disabled={deletingId === m.id}
                        aria-label="Delete comment"
                        onClick={() => void removeComment(m)}
                      >
                        {deletingId === m.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm text-ivory/90">
                  <RoleSpeech text={m.content} role={author?.role} />
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2 border-t border-gold/10 pt-4">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder={
            isSlave
              ? `Comment on ${missionLabel || "this mission"}…`
              : `Reply on ${missionLabel || "this mission"}…`
          }
          className="border-gold/20 bg-void/60"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          disabled={sending || !draft.trim()}
          onClick={() => void send()}
          className="bg-gold text-void hover:bg-gold-muted"
        >
          {sending ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="mr-2 h-3.5 w-3.5" />
          )}
          Send
        </Button>
      </div>
    </div>
  );
}
