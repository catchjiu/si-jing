import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getBypassCookieOptions,
  hasMaintenanceBypass,
  isMaintenanceAllowedPath,
  isMaintenanceMode,
  isValidBypassCookie,
  MAINTENANCE_BYPASS_COOKIE,
} from "@/lib/maintenance";
import { supabaseCookieOptions } from "@/lib/supabase/cookie-options";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const path = request.nextUrl.pathname;
  const rawBypass = request.cookies.get(MAINTENANCE_BYPASS_COOKIE)?.value;
  const hasBypass = hasMaintenanceBypass(request);
  const maintenanceActive = isMaintenanceMode() && !hasBypass;

  // Drop stale unlock cookies (e.g. after MAINTENANCE_BYPASS_VERSION bump).
  const clearStaleBypass = (response: NextResponse) => {
    if (rawBypass && !isValidBypassCookie(rawBypass)) {
      response.cookies.set(MAINTENANCE_BYPASS_COOKIE, "", {
        ...getBypassCookieOptions(),
        maxAge: 0,
      });
    }
    return response;
  };

  if (maintenanceActive && !isMaintenanceAllowedPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return clearStaleBypass(NextResponse.redirect(url));
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: supabaseCookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, cacheHeaders) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
          if (cacheHeaders) {
            Object.entries(cacheHeaders).forEach(([key, value]) => {
              supabaseResponse.headers.set(key, value);
            });
          }
        },
      },
    }
  );

  // Refresh expired tokens and write updated cookies to the response.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub ?? null;

  const isAuthPage = path === "/" || path.startsWith("/forgot-password");
  const isProtected = path.startsWith("/dashboard");
  const isAuthCallback = path.startsWith("/auth/callback");

  if (maintenanceActive) {
    return clearStaleBypass(supabaseResponse);
  }

  if (!userId && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return clearStaleBypass(NextResponse.redirect(url));
  }

  if (userId && isAuthPage && !isAuthCallback) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return clearStaleBypass(NextResponse.redirect(url));
  }

  return clearStaleBypass(supabaseResponse);
}
