"use client";

import { useRouter } from "next/navigation";

import { OrgJoinControl } from "@/components/orgs/OrgJoinControl";
import type { OrgRelation } from "@/lib/orgs/join-copy";

/**
 * The org page's button-row control: FOLLOWING ONLY (Franky, Oct 22, 2026:
 * "I don't want people to confuse following for request to join"). Follow
 * or Following ✓ for anyone outside the club, one locked "Member ✓" for a
 * member (leaving stays in the ⋯ menu), and a Follow that goes to sign in
 * for a visitor. Joining, asking, cancelling and answering an invite moved to
 * the Membership box under the row (`club-page/MembershipBox.tsx`).
 *
 * Everything it renders comes from the shared `OrgJoinControl` (`slot`
 * variant, `orgFollowSlot` in `join-copy.ts`), so the words can't drift from
 * the phone Orgs tab and the desktop cards. The page computes `relation` on
 * the server from the one join decision (`orgJoinState`) and the viewer's
 * follow row; nothing here re-derives it.
 *
 * A tap waits for the server ('…', no optimistic flip), then refreshes the
 * server render so the Membership box, the notice and the channels card
 * catch up.
 */
export function OrgProfileJoinButton({ relation }: { relation: OrgRelation }) {
  const router = useRouter();
  return (
    <OrgJoinControl
      variant="slot"
      source="profile"
      relation={relation}
      onChange={() => router.refresh()}
    />
  );
}
