/**
 * Which Supabase key may be used as the PUBLIC key (the one every browser
 * downloads), and what to do when the wrong kind is configured.
 *
 * PURE: no imports, so `next.config.ts`, the browser bundle, the Edge runtime
 * and `node --test` can all load it.
 *
 * Why this exists (S71, 2026-09-30): Vercel Production had the service_role
 * key — the database master key — in `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Next.js
 * copies every `NEXT_PUBLIC_*` variable the code mentions into the files the
 * browser downloads, so the master key was readable by anyone on the login
 * page. A check inside the running code is too late for that: the string is
 * already in the bundle. So the choice is made at BUILD time, in
 * `next.config.ts`, and a build that would ship a secret key refuses instead.
 */

export type SupabaseKeyKind = "publishable" | "anon" | "secret" | "unknown";

/** Decode a base64url string to text without Node-only APIs (atob exists in Node, Edge and browsers). */
function decodeBase64Url(part: string): string {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

/**
 * What a key IS, from its shape alone:
 *  - `sb_publishable_…`                      → "publishable" (meant for browsers)
 *  - `sb_secret_…`                           → "secret"
 *  - a JWT whose `role` claim is `anon`      → "anon" (meant for browsers)
 *  - a JWT whose `role` is `service_role`    → "secret" (the master key)
 *  - anything else                           → "unknown"
 * It never logs or returns the key.
 */
export function classifySupabaseKey(key: string | null | undefined): SupabaseKeyKind {
  const k = typeof key === "string" ? key.trim() : "";
  if (!k) return "unknown";
  if (k.startsWith("sb_publishable_")) return "publishable";
  if (k.startsWith("sb_secret_")) return "secret";
  const parts = k.split(".");
  if (parts.length === 3) {
    try {
      const role = (JSON.parse(decodeBase64Url(parts[1])) as { role?: unknown }).role;
      if (role === "anon") return "anon";
      if (role === "service_role") return "secret";
    } catch {
      // not a JWT we can read: fall through to "unknown"
    }
  }
  return "unknown";
}

export type PublicKeyChoice = {
  /** The key to ship to browsers, or null when neither variable is set. */
  key: string | null;
  /** Which variable it came from. */
  source: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" | "NEXT_PUBLIC_SUPABASE_ANON_KEY" | null;
  /** True when `NEXT_PUBLIC_SUPABASE_ANON_KEY` held a secret key and was NOT used. */
  ignoredSecretInAnonSlot: boolean;
};

/**
 * The public key to build with. Order: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
 * (what the Supabase–Vercel integration sets), then the classic
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY`. A variable holding a SECRET key is never
 * chosen. Throws when a variable is set but every one that is set holds a
 * secret key: a build with nothing safe to ship must stop, not guess.
 * Neither set → `{ key: null }` (the app already reports a missing key at
 * runtime; a bare CI build must keep working).
 */
export function pickPublicSupabaseKey(env: Record<string, string | undefined>): PublicKeyChoice {
  const names = ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
  // Judge the anon slot up front: when the publishable variable wins, the loop
  // below never looks at it, and a secret key sitting there must still be reported.
  const ignoredSecretInAnonSlot = classifySupabaseKey(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) === "secret";
  let anySet = false;
  for (const name of names) {
    const value = env[name]?.trim();
    if (!value) continue;
    anySet = true;
    if (classifySupabaseKey(value) === "secret") continue;
    return { key: value, source: name, ignoredSecretInAnonSlot };
  }
  if (anySet) {
    throw new Error(
      "Refusing to build: every NEXT_PUBLIC_SUPABASE_*_KEY variable holds a SECRET Supabase key " +
        "(service_role or sb_secret_). A NEXT_PUBLIC_ variable is copied into the files every visitor " +
        "downloads. Put the publishable / anon key there instead (Supabase → Project Settings → API Keys).",
    );
  }
  return { key: null, source: null, ignoredSecretInAnonSlot: false };
}
