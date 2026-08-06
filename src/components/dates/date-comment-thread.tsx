"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Profile } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { formatRoleSpeech } from "@/lib/role-speech";
import { datePageHref } from "@/lib/inbox-deep-links";
import { postToTopicThread } from "@/lib/inbox";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RoleSpeech } from "@/components/ui/role-speech";

type DateMessage = {
  id: string;
  date_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: Pick<Profile, "id" | "username" | "role"> | null;
};

type Props = {
  dateId: string;
  dateTitle?: string | null;
  className?: string;
};

export function DateCommentThread({ dateId, dateTitle, className }: Props) {
  const { profile, isQueen, isSlave } = useAuth();
  const [messages, setMessages] = useState<DateMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("date_messages")
      .select("*, author:users!author_id(id, username, role)")
      .eq("date_id", dateId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Could not load comments");
      setLoading(false);
      return;
    }
    setMessages((data as DateMessage[]) ?? []);
    setLoading(false);
  }, [dateId]);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel(`date-messages:${dateId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "date_messages",
          filter: `date_id=eq.${dateId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [dateId, load]);

  const removeComment = async (message: DateMessage) => {
    if (!profile) return;
    const canDelete = message.author_id === profile.id || isQueen;
    if (!canDelete) return;
    if (!window.confirm("Delete this comment?")) return;

    setDeletingId(message.id);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("date_messages")
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
      const { error } = await supabase.from("date_messages").insert({
        date_id: dateId,
        author_id: profile.id,
        content: text,
      });
      if (error) throw error;

      setDraft("");
      void load();
      void postToTopicThread(supabase, {
        topic: "dates",
        senderId: profile.id,
        content: text,
        attachmentType: "date",
        attachmentId: dateId,
      });
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: isSlave ? "Comment on a date" : "Queen replied on a date",
          body: `${dateTitle || "Date"}${text ? `: ${text.slice(0, 80)}` : ""}`,
          url: datePageHref(dateId),
          target: isSlave ? "queen" : "slave",
          kind: "date_comment",
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
    <div className={cn("space-y-4 rounded-xl border border-gold/15 bg-charcoal/60 p-4", className)}>
      <h3 className="font-heading text-lg text-gold">Comments</h3>

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

      <div className="space-y-2 border-t border-gold/10 pt-4">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder={
            isSlave
              ? `Comment on ${dateTitle || "this date"}…`
              : `Reply about ${dateTitle || "this date"}…`
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
