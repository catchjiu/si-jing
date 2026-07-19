"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  CONDUCT_SETTINGS_KEY,
  conductBlursMedia,
  fetchConductLevel,
  normalizeConductLevel,
  type ConductLevel,
} from "@/lib/conduct";
import { cn } from "@/lib/utils";

type ConductContextValue = {
  level: ConductLevel;
  blursMedia: boolean;
  loading: boolean;
  setLevelLocal: (level: ConductLevel) => void;
  reload: () => Promise<void>;
};

const ConductContext = createContext<ConductContextValue | null>(null);

export function ConductProvider({ children }: { children: ReactNode }) {
  const { profile, loading: authLoading } = useAuth();
  const [level, setLevel] = useState<ConductLevel>(4);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!profile) return;
    const supabase = createClient();
    try {
      setLevel(await fetchConductLevel(supabase));
    } catch (err) {
      console.error("conduct_level", err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      setLoading(false);
      return;
    }
    void reload();
  }, [authLoading, profile, reload]);

  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    const channel = supabase
      .channel("pair_settings:conduct_level")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pair_settings",
          filter: `key=eq.${CONDUCT_SETTINGS_KEY}`,
        },
        (payload) => {
          const value = (payload.new as { value?: unknown } | null)?.value;
          if (value != null) setLevel(normalizeConductLevel(value));
          else void reload();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile, reload]);

  const blursMedia = conductBlursMedia(level);

  const value = useMemo(
    () => ({
      level,
      blursMedia,
      loading,
      setLevelLocal: setLevel,
      reload,
    }),
    [level, blursMedia, loading, reload]
  );

  return (
    <ConductContext.Provider value={value}>
      <div
        className={cn(
          blursMedia &&
            "[&_img]:blur-[40px] [&_video]:blur-[40px] [&_img]:scale-[1.02] [&_video]:scale-[1.02] [&_img]:pointer-events-none [&_video]:pointer-events-none"
        )}
        data-conduct-blur={blursMedia ? "bad-boy" : "clear"}
      >
        {children}
      </div>
    </ConductContext.Provider>
  );
}

export function useConduct() {
  const ctx = useContext(ConductContext);
  if (!ctx) {
    return {
      level: 4 as ConductLevel,
      blursMedia: false,
      loading: true,
      setLevelLocal: () => {},
      reload: async () => {},
    };
  }
  return ctx;
}
