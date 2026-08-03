"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  buildFlirtUnreadBreakdown,
  fetchUnreadFlirtNotifications,
  type FlirtUnreadBreakdown,
} from "@/lib/flirt-notifications";

const EMPTY: FlirtUnreadBreakdown = { total: 0, byGuy: {} };

/** Unread flirt updates grouped by guy for grid badges and nav. */
export function useFlirtUnread() {
  const { profile } = useAuth();
  const [breakdown, setBreakdown] = useState<FlirtUnreadBreakdown>(EMPTY);
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!profile) {
      setBreakdown(EMPTY);
      return;
    }
    const supabase = createClient();
    try {
      const notifications = await fetchUnreadFlirtNotifications(
        supabase,
        profile.id
      );
      setBreakdown(buildFlirtUnreadBreakdown(notifications));
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
      .channel(`flirt-badge:${profile.id}:${crypto.randomUUID()}`)
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
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile, scheduleRefresh]);

  return { ...breakdown, refresh };
}
