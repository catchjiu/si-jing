"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { signObjectUrl } from "@/lib/storage/client";
import { formatRelative } from "@/lib/format";
import { hasPunishmentEffect } from "@/lib/punishments";
import {
  fetchMessages,
  markConversationRead,
  softDeleteMessage,
  type DirectMessageWithSender,
  type MessageAttachmentType,
  type MessageMediaType,
} from "@/lib/inbox";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RoleSpeech } from "@/components/ui/role-speech";
import { VoicePlayer } from "@/components/voice/voice-player";
import { MessageCard } from "@/components/inbox/message-card";
import { ChatComposer } from "@/components/inbox/chat-composer";

function SignedMedia({
  path,
  mediaType,
}: {
  path: string;
  mediaType: MessageMediaType;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void signObjectUrl({
      bucket: "messages",
      path,
      expiresIn: 60 * 60,
    }).then((signed) => {
      if (!cancelled) setUrl(signed);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!url) {
    return (
      <div className="mt-2 flex h-32 items-center justify-center rounded-lg bg-void/60">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (mediaType === "video") {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        src={url}
        controls
        playsInline
        className="mt-2 max-h-72 w-full rounded-lg bg-black object-contain"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="mt-2 max-h-72 w-full rounded-lg object-contain"
    />
  );
}

interface ChatThreadProps {
  conversationId: string;
  recipientId: string;
  className?: string;
}

export function ChatThread({
  conversationId,
  recipientId,
  className,
}: ChatThreadProps) {
  const { profile, isQueen } = useAuth();
  const [messages, setMessages] = useState<DirectMessageWithSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactBlocked, setContactBlocked] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const supabase = createClient();
    try {
      const rows = await fetchMessages(supabase, conversationId);
      setMessages(rows);
      await markConversationRead(supabase, conversationId, profile.id);
    } catch {
      toast.error("Could not load messages");
    } finally {
      setLoading(false);
    }
  }, [conversationId, profile]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!profile || profile.role !== "slave") {
      setContactBlocked(false);
      return;
    }
    void hasPunishmentEffect("contact", profile.id).then(setContactBlocked);
  }, [profile]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`dm:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const remove = async (id: string) => {
    if (!window.confirm("Delete this message?")) return;
    setDeletingId(id);
    const supabase = createClient();
    try {
      await softDeleteMessage(supabase, id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
      toast.success("Message deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No messages yet. Start the conversation.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === profile?.id;
            const canDelete = mine || isQueen;
            const isQueenAuthor = m.sender?.role === "queen";
            return (
              <div
                key={m.id}
                className={cn(
                  "rounded-lg border px-3 py-2",
                  mine
                    ? "ml-6 border-gold/25 bg-gold/5"
                    : "mr-6 border-royal/40 bg-royal/15"
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      isQueenAuthor ? "text-gold" : "text-ivory/80"
                    )}
                  >
                    {m.sender?.username ?? "Someone"}
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

                {m.content && (
                  <p className="whitespace-pre-wrap text-sm text-ivory/90">
                    <RoleSpeech text={m.content} role={m.sender?.role} />
                  </p>
                )}

                {m.media_path && m.media_type && (
                  <SignedMedia
                    path={m.media_path}
                    mediaType={m.media_type as MessageMediaType}
                  />
                )}

                {m.voice_path && (
                  <div className="mt-2">
                    <VoicePlayer
                      filePath={m.voice_path}
                      durationMs={m.voice_duration_ms}
                    />
                  </div>
                )}

                {m.attachment_type && m.attachment_id && (
                  <MessageCard
                    type={m.attachment_type as MessageAttachmentType}
                    id={m.attachment_id}
                    summary={m.content}
                  />
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <ChatComposer
        conversationId={conversationId}
        recipientId={recipientId}
        contactBlocked={contactBlocked}
        onSent={() => void load()}
      />
    </div>
  );
}
