import { NextResponse } from "next/server";

import { clubSetupPath, declineClubLink, redeemClubLink, redeemRefusalCopy } from "@/lib/club-links/redeem";
import { findClubLinkByCode, findClubLinkById, pendingClubLink } from "@/lib/club-links/store";
import { limitFor } from "@/lib/limits/budgets";
import { requireCanPublish } from "@/lib/moderation/access";
import { tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Body = { code?: unknown; decline?: unknown };

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, code, error }, { status });
}

/**
 * Use a club link (the club's view, wave 1), signed in.
 *
 *   { code }          the link page's button: a setup link makes its club with
 *                     this account as owner; a members' link makes it a member.
 *   {}                the link waiting for this account (its sign-up came
 *                     through one): the welcome page's Make me the owner or
 *                     Join button.
 *   { decline: true } the welcome page's no: "Not now" on a members' link (not
 *                     asked again), "Not me" on a setup link (this account's
 *                     place on it goes, so the person it was made for can
 *                     still use it; a second give-back turns the link off).
 *                     Needs no publish gate: it only gives back.
 *
 * 200 {ok, kind: "setup"|"members", handle, next} | {ok, declined: true}.
 * Refusals: 401; 429; the publish gate's own (Terms, school email,
 * restricted); 404 link_invalid; 404 nothing_waiting; 500 failed (a setup
 * place that couldn't be given back); and redeemClubLink's (link_used,
 * link_expired, link_off, link_in_use, campus_required, audience,
 * join_unavailable, failed), each with a sentence to show.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Sign in first.");

  const rl = await limitFor("clubLinkRedeem", user.id);
  if (!rl.allowed) return tooManyRequests(rl);

  let body: Body = {};
  try {
    body = ((await req.json()) ?? {}) as Body;
  } catch {
    return fail(400, "invalid_json", "Invalid JSON");
  }

  const service = createSupabaseServiceClient();
  const fromCode = body.code !== undefined;
  const link = fromCode
    ? await findClubLinkByCode(service, body.code)
    : await (async () => {
        const pending = await pendingClubLink(service, user.id);
        return pending ? findClubLinkById(service, pending.linkId) : null;
      })();
  if (!link) {
    return fromCode
      ? fail(404, "link_invalid", "That link doesn't work. Ask whoever shared it for a new one.")
      : fail(404, "nothing_waiting", "There's no club link waiting for you.");
  }

  if (body.decline === true) {
    if (!(await declineClubLink(service, link, user.id))) {
      return fail(500, "failed", redeemRefusalCopy("failed"));
    }
    return NextResponse.json({ ok: true, declined: true });
  }

  // Making or joining a club is publishing: Terms, a verified school email,
  // no restriction (the club itself needs a checked owner).
  const gate = await requireCanPublish(user.id);
  if (gate) return gate;

  const outcome = await redeemClubLink(service, link, user.id, { claimed: !fromCode });
  if (!outcome.ok) return fail(outcome.status, outcome.code, outcome.message);
  return NextResponse.json({
    ok: true,
    kind: outcome.kind,
    handle: outcome.handle,
    already: outcome.already,
    next: outcome.kind === "setup" ? clubSetupPath(outcome.handle) : `/orgs/${encodeURIComponent(outcome.handle)}`,
  });
}
