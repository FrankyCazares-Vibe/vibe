"use client";

import type { ReactNode } from "react";

import { CustomCursor } from "@/components/CustomCursor";
import LeftNav from "@/components/LeftNav";

type Props = {
  children: ReactNode;
  /** Optional right column (e.g. feed widgets). Omit for simple two-column layouts. */
  sidebar?: ReactNode;
};

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
      <CustomCursor />
    </div>
  );
}
