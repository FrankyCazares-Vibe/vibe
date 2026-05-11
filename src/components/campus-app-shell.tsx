"use client";

import type { ReactNode } from "react";

import { CustomCursor } from "@/components/CustomCursor";
import LeftNav from "@/components/LeftNav";

type Props = {
  children: ReactNode;
  /** Optional right column (e.g. feed widgets). Omit for simple two-column layouts. */
  sidebar?: ReactNode;
  /**
   * Pages that embed a static prototype in an iframe (e.g. /messages) should
   * set this true. The iframe runs its own dot+ring cursor internally, and a
   * parent-doc cursor can't track inside an iframe (iframes capture their own
   * mouse events), so mounting both produces a "stuck at the edge" twin.
   */
  iframeEmbed?: boolean;
};

export function CampusAppShell({ children, sidebar, iframeEmbed }: Props) {
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
      {iframeEmbed ? null : <CustomCursor />}
    </div>
  );
}
