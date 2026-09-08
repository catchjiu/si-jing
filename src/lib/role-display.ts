import type { UserRole } from "@/lib/types";

export type RoleDisplayTitle = "Queen" | "King" | "slave";

type RoleIdentity = {
  role: UserRole | null | undefined;
  home_role?: UserRole | null;
};

/** Permanent identity — never flipped by switch. Falls back to active role. */
export function homeRoleOf(profile: RoleIdentity): UserRole | null {
  if (profile.home_role === "queen" || profile.home_role === "slave") {
    return profile.home_role;
  }
  if (profile.role === "queen" || profile.role === "slave") {
    return profile.role;
  }
  return null;
}

/** True when active role differs from home identity (pair is switched). */
export function isRolesSwitched(profile: RoleIdentity): boolean {
  const home = homeRoleOf(profile);
  if (!home || !profile.role) return false;
  return profile.role !== home;
}

/**
 * Visible title for the current persona.
 * Home slave holding the dominant role is King; otherwise Queen / slave.
 */
export function roleDisplayTitle(profile: RoleIdentity): RoleDisplayTitle {
  if (profile.role === "slave") return "slave";
  if (profile.role === "queen") {
    return homeRoleOf(profile) === "slave" ? "King" : "Queen";
  }
  return "slave";
}

/** Title used when referring to the dominant partner from the other side. */
export function dominantDisplayTitle(profile: RoleIdentity): "Queen" | "King" {
  // If I am switched into slave (home queen), the dominant is King.
  if (profile.role === "slave" && homeRoleOf(profile) === "queen") {
    return "King";
  }
  // If I am King (home slave as queen), I am the dominant.
  if (profile.role === "queen" && homeRoleOf(profile) === "slave") {
    return "King";
  }
  return "Queen";
}

export function isKingPersona(profile: RoleIdentity): boolean {
  return roleDisplayTitle(profile) === "King";
}
