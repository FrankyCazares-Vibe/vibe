/**
 * The page-open tally's pure rules (launch checklist item 19, Oct 12 2026):
 * which pages are counted, which link labels are kept, and what one post from
 * the page's beacon may ask for. No imports, so the browser, the route and
 * `node --test` all load it as is.
 *
 * WHAT THE TALLY IS. A day-totals table (`public.page_open_tally`,
 * 20261012180000): the day, one of three page names, a link label and a
 * number. Nothing about the visitor: no account, no IP address, no browser
 * details, no cookie. So nothing here may ever pass anything else along.
 */

/** The three pages that are counted, by the fixed name the table stores. */
export const TALLY_PAGES = ["home", "waitlist", "signup"] as const;

export type TallyPage = (typeof TALLY_PAGES)[number];

/** Where each counted page lives, for the admin tab's words. */
export const TALLY_PAGE_PATHS: Record<TallyPage, string> = {
  home: "/",
  waitlist: "/waitlist",
  signup: "/auth/signup",
};

/** The route the beacon posts to. Same origin, so the browser rule needs no new host. */
export const TALLY_OPEN_PATH = "/api/tally/open";

/** A beacon post is `{ page, src }`: anything longer than this is not ours and is ignored. */
export const TALLY_BODY_MAX_CHARS = 256;

/**
 * A label is the `?src=` of the link the visitor came in on (`landing`,
 * `ig-vibe`). Lowercase letters, digits and dashes, 32 at most: the table's
 * own CHECK is the same shape, and `tally_page_open` applies it again.
 *
 * Narrower than the waitlist's source tag on purpose (form.ts allows `_` and
 * 40): a label with an underscore is counted under no label here. Use dashes
 * in the links you post.
 */
const LABEL_RE = /^[a-z0-9-]{1,32}$/;

export function isTallyPage(value: unknown): value is TallyPage {
  return typeof value === "string" && (TALLY_PAGES as readonly string[]).includes(value);
}

/**
 * The label to store, or "" for none. Trimmed and lowercased first, as the
 * waitlist does with the same `?src=`, so `IG-Vibe` and `ig-vibe` are one
 * label in both places. Anything that isn't a short plain tag (an address, a
 * sentence, a name with spaces) is dropped whole, never cut to fit: free
 * text must not reach the table.
 */
export function cleanTallyLabel(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const v = raw.trim().toLowerCase();
  return LABEL_RE.test(v) ? v : "";
}

/**
 * Does the request carry a sign-in cookie? Only the cookie's NAME is looked
 * at (`sb-<project>-auth-token`, or its `.0` / `.1` chunks,
 * src/lib/supabase/cookie-options.ts); the value, which says who, is never
 * read. A signed-in open is not counted, so the founders' own testing can't
 * swamp the numbers.
 *
 * `sb-…-auth-token-code-verifier` is not a sign-in: it is set while someone
 * is still signing up, so it does not match.
 */
export function carriesSignInCookie(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(";").some((part) => {
    const eq = part.indexOf("=");
    const name = (eq < 0 ? part : part.slice(0, eq)).trim();
    return /^sb-.+-auth-token(?:\.\d+)?$/.test(name);
  });
}

/**
 * Names a tool gives itself that a person's browser never does. Search
 * crawlers that run the page (`Googlebot/2.1`, `bingbot/2.0`, `Applebot/0.1`),
 * the `(compatible; …)` every crawler and uptime check still writes and no
 * browser has since Internet Explorer 10, and Chrome driven with no window
 * (`HeadlessChrome`: screenshot services, link scanners, our own audits) or
 * by a speed test (`Chrome-Lighthouse`).
 *
 * `bot` only counts before `/`, `;`, `)` or the end, so a phone whose model
 * name merely holds the letters (`CUBOT NOTE 20`) is still a person.
 */
const AUTOMATED_NAME_RE = /compatible;|bot[/;)]|bot$|spider|crawl|headless|lighthouse/i;

/**
 * Does the name the caller gives itself (the User-Agent header) say it is
 * not a person's browser? Review fix, Oct 12 2026: a search engine that
 * renders the front page runs the beacon like anyone else, and at a few real
 * opens a day that would double the numbers.
 *
 * True for no name at all and for anything that doesn't start `Mozilla/` as
 * every browser does (curl, a script's HTTP library, a link-preview fetcher),
 * and for the names above. The route asks Next's own list of known bots as
 * well (`userAgent(req).isBot`); this one is ours so it can be tested and can
 * cover what that list leaves out.
 *
 * THE NAME IS READ TO DECIDE AND NEVER KEPT: not in the tally, not in a log.
 * It is also only a name. A script can call itself Safari, and a scanner that
 * runs a normal browser (a school mail system opening the link in an invite
 * email) looks like a person. The limits (limits.ts) are what bound those,
 * and the Numbers tab says so.
 */
export function isAutomatedBrowserName(userAgent: string | null | undefined): boolean {
  const name = (userAgent ?? "").trim();
  if (!/^mozilla\//i.test(name)) return true;
  return AUTOMATED_NAME_RE.test(name);
}

/** What one beacon post asks to count. */
export type TallyOpen = { page: TallyPage; label: string };

/**
 * Reads a beacon post's body. Null for anything that isn't ours: too long,
 * not JSON, not an object, or a page that isn't one of the three. A label
 * that isn't a plain tag is kept as "" (the open still counts, under no
 * label).
 */
export function readOpenBody(text: string | null | undefined): TallyOpen | null {
  if (!text || text.length > TALLY_BODY_MAX_CHARS) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const body = parsed as Record<string, unknown>;
  if (!isTallyPage(body.page)) return null;
  return { page: body.page, label: cleanTallyLabel(body.src) };
}

/** The body the beacon sends for a page, given the page address's query string. */
export function openBeaconBody(page: TallyPage, search: string): string {
  let src: string | null = null;
  try {
    src = new URLSearchParams(search).get("src");
  } catch {
    src = null;
  }
  return JSON.stringify({ page, src: cleanTallyLabel(src) });
}
