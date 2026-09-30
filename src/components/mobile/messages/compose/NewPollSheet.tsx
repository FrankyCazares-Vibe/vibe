"use client";

import { useId, useRef, useState } from "react";

import type { ChatMessage, RoomKind } from "@/lib/chat/types";

import { palette } from "../v2-tokens";
import { AddButton, CardSheet, Counter, FieldLabel, fieldStyle, RemoveButton, Switch, useCardPost } from "./CardSheet";
import { cleanText, charCount, OPTIONS_MAX, optionName, POLL_OPTIONS_MIN, pollValid, QUESTION_MAX, removeLabel, sheetRoomLine } from "./sheet-rules";

/**
 * The New poll sheet (wave-2 contract 11.7, 1.2; mockup W0_NewPoll, MK:9):
 * `Question` (200 max, the counter), `Options` (two empty rows to start;
 * `Add option` up to 10, `Remove <label>` down to 2), the `Anonymous`
 * switch with its help line, the `Allow more than one answer` switch, the
 * CTA `Post poll` — enabled once the question is 1–200 and every label is
 * non-blank and ≤ 80 → `POST …/cards { type: "poll", question, options:
 * [{ label }], anonymous, multi }` (no `closes_at` in v1). A refused
 * `question` / `options.<n>` is outlined (`useCardPost`). No `maxLength`
 * on the inputs: it counts UTF-16 units while the counter and the route
 * count code points, so the counter (coral past the limit) and `pollValid`
 * carry the limit (S3-SECURITY-2).
 */
export type NewPollSheetProps = {
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

type OptionRow = { key: number; label: string };

const POST_FAILURE = "Couldn't post your poll.";

export function NewPollSheet({ roomId, roomKind, roomName, clubName, orgId, night, onClose, onPosted, onReload, returnFocusTo }: NewPollSheetProps) {
  const t = palette(night);
  const ids = useId();
  const questionId = `${ids}-question`;
  const optionsLabelId = `${ids}-options`;
  const anonLabelId = `${ids}-anon`;
  const anonHelpId = `${ids}-anon-help`;
  const multiLabelId = `${ids}-multi`;
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<OptionRow[]>([
    { key: 1, label: "" },
    { key: 2, label: "" },
  ]);
  const nextKey = useRef(3);
  const [anonymous, setAnonymous] = useState(false);
  const [multi, setMulti] = useState(false);
  const { posting, field, clearField, post } = useCardPost({ roomId, failure: POST_FAILURE, onPosted, onReload, onClose });
  const valid = pollValid(question, options.map((o) => o.label));

  const submit = () => {
    if (!valid) return;
    void post({
      type: "poll",
      question: cleanText(question),
      options: options.map((o) => ({ label: cleanText(o.label) })),
      anonymous,
      multi,
    });
  };

  const setLabel = (key: number, label: string) => {
    clearField();
    setOptions((rows) => rows.map((r) => (r.key === key ? { ...r, label } : r)));
  };
  const addOption = () => {
    setOptions((rows) => (rows.length >= OPTIONS_MAX ? rows : [...rows, { key: nextKey.current++, label: "" }]));
  };
  const removeOption = (key: number) => {
    clearField();
    setOptions((rows) => (rows.length <= POLL_OPTIONS_MIN ? rows : rows.filter((r) => r.key !== key)));
  };

  return (
    <CardSheet title="New poll" roomLine={sheetRoomLine(clubName, roomKind, roomName)} orgId={orgId} night={night} cta="Post poll" ctaDisabled={!valid} posting={posting} onSubmit={submit} onClose={onClose} returnFocusTo={returnFocusTo} ctaGap={10}>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <FieldLabel htmlFor={questionId} night={night}>
            Question
          </FieldLabel>
          <Counter n={charCount(question)} max={QUESTION_MAX} night={night} />
        </div>
        <input
          id={questionId}
          type="text"
          value={question}
          autoComplete="off"
          aria-invalid={field === "question" || undefined}
          onChange={(e) => {
            clearField();
            setQuestion(e.target.value);
          }}
          style={fieldStyle(night, field === "question")}
        />
      </div>

      <div role="group" aria-labelledby={optionsLabelId} style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        <FieldLabel id={optionsLabelId} night={night}>
          Options
        </FieldLabel>
        {options.map((row, i) => {
          const name = optionName(i + 1);
          const invalid = field === `options.${i}`;
          return (
            <div key={row.key} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <label style={{ ...fieldStyle(night, invalid), flexGrow: 1, minWidth: 0, padding: "0 14px 0 12px", display: "flex", alignItems: "center", gap: 10 }}>
                <span aria-hidden style={{ width: 18, height: 18, flexShrink: 0, boxSizing: "border-box", borderRadius: 999, border: `2px solid ${t.ringGrey}` }} />
                <input
                  type="text"
                  aria-label={name}
                  aria-invalid={invalid || undefined}
                  value={row.label}
                  autoComplete="off"
                  onChange={(e) => setLabel(row.key, e.target.value)}
                  style={{ flexGrow: 1, minWidth: 0, height: 44, padding: 0, border: "none", outline: "none", background: "transparent", color: t.ink, fontFamily: "inherit", fontSize: 16, fontWeight: 600 }}
                />
              </label>
              {options.length > POLL_OPTIONS_MIN ? (
                <RemoveButton label={removeLabel(row.label, name)} night={night} onClick={() => removeOption(row.key)} />
              ) : (
                // The column stays reserved at the minimum so the pills keep their width when a third option arrives (VIS-S3-5).
                <span aria-hidden style={{ width: 36, flexShrink: 0 }} />
              )}
            </div>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AddButton text="Add option" disabled={options.length >= OPTIONS_MAX} night={night} onClick={addOption} />
          <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: t.muted }}>2 to 10 options</span>
        </div>
      </div>

      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", borderTop: "1px solid rgba(var(--scrim-rgb),0.07)" }}>
        <div style={{ boxSizing: "border-box", padding: "10px 0 8px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid rgba(var(--scrim-rgb),0.07)" }}>
          <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span id={anonLabelId} style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>
              Anonymous
            </span>
            <span id={anonHelpId} style={{ fontSize: 12.5, lineHeight: 1.35, color: t.secondary }}>
              Off: the room sees who picked what. On: counts only.
            </span>
          </div>
          <Switch on={anonymous} labelledBy={anonLabelId} describedBy={anonHelpId} night={night} onToggle={() => setAnonymous((v) => !v)} />
        </div>
        <div style={{ minHeight: 56, boxSizing: "border-box", padding: "6px 0", display: "flex", alignItems: "center", gap: 12 }}>
          <span id={multiLabelId} style={{ flexGrow: 1, minWidth: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>
            Allow more than one answer
          </span>
          <Switch on={multi} labelledBy={multiLabelId} night={night} onToggle={() => setMulti((v) => !v)} />
        </div>
      </div>
    </CardSheet>
  );
}
