"use client";

import { useEffect } from "react";

import { readSwitchedClub, setSwitchedClub } from "@/lib/orgs/club-switch";

/**
 * Keeps this phone's remembered club honest (the club's view, wave 2, C1
 * and C9). Renders nothing.
 *
 * When the Profile tab is switched to THIS club: a viewer who is no longer
 * its owner or an officer has the switch cleared (the tab goes back to
 * them), and an officer gets the club's current name and logo stored, so a
 * rename or a new logo shows on the tab. Only on a membership read that
 * answered (`standingKnown`): a failed read says nothing about the viewer,
 * and must not take an officer's switch away.
 */
export function ClubSwitchSync({
  handle,
  name,
  logoUrl,
  standingKnown,
  officer,
}: {
  handle: string;
  name: string;
  logoUrl: string | null;
  standingKnown: boolean;
  officer: boolean;
}) {
  useEffect(() => {
    if (!standingKnown) return;
    const stored = readSwitchedClub();
    if (!stored || stored.handle.toLowerCase() !== handle.toLowerCase()) return;
    if (!officer) {
      setSwitchedClub(null);
      return;
    }
    if (stored.name !== name || stored.logo_url !== logoUrl) {
      setSwitchedClub({ handle: stored.handle, name, logo_url: logoUrl });
    }
  }, [handle, name, logoUrl, standingKnown, officer]);
  return null;
}
