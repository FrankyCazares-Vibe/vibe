import { classifySupabaseKey } from "@/lib/supabase/key-guard";

/** Shared URL/keys for Supabase clients (browser, server, middleware). */

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  return url.replace(/\/$/, "");
}

export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  // next.config.ts already swaps a secret key out at build time (key-guard.ts).
  // This is the second wall: a secret key used as the public key would run every
  // signed-out request with full database privileges, so never use one.
  if (classifySupabaseKey(key) === "secret") {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY holds a secret Supabase key; refusing to use it as the public key",
    );
  }
  return key;
}
