"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import { formatRoleSpeech } from "@/lib/role-speech";
import { notifyPush } from "@/lib/push-client";
import {
  addEdgeLogComment,
  fetchEdgeLogComments,
  type EdgeLogComment,
} from "@/lib/denial";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RoleSpeech } from "@/components/ui/role-speech";

type EdgeLogCommentThreadProps = {
  edgeLogId: string;
  className?: string;
};

export function EdgeLogCommentThread({
  edgeLogId,
  className,
}: EdgeLogCommentThreadProps) {
  const { profile, isQueen, isSlave } = useAuth();
  const [messages, setMessages] = useState<EdgeLogComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const canComment = isQueen || isSlave;

  const load = useCallback(async () => {
    const supabase = createClient();
    try {
      const rows = await fetchEdgeLogComments(supabase, edgeLogId);
      setMessages(rows);
    } catch {
      toast.error("Could not load comments");
    } finally {
      setLoading(false);
    }
  }, [edgeLogId]);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel(`edge-log-comments:${edgeLogId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "edge_log_comments",
          filter: `edge_log_id=eq.${edgeLogId}`,
        },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [edgeLogId, load]);

  const send = async () => {
    if (!profile || !draft.trim() || !canComment) return;
    setSending(true);
    const supabase = createClient();
    const text = formatRoleSpeech(draft.trim(), profile.role);
    try {
      await addEdgeLogComment(supabase, edgeLogId, text);
      setDraft("");
      void load();
      void notifyPush({
        title: isQueen
          ? "Queen commented on an edge log"
          : "D commented on an edge log",
        body: text.slice(0, 120),
        url: "/dashboard/denial",
        target: isQueen ? "slave" : "queen",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post comment");
    } finally {
      setSending(false);
    }
  };

  if (!canComment && messages.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-2 border-t border-gold/10 pt-2", className)}>
      {loading ? (
        <p className="text-[11px] text-muted-foreground">Loading comments…</p>
      ) : messages.length > 0 ? (
        <ul className="space-y-2">
          {messages.map((m) => {
            const author = m.author;
            const isOwn = author?.id === profile?.id;
            return (
              <li
                key={m.id}
                className={cn(
                  "rounded-md px-2 py-1.5 text-xs",
                  author?.role === "queen"
                    ? "bg-gold/10 text-ivory/90"
                    : "bg-void/50 text-ivory/85"
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-gold/90">
                    {author?.username ?? (isOwn ? "You" : "Them")}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatRelative(m.created_at)}
                  </span>
                </div>
                <RoleSpeech
                  text={m.content}
                  role={(author?.role as "queen" | "slave") ?? "slave"}
                  className="mt-0.5 block whitespace-pre-wrap"
                />
              </li>
            );
          })}
        </ul>
      ) : null}

      {canComment ? (
        <div className="flex gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={isQueen ? "Comment on this edge…" : "Reply…"}
            className="min-h-0 flex-1 resize-none border-gold/15 bg-void/50 text-xs"
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={sending || !draft.trim()}
            className="shrink-0 border-gold/30 text-gold"
            onClick={() => void send()}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
