import "server-only";
import { headers } from "next/headers";

import { detectAppShell, type AppShell } from "@/lib/native/detect";

/**
 * "Is this request from Vibe's App Store / Google Play app?", on the server
 * (handoffs/wave-plan-pwa/plan.md §6 S2A). The store app appends
 * `VibeApp/1 (ios|android)` to its web view's user agent, and the user
 * agent is the only one of detect.ts's two signals a server can see.
 *
 * A user agent is whatever the sender says it is, so this decides what to
 * SHOW (no Vibe+ purchase in the app, no landing page), never who may do
 * what. Someone faking the token only hides things from themselves.
 *
 * Reading the request headers makes the page that calls this dynamic. Never
 * call it from the root layout: every route would stop being static
 * (critic-s2s3.md item 18).
 */

/**
 * The store app a request's headers came from, or null for any browser.
 * Takes anything with `get`, so a route handler's `request.headers` and
 * `await headers()` both fit.
 */
export function appShellFromHeaders(h: Pick<Headers, "get">): AppShell | null {
  return detectAppShell(h.get("user-agent"));
}

/**
 * The same answer for the request being rendered right now, for server
 * components and server actions, via `next/headers`.
 */
export async function appShellFromRequest(): Promise<AppShell | null> {
  return appShellFromHeaders(await headers());
}
