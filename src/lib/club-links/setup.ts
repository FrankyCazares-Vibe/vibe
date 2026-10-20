import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { setupProgress, type SetupMark, type SetupProgress } from "./setup-steps";

/**
 * The setup list's facts for one club, read with the service role. Null when
 * the club has no setup list (no setup link made it) or a read failed.
 */
export async function loadClubSetup(
  service: SupabaseClient,
  org: { id: string; logo_url: string | null; banner_url: string | null; description: string | null },
): Promise<(SetupProgress & { linkId: string }) | null> {
  const { data: link, error } = await service
    .from("club_links")
    .select("id, setup_marks")
    .eq("kind", "setup")
    .eq("org_id", org.id)
    .maybeSingle();
  if (error) {
    // Before the club-links migration is in, there is no table: no list.
    console.error("[club-links] setup link", error.message);
    return null;
  }
  if (!link) return null;

  const [officers, events, members] = await Promise.all([
    service.from("org_members").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("role", "admin"),
    service.from("events").select("id", { count: "exact", head: true }).eq("org_id", org.id),
    service.from("club_links").select("id").eq("kind", "members").eq("org_id", org.id).maybeSingle(),
  ]);
  const progress = setupProgress({
    logoUrl: org.logo_url,
    bannerUrl: org.banner_url,
    description: org.description,
    officerCount: officers.count ?? 0,
    eventCount: events.count ?? 0,
    hasMembersLink: !!members.data,
    marks: (link.setup_marks as Record<string, unknown> | null) ?? {},
  });
  return { ...progress, linkId: link.id };
}

/** Mark a setup step done (who can join chosen, officers skipped for now). */
export async function markClubSetup(service: SupabaseClient, linkId: string, mark: SetupMark): Promise<boolean> {
  const { data: row, error } = await service.from("club_links").select("setup_marks").eq("id", linkId).maybeSingle();
  if (error || !row) return false;
  const marks = { ...((row.setup_marks as Record<string, unknown> | null) ?? {}), [mark]: new Date().toISOString() };
  const { error: upErr } = await service
    .from("club_links")
    .update({ setup_marks: marks, updated_at: new Date().toISOString() })
    .eq("id", linkId);
  if (upErr) console.error("[club-links] mark setup", upErr.message);
  return !upErr;
}
