"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Profile } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { formatRoleSpeech } from "@/lib/role-speech";
import { notifyPush } from "@/lib/push-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RoleSpeech } from "@/components/ui/role-speech";

type JournalCommentRow = {
  id: string;
  entry_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: Pick<Profile, "id" | "username" | "role"> | null;
};

interface JournalCommentThreadProps {
  entryId: string;
  visibility: "private" | "shared";
  className?: string;
}

export function JournalCommentThread({
  entryId,
  visibility,
  className,
}: JournalCommentThreadProps) {
  const { profile, isQueen, isSlave } = useAuth();
  const [messages, setMessages] = useState<JournalCommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const canComment = visibility === "shared" || isQueen;

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("journal_comments")
      .select("*, author:users!author_id(id, username, role)")
      .eq("entry_id", entryId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Could not load comments");
      setLoading(false);
      return;
    }
    setMessages((data as JournalCommentRow[]) ?? []);
    setLoading(false);
  }, [entryId]);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel(`journal-comments:${entryId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "journal_comments",
          filter: `entry_id=eq.${entryId}`,
        },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [entryId, load]);

  const send = async () => {
    if (!profile || !draft.trim() || !canComment) return;
    setSending(true);
    const supabase = createClient();
    const text = formatRoleSpeech(draft.trim(), profile.role);
    const { error } = await supabase.from("journal_comments").insert({
      entry_id: entryId,
      author_id: profile.id,
      content: text,
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraft("");
    void load();
    void notifyPush({
      title: isQueen ? "Queen commented on your journal" : "New journal comment",
      body: text.slice(0, 120),
      url: "/dashboard/journal",
      target: isQueen ? "slave" : "queen",
    });
  };

  if (visibility === "private" && isSlave) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        Private entry — only you can see this.
      </p>
    );
  }

  return (
    <div className={cn("space-y-3 border-t border-gold/10 pt-4", className)}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Comments
      </p>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => {
            const mine = m.author_id === profile?.id;
            const isQueenAuthor = m.author?.role === "queen";
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
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelative(m.created_at)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-ivory/90">
                  <RoleSpeech text={m.content} role={m.author?.role} />
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {canComment && (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder={isQueen ? "Reply to his reflection…" : "Add a note…"}
            className="border-gold/20 bg-void/60"
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
            Comment
          </Button>
        </div>
      )}
    </div>
  );
}
