import { NextResponse } from "next/server";

import { loadClubSetup, markClubSetup } from "@/lib/club-links/setup";
import { isSetupMark } from "@/lib/club-links/setup-steps";
import { limitFor } from "@/lib/limits/budgets";
import { requireNotRestricted } from "@/lib/moderation/access";
import { officerGate } from "@/lib/orgs/hidden-gate";
import { SETTINGS_ROLES, isOrgRole } from "@/lib/orgs/join-state";
import { tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, code, error }, { status });
}

/**
 * A new club's setup list, for its owner and officers (the club's view,
 * wave 1). GET -> { ok, setup: null | { steps, done, total, complete } }.
 * POST { mark: "who_can_join" | "officers_skipped" } marks the step the
 * club's own data can't show (the choice itself is saved by PATCH
 * /api/orgs/[slug], as everywhere else) and answers with the list.
 */
async function load(params: Params["params"]) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: fail(401, "unauthorized", "Sign in first.") } as const;
  const service = createSupabaseServiceClient();
  const { data: org } = await service
    .from("orgs")
    .select("id, handle, hidden_at, logo_url, banner_url, description")
    .eq("handle", slug.toLowerCase())
    .maybeSingle();
  if (!org) return { error: fail(404, "not_found", "Not found") } as const;
  const { data: me } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const gate = officerGate({ hidden: !!org.hidden_at, role: isOrgRole(me?.role) ? me.role : null, allowed: SETTINGS_ROLES });
  if (gate === "not_found") return { error: fail(404, "not_found", "Not found") } as const;
  if (gate === "forbidden") return { error: fail(403, "officers_only", "Only the club's owner and officers set it up.") } as const;
  return { user, service, org } as const;
}

function view(setup: Awaited<ReturnType<typeof loadClubSetup>>) {
  if (!setup) return { ok: true, setup: null };
  const { steps, done, total, complete } = setup;
  return { ok: true, setup: { steps, done, total, complete } };
}

export async function GET(_req: Request, { params }: Params) {
  const ctx = await load(params);
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(view(await loadClubSetup(ctx.service, ctx.org)));
}

export async function POST(req: Request, { params }: Params) {
  const ctx = await load(params);
  if ("error" in ctx) return ctx.error;
  const rl = await limitFor("orgOfficer", ctx.user.id);
  if (!rl.allowed) return tooManyRequests(rl);
  const gate = await requireNotRestricted(ctx.user.id);
  if (gate) return gate;

  let mark: unknown;
  try {
    mark = ((await req.json()) as { mark?: unknown })?.mark;
  } catch {
    return fail(400, "invalid_json", "Invalid JSON");
  }
  if (!isSetupMark(mark)) return fail(400, "invalid_mark", "mark must be who_can_join or officers_skipped");

  const setup = await loadClubSetup(ctx.service, ctx.org);
  if (!setup) return fail(404, "no_setup", "This club has no setup list.");
  if (!(await markClubSetup(ctx.service, setup.linkId, mark))) {
    return fail(500, "save_failed", "Couldn't save that. Try again.");
  }
  return NextResponse.json(view(await loadClubSetup(ctx.service, ctx.org)));
}
