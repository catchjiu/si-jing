"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Profile, RequestMessage } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { formatRoleSpeech } from "@/lib/role-speech";
import { hasPunishmentEffect } from "@/lib/punishments";
import { postToTopicThread } from "@/lib/inbox";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RoleSpeech } from "@/components/ui/role-speech";

type MessageWithAuthor = RequestMessage & {
  author?: Pick<Profile, "id" | "username" | "role"> | null;
};

interface RequestThreadProps {
  requestId: string;
  canReply?: boolean;
  className?: string;
}

export function RequestThread({
  requestId,
  canReply = true,
  className,
}: RequestThreadProps) {
  const { profile, isQueen } = useAuth();
  const [messages, setMessages] = useState<MessageWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [contactBlocked, setContactBlocked] = useState(false);

  useEffect(() => {
    if (!profile || profile.role !== "slave") {
      setContactBlocked(false);
      return;
    }
    void hasPunishmentEffect("contact", profile.id).then(setContactBlocked);
  }, [profile]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("request_messages")
      .select("*, author:users!author_id(id, username, role)")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Could not load messages");
      setLoading(false);
      return;
    }
    setMessages((data as MessageWithAuthor[]) ?? []);
    setLoading(false);
  }, [requestId]);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel(`request-messages:${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "request_messages",
          filter: `request_id=eq.${requestId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [requestId, load]);

  const send = async () => {
    if (!profile || !draft.trim()) return;
    if (contactBlocked) {
      toast.error("Contact is restricted — messaging is blocked");
      return;
    }
    setSending(true);
    const supabase = createClient();
    const text = formatRoleSpeech(draft.trim(), profile.role);
    const { error } = await supabase.from("request_messages").insert({
      request_id: requestId,
      author_id: profile.id,
      content: text,
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const sentText = text;
    setDraft("");
    void load();
    void postToTopicThread(supabase, {
      topic: "requests",
      senderId: profile.id,
      content: text,
      attachmentType: "request",
      attachmentId: requestId,
    });
    void import("@/lib/push-client").then(({ notifyPush }) =>
      notifyPush({
        title: profile.role === "queen" ? "Message from Queen" : "Message from D",
        body: sentText.slice(0, 120),
        url: "/dashboard/inbox",
        target: profile.role === "queen" ? "slave" : "queen",
      })
    );
  };

  const remove = async (messageId: string) => {
    if (!profile) return;
    const message = messages.find((m) => m.id === messageId);
    if (!message) return;
    if (message.author_id !== profile.id && !isQueen) {
      toast.error("You can only delete your own messages");
      return;
    }
    if (!window.confirm("Delete this message?")) return;

    setDeletingId(messageId);
    const supabase = createClient();
    const { error } = await supabase
      .from("request_messages")
      .delete()
      .eq("id", messageId);
    setDeletingId(null);
    if (error) {
      toast.error(error.message || "Could not delete message");
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    toast.success("Message deleted");
  };

  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Messages
      </p>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-muted-foreground">No messages yet.</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => {
            const mine = m.author_id === profile?.id;
            const canDelete = mine || isQueen;
            const isQueenAuthor = m.author?.role === "queen";
            return (
              <li
                key={m.id}
                className={cn(
                  "rounded-lg border px-3 py-2",
                  mine
                    ? "ml-4 border-gold/25 bg-gold/5"
                    : "mr-4 border-royal/40 bg-royal/15"
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
                        size="icon-sm"
                        variant="ghost"
                        disabled={deletingId === m.id}
                        onClick={() => void remove(m.id)}
                        className="size-7 text-muted-foreground hover:text-red-400"
                        aria-label="Delete message"
                      >
                        {deletingId === m.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
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

      {canReply && contactBlocked && (
        <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-200">
          Contact / privilege freeze is active — you cannot reply.
        </p>
      )}

      {canReply && !contactBlocked && (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Message back…"
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
      )}
    </div>
  );
}
