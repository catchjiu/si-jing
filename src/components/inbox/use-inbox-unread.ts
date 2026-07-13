"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { countAllUnreadMessages } from "@/lib/inbox";
import { countUnreadNotifications } from "@/lib/notifications";

/** Unread DMs across all topic threads + notifications for the Inbox nav badge. */
export function useInboxUnreadCount() {
  const { profile } = useAuth();
  const [count, setCount] = useState(0);

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

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`inbox-badge:${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => {
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_messages" },
        () => {
          void refresh();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile, refresh]);

  return count;
}
