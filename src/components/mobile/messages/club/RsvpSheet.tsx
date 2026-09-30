"use client";

import { useState } from "react";
import { Drawer } from "vaul";

import type { EventRef } from "@/lib/chat/types";
import { useHideTabBar } from "@/lib/chat/use-hide-tabbar";
import { vibeRequest } from "@/lib/feedback/request";

import { vaulContentStyle, vaulHandleStyle, vaulOverlayStyle, visuallyHiddenStyle } from "../sheet-styles";
import { FONT, palette } from "../v2-tokens";

/**
 * The RSVP sheet of the event chat layer (handoffs/chat-redesign/wave-2-contracts.md
 * 11.6, 1.2): a vaul sheet nested in the layer's drawer (a plain root closing
 * inside another drawer runs vaul's unlock, ConversationView's note), rows
 * `Going`, `Maybe`, `Not going`, the line `You'll appear in the event chat.`
 * under the first two (the dialog's name, `Your RSVP`, is the card group's
 * label of 1.2 and is not drawn: section 1 pins no sheet title; S2-repair.md
 * C2). `Going` / `Maybe` → `PUT /api/events/<id>/rsvp
 * { status }`; `Not going` → `DELETE`; 200 → `onChanged()` (the room's
 * `reload()`) and the sheet closes; a refusal (`campus_visiting`,
 * `terms_required`, a 404) → the toast `vibeRequest` maps for it (not quiet).
 * It calls `useHideTabBar()` (11.0, SCREENS-H1). Focus lands in the sheet
 * (vaul's trap) and returns to the pill on close (vaul's own restore).
 */
export type RsvpSheetProps = {
  eventId: string;
  current: EventRef["viewer_status"];
  night: boolean;
  onClose: () => void;
  onChanged: () => void;
};

type Choice = "going" | "maybe" | "no";

const ROWS: { choice: Choice; text: string; line: string | null }[] = [
  { choice: "going", text: "Going", line: "You'll appear in the event chat." },
  { choice: "maybe", text: "Maybe", line: "You'll appear in the event chat." },
  { choice: "no", text: "Not going", line: null },
];

export function RsvpSheet({ eventId, current, night, onClose, onChanged }: RsvpSheetProps) {
  useHideTabBar();
  const t = palette(night);
  const [busy, setBusy] = useState<Choice | null>(null);

  const pick = async (choice: Choice) => {
    if (busy) return;
    setBusy(choice);
    const url = `/api/events/${encodeURIComponent(eventId)}/rsvp`;
    const r =
      choice === "no"
        ? await vibeRequest(url, { method: "DELETE", failure: "Couldn't change your RSVP." })
        : await vibeRequest(url, { method: "PUT", json: { status: choice }, failure: "Couldn't save your RSVP." });
    setBusy(null);
    if (!r.ok) return;
    onChanged();
    onClose();
  };

  return (
    <Drawer.NestedRoot
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay style={{ ...vaulOverlayStyle, zIndex: 1210, background: t.scrim }} />
        <Drawer.Content style={{ ...vaulContentStyle, zIndex: 1211, background: t.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, fontFamily: FONT, color: t.ink }} aria-describedby={undefined}>
          <Drawer.Handle style={{ ...vaulHandleStyle, width: 40, height: 5, background: "rgba(var(--scrim-rgb),0.24)" }} />
          <div style={{ boxSizing: "border-box", padding: "8px 16px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            <Drawer.Title style={visuallyHiddenStyle}>Your RSVP</Drawer.Title>
            {ROWS.map((row) => {
              const active = (current ?? "no") === row.choice;
              return (
                <button
                  key={row.choice}
                  type="button"
                  aria-pressed={active}
                  aria-disabled={busy !== null}
                  onClick={() => void pick(row.choice)}
                  style={{
                    minHeight: row.line ? 60 : 52,
                    boxSizing: "border-box",
                    padding: "8px 14px",
                    borderRadius: 16,
                    border: active ? "1px solid rgba(255,92,53,0.50)" : `1px solid ${t.hairline}`,
                    background: active ? "rgba(255,92,53,0.16)" : "rgba(var(--scrim-rgb),0.04)",
                    color: t.ink,
                    fontFamily: "inherit",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    gap: 2,
                    cursor: "pointer",
                    opacity: busy && busy !== row.choice ? 0.6 : 1,
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{row.text}</span>
                  {row.line ? <span style={{ fontSize: 12, fontWeight: 500, color: t.secondary }}>{row.line}</span> : null}
                </button>
              );
            })}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.NestedRoot>
  );
}
