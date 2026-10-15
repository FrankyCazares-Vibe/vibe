/**
 * The use totals' pure rules (step 2 of the Usage tab, Oct 14 2026): how
 * often an open tab checks in, what one check-in may say, and the kind of
 * device it says it is. No imports and only erasable TypeScript, so the
 * browser, the route and `node --test` all load it as is.
 *
 * WHAT THE TOTALS ARE. A day-totals table (`public.usage_day_tally`,
 * 20261014150000): people active per UTC day and per Monday week, people
 * per sign-up week seen in each later week, the device kind of each
 * person's first visit of the day, and Otto and map opens. A number per row
 * and nothing about a person. `public.usage_touch` writes it, called only by
 * POST /api/me/heartbeat with the id the sign-in server vouches for; the
 * browser never names an account.
 *
 * WHAT A CHECK-IN SAYS. One word for the device kind, and an open when the
 * person has just opened Otto or the map: `{"device":"phone"}` or
 * `{"device":"phone","open":"map"}`. Never the browser's name, its version
 * or anything else about it. The kind is worked out in the browser from the
 * screen alone (`deviceClass`). The Privacy Policy (section 3d, "Use
 * totals") says exactly this, so a change here changes the policy the same
 * day.
 *
 * Who sends it: <ActivityTouch /> in the root layout (every React page),
 * public/html/_usageTouch.js on the static profile (its twin, which repeats
 * these constants; static-usage-touch.test.ts keeps them in step), and
 * `countOpen` where Otto and the map are opened (touch-client.ts).
 */

/** The route a check-in posts to. Same origin, so the browser rule needs no new host. */
export const TOUCH_PATH = "/api/me/heartbeat";

/**
 * At most one check-in per tab this often. Under the five-minute "active
 * now" window (20261008120000), so a tab left open on screen never drops
 * out of it.
 */
export const TOUCH_EVERY_MS = 4 * 60 * 1000;

/** How often an open tab on screen asks itself whether a check-in is due. */
export const TOUCH_TICK_MS = 30 * 1000;

/** One Otto or map open per feature per tab this often. */
export const OPEN_EVERY_MS = 10 * 60 * 1000;

/**
 * A day's Otto or map opens stop at this many for each person active that
 * day. The database applies it (`usage_touch`: `10 * greatest(v_active, 1)`);
 * the migration test pins the two together.
 */
export const OPEN_CAP_PER_ACTIVE = 10;

/** A check-in body longer than this is not ours and reads as no body. */
export const TOUCH_BODY_MAX_CHARS = 128;

/**
 * sessionStorage: when this tab last checked in. The static profile shares
 * it, so a tab that hops from /profile to the static page checks in once.
 * Gone when the tab closes.
 */
export const TOUCH_AT_KEY = "vibe_touch_at";

/** sessionStorage: when this tab last counted an open, `vibe_open_at_otto` / `_map`. */
export const OPEN_AT_KEY_PREFIX = "vibe_open_at_";

/** A screen under 900px wide: MOBILE_QUERY in src/lib/use-is-mobile.ts (the test checks). */
export const PHONE_QUERY = "(max-width: 899px)";

/** A finger, not a mouse, is the main way to point. */
export const COARSE_QUERY = "(pointer: coarse)";

/** The device kinds a check-in may name. Anything else is stored as "unknown". */
export const USAGE_DEVICES = ["phone", "desktop", "installed"] as const;

/** The opens that are counted. The table stores them as `otto_open` / `map_open`. */
export const USAGE_OPENS = ["otto", "map"] as const;

export type UsageDevice = (typeof USAGE_DEVICES)[number];
export type UsageOpen = (typeof USAGE_OPENS)[number];

export function isUsageDevice(value: unknown): value is UsageDevice {
  return typeof value === "string" && (USAGE_DEVICES as readonly string[]).includes(value);
}

export function isUsageOpen(value: unknown): value is UsageOpen {
  return typeof value === "string" && (USAGE_OPENS as readonly string[]).includes(value);
}

/**
 * The device kind, from the screen alone:
 *   - "installed": Vibe added to a Home Screen, or installed from the
 *     browser on a computer (the display mode, `isStandalone`).
 *   - "phone": a touch screen under 900px wide at the time.
 *   - "desktop": anything else.
 * Rough on purpose. A phone held sideways is 900px or wider and reads as a
 * computer; an iPad held upright reads as a phone. The App Store and Google
 * Play apps are never asked about (their tag is kept only beside a
 * notification address, Privacy Policy 3h), so they read as a phone.
 */
export function deviceClass(env: {
  standalone: boolean;
  coarsePointer: boolean;
  narrow: boolean;
}): UsageDevice {
  if (env.standalone === true) return "installed";
  if (env.coarsePointer === true && env.narrow === true) return "phone";
  return "desktop";
}

/** The body a check-in sends: the device kind, and the open when there is one. Nothing else. */
export function touchBody(device: UsageDevice, open?: UsageOpen): string {
  const kind = isUsageDevice(device) ? device : "desktop";
  return isUsageOpen(open) ? JSON.stringify({ device: kind, open }) : JSON.stringify({ device: kind });
}

/** What the route reads from a check-in. */
export type TouchRead = { device: UsageDevice | "unknown"; open: UsageOpen | null };

/**
 * Reads a check-in's body. No body, one too long, not JSON or not an object
 * (an older open tab posts nothing at all): the check-in still counts, as an
 * "unknown" device with no open. A device or an open that isn't one of ours
 * reads the same way, and any other field is dropped.
 */
export function readTouchBody(text: string | null | undefined): TouchRead {
  const none: TouchRead = { device: "unknown", open: null };
  if (!text || text.length > TOUCH_BODY_MAX_CHARS) return none;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return none;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return none;
  const body = parsed as Record<string, unknown>;
  return {
    device: isUsageDevice(body.device) ? body.device : "unknown",
    open: isUsageOpen(body.open) ? body.open : null,
  };
}

/**
 * Is a check-in (or an open) due? Yes when this tab has none on record,
 * when `every` has passed since the last one, and when the clock now reads
 * earlier than the last one (it was set back): a wrong yes costs one
 * request, a wrong no could keep the tab quiet for hours.
 */
export function touchDue(now: number, last: number | null, every: number): boolean {
  if (last === null || !Number.isFinite(last)) return true;
  if (now < last) return true;
  return now - last >= every;
}

/**
 * "The function isn't there (yet)": PGRST202, PostgREST's schema cache has
 * no such function; 42883, Postgres has none. The code ships before
 * 20261014150000 is applied. A copy of the rule in
 * src/app/api/admin/usage/route.ts. Not 42501: the functions refuse only
 * anon and authenticated, so a refusal of the service role is a real
 * failure.
 */
export function isMissingFunction(error: { code?: string; message?: string }): boolean {
  if (error.code === "42883" || error.code === "PGRST202") return true;
  return (error.message ?? "").toLowerCase().includes("could not find the function");
}
