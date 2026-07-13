import type { CookieOptions } from "@supabase/ssr";

const isProduction = process.env.NODE_ENV === "production";

/** Shared cookie options so auth persists across browser, server, and proxy. */
export const supabaseCookieOptions: CookieOptions = {
  path: "/",
  sameSite: "lax",
  secure: isProduction,
  // ~400 days — matches @supabase/ssr default
  maxAge: 400 * 24 * 60 * 60,
};
