import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Anon Supabase client without cookie session wiring (health checks, stateless server probes).
 * For authenticated routes use `createSupabaseServerClient` or `getSupabaseBrowserClient`.
 */
export function createSupabaseClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey());
}
