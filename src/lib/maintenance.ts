import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export const MAINTENANCE_BYPASS_COOKIE = "qs_maintenance_bypass";

export function isMaintenanceMode(): boolean {
  return process.env.MAINTENANCE_MODE === "true";
}

export function hasMaintenanceBypass(request: NextRequest): boolean {
  return request.cookies.get(MAINTENANCE_BYPASS_COOKIE)?.value === "1";
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
  const expected = process.env.MAINTENANCE_UNLOCK_SECRET;
  if (!expected || !secret) return false;

  const a = Buffer.from(secret);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export function isMaintenanceAllowedPath(path: string): boolean {
  return path === "/" || path === "/api/maintenance/unlock";
}
