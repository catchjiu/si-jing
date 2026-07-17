"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  listTopicThreads,
  type InboxTopic,
  type TopicThreadSummary,
} from "@/lib/inbox";
import { countUnreadNotifications } from "@/lib/notifications";

export type InboxUnreadBreakdown = {
  total: number;
  dmTotal: number;
  alerts: number;
  byTopic: Partial<Record<InboxTopic, number>>;
  threads: TopicThreadSummary[];
  /** Short chips for banners, e.g. "Teases 2 · Worship 1 · Alerts 3" */
  summaryParts: string[];
};

const EMPTY: InboxUnreadBreakdown = {
  total: 0,
  dmTotal: 0,
  alerts: 0,
  byTopic: {},
  threads: [],
  summaryParts: [],
};

function buildBreakdown(
  threads: TopicThreadSummary[],
  alerts: number
): InboxUnreadBreakdown {
  const byTopic: Partial<Record<InboxTopic, number>> = {};
  let dmTotal = 0;
  const summaryParts: string[] = [];

  for (const t of threads) {
    if (t.unread > 0) {
      byTopic[t.topic] = t.unread;
      dmTotal += t.unread;
      summaryParts.push(
        `${t.topic === "general" ? "Queen Sisi" : t.label} ${
          t.unread > 9 ? "9+" : t.unread
        }`
      );
    }
  }
  if (alerts > 0) {
    summaryParts.push(`Alerts ${alerts > 9 ? "9+" : alerts}`);
  }

  return {
    total: dmTotal + alerts,
    dmTotal,
    alerts,
    byTopic,
    threads,
    summaryParts,
  };
}

/** Unread DMs (per topic) + alerts for Inbox nav / feature badges. */
export function useInboxUnread() {
  const { profile } = useAuth();
  const [breakdown, setBreakdown] = useState<InboxUnreadBreakdown>(EMPTY);
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!profile) {
      setBreakdown(EMPTY);
      return;
    }
    const supabase = createClient();
    try {
      const [threads, alerts] = await Promise.all([
        listTopicThreads(supabase, profile.id),
        countUnreadNotifications(supabase, profile.id),
      ]);
      setBreakdown(buildBreakdown(threads, alerts));
    } catch {
      // badge is best-effort
    }
  }, [profile]);

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void refresh();
    }, 400);
  }, [refresh]);

  useEffect(() => {
    void refresh();
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [refresh]);

  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`inbox-badge:${profile.id}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_members",
          filter: `user_id=eq.${profile.id}`,
        },
        scheduleRefresh
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile, scheduleRefresh]);

  return { ...breakdown, refresh };
}

/** Back-compat: total unread for simple badge sites. */
export function useInboxUnreadCount() {
  return useInboxUnread().total;
}
