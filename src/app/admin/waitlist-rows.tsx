"use client";

/**
 * One person on the waitlist, as the founders see them. Everything here is
 * shown as plain text: the answers are typed by strangers.
 *
 * The address is masked (`f*****@iu.edu`). "Show email" appears only when
 * the list said `canReveal` (the ids in app_settings.waitlist_email_viewers:
 * Franky, in production), and the route logs every reveal. A revealed
 * address lives in this card's state only: never the URL, never storage.
 */

import { useState } from "react";

import { WAITLIST_YEAR_OPTIONS } from "@/lib/waitlist/form";
import type { AdminWaitlistRow, WaitlistStatus } from "@/lib/waitlist/types";
import { canBatchInvite, leavingLabel, tooLateForCode } from "@/lib/waitlist/view";

import { ActionButton, adminPost, Badge, COLORS, fmtDay, fmtWhen, Notice } from "./admin-shell";

const STATUS: Record<WaitlistStatus, { word: string; color: string }> = {
  // Badge tints its colour, so these are hex (COLORS.faint and .muted are rgba).
  unconfirmed: { word: "Unconfirmed", color: "#9C958C" },
  waiting: { word: "Waiting", color: COLORS.unknown },
  invited: { word: "Code sent", color: COLORS.verified },
  expired: { word: "Code expired", color: COLORS.warn },
  joined: { word: "Joined", color: COLORS.good },
};

export const STATUS_WORDS: Record<WaitlistStatus, string> = {
  unconfirmed: STATUS.unconfirmed.word,
  waiting: STATUS.waiting.word,
  invited: STATUS.invited.word,
  expired: STATUS.expired.word,
  joined: STATUS.joined.word,
};

const YEAR_LABEL = new Map<string, string>(WAITLIST_YEAR_OPTIONS.map((o) => [o.value, o.label]));

/** "IU · 2nd year · Informatics", leaving out what they didn't give. */
function aboutLine(r: AdminWaitlistRow): string {
  const school = r.schoolSystem === "iu" ? "IU" : r.schoolSystem === "purdue" ? "Purdue" : "Not a school address";
  const year = r.classYear === null ? null : YEAR_LABEL.get(String(r.classYear)) ?? null;
  return [school, year, r.major].filter(Boolean).join(" · ");
}

function codeLine(r: AdminWaitlistRow): string | null {
  if (r.status === "joined") {
    if (!r.joinedHandle) return "Joined (account since deleted)";
    // Until onboarding picks a handle it is the trigger's placeholder, u<32 hex>.
    return /^u[0-9a-f]{32}$/.test(r.joinedHandle) ? "Joined, not set up yet" : `Joined as @${r.joinedHandle}`;
  }
  if (!r.codeIssuedAt) return null;
  const sent = `Code sent ${fmtWhen(r.codeIssuedAt)}`;
  // A code sent late ends when the entry is deleted (20261003150000); both
  // moments use fmtWhen, as deletionLine does.
  const withEntry =
    r.codeExpiresAt && r.deletesAt && Math.abs(Date.parse(r.codeExpiresAt) - Date.parse(r.deletesAt)) < 1000
      ? " (when the entry is deleted)"
      : "";
  const ends =
    r.status === "expired" ? `expired ${fmtDay(r.codeExpiresAt)}` : `works until ${fmtWhen(r.codeExpiresAt)}${withEntry}`;
  const times = r.inviteCount > 1 ? ` · ${r.inviteCount} codes so far` : "";
  return `${sent} · ${ends}${times}`;
}

/**
 * "deleted Oct 20, 2026, 3:12 PM": always with the time, the same format as
 * a code that ends with its entry ({@link codeLine}), so the row shows one
 * deletion moment one way. For a joined row only the entry goes, never the
 * account.
 */
function deletionLine(r: AdminWaitlistRow): string | null {
  if (!r.deletesAt) return null;
  const when = fmtWhen(r.deletesAt);
  return r.status === "joined" ? `entry deleted ${when} (the account stays)` : `deleted ${when}`;
}

type Ask = "send" | "remove" | null;

export function WaitlistRowCard({
  row,
  selected,
  focused = false,
  onToggle,
  canReveal,
  batch,
  onChanged,
  onRemoved,
  onPause,
}: {
  row: AdminWaitlistRow;
  selected: boolean;
  /** The row "Add someone" found: outlined, and scrolled to by the list. */
  focused?: boolean;
  onToggle: (id: string) => void;
  canReveal: boolean;
  /** The batch name typed above the list, already cleaned, or null. */
  batch: string | null;
  onChanged: () => void;
  onRemoved: (id: string) => void;
  onPause: (message: string) => void;
}) {
  const [asking, setAsking] = useState<Ask>(null);
  const [busy, setBusy] = useState<"send" | "remove" | "reveal" | null>(null);
  const [said, setSaid] = useState<{ tone: "good" | "error" | "info"; text: string } | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const status = STATUS[row.status];
  const now = new Date();
  // Past its line or in its last 24 hours: the database refuses a code
  // ("entry_expiring" / "entry_expired"), so there is no button for one.
  const late = tooLateForCode(row, now);
  const hadCode = row.status === "invited" || row.status === "expired" || row.status === "joined";
  // A new code kills the old one: ask first when it is live, or already used.
  const sendNeedsAsk = row.status === "invited" || row.status === "joined";

  async function post<T>(path: string, json: unknown, failure: string, kind: "send" | "remove" | "reveal") {
    setBusy(kind);
    setSaid(null);
    const r = await adminPost<T>(`/api/admin/waitlist/${encodeURIComponent(row.id)}/${path}`, json, failure);
    setBusy(null);
    setAsking(null);
    if (!r.ok) {
      setSaid({ tone: "error", text: r.message });
      if (r.pause) onPause(r.message);
    }
    return r;
  }

  async function sendCode() {
    const r = await post("send-code", batch ? { batch } : {}, "Couldn't send a code.", "send");
    if (r.ok) {
      setSaid({ tone: "good", text: hadCode ? "New code sent. The old one no longer works." : "Code sent." });
      onChanged();
    }
  }

  async function remove() {
    const r = await post("remove", {}, "Couldn't remove them.", "remove");
    if (r.ok) onRemoved(row.id);
  }

  async function reveal() {
    const r = await post<{ email?: string }>("reveal", {}, "Couldn't show the address.", "reveal");
    if (r.ok && typeof r.data.email === "string") setEmail(r.data.email);
  }

  const code = codeLine(row);
  const deletion = deletionLine(row);
  const leaving = leavingLabel(row, now);
  return (
    <div
      id={`wl-row-${row.id}`}
      className="adm-card"
      style={{
        display: "flex", flexDirection: "column", gap: 8, fontSize: 13, lineHeight: 1.55,
        ...(focused ? { outline: `2px solid ${COLORS.accent}`, outlineOffset: 2 } : {}),
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <input
          type="checkbox"
          checked={selected}
          disabled={!canBatchInvite(row, now) && !selected}
          onChange={() => onToggle(row.id)}
          aria-label={`Pick ${row.name} for the next batch`}
          title={
            canBatchInvite(row, now)
              ? undefined
              : late
                ? "Their entry is deleted within a day, too late for a code"
                : "Batches go to confirmed people with no code yet"
          }
          style={{ width: 18, height: 18, marginTop: 2, accentColor: COLORS.accent, flex: "none" }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <strong style={{ fontSize: 14, overflowWrap: "anywhere" }}>{row.name}</strong>
            <Badge color={status.color}>{status.word}</Badge>
            {row.isOfficer ? <Badge color={COLORS.accent}>Runs a club</Badge> : null}
            {row.origin === "founder" ? <Badge color="#B8B0A6">Added by hand</Badge> : null}
            {leaving ? <Badge color={COLORS.warn}>{leaving}</Badge> : null}
          </div>
          <div style={{ color: COLORS.muted, overflowWrap: "anywhere" }}>
            {email ?? row.maskedEmail}
            {email ? (
              <button type="button" onClick={() => setEmail(null)} style={linkButton}>Hide</button>
            ) : null}
          </div>
          <div style={{ color: COLORS.muted }}>{aboutLine(row)}</div>
          {row.isOfficer && row.officerClub ? <div>Runs {row.officerClub}</div> : null}
          {row.clubs ? <div style={{ overflowWrap: "anywhere" }}>In: {row.clubs}</div> : null}
          {row.wish ? <div style={{ color: COLORS.muted, overflowWrap: "anywhere" }}>“{row.wish}”</div> : null}
          <div style={{ color: COLORS.faint, fontSize: 12 }}>
            {`Signed up ${fmtWhen(row.createdAt)}`}
            {row.confirmedAt ? ` · confirmed ${fmtDay(row.confirmedAt)}` : ""}
            {row.source ? ` · from ${row.source}` : ""}
            {row.batch ? ` · batch ${row.batch}` : ""}
            {row.newsOptIn ? " · wants Vibe news" : ""}
            {deletion ? ` · ${deletion}` : ""}
          </div>
          {code ? <div style={{ color: COLORS.faint, fontSize: 12 }}>{code}</div> : null}
        </div>
      </div>

      {asking ? (
        <div className="adm-actions">
          <span style={{ color: COLORS.muted }}>
            {asking === "remove"
              ? "Remove them and their answers from the list?"
              : row.status === "joined"
                ? "Their code already made an account. A new code goes out only if that account was never confirmed (a mistyped address). Try?"
                : "Their current code will stop working. Send a new one?"}
          </span>
          <ActionButton
            tone={asking === "remove" ? "danger" : "primary"}
            busy={busy !== null}
            onClick={() => void (asking === "remove" ? remove() : sendCode())}
          >
            {asking === "remove" ? "Yes, remove" : "Yes, send a new code"}
          </ActionButton>
          <ActionButton onClick={() => setAsking(null)} disabled={busy !== null}>Cancel</ActionButton>
        </div>
      ) : (
        <div className="adm-actions">
          {late ? (
            <span style={{ color: COLORS.muted, fontSize: 12 }}>
              {row.status === "joined"
                ? "Their entry is deleted within a day; the account stays."
                : "Too late for a code: their entry is deleted within a day. Once it’s deleted they can join the list again, or you can add them again."}
            </span>
          ) : (
            <ActionButton
              busy={busy === "send"}
              disabled={busy !== null}
              onClick={() => (sendNeedsAsk ? setAsking("send") : void sendCode())}
            >
              {hadCode ? "Send a new code" : "Send code"}
            </ActionButton>
          )}
          {canReveal && !email ? (
            <ActionButton busy={busy === "reveal"} disabled={busy !== null} onClick={() => void reveal()}>
              Show email
            </ActionButton>
          ) : null}
          <ActionButton tone="danger" disabled={busy !== null} onClick={() => setAsking("remove")}>
            Remove
          </ActionButton>
        </div>
      )}
      {said ? <Notice tone={said.tone}>{said.text}</Notice> : null}
    </div>
  );
}

const linkButton: React.CSSProperties = {
  marginLeft: 8,
  padding: 0,
  border: 0,
  background: "none",
  color: COLORS.accent,
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
};
