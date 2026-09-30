"use client";

import { useId, useRef, useState } from "react";

import type { ChatMessage, RoomKind } from "@/lib/chat/types";

import { visuallyHiddenStyle } from "../sheet-styles";
import { palette } from "../v2-tokens";
import { AddButton, CardSheet, Counter, FieldLabel, fieldStyle, MinusIcon, PlusIcon, RemoveButton, useCardPost } from "./CardSheet";
import {
  CAPACITY_DEFAULT,
  CAPACITY_MAX,
  CAPACITY_MIN,
  charCount,
  cleanText,
  OPTIONS_MAX,
  QUESTION_MAX,
  removeLabel,
  sheetRoomLine,
  SIGNUP_SLOTS_MIN,
  signupValid,
  slotName,
  spotsForLabel,
  spotsWord,
  stepCapacity,
} from "./sheet-rules";

/**
 * The New sign-up sheet (wave-2 contract 11.7, 1.2; mockup W0_NewSignup,
 * MK:10): `Title` (200 max, the counter), `Slots` / `Spots` (one row to
 * start: a label input and the `Spots` stepper 1–50, default 2; `Add slot`
 * up to 10, `Remove <slot>` down to 1; `1 to 10 slots`), the helper `Names
 * show to everyone in this room.`, the CTA `Post sign-up` → `POST …/cards
 * { type: "signup", question: title, options: [{ label, capacity }] }`.
 * The stepper is `role="group" aria-label="Spots for <slot>"` with `One
 * less spot` / `One more spot` around the number, spoken as `<n> spots`
 * from a visually hidden span (an `aria-label` on a plain span is not read;
 * S3-BEHAVIOUR-5). A refused `question` (the title) / `options.<n>` is
 * outlined. No `maxLength` on the inputs (S3-SECURITY-2, as the poll sheet).
 */
export type NewSignupSheetProps = {
  roomId: string;
  roomKind: RoomKind;
  roomName: string;
  clubName: string;
  orgId?: string | null;
  night: boolean;
  onClose: () => void;
  onPosted: (message: ChatMessage) => void;
  onReload: () => void;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
};

type SlotRow = { key: number; label: string; capacity: number };

const POST_FAILURE = "Couldn't post your sign-up.";

/**
 * The slot row at 375 (VIS-S3-2): 343 − 6 − 106 − 6 − 32 = 193px for the label
 * input (165px of text: `Leaving from Union` at 16px/600 fits whole). The
 * mockup's 118px stepper had no Remove column beside it; the contract adds
 * one, so the stepper drops its 1px paddings and 12px of slack around the
 * number (the arms stay 44×44), the gaps go 8 → 6, and the 44×44 X reaches
 * −12 into the gutter. The header (`Spots`, the spacer) mirrors the row, and
 * the column is reserved at the minimum of one slot so nothing jumps when
 * the second slot arrives (as the poll sheet, VIS-S3-5).
 */
const STEPPER_WIDTH = 106;
const ROW_GAP = 6;
const REMOVE_INTO = -12;
const REMOVE_COLUMN = 44 + REMOVE_INTO;

export function NewSignupSheet({ roomId, roomKind, roomName, clubName, orgId, night, onClose, onPosted, onReload, returnFocusTo }: NewSignupSheetProps) {
  const t = palette(night);
  const ids = useId();
  const titleId = `${ids}-title`;
  const slotsLabelId = `${ids}-slots`;
  const [title, setTitle] = useState("");
  const [slots, setSlots] = useState<SlotRow[]>([{ key: 1, label: "", capacity: CAPACITY_DEFAULT }]);
  const nextKey = useRef(2);
  const { posting, field, clearField, post } = useCardPost({ roomId, failure: POST_FAILURE, onPosted, onReload, onClose });
  const valid = signupValid(title, slots);

  const submit = () => {
    if (!valid) return;
    void post({
      type: "signup",
      question: cleanText(title),
      options: slots.map((s) => ({ label: cleanText(s.label), capacity: s.capacity })),
    });
  };

  const update = (key: number, patch: Partial<SlotRow>) => {
    clearField();
    setSlots((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const addSlot = () => {
    setSlots((rows) => (rows.length >= OPTIONS_MAX ? rows : [...rows, { key: nextKey.current++, label: "", capacity: CAPACITY_DEFAULT }]));
  };
  const removeSlot = (key: number) => {
    clearField();
    setSlots((rows) => (rows.length <= SIGNUP_SLOTS_MIN ? rows : rows.filter((r) => r.key !== key)));
  };

  const arm = (label: string, disabled: boolean, onClick: () => void, icon: React.ReactNode, color: string) => (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onClick();
      }}
      style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 999, border: "none", background: "transparent", color: disabled ? t.muted : color, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, cursor: disabled ? "default" : "pointer", WebkitTapHighlightColor: "transparent" }}
    >
      {icon}
    </button>
  );

  return (
    <CardSheet title="New sign-up" roomLine={sheetRoomLine(clubName, roomKind, roomName)} orgId={orgId} night={night} cta="Post sign-up" ctaDisabled={!valid} posting={posting} onSubmit={submit} onClose={onClose} returnFocusTo={returnFocusTo}>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <FieldLabel htmlFor={titleId} night={night}>
            Title
          </FieldLabel>
          <Counter n={charCount(title)} max={QUESTION_MAX} night={night} />
        </div>
        <input
          id={titleId}
          type="text"
          value={title}
          autoComplete="off"
          aria-invalid={field === "question" || undefined}
          onChange={(e) => {
            clearField();
            setTitle(e.target.value);
          }}
          style={fieldStyle(night, field === "question")}
        />
      </div>

      <div role="group" aria-labelledby={slotsLabelId} style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: ROW_GAP }}>
          <FieldLabel id={slotsLabelId} night={night}>
            Slots
          </FieldLabel>
          <span aria-hidden style={{ marginLeft: "auto", width: STEPPER_WIDTH, textAlign: "center", fontSize: 12.5, fontWeight: 700, color: t.secondary }}>
            Spots
          </span>
          <span aria-hidden style={{ width: REMOVE_COLUMN, flexShrink: 0 }} />
        </div>
        {slots.map((row, i) => {
          const name = slotName(i + 1);
          const invalid = field === `options.${i}`;
          return (
            <div key={row.key} style={{ display: "flex", alignItems: "center", gap: ROW_GAP }}>
              <input
                type="text"
                aria-label={name}
                aria-invalid={invalid || undefined}
                value={row.label}
                autoComplete="off"
                onChange={(e) => update(row.key, { label: e.target.value })}
                style={{ ...fieldStyle(night, invalid), flexGrow: 1, minWidth: 0, width: undefined }}
              />
              <div role="group" aria-label={spotsForLabel(row.label, name)} style={{ width: STEPPER_WIDTH, height: 48, flexShrink: 0, boxSizing: "border-box", padding: 0, borderRadius: 999, border: "1px solid rgba(var(--scrim-rgb),0.10)", background: "rgba(var(--scrim-rgb),0.04)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {arm("One less spot", row.capacity <= CAPACITY_MIN, () => update(row.key, { capacity: stepCapacity(row.capacity, -1) }), <MinusIcon size={16} />, t.secondary)}
                <span style={{ minWidth: 18, textAlign: "center", fontSize: 15.5, fontWeight: 800, color: t.ink }}>
                  <span aria-hidden>{row.capacity}</span>
                  <span style={visuallyHiddenStyle}>{spotsWord(row.capacity)}</span>
                </span>
                {arm("One more spot", row.capacity >= CAPACITY_MAX, () => update(row.key, { capacity: stepCapacity(row.capacity, 1) }), <PlusIcon size={16} />, t.ink)}
              </div>
              {slots.length > SIGNUP_SLOTS_MIN ? (
                <RemoveButton label={removeLabel(row.label, name)} night={night} into={REMOVE_INTO} onClick={() => removeSlot(row.key)} />
              ) : (
                <span aria-hidden style={{ width: REMOVE_COLUMN, flexShrink: 0 }} />
              )}
            </div>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AddButton text="Add slot" disabled={slots.length >= OPTIONS_MAX} night={night} onClick={addSlot} />
          <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: t.muted }}>1 to 10 slots</span>
        </div>
      </div>

      <p style={{ margin: "6px 0 0", boxSizing: "border-box", paddingTop: 12, borderTop: "1px solid rgba(var(--scrim-rgb),0.07)", display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, lineHeight: 1.35, fontWeight: 500, color: t.secondary }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
          <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" />
          <path d="M17.5 14.2a5.5 5.5 0 0 1 3 4.8" />
        </svg>
        Names show to everyone in this room.
      </p>
    </CardSheet>
  );
}
