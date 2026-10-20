"use client";

/**
 * The setup list's inline panels (the club's view, wave 1): the one line
 * about the club, who can join, and the officers. Each saves through the
 * club's existing routes (PATCH /api/orgs/[slug], the members routes) and
 * the setup route's marks, then calls `onDone` so the page reads the list
 * again. Form refusals show under the form (quiet requests); a tap's own
 * failure is a toast.
 */
import { useEffect, useId, useState } from "react";

import { LoadFailed, asLoadFailure, type LoadFailure } from "@/components/feedback/LoadFailed";
import { OrgInviteSheet } from "@/components/orgs/OrgInviteSheet";
import {
  busyStyle,
  errorLineStyle,
  inputStyle,
  lineStyle,
  panelStyle,
  pillStyle,
  quietStyle,
  textActionStyle,
} from "@/components/orgs/club-tool-styles";
import { vibeRequest } from "@/lib/feedback/request";
import type { JoinPolicy } from "@/lib/orgs/join-state";

import type { SetupClub } from "./SetupScreen";

/** "One line": the club page's description, kept short here (the route allows 400). */
const ABOUT_MAX = 150;

function orgApi(handle: string, rest = ""): string {
  return `/api/orgs/${encodeURIComponent(handle)}${rest}`;
}

/** Marks a step the club's own data can't show (POST /api/orgs/[slug]/setup). */
function markStep(handle: string, mark: "who_can_join" | "officers_skipped", quiet: boolean) {
  return vibeRequest(orgApi(handle, "/setup"), { method: "POST", json: { mark }, quiet, failure: "Couldn't save that." });
}

export function AboutForm({ handle, onDone }: { handle: string; onDone: () => void }) {
  const inputId = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const value = text.trim();

  const save = async () => {
    if (busy || !value) return;
    setBusy(true);
    setErr(null);
    const r = await vibeRequest(orgApi(handle), {
      method: "PATCH",
      json: { description: value },
      quiet: true,
      failure: "Couldn't save that.",
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    onDone();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      style={{ display: "flex", flexDirection: "column", gap: 8, margin: "0 0 14px 34px" }}
    >
      <label htmlFor={inputId} className="sr-only">
        One line about the club
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          id={inputId}
          type="text"
          value={text}
          maxLength={ABOUT_MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder="We play chess on Thursdays. All levels."
          aria-invalid={err ? true : undefined}
          style={{ ...inputStyle, flex: 1, minWidth: 0 }}
        />
        <button type="submit" className="vibe-press" disabled={busy || !value} style={{ ...pillStyle, ...busyStyle(busy || !value) }}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {err ? (
        <p role="alert" style={errorLineStyle}>
          {err}
        </p>
      ) : null}
    </form>
  );
}

const JOIN_CHOICES: readonly { value: JoinPolicy; label: string; sub: string }[] = [
  { value: "open", label: "Anyone can join", sub: "They join right away" },
  { value: "request", label: "Ask first", sub: "Officers say yes to each one" },
  { value: "invite", label: "Invite only", sub: "Officers invite members" },
];

export function WhoCanJoinPanel({
  handle,
  current,
  onDone,
}: {
  handle: string;
  current: JoinPolicy;
  onDone: () => void;
}) {
  const name = useId();
  const [choice, setChoice] = useState<JoinPolicy>(current);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    // Only a change is sent: a hidden club refuses any change to who can
    // join, and keeping the choice it has is a choice too (the mark below).
    if (choice !== current) {
      const r = await vibeRequest(orgApi(handle), {
        method: "PATCH",
        json: { join_policy: choice },
        quiet: true,
        failure: "Couldn't save who can join.",
      });
      if (!r.ok) {
        setBusy(false);
        setErr(r.message);
        return;
      }
    }
    const marked = await markStep(handle, "who_can_join", true);
    setBusy(false);
    if (!marked.ok) {
      setErr(marked.message);
      return;
    }
    onDone();
  };

  return (
    <div style={panelStyle}>
      <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <legend className="sr-only">Who can join</legend>
        {JOIN_CHOICES.map((c) => {
          const picked = c.value === choice;
          return (
            <label
              key={c.value}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                minHeight: 52,
                padding: "8px 12px",
                borderRadius: 12,
                cursor: "pointer",
                border: `1px solid ${picked ? "var(--coral)" : "var(--hairline)"}`,
                background: picked ? "rgba(255,92,53,0.08)" : "transparent",
              }}
            >
              <input
                type="radio"
                name={name}
                value={c.value}
                checked={picked}
                onChange={() => setChoice(c.value)}
                style={{ width: 18, height: 18, margin: 0, accentColor: "var(--coral)", flexShrink: 0 }}
              />
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ ...lineStyle, color: "var(--charcoal)", fontWeight: 700 }}>{c.label}</span>
                <span style={quietStyle}>{c.sub}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {err ? (
        <p role="alert" style={errorLineStyle}>
          {err}
        </p>
      ) : null}
      <div>
        <button type="button" className="vibe-press" disabled={busy} onClick={() => void save()} style={{ ...pillStyle, ...busyStyle(busy) }}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

type MemberRow = { user_id: string; role: string; name: string | null; handle: string | null };

/** The roster's members who aren't officers yet, or null when the answer isn't a list. */
function parseMembers(data: unknown): MemberRow[] | null {
  const list = (data as { members?: unknown } | null)?.members;
  if (!Array.isArray(list)) return null;
  return list
    .filter((m): m is MemberRow => !!m && typeof (m as MemberRow).user_id === "string")
    .filter((m) => m.role === "member");
}

/** Same breakpoint as the club page's officer bar: a bottom sheet below it, a modal above. */
const PHONE_QUERY = "(max-width: 720px)";

export function OfficersPanel({
  club,
  role,
  onDone,
  onClose,
}: {
  club: SetupClub;
  role: "owner" | "admin";
  /** After a new officer: the list reads its steps again (the panel stays open for the next one). */
  onDone: () => void;
  /** After "Skip for now": the panel closes. */
  onClose: () => void;
}) {
  const isOwner = role === "owner";
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [invite, setInvite] = useState<"sheet" | "modal" | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const failure = "Couldn't load the club's members.";
      const r = await vibeRequest<unknown>(orgApi(club.handle, "/members"), { quiet: true, failure, signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      const rows = r.ok ? parseMembers(r.data) : null;
      if (rows) setMembers(rows);
      else setLoadErr(asLoadFailure(r, failure));
    })();
    return () => ctrl.abort();
  }, [club.handle, loadKey]);

  // Only the owner makes officers (Franky, Oct 20); the route says so too.
  const makeOfficer = async (userId: string) => {
    if (busyId) return;
    setBusyId(userId);
    const r = await vibeRequest(orgApi(club.handle, `/members/${encodeURIComponent(userId)}`), {
      method: "PATCH",
      json: { role: "admin" },
      failure: "Couldn't make them an officer.",
    });
    setBusyId(null);
    if (!r.ok) return;
    setMembers((prev) => (prev ? prev.filter((m) => m.user_id !== userId) : prev));
    onDone();
  };

  const skip = async () => {
    if (skipping) return;
    setSkipping(true);
    const r = await markStep(club.handle, "officers_skipped", false);
    setSkipping(false);
    if (!r.ok) return;
    onClose();
    onDone();
  };

  let list: React.ReactNode;
  if (loadErr) {
    list = (
      <LoadFailed
        compact
        failure={loadErr}
        onRetry={() => {
          setLoadErr(null);
          setLoadKey((k) => k + 1);
        }}
      />
    );
  } else if (!members) {
    list = <p style={quietStyle}>Loading members…</p>;
  } else if (members.length === 0) {
    list = <p style={lineStyle}>Nobody else is in the club yet.</p>;
  } else {
    list = (
      <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 320, overflowY: "auto" }}>
        {members.map((m) => (
          <li key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 52, borderBottom: "1px solid var(--hairline)" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...lineStyle, display: "block", color: "var(--charcoal)", fontWeight: 600, overflowWrap: "anywhere" }}>
                {m.name || m.handle || "Member"}
              </span>
              {m.handle ? <span style={{ ...quietStyle, display: "block" }}>@{m.handle}</span> : null}
            </span>
            {isOwner ? (
              <button
                type="button"
                className="vibe-press"
                disabled={busyId !== null}
                onClick={() => void makeOfficer(m.user_id)}
                style={{ ...pillStyle, ...busyStyle(busyId !== null) }}
              >
                {busyId === m.user_id ? "Saving…" : "Make officer"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div style={panelStyle}>
      {isOwner ? null : <p style={lineStyle}>Only the owner adds officers.</p>}
      {list}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div>
          <button
            type="button"
            className="vibe-press"
            onClick={() => setInvite(window.matchMedia(PHONE_QUERY).matches ? "sheet" : "modal")}
            style={pillStyle}
          >
            Invite by name
          </button>
        </div>
        <p style={quietStyle}>Once they join, make them officers here.</p>
      </div>
      <div>
        <button type="button" disabled={skipping} onClick={() => void skip()} style={{ ...textActionStyle, ...busyStyle(skipping) }}>
          {skipping ? "Saving…" : "Skip for now"}
        </button>
      </div>
      {invite ? (
        <OrgInviteSheet
          handle={club.handle}
          orgName={club.name}
          audience={club.audience}
          presentation={invite}
          onClose={() => setInvite(null)}
        />
      ) : null}
    </div>
  );
}
