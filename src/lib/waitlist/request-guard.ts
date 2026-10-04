/**
 * The waitlist form's post must come from our own page (review fix, Oct 3).
 * Without this, any website could make its visitors' browsers submit the
 * form (a "simple" cross-site POST: text/plain, no preflight), and every
 * visitor's network would count as a different person against the limits.
 *
 * Two rules, either one enough on its own for a browser:
 *   1. The body must be declared application/json. A browser only sends that
 *      cross-site after a CORS preflight, which our routes never answer, and
 *      an HTML form can't send it at all. -> 415
 *   2. When the browser says where the request came from (Sec-Fetch-Site,
 *      sent by every current browser), it must be "same-origin". -> 403
 * A script with no browser (curl) passes both, and meets the rate limits.
 *
 * Pure: no imports, so the node test runner loads it.
 */

export type CrossSiteRefusal = { status: 403 | 415; error: string };

export function waitlistPostRefusal(headers: {
  contentType: string | null;
  secFetchSite: string | null;
}): CrossSiteRefusal | null {
  const type = (headers.contentType ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") {
    return { status: 415, error: "Send the form from the Vibe waitlist page." };
  }
  const site = (headers.secFetchSite ?? "").trim().toLowerCase();
  if (site && site !== "same-origin") {
    return { status: 403, error: "Send the form from the Vibe waitlist page." };
  }
  return null;
}

/** What the form shows when the waitlist can't take an entry at all. */
export const WAITLIST_UNAVAILABLE = "The waitlist isn't available right now. Try again later.";

/**
 * No thank-you for an entry that can't be saved (release fix, Oct 4).
 *
 * The route answers before it saves, so on a database that has no waitlist
 * yet (the site was deployed before the waitlist's migration files were
 * applied) every submit got the thank-you page while the save failed in the
 * background. `signupSwitch` is `readSignupSwitch()`'s answer: null means the
 * switch can't be read, and the switch arrives in the same file as the
 * `waitlist` table, so null is "the waitlist's part of the database is not
 * there, or the database can't be reached". -> 503
 *
 * True and false both pass: the switch only decides what the site's buttons
 * say, and the form's page already sends people to sign-up while it is open.
 * The answer is the same for everyone, so it says nothing about an address.
 */
export function waitlistStoreRefusal(signupSwitch: boolean | null): { status: 503; error: string } | null {
  return signupSwitch === null ? { status: 503, error: WAITLIST_UNAVAILABLE } : null;
}
