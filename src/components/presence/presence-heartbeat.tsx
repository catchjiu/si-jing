"use client";

import { useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { applyQueenWorkSchedules } from "@/lib/queen-work-schedule";

const INTERVAL_MS = 60_000;

/** Heartbeat so Queen can see D's last-active time; applies Queen work schedule. */
export function PresenceHeartbeat() {
  const { user, loading } = useAuth();

  const touch = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    await supabase.rpc("touch_last_active");
    try {
      await applyQueenWorkSchedules(supabase);
    } catch {
      // schedule apply is best-effort until migration is live
    }
  }, [user]);

  useEffect(() => {
    if (loading || !user) return;
    void touch();
    const id = window.setInterval(() => void touch(), INTERVAL_MS);
    const onFocus = () => void touch();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [loading, user, touch]);

  return null;
}
