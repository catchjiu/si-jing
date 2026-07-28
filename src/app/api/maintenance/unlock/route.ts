import { NextResponse } from "next/server";
import {
  getBypassCookieOptions,
  getExpectedBypassValue,
  isMaintenanceMode,
  isMaintenanceUnlockSecretValid,
  MAINTENANCE_BYPASS_COOKIE,
} from "@/lib/maintenance";

export async function POST(request: Request) {
  if (!isMaintenanceMode()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  let body: { secret?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const secret = body.secret?.trim() ?? "";
  if (!isMaintenanceUnlockSecretValid(secret)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    MAINTENANCE_BYPASS_COOKIE,
    getExpectedBypassValue(),
    getBypassCookieOptions()
  );
  return response;
}
