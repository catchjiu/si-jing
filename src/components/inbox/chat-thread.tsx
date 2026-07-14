"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Reply, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { signObjectUrl } from "@/lib/storage/client";
import { formatRelative } from "@/lib/format";
import { hasPunishmentEffect } from "@/lib/punishments";
import {
  fetchMessages,
  markConversationRead,
  messageSnippet,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SignedAvatarImage } from "@/components/ui/signed-avatar-image";
import { KeepInEvidenceButton } from "@/components/evidence/keep-in-evidence-button";
import { InboxTeaseEmbed } from "@/components/inbox/inbox-tease-embed";
import type { EvidencePinMediaKind } from "@/lib/types";

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

function keepPropsForMessage(m: DirectMessageWithSender): {
  mediaKind: EvidencePinMediaKind;
  caption: string | null;
  filePath: string | null;
  storageBucket: "messages" | "voice" | null;
  title: string;
} {
  const title = `Inbox · ${m.sender?.username ?? "D"}`;
  if (m.media_path && m.media_type) {
    return {
      mediaKind: m.media_type,
      caption: m.content,
      filePath: m.media_path,
      storageBucket: "messages",
      title,
    };
  }
  if (m.voice_path) {
    return {
      mediaKind: "voice",
      caption: m.content,
      filePath: m.voice_path,
      storageBucket: "voice",
      title,
    };
  }
  return {
    mediaKind: "text",
    caption:
      m.content?.trim() ||
      (m.attachment_type ? `Shared a ${m.attachment_type}` : null),
    filePath: null,
    storageBucket: null,
    title,
  };
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
  const [replyingTo, setReplyingTo] = useState<DirectMessageWithSender | null>(
    null
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior });
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

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
    initialScrollDone.current = false;
    setLoading(true);
    setMessages([]);
    setReplyingTo(null);
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
        (payload) => {
          const eventType = payload.eventType;
          if (eventType === "INSERT") {
            const row = payload.new as DirectMessageWithSender;
            if (row.deleted_at) return;
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev;
              const replyParent = row.reply_to_id
                ? prev.find((m) => m.id === row.reply_to_id)
                : null;
              const enriched: DirectMessageWithSender = {
                ...row,
                sender:
                  row.sender_id === profile?.id && profile
                    ? {
                        id: profile.id,
                        username: profile.username,
                        role: profile.role,
                        avatar_url: profile.avatar_url ?? null,
                      }
                    : row.sender ?? null,
                reply_to:
                  (row.reply_to as DirectMessageWithSender["reply_to"]) ??
                  (replyParent
                    ? {
                        id: replyParent.id,
                        sender_id: replyParent.sender_id,
                        content: replyParent.content,
                        media_path: replyParent.media_path,
                        media_type: replyParent.media_type,
                        voice_path: replyParent.voice_path,
                        attachment_type: replyParent.attachment_type,
                        sender: replyParent.sender ?? null,
                      }
                    : null),
              };
              return [...prev, enriched].sort(
                (a, b) =>
                  new Date(a.created_at).getTime() -
                  new Date(b.created_at).getTime()
              );
            });
            if (profile && row.sender_id !== profile.id) {
              void markConversationRead(
                createClient(),
                conversationId,
                profile.id
              );
            }
            return;
          }
          if (eventType === "UPDATE") {
            const row = payload.new as DirectMessageWithSender;
            if (row.deleted_at) {
              setMessages((prev) => prev.filter((m) => m.id !== row.id));
              return;
            }
            setMessages((prev) =>
              prev.map((m) => (m.id === row.id ? { ...m, ...row } : m))
            );
            return;
          }
          if (eventType === "DELETE") {
            const row = payload.old as { id?: string };
            if (row.id) {
              setMessages((prev) => prev.filter((m) => m.id !== row.id));
            }
          }
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, profile]);

  // Pin to latest message on open and when new messages arrive
  useEffect(() => {
    if (loading || messages.length === 0) return;
    const behavior: ScrollBehavior = initialScrollDone.current
      ? "smooth"
      : "auto";
    const run = () => scrollToBottom(behavior);
    run();
    // Re-run after layout/images settle so first open lands on the true bottom
    const t1 = window.setTimeout(run, 50);
    const t2 = window.setTimeout(() => {
      run();
      initialScrollDone.current = true;
    }, 250);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [loading, messages.length, conversationId, scrollToBottom]);

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
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-4"
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No messages yet. Start the conversation.
          </p>
        ) : (
          (() => {
            const shownTeaseEmbeds = new Set<string>();
            return messages.map((m) => {
            const mine = m.sender_id === profile?.id;
            const canDelete = mine || isQueen;
            const isQueenAuthor = m.sender?.role === "queen";
            const canKeep =
              isQueen &&
              !mine &&
              Boolean(
                m.content?.trim() ||
                  m.media_path ||
                  m.voice_path ||
                  m.attachment_type
              );
            const keep = canKeep ? keepPropsForMessage(m) : null;
            const teaseId =
              m.attachment_type === "tease" && m.attachment_id
                ? m.attachment_id
                : null;
            const showTeaseEmbed =
              !!teaseId && !shownTeaseEmbeds.has(teaseId);
            if (teaseId && showTeaseEmbed) shownTeaseEmbeds.add(teaseId);

            const senderName = m.sender?.username ?? "Someone";
            const senderInitial = senderName[0]?.toUpperCase() ?? "?";

            return (
              <div
                key={m.id}
                className={cn(
                  "flex items-start gap-2.5",
                  mine ? "ml-2 flex-row-reverse" : "mr-2"
                )}
              >
                <Avatar
                  size="sm"
                  className={cn(
                    "mt-0.5 shrink-0",
                    isQueenAuthor && "ring-1 ring-gold/35"
                  )}
                >
                  {m.sender?.avatar_url && (
                    <SignedAvatarImage
                      avatarUrl={m.sender.avatar_url}
                      alt={senderName}
                    />
                  )}
                  <AvatarFallback
                    className={cn(
                      "text-xs font-medium",
                      isQueenAuthor
                        ? "bg-royal text-gold"
                        : "bg-charcoal text-ivory"
                    )}
                  >
                    {senderInitial}
                  </AvatarFallback>
                </Avatar>

                <div
                  className={cn(
                    "min-w-0 flex-1 rounded-lg border px-3 py-2",
                    mine
                      ? "border-gold/25 bg-gold/5"
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
                    {isQueenAuthor ? "Queen" : "slave"}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">
                      {formatRelative(m.created_at)}
                    </span>
                    {keep && (
                      <KeepInEvidenceButton
                        sourceType="direct_message"
                        sourceId={m.id}
                        mediaKind={keep.mediaKind}
                        title={keep.title}
                        caption={keep.caption}
                        filePath={keep.filePath}
                        storageBucket={keep.storageBucket}
                        label="Keep"
                        className="h-7 px-2 text-[11px]"
                      />
                    )}
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
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setReplyingTo(m)}
                      className="size-7 text-muted-foreground hover:text-gold"
                      aria-label="Reply to message"
                    >
                      <Reply className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {m.reply_to && (
                  <button
                    type="button"
                    onClick={() => {
                      const parent = messages.find((x) => x.id === m.reply_to?.id);
                      if (parent) setReplyingTo(parent);
                    }}
                    className="mb-2 w-full rounded-md border-l-2 border-gold/50 bg-void/40 px-2 py-1.5 text-left transition-colors hover:bg-void/60"
                  >
                    <p className="text-[10px] font-medium text-gold/90">
                      {m.reply_to.sender?.username ?? "Someone"}
                      {m.reply_to.sender?.role === "queen" ? " · Queen" : ""}
                    </p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {messageSnippet(m.reply_to)}
                    </p>
                  </button>
                )}

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

                {showTeaseEmbed && teaseId ? (
                  <InboxTeaseEmbed teaseId={teaseId} />
                ) : m.attachment_type &&
                  m.attachment_id &&
                  m.attachment_type !== "tease" ? (
                  <MessageCard
                    type={m.attachment_type as MessageAttachmentType}
                    id={m.attachment_id}
                    summary={m.content}
                  />
                ) : null}
                </div>
              </div>
            );
            });
          })()
        )}
        <div ref={bottomRef} />
      </div>

      <ChatComposer
        conversationId={conversationId}
        recipientId={recipientId}
        contactBlocked={contactBlocked}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSent={() => {
          setReplyingTo(null);
          void load();
        }}
      />
    </div>
  );
}
