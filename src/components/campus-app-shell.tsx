"use client";

import type { ReactNode } from "react";

import LeftNav from "@/components/LeftNav";
import { OttoCorner } from "@/components/network/OttoCorner";

type Props = {
  children: ReactNode;
  /** Optional right column (e.g. feed widgets). Omit for simple two-column layouts. */
  sidebar?: ReactNode;
};

/**
 * Mounted on every campus-shelled route, so Otto's bottom-right orb is the
 * unifying surface across campus / network / profile / messages / otto.
 * The orb + side panel handle their own auth and notification polling.
 * Per-route mounts (e.g. NetworkPageClient) were removed once this lifted.
 */
export function CampusAppShell({ children, sidebar }: Props) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: sidebar ? "200px 1fr 320px" : "200px 1fr",
        minHeight: "100vh",
      }}
    >
      <LeftNav />
      {children}
      {sidebar ?? null}
      <OttoCorner />
    </div>
  );
}
