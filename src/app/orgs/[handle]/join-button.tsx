"use client";

import { useRouter } from "next/navigation";

import { OrgJoinControl } from "@/components/orgs/OrgJoinControl";
import type { OrgRelation } from "@/lib/orgs/join-copy";

/**
 * The org page's header controls: Follow next to the membership control
 * (wave plan `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §7 F6).
 *
 * Everything it renders comes from the shared `OrgJoinControl` (header
 * variant, `orgHeaderView` in `join-copy.ts`), so the org page, the phone Orgs
 * tab and the desktop cards can't drift apart. The page computes `relation`
 * on the server from the one join decision (`orgJoinState`) and the viewer's
 * follow row; nothing here re-derives it.
 *
 * A tap waits for the server ('…', no optimistic flip), then refreshes the
 * server render so the chips, notice, banner and channels card catch up.
 */
export function OrgProfileJoinButton({
  relation,
  pendingInviteId,
}: {
  relation: OrgRelation;
  pendingInviteId: string | null;
}) {
  const router = useRouter();
  return (
    <OrgJoinControl
      variant="header"
      source="profile"
      relation={relation}
      pendingInviteId={pendingInviteId}
      onChange={() => router.refresh()}
    />
  );
}
