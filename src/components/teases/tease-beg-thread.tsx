"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Profile, TeaseMediaKind, TeaseViewCapture } from "@/lib/types";
import { TeaseViewCaptureGallery } from "@/components/teases/tease-view-capture-gallery";
import { formatRelative } from "@/lib/format";
import { formatRoleSpeech } from "@/lib/role-speech";
import { notifyPush } from "@/lib/push-client";
import { postToTopicThread } from "@/lib/inbox";
import {
  inboxAnchors,
  highlightMessageElement,
  teasePageHref,
} from "@/lib/inbox-deep-links";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceNotes } from "@/components/voice/voice-notes";
import { RoleSpeech } from "@/components/ui/role-speech";

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
  mediaKind?: TeaseMediaKind;
  highlightCommentId?: string | null;
  highlightVoiceId?: string | null;
  className?: string;
}

export function TeaseBegThread({
  teaseId,
  teaseTitle,
  mediaKind = "image",
  highlightCommentId = null,
  highlightVoiceId = null,
  className,
}: TeaseBegThreadProps) {
  const { profile, isSlave, isQueen } = useAuth();
  const [messages, setMessages] = useState<TeaseMessage[]>([]);
  const [viewCaptures, setViewCaptures] = useState<TeaseViewCapture[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const loadMessages = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tease_messages")
      .select("*, author:users!author_id(id, username, role)")
      .eq("tease_id", teaseId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Could not load messages");
      return;
    }
    setMessages((data as TeaseMessage[]) ?? []);
  }, [teaseId]);

  const loadViewCaptures = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tease_view_captures")
      .select("*")
      .eq("tease_id", teaseId)
      .order("created_at", { ascending: false });

    if (error) return;
    setViewCaptures((data as TeaseViewCapture[]) ?? []);
  }, [teaseId]);

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadMessages(), loadViewCaptures()]);
    setLoading(false);
  }, [loadMessages, loadViewCaptures]);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel(`tease-thread:${teaseId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tease_messages",
          filter: `tease_id=eq.${teaseId}`,
        },
        () => {
          void loadMessages();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tease_view_captures",
          filter: `tease_id=eq.${teaseId}`,
        },
        () => {
          void loadViewCaptures();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [teaseId, load, loadMessages, loadViewCaptures]);

  useEffect(() => {
    if (!highlightCommentId || loading) return;
    const timer = window.setTimeout(() => {
      highlightMessageElement(highlightCommentId);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [highlightCommentId, loading, messages.length]);

  const send = async () => {
    if (!profile || !draft.trim()) return;
    setSending(true);
    const supabase = createClient();
    const text = formatRoleSpeech(draft.trim(), profile.role);
    const { data: inserted, error } = await supabase
      .from("tease_messages")
      .insert({
        tease_id: teaseId,
        author_id: profile.id,
        content: text,
      })
      .select("id")
      .single();
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraft("");
    void load();
    void postToTopicThread(supabase, {
      topic: "teases",
      senderId: profile.id,
      content: text,
      attachmentType: "tease",
      attachmentId: teaseId,
      attachmentAnchor: inserted?.id
        ? inboxAnchors.teaseComment(inserted.id)
        : null,
    });
    void notifyPush({
      title: isSlave ? "D is begging" : "Queen replied on a tease",
      body: text.slice(0, 120),
      url: teasePageHref(teaseId, {
        commentId: inserted?.id ?? undefined,
      }),
      target: isSlave ? "queen" : "slave",
      kind: "tease",
    });
  };

  return (
    <div className={cn("space-y-3 border-t border-gold/10 pt-4", className)}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {isSlave ? "Beg Queen" : "Begging & replies"}
      </p>

      {(isQueen || isSlave) && viewCaptures.length > 0 && (
        <TeaseViewCaptureGallery
          captures={viewCaptures}
          mediaKind={mediaKind}
          audience={isSlave ? "slave" : "queen"}
        />
      )}

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
                    {m.author?.username ?? "Someone"}
                    {isQueenAuthor ? " · Queen" : ""}
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
        highlightVoiceId={highlightVoiceId}
        title={isSlave ? "Voice beg" : `Voice on ${teaseTitle || "tease"}`}
        allowEvidencePin
        evidenceTitle={
          teaseTitle ? `Tease · ${teaseTitle}` : "Tease voice"
        }
      />
    </div>
  );
}
