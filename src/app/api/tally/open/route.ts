import { after, NextResponse, userAgent } from "next/server";

import { clientNetworkKey, rateLimit } from "@/lib/rate-limit";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";
import {
  createDropNotes,
  OPENS_ALL_NETWORKS_PER_HOUR,
  OPENS_PER_NETWORK_PER_DAY,
  OPENS_PER_NETWORK_PER_HOUR,
  type TallyDrop,
} from "@/lib/tally/limits";
import { networkDayCode, utcDay } from "@/lib/tally/network-code";
import { carriesSignInCookie, isAutomatedBrowserName, readOpenBody, type TallyOpen } from "@/lib/tally/open";
import { waitlistPostRefusal } from "@/lib/waitlist/request-guard";

const TAG = "tally/open";
const NO_STORE = { "cache-control": "no-store" } as const;

/**
 * An open a limit dropped is said in the logs, the way the waitlist says a
 * spent email budget (`mayEmail`), so a capped day can be told from a quiet
 * one. Which limit and how many, never the network and never the label; at
 * most a line a minute per limit (limits.ts).
 */
const dropNote = createDropNotes();

function warnDropped(reason: TallyDrop): void {
  const line = dropNote(reason, Date.now());
  if (line) console.warn(`[${TAG}] ${line}`);
}

/**
 * "The function isn't there (yet)": PGRST202 PostgREST's schema cache has no
 * such function; 42883 Postgres has none. The code ships before
 * 20261012180000 is applied, so this is a quiet "count nothing", said once.
 */
const MISSING_FN_CODES = new Set(["PGRST202", "42883"]);
let warnedMissing = false;

function isMissingFunction(error: { code?: string; message?: string }): boolean {
  if (error.code && MISSING_FN_CODES.has(error.code)) return true;
  return (error.message ?? "").toLowerCase().includes("could not find the function");
}

/**
 * POST /api/tally/open. Body: `{ page, src }` from `OpenBeacon`
 * (src/components/tally/OpenBeacon.tsx), once per page load.
 *
 * Vibe's own count of how many times the front page, the waitlist page and
 * the sign-up page are opened, per day and per link label (launch checklist
 * item 19). What is kept is a number in `public.page_open_tally`: the day,
 * one of three page names, the `?src=` label, a count. Not the account, the
 * IP address, the browser, the page they came from, a cookie or the time.
 *
 * THE SAME ANSWER WHATEVER HAPPENS: 200 `{ok:true}`, sent before any of the
 * work, which runs in `after()`. Counted, skipped, limited, a post that
 * isn't ours, a database without the function yet: the page (and anyone
 * probing) is told the same thing in the same time, so nobody can learn
 * which of their posts moved the number.
 *
 * An open is NOT counted when:
 *   - the post didn't come from our own page (request-guard.ts, the waitlist
 *     form's rule: JSON only, and a browser must say same-origin), so no
 *     other website can make its visitors' browsers add to the numbers;
 *   - the request carries a sign-in cookie. Only the cookie's name is looked
 *     at, never who it is, so the founders' own testing isn't in the numbers;
 *   - the caller's own name says it is not a person's browser: a search
 *     engine that renders the page, a link-preview fetcher, a browser with no
 *     window, a script (Next's list of known bots, and open.ts
 *     `isAutomatedBrowserName`). The name is read here to decide and goes no
 *     further: it is not stored and not logged. A tool that calls itself a
 *     normal browser is counted, which is why the limits exist;
 *   - the body isn't `{ page }` with one of the three page names;
 *   - this network has passed its hour or its day, or all networks together
 *     have passed the hour's ceiling (the existing limiter,
 *     src/lib/rate-limit.ts; the numbers are in src/lib/tally/limits.ts).
 *     The network is NOT stored, here or in the limiter: the limiter's rows
 *     are keyed on a scrambled code made from the network, the day and a
 *     server secret (src/lib/tally/network-code.ts says why), and the tally
 *     itself gets no address. With no secret set the per-network limits are
 *     skipped and only the ceiling applies. Each drop is said in the logs
 *     (`warnDropped`);
 *   - the function is missing (the migration isn't applied yet), or the
 *     service key isn't set.
 *
 * A label that isn't a short plain tag is counted under no label; the
 * function applies the same rule again, and caps the labels a day can hold.
 */
export async function POST(req: Request) {
  let text = "";
  try {
    text = await req.text();
  } catch {
    text = "";
  }

  const ours =
    waitlistPostRefusal({
      contentType: req.headers.get("content-type"),
      secFetchSite: req.headers.get("sec-fetch-site"),
    }) === null;
  const signedIn = carriesSignInCookie(req.headers.get("cookie"));
  // Worked out before the answer, like the cookie check, and never passed on.
  const automated = userAgent(req).isBot || isAutomatedBrowserName(req.headers.get("user-agent"));
  const open = ours && !signedIn && !automated ? readOpenBody(text) : null;

  if (open && isSupabaseServiceConfigured()) {
    // Scrambled here, before the answer, so the address itself never
    // reaches the part that runs afterwards or the limiter's table.
    const networkCode = networkDayCode(
      clientNetworkKey(req),
      utcDay(new Date()),
      process.env.SCHOOL_EMAIL_VERIFY_SECRET,
    );
    after(() => countOpen(open, networkCode));
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

/**
 * The part that runs after the answer has gone. Never throws.
 *
 * The network's own limits come first, so a network that is already past
 * them can't use up the all-networks ceiling for everyone else. All three
 * fail open (the limiter's default): if the limiter is down the open still
 * counts, because losing real opens quietly is the worse mistake here.
 */
async function countOpen(open: TallyOpen, networkCode: string | null): Promise<void> {
  try {
    // No code (no secret set): the per-network limits are skipped, never
    // keyed on the address. The ceiling below still bounds a flood.
    if (networkCode) {
      const perHour = await rateLimit(`tally-open-net:${networkCode}`, {
        limit: OPENS_PER_NETWORK_PER_HOUR,
        windowSec: 3600,
      });
      if (!perHour.allowed) return warnDropped("network-hour");
      const perDay = await rateLimit(`tally-open-net-day:${networkCode}`, {
        limit: OPENS_PER_NETWORK_PER_DAY,
        windowSec: 86_400,
      });
      if (!perDay.allowed) return warnDropped("network-day");
    }
    // No network in this key: one count for everybody.
    const everyone = await rateLimit("tally-open-all", {
      limit: OPENS_ALL_NETWORKS_PER_HOUR,
      windowSec: 3600,
    });
    if (!everyone.allowed) return warnDropped("all-networks");

    const { error } = await createSupabaseServiceClient().rpc("tally_page_open", {
      p_page: open.page,
      p_label: open.label,
    });
    if (!error) return;
    if (isMissingFunction(error)) {
      if (!warnedMissing) {
        warnedMissing = true;
        console.warn(`[${TAG}] tally_page_open is missing; counting nothing until 20261012180000 is applied`);
      }
      return;
    }
    // By code only: never the label, never the network.
    console.error(`[${TAG}]`, error.code ?? "unknown");
  } catch (err) {
    console.error(`[${TAG}]`, err instanceof Error ? err.name : "unknown");
  }
}
