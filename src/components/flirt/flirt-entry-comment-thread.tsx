"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageSquare, Send, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Profile } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { formatRoleSpeech } from "@/lib/role-speech";
import { flirtPageHref } from "@/lib/inbox-deep-links";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RoleSpeech } from "@/components/ui/role-speech";

type FlirtEntryComment = {
  id: string;
  entry_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: Pick<Profile, "id" | "username" | "role"> | null;
};

type Props = {
  entryId: string;
  guyId: string;
  guyName: string;
  defaultExpanded?: boolean;
  className?: string;
};

export function FlirtEntryCommentThread({
  entryId,
  guyId,
  guyName,
  defaultExpanded = false,
  className,
}: Props) {
  const { profile, isQueen, isSlave } = useAuth();
  const [comments, setComments] = useState<FlirtEntryComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (defaultExpanded) setExpanded(true);
  }, [defaultExpanded]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("flirt_entry_comments")
      .select("*, author:users!author_id(id, username, role)")
      .eq("entry_id", entryId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Could not load comments");
      setLoading(false);
      return;
    }
    setComments((data as FlirtEntryComment[]) ?? []);
    setLoading(false);
  }, [entryId]);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel(`flirt-entry-comments:${entryId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "flirt_entry_comments",
          filter: `entry_id=eq.${entryId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [entryId, load]);

  const removeComment = async (comment: FlirtEntryComment) => {
    if (!profile) return;
    const canDelete = comment.author_id === profile.id || isQueen;
    if (!canDelete) return;
    if (!window.confirm("Delete this comment?")) return;

    setDeletingId(comment.id);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("flirt_entry_comments")
        .delete()
        .eq("id", comment.id);
      if (error) throw error;
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
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
      const { data: row, error } = await supabase
        .from("flirt_entry_comments")
        .insert({
          entry_id: entryId,
          author_id: profile.id,
          content: text,
        })
        .select("id")
        .single();
      if (error) throw error;

      setDraft("");
      setExpanded(true);
      void load();
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: isSlave ? "Comment on flirt timeline" : "Queen replied on flirt timeline",
          body: `${guyName}: ${text.slice(0, 80)}`,
          url: flirtPageHref(guyId, {
            entryId,
            commentId: row.id,
          }),
          target: isSlave ? "queen" : "slave",
          kind: "flirt_entry_comment",
        })
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSending(false);
    }
  };

  if (!isQueen && !isSlave) return null;

  const count = comments.length;

  return (
    <div className={cn("mt-3 border-t border-gold/10 pt-3", className)}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-gold"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        {loading
          ? "Comments…"
          : count === 0
            ? "Comment"
            : `${count} comment${count === 1 ? "" : "s"}`}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No comments yet.</p>
          ) : (
            <ul className="space-y-2">
              {comments.map((c) => {
                const mine = c.author_id === profile?.id;
                const isQueenAuthor = c.author?.role === "queen";
                const canDelete = mine || isQueen;
                return (
                  <li
                    key={c.id}
                    className={cn(
                      "rounded-lg border px-3 py-2",
                      mine
                        ? "ml-2 border-gold/25 bg-gold/5"
                        : "mr-2 border-royal/40 bg-royal/15"
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "text-[11px] font-medium",
                          isQueenAuthor ? "text-gold" : "text-ivory/80"
                        )}
                      >
                        {c.author?.username ?? "Someone"}
                        {isQueenAuthor ? " · Queen" : ""}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          {formatRelative(c.created_at)}
                        </span>
                        {canDelete && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                            disabled={deletingId === c.id}
                            aria-label="Delete comment"
                            onClick={() => void removeComment(c)}
                          >
                            {deletingId === c.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-ivory/90">
                      <RoleSpeech text={c.content} role={c.author?.role} />
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex gap-2 pt-1">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder={
                isSlave
                  ? `React to this entry about ${guyName}…`
                  : "Reply on this entry…"
              }
              className="min-h-0 flex-1 border-gold/20 bg-void/60 text-sm"
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
              className="shrink-0 self-end bg-gold text-void hover:bg-gold-muted"
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
