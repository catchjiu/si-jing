"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Profile } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { notifyPush } from "@/lib/push-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceNotes } from "@/components/voice/voice-notes";

type TeaseMessage = {
  id: string;
  tease_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: Pick<Profile, "id" | "username" | "role"> | null;
};

interface TeaseBegThreadProps {
  teaseId: string;
  teaseTitle?: string | null;
  className?: string;
}

export function TeaseBegThread({
  teaseId,
  teaseTitle,
  className,
}: TeaseBegThreadProps) {
  const { profile, isSlave } = useAuth();
  const [messages, setMessages] = useState<TeaseMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tease_messages")
      .select("*, author:users!author_id(id, username, role)")
      .eq("tease_id", teaseId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Could not load messages");
      setLoading(false);
      return;
    }
    setMessages((data as TeaseMessage[]) ?? []);
    setLoading(false);
  }, [teaseId]);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel(`tease-messages:${teaseId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tease_messages",
          filter: `tease_id=eq.${teaseId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [teaseId, load]);

  const send = async () => {
    if (!profile || !draft.trim()) return;
    setSending(true);
    const supabase = createClient();
    const text = draft.trim();
    const { error } = await supabase.from("tease_messages").insert({
      tease_id: teaseId,
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
      title: isSlave ? "D is begging" : "Queen replied on a tease",
      body: text.slice(0, 120),
      url: "/dashboard/teases",
      target: isSlave ? "queen" : "slave",
    });
  };

  return (
    <div className={cn("space-y-3 border-t border-gold/10 pt-4", className)}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {isSlave ? "Beg Queen" : "Begging & replies"}
      </p>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {isSlave
            ? "Ask for more… or beg for the reveal."
            : "No messages yet."}
        </p>
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

      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder={
            isSlave
              ? "Please, Queen… (text beg)"
              : "Reply to the begging…"
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
          {isSlave ? "Send beg" : "Send reply"}
        </Button>
      </div>

      <VoiceNotes
        entityType="tease"
        entityId={teaseId}
        compact
        title={isSlave ? "Voice beg" : `Voice on ${teaseTitle || "tease"}`}
        allowEvidencePin
        evidenceTitle={
          teaseTitle ? `Tease · ${teaseTitle}` : "Tease voice"
        }
      />
    </div>
  );
}
