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
import {
  dominantDisplayTitle,
  isRolesSwitched,
  roleDisplayTitle,
  submissiveDisplayTitle,
  type DominantDisplayTitle,
  type RoleDisplayTitle,
  type SubmissiveDisplayTitle,
} from "@/lib/role-display";
import { isR2Path } from "@/lib/storage/paths";
import { signObjectUrl } from "@/lib/storage/client";

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  homeRole: UserRole | null;
  displayTitle: RoleDisplayTitle | null;
  dominantTitle: DominantDisplayTitle;
  submissiveTitle: SubmissiveDisplayTitle;
  isQueen: boolean;
  isSlave: boolean;
  isDaddy: boolean;
  /** @deprecated Use isDaddy */
  isKing: boolean;
  /** Permanent home identity is slave (keeps AI writing even as Daddy). */
  isHomeSlave: boolean;
  isSwitched: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function normalizeProfile(data: Profile): Profile {
  const role = data.role === "queen" ? "queen" : "slave";
  const home =
    data.home_role === "queen" || data.home_role === "slave"
      ? data.home_role
      : role;
  return { ...data, role, home_role: home };
}

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
        const normalized = normalizeProfile(data as Profile);
        const resolved = await withResolvedAvatar(normalized);
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

      // Avoid re-fetching profile on TOKEN_REFRESHED — that event fires often
      // and concurrent refresh races with the proxy can kill the session.
      if (!nextUser) {
        setProfile(null);
      } else if (
        event === "SIGNED_IN" ||
        event === "INITIAL_SESSION" ||
        event === "USER_UPDATED"
      ) {
        void fetchProfile(nextUser.id);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    window.location.href = "/";
  }, [supabase]);

  const role = profile?.role ?? null;
  const homeRole = profile?.home_role ?? null;
  const displayTitle = profile ? roleDisplayTitle(profile) : null;
  const dominantTitle = profile ? dominantDisplayTitle(profile) : "Queen";
  const submissiveTitle = profile
    ? submissiveDisplayTitle(profile)
    : "slave";
  const switched = profile ? isRolesSwitched(profile) : false;
  const isDaddy = displayTitle === "Daddy";

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      role,
      homeRole,
      displayTitle,
      dominantTitle,
      submissiveTitle,
      isQueen: role === "queen",
      isSlave: role === "slave",
      isDaddy,
      isKing: isDaddy,
      isHomeSlave: homeRole === "slave",
      isSwitched: switched,
      loading,
      refreshProfile,
      signOut,
    }),
    [
      user,
      profile,
      role,
      homeRole,
      displayTitle,
      dominantTitle,
      submissiveTitle,
      isDaddy,
      switched,
      loading,
      refreshProfile,
      signOut,
    ]
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
