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
import { postToTopicThread } from "@/lib/inbox";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceNotes } from "@/components/voice/voice-notes";
import { RoleSpeech } from "@/components/ui/role-speech";

type WorshipGalleryMessage = {
  id: string;
  gallery_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: Pick<Profile, "id" | "username" | "role"> | null;
};

interface WorshipGalleryCommentThreadProps {
  galleryId: string;
  galleryTopic?: string | null;
  className?: string;
}

export function WorshipGalleryCommentThread({
  galleryId,
  galleryTopic,
  className,
}: WorshipGalleryCommentThreadProps) {
  const { profile, isSlave } = useAuth();
  const [messages, setMessages] = useState<WorshipGalleryMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("worship_gallery_messages")
      .select("*, author:users!author_id(id, username, role)")
      .eq("gallery_id", galleryId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Could not load gallery comments");
      setLoading(false);
      return;
    }
    setMessages((data as WorshipGalleryMessage[]) ?? []);
    setLoading(false);
  }, [galleryId]);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel(`worship-gallery-messages:${galleryId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "worship_gallery_messages",
          filter: `gallery_id=eq.${galleryId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [galleryId, load]);

  const send = async () => {
    if (!profile || !draft.trim()) return;
    setSending(true);
    const supabase = createClient();
    const text = formatRoleSpeech(draft.trim(), profile.role);
    const { error } = await supabase.from("worship_gallery_messages").insert({
      gallery_id: galleryId,
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
    void postToTopicThread(supabase, {
      topic: "worship",
      senderId: profile.id,
      content: text,
      attachmentType: "worship",
      attachmentId: galleryId,
    });
    void notifyPush({
      title: isSlave ? "Comment on worship gallery" : "Queen commented on gallery",
      body: text.slice(0, 120),
      url: "/dashboard/inbox",
      target: isSlave ? "queen" : "slave",
    });
  };

  return (
    <div className={cn("space-y-4 border-t border-gold/10 pt-4", className)}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Gallery comments
      </p>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments on this gallery yet.</p>
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
              ? "Notes about this collection…"
              : "Reply on this gallery…"
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
          Send comment
        </Button>
      </div>

      <VoiceNotes
        entityType="worship_gallery"
        entityId={galleryId}
        compact
        mirrorToInbox={{
          topic: "worship",
          attachmentType: "worship",
          attachmentId: galleryId,
        }}
        title={
          isSlave
            ? "Voice on gallery"
            : `Voice on ${galleryTopic || "gallery"}`
        }
      />
    </div>
  );
}
