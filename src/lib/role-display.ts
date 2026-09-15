import type { UserRole } from "@/lib/types";

export type RoleDisplayTitle = "Queen" | "Daddy" | "slave" | "slut";
export type DominantDisplayTitle = "Queen" | "Daddy";
export type SubmissiveDisplayTitle = "slave" | "slut";

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
 * Switch mode: home slave is Daddy, home Queen is slut.
 */
export function roleDisplayTitle(profile: RoleIdentity): RoleDisplayTitle {
  if (profile.role === "slave") {
    return homeRoleOf(profile) === "queen" ? "slut" : "slave";
  }
  if (profile.role === "queen") {
    return homeRoleOf(profile) === "slave" ? "Daddy" : "Queen";
  }
  return "slave";
}

/** Title used when referring to the dominant partner from the other side. */
export function dominantDisplayTitle(profile: RoleIdentity): DominantDisplayTitle {
  return isRolesSwitched(profile) ? "Daddy" : "Queen";
}

export function submissiveDisplayTitle(
  profile: RoleIdentity
): SubmissiveDisplayTitle {
  return isRolesSwitched(profile) ? "slut" : "slave";
}

export function isDaddyPersona(profile: RoleIdentity): boolean {
  return roleDisplayTitle(profile) === "Daddy";
}

/** @deprecated Use isDaddyPersona */
export function isKingPersona(profile: RoleIdentity): boolean {
  return isDaddyPersona(profile);
}
