import { after, NextResponse } from "next/server";

import { getSiteOriginForRequest } from "@/lib/auth/site-url";
import { sendWaitlistConfirmEmail } from "@/lib/email/resend-transactional";
import { recipientRateKey, redactAddresses } from "@/lib/email/send-log-core";
import { clientNetworkKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";
import { remainingBudget, waitlistEmailKey } from "@/lib/waitlist/admin-view";
import { waitlistConfirmUrl, waitlistLeaveUrl } from "@/lib/waitlist/email-content";
import { parseWaitlistForm, type WaitlistFormValue } from "@/lib/waitlist/form";
import { waitlistPostRefusal } from "@/lib/waitlist/request-guard";
import {
  accountExistsFor,
  dropWaitlistEntryIfDue,
  findByEmailKey,
  insertFormRow,
  purgeExpiredWaitlistIfDue,
  readWaitlistBudget,
  renewConfirmToken,
} from "@/lib/waitlist/store";
import { mintManageToken } from "@/lib/waitlist/tokens";
import type { WaitlistSubmitResponse } from "@/lib/waitlist/types";

const OK: WaitlistSubmitResponse = { ok: true };

/** Confirm emails one network may cause in a day (each costs a send from the confirm budget). */
const CONFIRMS_PER_NETWORK_PER_DAY = 10;

function badInput(field: "form" | "email", error: string, status = 400) {
  const body: WaitlistSubmitResponse = { ok: false, field, error };
  return NextResponse.json(body, { status });
}

/**
 * POST /api/waitlist. Body: `WaitlistFormInput` (the `/waitlist` form).
 *
 * THE SAME ANSWER WHATEVER HAPPENS, the password-reset route's shape: every
 * well-formed submit gets 200 `{ok:true}`: a new person, someone already on
 * the list, confirmed, invited or joined, an address that already has an
 * account, a filled-in honeypot, the per-address limit, a spent email
 * budget. So the form can't be used to learn who is on the list or who has
 * an account, and the work that differs (the reads, the insert, the email)
 * runs in `after()`, so the timing says nothing either.
 *
 * What is answered differently, before any of that: 415 / 403 for a post
 * that didn't come from our own page (request-guard.ts: JSON only, and a
 * browser must say same-origin), so no other website can make its visitors
 * submit the form; 400 for input that doesn't parse (the field and the copy,
 * from `parseWaitlistForm`); 429 for the per-network limit (30 an hour: a
 * tabling table on campus Wi-Fi shares one address) and the global one (300
 * an hour, closed if the limiter is down); 503 without a service key.
 *
 * After answering: 3 a day per address (keyed on a hash, never the address);
 * an account with this address, or a row that is confirmed, invited or joined,
 * changes nothing; an entry past its line counts as gone, even before the
 * purge reaches it, so it is dropped first (`dropWaitlistEntryIfDue`) and the
 * person joins again as a fresh entry, as the pages promise; a new person gets
 * a row and the confirm email; an
 * unconfirmed person gets a fresh link carrying this submit's answers (the
 * older link dies, so whoever confirms confirms the answers sent with the
 * link they tapped) and a fresh start: the new link makes the entry's join
 * date now (trigger `waitlist_restart_clock`, 20261003170000), so a late
 * confirm still gets the full time. A confirm email needs room in the CONFIRM budget
 * (`WAITLIST_CONFIRM_DAILY_CAP`, its own allowance: the form can never spend
 * the founders' access-code sends) and in this network's 10 a day; without
 * it the row is saved and nothing is sent. At most once an hour the same
 * background step runs the retention purge (store.ts
 * `purgeExpiredWaitlistIfDue`: every entry 38 days after it joined,
 * unconfirmed ones 28 days after their last confirm email, two days inside
 * the promised 40 and 30).
 */
export async function POST(req: Request) {
  const refused = waitlistPostRefusal({
    contentType: req.headers.get("content-type"),
    secFetchSite: req.headers.get("sec-fetch-site"),
  });
  if (refused) return badInput("form", refused.error, refused.status);

  const network = clientNetworkKey(req);
  const perNet = await rateLimit(`waitlist-net:${network}`, { limit: 30, windowSec: 3600 });
  if (!perNet.allowed) return tooManyRequests(perNet);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return badInput("form", "Something went wrong. Refresh the page and try again.");
  }
  const parsed = parseWaitlistForm(raw);
  if (!parsed.ok) return NextResponse.json(parsed satisfies WaitlistSubmitResponse, { status: 400 });
  const value = parsed.value;
  const emailKey = waitlistEmailKey(value.email);
  if (!emailKey) return badInput("email", "That doesn't look like an email address.");

  // A bot that filled the hidden field gets the same answer and costs nothing:
  // it never reaches the global limit, so it can't use that up for people.
  if (value.honeypot) return NextResponse.json(OK);

  const global = await rateLimit("waitlist-global", { limit: 300, windowSec: 3600, failClosed: true });
  if (!global.allowed) return tooManyRequests(global);

  if (!isSupabaseServiceConfigured()) {
    const body: WaitlistSubmitResponse = {
      ok: false,
      field: "form",
      error: "The waitlist isn't available right now. Try again later.",
    };
    return NextResponse.json(body, { status: 503 });
  }

  // Links point at this host locally (localhost:3102), at the site otherwise.
  const site = getSiteOriginForRequest(req);
  after(() => saveAndConfirm(value, emailKey, site, network));
  return NextResponse.json(OK);
}

/** The part of a submit that runs after the answer has gone. Never throws. */
async function saveAndConfirm(value: WaitlistFormValue, emailKey: string, site: string, network: string): Promise<void> {
  try {
    const service = createSupabaseServiceClient();
    await purgeExpiredWaitlistIfDue(service);

    const addressKey = recipientRateKey(emailKey, process.env.SCHOOL_EMAIL_VERIFY_SECRET);
    const perAddress = await rateLimit(`waitlist-email:${addressKey}`, { limit: 3, windowSec: 86_400 });
    if (!perAddress.allowed) return;

    if (await accountExistsFor(service, [value.email, emailKey])) return;

    // Past its line (38 days, or 28 unconfirmed): gone now, so this submit is a fresh entry.
    await dropWaitlistEntryIfDue(service, emailKey);
    const existing = await findByEmailKey(service, emailKey);
    // Confirmed, invited or joined: nothing changes and nothing is sent.
    if (existing && (existing.confirmed_at || existing.code_hash || existing.redeemed_at)) return;

    const token = (await mayEmail(service, network)) ? mintManageToken() : null;
    if (!existing) {
      if ((await insertFormRow(service, value, emailKey, token?.hash ?? null)) === "exists") return;
    } else if (!token || !(await renewConfirmToken(service, existing.id, token.hash, value))) {
      return;
    }
    if (!token) return;

    await sendWaitlistConfirmEmail(
      value.email,
      waitlistConfirmUrl(site, token.token),
      waitlistLeaveUrl(site, token.token),
    );
  } catch (err) {
    // Logged only, never with the address; the answer has already gone out.
    console.error("[waitlist] submit", redactAddresses(err instanceof Error ? err.message : String(err)));
  }
}

/**
 * Room for one more confirm email: the confirm budget (never the founders'
 * access-code budget) and this network's daily share. Warns when either is
 * spent, so a flood shows up in the logs.
 */
async function mayEmail(service: ReturnType<typeof createSupabaseServiceClient>, network: string): Promise<boolean> {
  const budget = await readWaitlistBudget(service, "waitlist_confirm");
  if (remainingBudget(budget.used, budget.cap) < 1) {
    console.warn("[waitlist] the confirm-email budget is spent for today: a confirm email was not sent");
    return false;
  }
  const perDay = await rateLimit(`waitlist-confirm-net:${network}`, {
    limit: CONFIRMS_PER_NETWORK_PER_DAY,
    windowSec: 86_400,
  });
  if (!perDay.allowed) {
    console.warn("[waitlist] one network passed its confirm emails for today: a confirm email was not sent");
    return false;
  }
  return true;
}
