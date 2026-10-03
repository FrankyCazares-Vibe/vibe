"use client";

/**
 * "Add someone": a club officer who wrote in (often from Gmail) goes on the
 * list by hand, already confirmed, and can get a code at once. Any address
 * works here; the account they make still verifies a school email later.
 *
 * The typed address goes to POST /api/admin/waitlist/add in the body and
 * nowhere else. The route answers with an id, never the address.
 */

import { useState } from "react";

import { WAITLIST_LIMITS } from "@/lib/waitlist/form";
import type { AdminWaitlistAddResponse } from "@/lib/waitlist/types";

import { ActionButton, adminPost, COLORS, inputStyle, labelStyle, Notice } from "./admin-shell";

export function WaitlistAdd({
  batch,
  onAdded,
  onFound,
  onPause,
}: {
  /** The batch name typed above the list, already cleaned, or null. */
  batch: string | null;
  onAdded: () => void;
  /** The address is already on the list: show that person's row. */
  onFound: (id: string) => void;
  onPause: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isOfficer, setIsOfficer] = useState(true);
  const [officerClub, setOfficerClub] = useState("");
  const [clubs, setClubs] = useState("");
  const [issueCode, setIssueCode] = useState(true);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ tone: "good" | "error"; text: string } | null>(null);

  function problem(): string | null {
    const e = email.trim();
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Type the email address they wrote from.";
    if (e.length > WAITLIST_LIMITS.email) return "That address is too long.";
    if (!name.trim()) return "Add their name.";
    if (Array.from(name.trim()).length > WAITLIST_LIMITS.name) return `Keep the name under ${WAITLIST_LIMITS.name} characters.`;
    if (Array.from(officerClub.trim()).length > WAITLIST_LIMITS.officerClub) {
      return `Keep the club's name under ${WAITLIST_LIMITS.officerClub} characters.`;
    }
    if (Array.from(clubs.trim()).length > WAITLIST_LIMITS.clubs) return `Keep their clubs under ${WAITLIST_LIMITS.clubs} characters.`;
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const wrong = problem();
    if (wrong) {
      setSaid({ tone: "error", text: wrong });
      return;
    }
    setBusy(true);
    setSaid(null);
    const r = await adminPost<AdminWaitlistAddResponse>(
      "/api/admin/waitlist/add",
      {
        email: email.trim(),
        name: name.trim(),
        isOfficer,
        ...(isOfficer && officerClub.trim() ? { officerClub: officerClub.trim() } : {}),
        ...(clubs.trim() ? { clubs: clubs.trim() } : {}),
        issueCode,
        ...(batch ? { batch } : {}),
      },
      "Couldn't add them.",
    );
    setBusy(false);
    if (!r.ok) {
      setSaid({ tone: "error", text: r.message });
      if (r.pause) onPause(r.message);
      return;
    }
    if (r.data.existing) {
      // Someone who lost their code and wrote in: their row, one tap from
      // "Send a new code". Nothing was changed or sent.
      setSaid({ tone: "good", text: "That address is already on the list. Their row is shown below; nothing was changed." });
      setEmail("");
      onFound(r.data.id);
      return;
    }
    const sent = r.data.emailed ? " Their code is on its way." : issueCode ? " The code email didn't go: send one from their row." : "";
    setSaid({ tone: "good", text: `Added ${name.trim()}.${sent}` });
    setEmail("");
    setName("");
    setOfficerClub("");
    setClubs("");
    onAdded();
  }

  const check = { width: 18, height: 18, accentColor: COLORS.accent, margin: 0, flex: "none" } as const;
  return (
    <form onSubmit={submit} className="adm-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Add someone</div>
      <div className="adm-fields">
        <label style={{ flex: 1, minWidth: 220 }}>
          <span style={labelStyle}>Email</span>
          <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ flex: 1, minWidth: 160 }}>
          <span style={labelStyle}>Name</span>
          <input type="text" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </label>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
        <input type="checkbox" checked={isOfficer} onChange={(e) => setIsOfficer(e.target.checked)} style={check} />
        Runs a club
      </label>
      <div className="adm-fields">
        {isOfficer ? (
          <label style={{ flex: 1, minWidth: 200 }}>
            <span style={labelStyle}>Their club</span>
            <input type="text" value={officerClub} onChange={(e) => setOfficerClub(e.target.value)} style={inputStyle} />
          </label>
        ) : null}
        <label style={{ flex: 1, minWidth: 200 }}>
          <span style={labelStyle}>Other clubs they’re in</span>
          <input type="text" value={clubs} onChange={(e) => setClubs(e.target.value)} style={inputStyle} />
        </label>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
        <input type="checkbox" checked={issueCode} onChange={(e) => setIssueCode(e.target.checked)} style={check} />
        Email them an access code now{batch ? ` (batch ${batch})` : ""}
      </label>
      <div className="adm-actions">
        <ActionButton type="submit" tone="primary" busy={busy}>
          {issueCode ? "Add and send a code" : "Add to the list"}
        </ActionButton>
      </div>
      {said ? <Notice tone={said.tone}>{said.text}</Notice> : null}
    </form>
  );
}
