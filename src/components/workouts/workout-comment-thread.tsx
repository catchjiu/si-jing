"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Profile, WorkoutComment } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { formatRoleSpeech } from "@/lib/role-speech";
import {
  highlightMessageElement,
  inboxAnchors,
  queenWorkoutPageHref,
} from "@/lib/inbox-deep-links";
import { postToTopicThread } from "@/lib/inbox";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RoleSpeech } from "@/components/ui/role-speech";

type Props = {
  sessionId: string;
  sessionLabel?: string | null;
  highlightCommentId?: string | null;
  className?: string;
};

export function WorkoutCommentThread({
  sessionId,
  sessionLabel,
  highlightCommentId = null,
  className,
}: Props) {
  const { profile, isQueen, isSlave } = useAuth();
  const [messages, setMessages] = useState<WorkoutComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("workout_comments")
      .select("*, author:users!author_id(id, username, role)")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Could not load comments");
      setLoading(false);
      return;
    }
    setMessages((data as WorkoutComment[]) ?? []);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel(`workout-comments:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workout_comments",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId, load]);

  useEffect(() => {
    if (!highlightCommentId || loading) return;
    const timer = window.setTimeout(() => {
      highlightMessageElement(highlightCommentId);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [highlightCommentId, loading, messages.length]);

  const removeComment = async (message: WorkoutComment) => {
    if (!profile) return;
    const canDelete = message.author_id === profile.id || isQueen;
    if (!canDelete) return;
    if (!window.confirm("Delete this comment?")) return;

    setDeletingId(message.id);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("workout_comments")
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
        .from("workout_comments")
        .insert({
          session_id: sessionId,
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
        attachmentType: "workout",
        attachmentId: sessionId,
        attachmentAnchor: inboxAnchors.workoutComment(sessionId, commentId),
      });
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: isSlave
            ? "Comment on Queen workout"
            : "Queen commented on a workout",
          body: `${sessionLabel || "Queen workout"}${text ? `: ${text.slice(0, 80)}` : ""}`,
          url: queenWorkoutPageHref(sessionId, { commentId }),
          target: isSlave ? "queen" : "slave",
          kind: "workout_comment",
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
        <p className="text-xs text-muted-foreground">
          No comments yet. Queen can leave notes after she trains.
        </p>
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
            isQueen
              ? "How did it feel? Anything to change next time…"
              : "Note for Queen, form cue, or encouragement…"
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
