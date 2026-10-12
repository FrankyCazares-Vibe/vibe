/**
 * The page-open tally's limits, and the log line for an open a limit dropped
 * (review fix, Oct 12 2026). No imports, so the route, the Numbers tab and
 * `node --test` all load it as is: the tab prints these same numbers, so what
 * the founders read can't drift from what the route does.
 *
 * WHY THERE ARE LIMITS. The count is public by nature: anyone can add an open
 * by loading the page, and a script can post without a page at all. The
 * limits don't make the numbers exact, they make them dear to pump up.
 *
 * WHY A DROP IS SAID OUT LOUD. An open past a limit is not counted, and the
 * visitor's answer does not say so. Without a log line a capped day and a
 * quiet day look the same. So every drop is noted (below), never with the
 * network or the label in the line.
 */

/**
 * Opens one network may add in an hour. It has to fit a demo day: on campus
 * Wi-Fi many phones share one address, and each person opens the front page
 * and then the waitlist page, so 150 people in an hour is 300 opens.
 */
export const OPENS_PER_NETWORK_PER_HOUR = 300;

/** Opens one network may add in a (UTC) day: one laptop in a loop can't add thousands. */
export const OPENS_PER_NETWORK_PER_DAY = 1000;

/**
 * Opens ALL networks together may add in an hour. Many addresses are cheap
 * (one home IPv6 range holds thousands of separate networks), so the
 * per-network limits alone don't bound a flood. Set far above real traffic
 * (under 100 opens a week when this was written; ten full demo-day networks
 * in one hour would just reach it). If a real hour ever passes it, raise it:
 * the log line below is how you would know.
 */
export const OPENS_ALL_NETWORKS_PER_HOUR = 3000;

/** Which limit dropped an open. */
export type TallyDrop = "network-hour" | "network-day" | "all-networks";

const DROP_WORDS: Record<TallyDrop, string> = {
  "network-hour": `one network passed its ${OPENS_PER_NETWORK_PER_HOUR} opens for this hour`,
  "network-day": `one network passed its ${OPENS_PER_NETWORK_PER_DAY} opens for today`,
  "all-networks": `all networks together passed ${OPENS_ALL_NETWORKS_PER_HOUR} opens this hour (a flood, or a real hour past the ceiling: raise it if it is real)`,
};

/** A dropped open is said at most this often per limit, per server. */
export const DROP_NOTE_EVERY_MS = 60_000;

/**
 * Makes the function that words a dropped open for the log. It answers the
 * line to write, or null to stay quiet: the first drop for a limit is said
 * at once, and the ones in the next minute are held and added to the next
 * line, so a flood of a hundred thousand posts writes a line a minute and
 * not a hundred thousand.
 *
 * The count in a line is a flag, not a total: it is kept per server (Vercel
 * runs several), and the drops held when a burst ends are never said.
 */
export function createDropNotes(everyMs: number = DROP_NOTE_EVERY_MS): (reason: TallyDrop, now: number) => string | null {
  const said = new Map<TallyDrop, { at: number; held: number }>();
  return (reason, now) => {
    const last = said.get(reason);
    if (last && Math.abs(now - last.at) < everyMs) {
      last.held += 1;
      return null;
    }
    const dropped = (last?.held ?? 0) + 1;
    said.set(reason, { at: now, held: 0 });
    return `${DROP_WORDS[reason]}: ${dropped === 1 ? "an open was" : `${dropped} opens were`} not counted`;
  };
}
