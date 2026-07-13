import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { supabaseCookieOptions } from "@/lib/supabase/cookie-options";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: supabaseCookieOptions,
      isSingleton: true,
      auth: {
        persistSession: true,
        // Let the browser client refresh on its own schedule.
        // Do not also hammer getSession() from AuthProvider — concurrent
        // refresh-token use with the proxy invalidates the session and
        // can bounce the page through / → /dashboard (looks like a reload).
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );
}
