import { NextResponse } from "next/server";

import { loadClubOfficer } from "@/lib/club-routes/officer-guard";
import { limitFor } from "@/lib/limits/budgets";
import { requireNotRestricted } from "@/lib/moderation/access";
import { tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ slug: string; channelId: string; userId: string }> };

/** The `orgOfficer` refusal, the same line on every club officer route. */
const OFFICER_BUSY = "Too many club changes at once. Try again in a few minutes.";

/**
 * DELETE /api/orgs/[slug]/channels/[channelId]/members/[userId]
 * Removes a user from the per-channel allow list. The owner or an officer
 * only (matches the INSERT policy). Not while
 * restricted (the delete is service-role, so the route asks), and a stranger
 * asking about a hidden club gets 404 (security wave 2, `loadClubOfficer`).
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { slug, channelId, userId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Before the staff guard, so a refused caller costs no database read (limits wave 3).
  const rl = await limitFor("orgOfficer", user.id);
  if (!rl.allowed) return tooManyRequests(rl, OFFICER_BUSY);

  const restricted = await requireNotRestricted(user.id);
  if (restricted) return restricted;

  const guard = await loadClubOfficer(slug, user.id, { channelId });
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }
  const { service } = guard;

  const { error } = await service
    .from("org_channel_members")
    .delete()
    .eq("channel_id", channelId)
    .eq("user_id", userId);
  if (error) {
    console.error("[channel/members/[userId] DELETE]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to revoke access" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
