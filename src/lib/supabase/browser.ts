"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

let browserClient: SupabaseClient | undefined;

/** Browser Supabase client — session stored in cookies via @supabase/ssr. */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    // Secure in production, same flags as the server clients (cookie-options.ts).
    browserClient = createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      cookieOptions: SESSION_COOKIE_OPTIONS,
    });
  }
  return browserClient;
}
