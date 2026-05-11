"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import LeftNav from "@/components/LeftNav";
import { OttoCorner } from "@/components/network/OttoCorner";

type Props = {
  children: ReactNode;
  /** Optional right column (e.g. feed widgets). Omit for simple two-column layouts. */
  sidebar?: ReactNode;
};

/**
 * Mounted on every campus-shelled route. The bottom-right Otto orb is the
 * unifying surface across campus / network / profile / otto.
 *
 * We hide the orb on /messages because the messaging surface already has
 * its own bottom-right composer + iframe-cursor seam, and an extra floating
 * element on top of that conflicts visually with the chat UI.
 */
export function CampusAppShell({ children, sidebar }: Props) {
  const pathname = usePathname();
  const showOttoCorner = !pathname?.startsWith("/messages");

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
      {showOttoCorner ? <OttoCorner /> : null}
    </div>
  );
}
