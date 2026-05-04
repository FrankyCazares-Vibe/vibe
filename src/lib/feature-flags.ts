/**
 * `NEXT_PUBLIC_SHOW_GLOBAL_FEED=true` — show `/feed` in the app shell and render the
 * global feed page. When unset/false (default), campus-only builds hide it and
 * redirect `/feed` → `/campus` so school posts stay scoped to campus.
 */
export function isGlobalFeedSurfaceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SHOW_GLOBAL_FEED === "true";
}

/** Default signed-in “home” in the app shell when global feed is deferred. */
export function getAppShellHomeHref(): "/feed" | "/campus" {
  return isGlobalFeedSurfaceEnabled() ? "/feed" : "/campus";
}
