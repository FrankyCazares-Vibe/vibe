/**
 * The query settings public/html/profile.html acts on when it loads, in one
 * place. The client hop (profile-html-bridge) and the SERVER page both build
 * links from them, and a "use client" module's exports can't be called on the
 * server — hence this plain module, which both import.
 */

/**
 * The settings the clean addresses (/profile and /profile/<handle>) must carry
 * across the hop to the static page. Dropping one here silently breaks its
 * link:
 *   welcome=1   starts the Otto tour (maybeStartProfileTour)
 *   post=<id>   opens that post (Otto notification and mention links)
 *   embedded=1  hides the static sidebar inside a host frame (_persistence.js)
 *   clear=1     wipes the page's local caches, then reloads (_persistence.js).
 *               Own profile only: a link someone shares never resets yours.
 * `handle` / `user` say whose profile it is. The route decides that, never
 * the query, and the hop sets `app=1` itself.
 */
export function forwardedProfileParams(
  incoming: URLSearchParams,
  opts: { own: boolean },
): URLSearchParams {
  const out = new URLSearchParams();
  if (incoming.get("welcome") === "1") out.set("welcome", "1");
  // Post ids are uuids; anything far longer is not a link we made.
  const post = (incoming.get("post") || "").trim();
  if (post && post.length <= 128) out.set("post", post);
  if (incoming.get("embedded") === "1") out.set("embedded", "1");
  if (opts.own && incoming.get("clear") === "1") out.set("clear", "1");
  return out;
}

/**
 * Where a gate must send the student back to: `/profile` plus the settings
 * that say WHICH profile view they asked for. A notification link is
 * /profile?post=<id>, and every gate redirect used to hand back a bare
 * `/profile`, so passing the gate lost the post the student tapped.
 *
 * Only `post` and `welcome` ride along: they name the thing the student was
 * going to see. `clear=1` (wipe local caches) and `embedded=1` (a host
 * frame's chrome) describe a page that no longer exists after a full gate
 * round trip, so carrying them would be re-running an action, not returning.
 */
export function profileNextPath(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const incoming = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    const one = Array.isArray(v) ? v[0] : v;
    if (typeof one === "string") incoming.set(k, one);
  }
  const kept = forwardedProfileParams(incoming, { own: true });
  kept.delete("clear");
  kept.delete("embedded");
  const qs = kept.toString();
  return qs ? `/profile?${qs}` : "/profile";
}
