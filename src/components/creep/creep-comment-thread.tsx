"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Profile } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { formatRoleSpeech } from "@/lib/role-speech";
import { notifyCreepThread } from "@/lib/inbox";
import { inboxAnchors } from "@/lib/inbox-deep-links";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RoleSpeech } from "@/components/ui/role-speech";

type CreepCommentRow = {
  id: string;
  entry_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: Pick<Profile, "id" | "username" | "role"> | null;
};

type Props = {
  entryId: string;
  galleryId: string;
  galleryTitle?: string | null;
  highlightCommentId?: string | null;
  className?: string;
};

export function CreepCommentThread({
  entryId,
  galleryId,
  galleryTitle,
  highlightCommentId = null,
  className,
}: Props) {
  const { profile, isQueen, isSlave } = useAuth();
  const [messages, setMessages] = useState<CreepCommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("creep_comments")
      .select("*, author:users!author_id(id, username, role)")
      .eq("entry_id", entryId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Could not load comments");
      setLoading(false);
      return;
    }
    setMessages((data as CreepCommentRow[]) ?? []);
    setLoading(false);
  }, [entryId]);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel(`creep-comments:${entryId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "creep_comments",
          filter: `entry_id=eq.${entryId}`,
        },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [entryId, load]);

  useEffect(() => {
    if (!highlightCommentId || loading) return;
    document
      .getElementById(`creep-comment-${highlightCommentId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightCommentId, loading, messages]);

  const removeComment = async (message: CreepCommentRow) => {
    if (!profile) return;
    const canDelete = message.author_id === profile.id || isQueen;
    if (!canDelete) return;
    if (!window.confirm("Delete this comment?")) return;

    setDeletingId(message.id);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("creep_comments")
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
      const { data: inserted, error } = await supabase
        .from("creep_comments")
        .insert({
          entry_id: entryId,
          author_id: profile.id,
          content: text,
        })
        .select("id")
        .single();
      if (error) throw error;

      setDraft("");
      void load();
      void notifyCreepThread(supabase, {
        senderId: profile.id,
        content: text,
        galleryId,
        attachmentAnchor: inboxAnchors.creepPhotoComment(
          entryId,
          (inserted?.id as string | undefined) ?? ""
        ),
        pushTitle: isQueen
          ? "Queen commented in Creep"
          : "New comment in Creep",
        pushBody: text.slice(0, 80),
        notifyTarget: isQueen ? "slave" : "queen",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSending(false);
    }
  };

  if (!isQueen && !isSlave) return null;

  return (
    <div className={cn("space-y-3 border-t border-gold/10 pt-3", className)}>
      <h3 className="text-xs font-medium uppercase tracking-wider text-gold/80">
        Comments
        {galleryTitle ? ` · ${galleryTitle}` : ""}
      </h3>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading comments…</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => {
            const mine = m.author_id === profile?.id;
            const isQueenAuthor = m.author?.role === "queen";
            const canDelete = mine || isQueen;
            return (
              <li
                key={m.id}
                id={`creep-comment-${m.id}`}
                className={cn(
                  "rounded-lg border px-3 py-2",
                  m.id === highlightCommentId
                    ? "border-gold/40"
                    : mine
                      ? "border-gold/20 bg-gold/5"
                      : "border-royal/40 bg-royal/15"
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      isQueenAuthor ? "text-gold" : "text-ivory/80"
                    )}
                  >
                    {m.author?.username ?? "Someone"}
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
                  <RoleSpeech text={m.content} role={m.author?.role} />
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Comment…"
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
