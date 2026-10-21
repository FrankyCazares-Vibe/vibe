/**
 * Which phone tab lights for a pathname — the pure rule behind
 * `MobileTabBar`. Zero imports, so it runs under `node --test` with
 * nothing to resolve but itself (see `mobile-tab-active.test.ts`).
 *
 * The five tabs keep their old rule: an exact match or a subpath
 * (`/profile/<handle>` lights Profile). A few routes outside the tabs
 * belong under one of them on a phone, and light that tab instead of
 * none: a club page sits inside Campus, your plan sits next to
 * Settings under Profile. Everything else lights nothing. Switched to a
 * club (wave 2), that club's page is the Profile tab's.
 */

export const MOBILE_TAB_HREFS = ["/campus", "/network", "/otto", "/messages", "/profile"] as const;
export type MobileTabHref = (typeof MOBILE_TAB_HREFS)[number];

/** Routes outside the five tabs that belong under one of them on a phone. */
export const MOBILE_TAB_SECTIONS: ReadonlyArray<readonly [base: string, tab: MobileTabHref]> =
  Object.freeze([
    ["/orgs", "/campus"], // a club page is reached from Campus → Orgs
    ["/plus", "/profile"], // your plan is account business, next to Settings
  ] as const);

/** True when `pathname` is `base` itself or a path below it (`/orgsx` is not). */
function under(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * True when `pathname` is the club page of `handle` or below it (setup,
 * tools). Handles compare lower-cased; a segment that won't decode is no match.
 */
export function isClubPath(pathname: string, handle: string): boolean {
  const m = /^\/orgs\/([^/]+)(?:\/|$)/.exec(pathname);
  if (!m) return false;
  let segment: string;
  try {
    segment = decodeURIComponent(m[1]);
  } catch {
    return false;
  }
  const want = handle.trim().toLowerCase();
  return want !== "" && segment.toLowerCase() === want;
}

/**
 * The tab that lights for this pathname, or null for none. `switchedHandle`:
 * the club the Profile tab stands for on this phone (club-switch.ts), whose
 * page and its subpaths light Profile; every other club page lights Campus.
 */
export function activeMobileTab(
  pathname: string | null | undefined,
  switchedHandle?: string | null,
): MobileTabHref | null {
  if (!pathname) return null;
  if (switchedHandle && isClubPath(pathname, switchedHandle)) return "/profile";
  for (const href of MOBILE_TAB_HREFS) {
    if (under(pathname, href)) return href;
  }
  for (const [base, tab] of MOBILE_TAB_SECTIONS) {
    if (under(pathname, base)) return tab;
  }
  return null;
}
