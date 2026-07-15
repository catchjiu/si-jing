"use client";

import { useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";

const INTERVAL_MS = 60_000;

/** Heartbeat so Queen can see D's last-active time. */
export function PresenceHeartbeat() {
  const { user, loading } = useAuth();

  const touch = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    await supabase.rpc("touch_last_active");
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
