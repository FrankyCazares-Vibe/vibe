import { NextResponse } from "next/server";

import { isMissingChatSchema, warnMissingChatSchemaOnce } from "@/lib/chat/schema";
import { refusalBody } from "@/lib/chat/types";
import { loadClubOfficer } from "@/lib/club-routes/officer-guard";
import { limitFor } from "@/lib/limits/budgets";
import { requireNotRestricted } from "@/lib/moderation/access";
import { isUuid } from "@/lib/pgrest";
import { tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ slug: string }> };
type Body = { channel_ids?: unknown };

const MAX_IDS = 200;
/** The `orgOfficer` refusal, the same line on every club officer route. */
const OFFICER_BUSY = "Too many club changes at once. Try again in a few minutes.";

/**
 * POST /api/orgs/[slug]/channels/reorder
 * Body: { channel_ids: ["uuid-a", "uuid-b", ...] }
 *
 * Writes `position = index` for each id in order. Channels that exist in the
 * org but aren't listed are left alone — this lets the client send a partial
 * order (e.g. only the visible/non-pinned section) without disturbing
 * everything else.
 *
 * Permissions: owner/admin only, not restricted (the write is service-role,
 * so the route asks); a stranger asking about a hidden club gets 404
 * (`loadClubOfficer`, security wave 2).
 *
 * Chat rooms, wave 1 (wave-1-contracts.md section 8): an event's chat is not
 * in the list this orders, so an id of `kind = 'event'` answers 409
 * `room_locked` and nothing is written. On a database without
 * `channels.kind` the route does what it did before (section 3.10).
 */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // One count per reorder, however many ids it moves; before the staff guard,
  // so a refused caller costs no database read (limits wave 3).
  const rl = await limitFor("orgOfficer", user.id);
  if (!rl.allowed) return tooManyRequests(rl, OFFICER_BUSY);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  // `null`, a number or an array parse fine but are not a body: same answer.
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (
    !Array.isArray(body.channel_ids) ||
    body.channel_ids.some((id) => typeof id !== "string")
  ) {
    return NextResponse.json(
      { ok: false, error: "channel_ids must be an array of strings" },
      { status: 400 }
    );
  }
  const channelIds = body.channel_ids as string[];
  if (channelIds.length === 0) {
    return NextResponse.json({ ok: true });
  }
  if (channelIds.length > MAX_IDS) {
    return NextResponse.json(
      { ok: false, error: `channel_ids may contain at most ${MAX_IDS} entries` },
      { status: 400 }
    );
  }
  if (!channelIds.every(isUuid)) {
    return NextResponse.json(
      { ok: false, error: "channel_ids must be UUIDs" },
      { status: 400 }
    );
  }

  const restricted = await requireNotRestricted(user.id);
  if (restricted) return restricted;

  const guard = await loadClubOfficer(slug, user.id);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }
  const { org, service } = guard;

  // Reject any id that doesn't belong to this org — protects against
  // accidentally writing positions onto someone else's channels.
  async function readBelonging(withKind: boolean) {
    return service
      .from("channels")
      .select(withKind ? "id, kind" : "id")
      .eq("org_id", org.id)
      .in("id", channelIds);
  }
  let { data: found, error: belongsErr } = await readBelonging(true);
  if (belongsErr && isMissingChatSchema(belongsErr)) {
    warnMissingChatSchemaOnce("orgs/[slug]/channels/reorder");
    const bare = await readBelonging(false);
    found = bare.data;
    belongsErr = bare.error;
  }
  if (belongsErr) {
    console.error("[orgs/[slug]/channels/reorder]", belongsErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const belongs = (found || []) as unknown as { id: string; kind?: unknown }[];
  const valid = new Set(belongs.map((r) => r.id));
  const filtered = channelIds.filter((id) => valid.has(id));
  if (filtered.length !== channelIds.length) {
    return NextResponse.json(
      { ok: false, error: "One or more channel ids don't belong to this org" },
      { status: 400 }
    );
  }
  if (belongs.some((r) => r.kind === "event")) {
    return NextResponse.json(refusalBody("room_locked"), { status: 409 });
  }

  // No bulk-update-with-different-values shortcut in the JS client, so issue
  // one UPDATE per channel. Tens of channels max — fine. If this ever needs
  // to scale, swap to a stored procedure that accepts an ordered array.
  await Promise.all(
    filtered.map((id, idx) =>
      service.from("channels").update({ position: idx }).eq("id", id)
    )
  );

  return NextResponse.json({ ok: true });
}
