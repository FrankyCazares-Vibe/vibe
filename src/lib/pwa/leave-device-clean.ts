/**
 * Leave this device clean at sign-out, account deletion and every other way a
 * student stops being signed in here (handoffs/wave-plan-pwa/plan.md §8 W7,
 * W9 and §8.2; critic-w3.md items 4, 15 and 21).
 *
 * A shared phone must not keep the last student's notifications coming, their
 * words on the lock screen, their count on the icon, or their profile, posts
 * and searches in storage for the static pages to show the next person.
 *
 * `serverDelete`: true only where the session is still alive and nothing else
 * removes the row (the two browser-only `signOut({scope:"local"})` paths, run
 * BEFORE signOut). The logout route deletes the rows itself (it gets
 * pushLogoutBody()), and account deletion cascades, so those pass false and
 * run this AFTER they succeed.
 *
 * Never throws, never navigates (EmailLinkProblem stays on its page), and
 * finishes within about 3 s whatever the network does: the device half is
 * capped, and storage and the draft go regardless.
 *
 * Imports go one way only: this → device-push → push-native → bridge
 * (critic-w3.md item 20).
 */

import { clearDraft } from "@/lib/onboarding/draft";
import {
  clearShownNow,
  leaveDevicePush,
  PUSH_DEVICE_KEY,
  PUSH_SYNC_FAIL_KEY,
} from "@/lib/pwa/device-push";

/** The device half (DELETE, unsubscribe, shown notifications, badge) gets this long. */
const DEVICE_BUDGET_MS = 2500;

/**
 * Per-account localStorage, by name: `localStorage.clear()` would also replay
 * the tours (the *_tour_seen_v1 keys stay), and `vibe.launchUrlHandled`
 * (sessionStorage) stays so the app's launch link doesn't reopen.
 * `vibe_push_taps_v1` stays on purpose (critic-w3.md item 15): it holds
 * message ids only, and clearing it would let Android replay the last
 * student's tap onto the sign-in screen.
 */
const ACCOUNT_KEYS = [
  "vibe_user_v1",
  "vibe_posts_v1",
  "vibe_vibes_v1",
  "vibe_relationships_v1",
  "vibe_otto_lastpost_v1",
  "vibe_otto_v1",
  "vibe_cal_events_v1",
  "vibe_recent_searches_v1",
  PUSH_DEVICE_KEY,
  "vibe_push_ask_v1",
  "vibe_first_dm_ask_v1",
  PUSH_SYNC_FAIL_KEY,
] as const;

/**
 * In order (critic-w3.md item 21): the server DELETE (when `serverDelete`) →
 * unsubscribe / deleteToken → shown notifications (the worker's SIGNED_OUT, or
 * the app's delivered list) → the badge → storage → the onboarding draft.
 */
export function leaveDeviceClean(opts: { serverDelete: boolean }): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return leave(opts?.serverDelete === true).catch(() => {});
}

async function leave(serverDelete: boolean): Promise<void> {
  const finished = await withinBudget(leaveDevicePush({ serverDelete }), DEVICE_BUDGET_MS);
  // Still queued behind other work (a slow resync, a turn-on) and the caller
  // navigates next: take the last student's notifications and badge off the
  // screen now. The record's DELETE already went out when leaving began.
  if (!finished) clearShownNow();
  for (const key of ACCOUNT_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Blocked storage holds nothing to remove.
    }
  }
  try {
    clearDraft();
  } catch {
    // clearDraft never throws; this is belt and braces for a sign-out path.
  }
}

/**
 * Waits for `work` at most `ms`: true if it finished, false if the budget ran
 * out first. The work itself carries on if it's slower.
 */
function withinBudget(work: Promise<void>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    const done = () => {
      clearTimeout(timer);
      resolve(true);
    };
    work.then(done, done);
  });
}
