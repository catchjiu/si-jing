"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Profile, UserRole } from "@/lib/types";
import { isR2Path } from "@/lib/storage/paths";
import { signObjectUrl } from "@/lib/storage/client";

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  isQueen: boolean;
  isSlave: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function withResolvedAvatar(profile: Profile): Promise<Profile> {
  const avatar = profile.avatar_url;
  if (!avatar || !isR2Path(avatar)) return profile;
  const url = await signObjectUrl({
    bucket: "submissions",
    path: avatar,
    expiresIn: 60 * 60 * 24,
  });
  return { ...profile, avatar_url: url ?? avatar };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(
    async (userId: string) => {
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (data) {
        const resolved = await withResolvedAvatar(data as Profile);
        setProfile(resolved);
      } else {
        setProfile(null);
      }
    },
    [supabase]
  );

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await fetchProfile(user.id);
  }, [fetchProfile, user]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      setUser(currentUser);
      if (currentUser) {
        await fetchProfile(currentUser.id);
      }
      setLoading(false);
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        void fetchProfile(nextUser.id);
      } else {
        setProfile(null);
      }
      setLoading(false);

      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        void supabase.auth.getSession();
      }
    });

    const refreshSession = () => {
      void supabase.auth.getSession();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshSession();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refreshSession);

    const refreshInterval = window.setInterval(refreshSession, 4 * 60 * 1000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refreshSession);
      window.clearInterval(refreshInterval);
    };
  }, [fetchProfile, supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    window.location.href = "/";
  }, [supabase]);

  const role = profile?.role ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      role,
      isQueen: role === "queen",
      isSlave: role === "slave",
      loading,
      refreshProfile,
      signOut,
    }),
    [user, profile, role, loading, refreshProfile, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
