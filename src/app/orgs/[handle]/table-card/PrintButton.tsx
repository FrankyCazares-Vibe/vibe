"use client";

import { primaryButtonStyle } from "@/components/orgs/club-tool-styles";

/**
 * The table card's Print (the club's view, wave 3, B3; Oct 23, 2026): the
 * browser's own print dialog. The page's print rule (TABLE_CARD_CSS in
 * page.tsx) leaves only the card, on a 5 × 7 in sheet with no margin, so
 * what comes out of the printer is the card and nothing else. Its own client
 * file because the page itself is drawn on the server.
 *
 * The page doesn't draw it inside the store apps: their web views have no
 * print dialog, so the button would do nothing there.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      className="vibe-press"
      onClick={() => window.print()}
      style={{ ...primaryButtonStyle, flex: "1 1 0", width: "auto", minWidth: 0 }}
    >
      Print
    </button>
  );
}
