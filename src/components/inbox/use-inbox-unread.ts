"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { countAllUnreadMessages } from "@/lib/inbox";
import { countUnreadNotifications } from "@/lib/notifications";

/** Unread DMs across all topic threads + notifications for the Inbox nav badge. */
export function useInboxUnreadCount() {
  const { profile } = useAuth();
  const [count, setCount] = useState(0);
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!profile) {
      setCount(0);
      return;
    }
    const supabase = createClient();
    try {
      const [dm, notes] = await Promise.all([
        countAllUnreadMessages(supabase, profile.id),
        countUnreadNotifications(supabase, profile.id),
      ]);
      setCount(dm + notes);
    } catch {
      // ignore — badge is best-effort
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
      .channel(`inbox-badge:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          scheduleRefresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        () => {
          scheduleRefresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_members",
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          scheduleRefresh();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile, scheduleRefresh]);

  return count;
}
