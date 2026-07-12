"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Profile, RequestMessage } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
  const { profile } = useAuth();
  const [messages, setMessages] = useState<MessageWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

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
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.from("request_messages").insert({
      request_id: requestId,
      author_id: profile.id,
      content: draft.trim(),
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const sentText = draft.trim();
    setDraft("");
    void load();
    void import("@/lib/push-client").then(({ notifyPush }) =>
      notifyPush({
        title: profile.role === "queen" ? "Message from Queen" : "Message from D",
        body: sentText.slice(0, 120),
        url: "/dashboard/requests",
        target: profile.role === "queen" ? "slave" : "queen",
      })
    );
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
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelative(m.created_at)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-ivory/90">
                  {m.content}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {canReply && (
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
