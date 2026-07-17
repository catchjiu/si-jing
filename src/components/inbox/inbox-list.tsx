"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronRight,
  Crown,
  Inbox,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import {
  listTopicThreads,
  markAllConversationsRead,
  type AppNotification,
  type TopicThreadSummary,
} from "@/lib/inbox";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";
import { buildAlertDigests } from "@/lib/alert-digests";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SignedAvatarImage } from "@/components/ui/signed-avatar-image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PushInboxPrompt } from "@/components/push/push-inbox-prompt";

const ALERT_KIND_FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "tease", label: "Teases" },
  { id: "worship", label: "Worship" },
  { id: "task", label: "Tasks" },
  { id: "request", label: "Requests" },
  { id: "journal", label: "Journal" },
  { id: "wishlist", label: "Wishlist" },
  { id: "other", label: "Other" },
];

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

/** Resolve category from kind, or fall back to title/href for older push rows. */
function alertCategory(n: AppNotification): string {
  const kind = (n.kind || "").toLowerCase().trim();
  const known = [
    "tease",
    "worship",
    "task",
    "request",
    "journal",
    "wishlist",
    "punishment",
    "date",
    "reward",
  ] as const;
  for (const k of known) {
    if (kind.includes(k)) return k;
  }

  const haystack = `${n.title} ${n.body ?? ""} ${n.href}`.toLowerCase();
  if (
    haystack.includes("tease") ||
    haystack.includes("/dashboard/teases")
  ) {
    return "tease";
  }
  if (
    haystack.includes("worship") ||
    haystack.includes("/dashboard/worship")
  ) {
    return "worship";
  }
  if (
    haystack.includes("task") ||
    haystack.includes("submission") ||
    haystack.includes("/dashboard/task") ||
    haystack.includes("/dashboard/submissions")
  ) {
    return "task";
  }
  if (
    haystack.includes("request") ||
    haystack.includes("directive") ||
    haystack.includes("/dashboard/requests")
  ) {
    return "request";
  }
  if (
    haystack.includes("journal") ||
    haystack.includes("/dashboard/journal")
  ) {
    return "journal";
  }
  if (
    haystack.includes("wishlist") ||
    haystack.includes("gift idea") ||
    haystack.includes("/dashboard/wishlist")
  ) {
    return "wishlist";
  }
  if (
    haystack.includes("punishment") ||
    haystack.includes("/dashboard/punishments")
  ) {
    return "punishment";
  }
  if (
    haystack.includes("date") ||
    haystack.includes("/dashboard/dates")
  ) {
    return "date";
  }
  if (
    haystack.includes("reward") ||
    haystack.includes("/dashboard/rewards")
  ) {
    return "reward";
  }
  return "other";
}

function alertMatchesFilter(n: AppNotification, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "unread") return !n.read_at;
  return alertCategory(n) === filter;
}

export function InboxList({ className }: { className?: string }) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState<TopicThreadSummary[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [alertFilter, setAlertFilter] = useState("all");
  const [markingThreads, setMarkingThreads] = useState(false);

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
      }, 400);
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

  const markAllAlertsRead = async () => {
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

  const markAllThreadsRead = async () => {
    if (!profile) return;
    setMarkingThreads(true);
    try {
      const supabase = createClient();
      await markAllConversationsRead(supabase, profile.id);
      setThreads((prev) => prev.map((t) => ({ ...t, unread: 0 })));
      toast.success("Queen Sisi marked read");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not mark thread read"
      );
    } finally {
      setMarkingThreads(false);
    }
  };

  const general = threads.find((t) => t.topic === "general") ?? threads[0];
  const unreadNotes = notifications.filter((n) => !n.read_at).length;
  const unreadThreads = threads.reduce((sum, t) => sum + t.unread, 0);

  const filteredAlerts = useMemo(
    () => notifications.filter((n) => alertMatchesFilter(n, alertFilter)),
    [notifications, alertFilter]
  );

  const alertDigests = useMemo(
    () => buildAlertDigests(filteredAlerts),
    [filteredAlerts]
  );

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <PushInboxPrompt />

      {(unreadThreads > 0 || unreadNotes > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/25 bg-gold/5 px-4 py-3">
          <p className="text-sm text-ivory/90">
            <span className="font-medium text-gold">New: </span>
            {[
              unreadThreads > 0
                ? `Queen Sisi ${unreadThreads > 9 ? "9+" : unreadThreads}`
                : null,
              unreadNotes > 0
                ? `Alerts ${unreadNotes > 9 ? "9+" : unreadNotes}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="flex flex-wrap gap-2">
            {unreadThreads > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={markingThreads}
                onClick={() => void markAllThreadsRead()}
                className="border-gold/30 text-xs text-gold"
              >
                {markingThreads ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Mark thread read
              </Button>
            )}
            {unreadNotes > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void markAllAlertsRead()}
                className="text-xs text-muted-foreground"
              >
                Mark alerts read
              </Button>
            )}
          </div>
        </div>
      )}

      {general ? (
        <Link
          href={`/dashboard/inbox/${general.conversationId}`}
          className="flex items-center gap-3 rounded-xl border border-gold/30 bg-gradient-to-r from-royal/40 to-charcoal/80 p-4 transition-colors hover:border-gold/50"
        >
          <div className="relative">
            <Avatar size="lg">
              <SignedAvatarImage
                avatarUrl={general.other?.avatar_url}
                alt={general.other?.username ?? "Queen Sisi"}
              />
              <AvatarFallback className="bg-royal text-gold">
                <Crown className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-heading text-lg text-ivory">Queen Sisi</p>
              <Badge
                variant="outline"
                className="border-gold/50 text-[10px] uppercase tracking-wider text-gold"
              >
                Thread
              </Badge>
              {general.unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-semibold text-void">
                  {general.unread > 9 ? "9+" : general.unread}
                </span>
              )}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {previewText(general)}
            </p>
            {general.lastMessage && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {formatRelative(general.lastMessage.created_at)}
              </p>
            )}
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-gold/60" />
        </Link>
      ) : (
        <p className="rounded-xl border border-gold/10 bg-charcoal/60 px-4 py-8 text-center text-sm text-muted-foreground">
          Queen Sisi thread is not ready yet.
        </p>
      )}

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
              onClick={() => void markAllAlertsRead()}
              className="text-xs text-muted-foreground"
            >
              Mark all read
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ALERT_KIND_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setAlertFilter(f.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                alertFilter === f.id
                  ? "border-gold/50 bg-gold/15 text-gold"
                  : "border-gold/15 text-muted-foreground hover:border-gold/30 hover:text-ivory"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {alertDigests.length === 0 ? (
          <p className="rounded-xl border border-gold/10 bg-charcoal/60 px-4 py-8 text-center text-sm text-muted-foreground">
            {notifications.length === 0
              ? "No alerts yet."
              : "No alerts match this filter."}
          </p>
        ) : (
          <ul className="space-y-2">
            {alertDigests.map((d) => {
              if (d.kind === "single") {
                const n = d.item;
                return (
                  <li key={d.id}>
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
                );
              }

              return (
                <li key={d.id} className="relative pb-1.5">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-3 bottom-0 h-[calc(100%-6px)] rounded-lg border border-gold/10 bg-charcoal/30"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-1.5 bottom-0.5 h-[calc(100%-3px)] rounded-lg border border-gold/15 bg-charcoal/50"
                  />
                  <Link
                    href={d.href}
                    onClick={() => {
                      const unreadIds = d.items
                        .filter((i) => !i.read_at)
                        .map((i) => i.id);
                      if (unreadIds.length === 0) return;
                      const supabase = createClient();
                      const now = new Date().toISOString();
                      for (const id of unreadIds) {
                        void markNotificationRead(supabase, id);
                      }
                      setNotifications((prev) =>
                        prev.map((x) =>
                          unreadIds.includes(x.id)
                            ? { ...x, read_at: x.read_at ?? now }
                            : x
                        )
                      );
                    }}
                    className={cn(
                      "relative block rounded-lg border px-4 py-3 transition-colors hover:border-gold/30",
                      d.allRead
                        ? "border-gold/10 bg-charcoal/40"
                        : "border-gold/25 bg-gold/5"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm text-ivory">{d.title}</p>
                          <span className="rounded-full bg-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-gold">
                            {d.count}
                          </span>
                        </div>
                        {d.body && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {d.body}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatRelative(d.newestAt)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
