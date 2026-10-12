"use client";

import { useEffect } from "react";

import { openBeaconBody, TALLY_OPEN_PATH, type TallyPage } from "@/lib/tally/open";

/**
 * Pages already reported by this page load. In memory only: a reload starts
 * it empty, and nothing is written to the browser (no cookie, no storage).
 * It is what makes "once per page load" true when React runs an effect twice
 * in development, and when someone taps back to the page without a reload.
 */
const reported = new Set<TallyPage>();

/**
 * Tells Vibe's own counter that this page was opened (launch checklist item
 * 19: how many people open the front page, the waitlist page and the sign-up
 * page, so the founders can see what share of visitors join). Mounted on
 * those three pages; renders nothing.
 *
 * It sends two things, the page's fixed name and the `?src=` label of the
 * address the page loaded on (kept only as a short plain tag), to
 * POST /api/tally/open on this same site. Nothing else is read: not the rest
 * of the address (an invite link's access code stays on the page), not the
 * page the visitor came from, no id of any kind. The route decides whether
 * the open counts (a signed-in visitor's doesn't, nor does a search engine's
 * or one past the limits) and answers the same either way.
 *
 * It can never delay or break the page: it runs after the page has painted,
 * `keepalive` lets the post finish if the visitor taps a button straight
 * away, the answer is not read, and every failure (offline, a blocked
 * request, an old browser) ends in nothing.
 */
export function OpenBeacon({ page }: { page: TallyPage }): null {
  useEffect(() => {
    if (reported.has(page)) return;

    const send = () => {
      if (reported.has(page)) return;
      reported.add(page);
      try {
        void fetch(TALLY_OPEN_PATH, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: openBeaconBody(page, window.location.search),
          // Same-origin, so the browser's own cookies ride along: the route
          // skips a request that carries a sign-in cookie, by name only.
          credentials: "same-origin",
          // The post carries no page address at all, so an invite link's
          // access code is not repeated to the server in a Referer header.
          referrerPolicy: "no-referrer",
          keepalive: true,
        }).catch(() => {});
      } catch {
        // fetch itself threw (a very old browser): nothing to do.
      }
    };

    // A page Chrome loaded ahead of time (a guess from the address bar) has
    // not been opened by anyone yet. Count it when it is actually shown.
    const doc = document as Document & { prerendering?: boolean };
    if (doc.prerendering) {
      document.addEventListener("prerenderingchange", send, { once: true });
      return () => document.removeEventListener("prerenderingchange", send);
    }
    send();
  }, [page]);

  return null;
}
