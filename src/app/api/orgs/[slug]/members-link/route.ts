import { NextResponse } from "next/server";

import { getSiteOriginForRequest } from "@/lib/auth/site-url";
import { clubLinkUrl } from "@/lib/club-links/code";
import {
  clubLinkState,
  getMembersLink,
  getOrCreateMembersLink,
  setMembersLinkOff,
  type MembersLink,
} from "@/lib/club-links/store";
import { limitFor } from "@/lib/limits/budgets";
import { requireCanPublish } from "@/lib/moderation/access";
import { officerGate } from "@/lib/orgs/hidden-gate";
import { SETTINGS_ROLES, isOrgRole } from "@/lib/orgs/join-state";
import { tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };
type Body = { action?: unknown };

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, code, error }, { status });
}

/**
 * The club's members' link, for its owner and officers (the club's view,
 * wave 1). One per checked club; it lets people with a school email past the
 * closed waitlist and asks them to join; it ends 3 weeks after it was made
 * and lets 150 people sign up through it. Officers see only how many joined.
 *
 * GET  -> { ok, checked, link: null | { url, state, expires_at, joined, max_signups, full } }
 * POST { action: "make" | "off" | "on" } -> the same shape.
 *   make: the link, made now if the club has none (needs a checked club).
 *   off / on: turn it off, or back on (it still ends on its date).
 *
 * `joined` is the only number an officer sees: how many people joined the
 * club through the link. Never who.
 */
async function load(req: Request, params: Params["params"]) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: fail(401, "unauthorized", "Sign in first.") } as const;

  const service = createSupabaseServiceClient();
  const { data: org, error } = await service
    .from("orgs")
    .select("id, handle, verified, hidden_at")
    .eq("handle", slug.toLowerCase())
    .maybeSingle();
  if (error) {
    console.error("[orgs/[slug]/members-link] org", error.message);
    return { error: fail(500, "load_failed", "Couldn't load the club.") } as const;
  }
  if (!org) return { error: fail(404, "not_found", "Not found") } as const;

  const { data: me } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const role = isOrgRole(me?.role) ? me.role : null;
  const gate = officerGate({ hidden: !!org.hidden_at, role, allowed: SETTINGS_ROLES });
  if (gate === "not_found") return { error: fail(404, "not_found", "Not found") } as const;
  if (gate === "forbidden") {
    return { error: fail(403, "officers_only", "Only the club's owner and officers can see its members' link.") } as const;
  }
  return { user, service, org, origin: getSiteOriginForRequest(req) } as const;
}

function view(origin: string, checked: boolean, link: MembersLink | null) {
  if (!link) return { ok: true, checked, link: null };
  const state = clubLinkState({ kind: "members", expires_at: link.expires_at, off_at: link.off_at, used_at: null });
  return {
    ok: true,
    checked,
    link: {
      url: clubLinkUrl(origin, link.code),
      state,
      expires_at: link.expires_at,
      joined: link.joined,
      max_signups: link.max_signups,
      full: link.signups >= link.max_signups,
    },
  };
}

export async function GET(req: Request, { params }: Params) {
  const ctx = await load(req, params);
  if ("error" in ctx) return ctx.error;
  const link = await getMembersLink(ctx.service, ctx.org.id);
  return NextResponse.json(view(ctx.origin, ctx.org.verified === true, link));
}

export async function POST(req: Request, { params }: Params) {
  const ctx = await load(req, params);
  if ("error" in ctx) return ctx.error;

  const rl = await limitFor("orgOfficer", ctx.user.id);
  if (!rl.allowed) return tooManyRequests(rl);
  const gate = await requireCanPublish(ctx.user.id);
  if (gate) return gate;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail(400, "invalid_json", "Invalid JSON");
  }
  const action = body.action;
  if (action !== "make" && action !== "off" && action !== "on") {
    return fail(400, "invalid_action", "action must be make, off or on");
  }
  if (ctx.org.hidden_at) return fail(409, "org_hidden", "This club is hidden, so nobody new can join it.");
  if (ctx.org.verified !== true) {
    return fail(409, "org_unchecked", "Your club needs to be checked by Vibe before it gets a members' link.");
  }

  if (action === "make") {
    const link = await getOrCreateMembersLink(ctx.service, ctx.org.id, ctx.user.id);
    if (!link) return fail(500, "create_failed", "Couldn't make the link. Try again.");
    return NextResponse.json(view(ctx.origin, true, link));
  }
  if (!(await setMembersLinkOff(ctx.service, ctx.org.id, action === "off"))) {
    return fail(404, "no_link", "The club has no members' link yet.");
  }
  return NextResponse.json(view(ctx.origin, true, await getMembersLink(ctx.service, ctx.org.id)));
}
