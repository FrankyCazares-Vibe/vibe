import "server-only";

import { cache } from "react";

import { normalizeClubLinkCode } from "@/lib/club-links/code";
import { clubLinkState, findClubLinkByCode, type ClubLinkRow, type ClubLinkState } from "@/lib/club-links/store";
import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/** What the link page shows about a link: the club's name and face, and where the link stands. */
export type ClubLinkView = {
  code: string;
  link: ClubLinkRow;
  state: ClubLinkState;
  club: {
    name: string;
    /** Members' links, and setup links that made their club. */
    handle: string | null;
    logoUrl: string | null;
    checked: boolean;
  };
};

/**
 * The link a code opens, read once per request (the page and its metadata
 * share it). Null when the code isn't one or no link has it. A members'
 * link whose club is gone, hidden or no longer checked reads as off.
 */
export const loadClubLinkView = cache(async (rawCode: string): Promise<ClubLinkView | null> => {
  const code = normalizeClubLinkCode(rawCode);
  if (!code) return null;
  const service = createSupabaseServiceClient();
  const link = await findClubLinkByCode(service, code);
  if (!link) return null;
  let state = clubLinkState(link);

  if (link.kind === "setup" && !link.org_id) {
    return {
      code,
      link,
      state,
      club: { name: link.club_name ?? "your club", handle: null, logoUrl: null, checked: link.checked },
    };
  }
  const { data: org } = await service
    .from("orgs")
    .select("name, handle, logo_url, verified, hidden_at")
    .eq("id", link.org_id ?? "")
    .maybeSingle();
  if (!org) return null;
  if (link.kind === "members" && state === "live" && (org.hidden_at || !org.verified)) state = "off";
  return {
    code,
    link,
    state,
    club: {
      name: org.name,
      handle: org.handle,
      logoUrl: org.hidden_at ? null : orgAssetProxyUrl(org.handle, org.logo_url, "logo"),
      checked: org.verified === true,
    },
  };
});

/** Two letters for the club's tile when it has no logo: "Sixty-Four Chess" -> "SC". */
export function clubInitials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/[\s-]+/).filter(Boolean);
  const letters = words.length >= 2 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? "V").slice(0, 2);
  return letters.toUpperCase();
}
