import { createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export const MAINTENANCE_BYPASS_COOKIE = "qs_maintenance_bypass";
export const MAINTENANCE_UNLOCK_SECRET_DEFAULT = "brokenheart";

export function getMaintenanceUnlockSecret(): string {
  const fromEnv = process.env.MAINTENANCE_UNLOCK_SECRET?.trim();
  return fromEnv || MAINTENANCE_UNLOCK_SECRET_DEFAULT;
}

export function isMaintenanceMode(): boolean {
  const value = process.env.MAINTENANCE_MODE?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

/**
 * Cookie value for a valid unlock. Bump MAINTENANCE_BYPASS_VERSION (or change
 * MAINTENANCE_UNLOCK_SECRET) to invalidate every device that already unlocked.
 */
export function getExpectedBypassValue(): string {
  const secret = process.env.MAINTENANCE_UNLOCK_SECRET ?? "";
  const version = process.env.MAINTENANCE_BYPASS_VERSION?.trim() || "2";
  return createHash("sha256")
    .update(`qs-bypass:${version}:${secret}`)
    .digest("hex")
    .slice(0, 32);
}

export function isValidBypassCookie(value: string | undefined): boolean {
  if (!value) return false;
  const expected = getExpectedBypassValue();
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function hasMaintenanceBypass(request: NextRequest): boolean {
  return isValidBypassCookie(
    request.cookies.get(MAINTENANCE_BYPASS_COOKIE)?.value
  );
}

export function getBypassCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  };
}

export function isMaintenanceUnlockSecretValid(secret: string): boolean {
  const expected = getMaintenanceUnlockSecret();
  if (!secret) return false;

  const a = Buffer.from(secret);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export function isMaintenanceAllowedPath(path: string): boolean {
  return path === "/" || path === "/api/maintenance/unlock";
}
