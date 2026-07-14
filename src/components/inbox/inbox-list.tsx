"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Ban,
  BookOpen,
  CalendarHeart,
  ChevronRight,
  Gift,
  Crown,
  HandHeart,
  Inbox,
  ListTodo,
  Loader2,
  MessageCircle,
  Pin,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import {
  listTopicThreads,
  type AppNotification,
  type InboxTopic,
  type TopicThreadSummary,
} from "@/lib/inbox";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SignedAvatarImage } from "@/components/ui/signed-avatar-image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const TOPIC_ICONS: Record<
  Exclude<InboxTopic, "general">,
  typeof Sparkles
> = {
  teases: Sparkles,
  punishments: Ban,
  dates: CalendarHeart,
  tasks: ListTodo,
  rewards: Gift,
  requests: HandHeart,
  journal: BookOpen,
  worship: Crown,
};

function previewText(thread: TopicThreadSummary): string {
  const m = thread.lastMessage;
  if (!m) return thread.description;
  if (m.content?.trim()) return m.content;
  if (m.attachment_type) return `Shared a ${m.attachment_type}`;
  if (m.media_type === "video") return "Sent a video";
  if (m.media_path) return "Sent a photo";
  if (m.voice_path) return "Sent a voice note";
  return thread.description;
}

export function InboxList({ className }: { className?: string }) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState<TopicThreadSummary[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    const supabase = createClient();
    try {
      const [topicThreads, notes] = await Promise.all([
        listTopicThreads(supabase, profile.id),
        fetchNotifications(supabase, profile.id),
      ]);
      setThreads(topicThreads);
      setNotifications(notes);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load inbox"
      );
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!profile) return;
    let debounce: number | null = null;
    const schedule = () => {
      if (debounce != null) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        debounce = null;
        void load();
      }, 350);
    };
    const supabase = createClient();
    const channel = supabase
      .channel(`inbox-live:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        schedule
      )
      .subscribe();
    return () => {
      if (debounce != null) window.clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [profile, load]);

  const markAllRead = async () => {
    if (!profile) return;
    const supabase = createClient();
    await markAllNotificationsRead(supabase, profile.id);
    setNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        read_at: n.read_at ?? new Date().toISOString(),
      }))
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  const general = threads.find((t) => t.topic === "general");
  const topics = threads.filter((t) => t.topic !== "general");
  const unreadNotes = notifications.filter((n) => !n.read_at).length;

  return (
    <div className={cn("space-y-6", className)}>
      {general && (
        <Link
          href={`/dashboard/inbox/${general.conversationId}`}
          className="flex items-center gap-3 rounded-xl border border-gold/30 bg-gradient-to-r from-royal/40 to-charcoal/80 p-4 transition-colors hover:border-gold/50"
        >
          <div className="relative">
            <Avatar size="lg">
              <SignedAvatarImage
                avatarUrl={general.other?.avatar_url}
                alt={general.other?.username ?? "Chat"}
              />
              <AvatarFallback className="bg-royal text-gold">
                {general.other?.username?.[0]?.toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -left-1 -top-1 rounded-full border border-gold/40 bg-void p-0.5">
              <Pin className="h-3 w-3 text-gold" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-heading text-lg text-ivory">
                {general.other?.username ?? "Direct"}
              </p>
              {general.other?.role && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] uppercase tracking-wider",
                    general.other.role === "queen"
                      ? "border-gold/50 text-gold"
                      : "border-royal/60 text-ivory/80"
                  )}
                >
                  {general.other.role}
                </Badge>
              )}
              {general.unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-semibold text-void">
                  {general.unread > 9 ? "9+" : general.unread}
                </span>
              )}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {previewText(general)}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-gold/60" />
        </Link>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-gold" />
          <h2 className="font-heading text-lg text-ivory">Topic threads</h2>
        </div>
        <ul className="space-y-2">
          {topics.map((thread) => {
            const Icon = TOPIC_ICONS[thread.topic as Exclude<InboxTopic, "general">];
            return (
              <li key={thread.conversationId}>
                <Link
                  href={`/dashboard/inbox/${thread.conversationId}`}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors hover:border-gold/40",
                    thread.unread > 0
                      ? "border-gold/30 bg-gold/5"
                      : "border-gold/10 bg-charcoal/60"
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-royal/30">
                    <Icon className="h-4 w-4 text-gold" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ivory">{thread.label}</p>
                      {thread.unread > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-semibold text-void">
                          {thread.unread > 9 ? "9+" : thread.unread}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {previewText(thread)}
                    </p>
                  </div>
                  {thread.lastMessage && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatRelative(thread.lastMessage.created_at)}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-gold" />
            <h2 className="font-heading text-lg text-ivory">Alerts</h2>
            {unreadNotes > 0 && (
              <Badge
                variant="outline"
                className="border-gold/40 text-[10px] text-gold"
              >
                {unreadNotes} new
              </Badge>
            )}
          </div>
          {unreadNotes > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void markAllRead()}
              className="text-xs text-muted-foreground"
            >
              Mark all read
            </Button>
          )}
        </div>

        {notifications.length === 0 ? (
          <p className="rounded-xl border border-gold/10 bg-charcoal/60 px-4 py-8 text-center text-sm text-muted-foreground">
            No alerts yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {notifications.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.href}
                  onClick={() => {
                    if (!n.read_at) {
                      const supabase = createClient();
                      void markNotificationRead(supabase, n.id);
                      setNotifications((prev) =>
                        prev.map((x) =>
                          x.id === n.id
                            ? { ...x, read_at: new Date().toISOString() }
                            : x
                        )
                      );
                    }
                  }}
                  className={cn(
                    "block rounded-lg border px-4 py-3 transition-colors hover:border-gold/30",
                    n.read_at
                      ? "border-gold/10 bg-charcoal/40"
                      : "border-gold/25 bg-gold/5"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ivory">{n.title}</p>
                      {n.body && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {n.body}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatRelative(n.created_at)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
