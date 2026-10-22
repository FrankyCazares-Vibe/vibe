"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { orLoadFailed } from "@/lib/use-is-mobile";

// Its own download (`next/dynamic`), so a phone, which club-frame.tsx never
// frames, doesn't fetch the left menu, the Otto corner and the rest of the
// frame with the setup and Club tools pages (review, Oct 21, 2026). No
// `loading` option, and `orLoadFailed`, as in the *Switch.tsx files: see
// use-is-mobile.ts.
const CampusAppShell = dynamic(() =>
  orLoadFailed(import("@/components/campus-app-shell").then((mod) => mod.CampusAppShell)),
);

/** The app frame around a club page on a computer. `ClubAppFrame` decides when. */
export function ClubShell({ children, campusHref }: { children: ReactNode; campusHref: string }) {
  return (
    <CampusAppShell pageTabBar campusHref={campusHref}>
      {children}
    </CampusAppShell>
  );
}
