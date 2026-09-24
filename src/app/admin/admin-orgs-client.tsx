"use client";

/**
 * The clubs tab: verify a club, and take one out of sight.
 *
 * The surface, the header and the tab bar moved to admin-shell.tsx in wave 2 —
 * this file is the list and nothing else now.
 *
 * HIDE IS KEYED BY THE HANDLE. `POST /api/admin/orgs/[slug]/hide` reads
 * `[slug]` as the org's handle, not its id; an org uuid there is a 404. The
 * same is true of /verify.
 *
 * THE ROW IS REPAINTED FROM THE ANSWER, not from what we hoped. Hiding revokes
 * pending invites and says how many, and unhiding does not bring them back —
 * neither of which an optimistic row could have known. That answer is shown
 * INSIDE the row, because the list runs to 500 clubs and a sentence at the top
 * of the page is off-screen by the time you have scrolled to the one you acted
 * on — and the revoked-invite count is the part that cannot be undone.
 *
 * HIDE ASKS TWICE. It sits next to Verify, and below 640px both are full-width
 * and stacked, so a mis-tap is one pixel of travel from "verify this club" to
 * "burn its pending invites". Unhide stays one click: it destroys nothing.
 */

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  ActionButton,
  adminPost,
  Badge,
  COLORS,
  Empty,
  fmtRelative,
  inputStyle,
  Notice,
} from "./admin-shell";

export type AdminOrgRow = {
  id: string;
  handle: string;
  name: string;
  description: string;
  logo_url: string | null;
  is_public: boolean;
  verified: boolean;
  /** `orgs.hidden_at` is set: out of sight for everyone but its members. */
  hidden: boolean;
  last_activity_at: string | null;
  created_at: string;
  member_count: number;
  dormant: boolean;
};

type RowNote = { tone: "error" | "good"; text: string };

type FilterKey = "all" | "verified" | "community" | "dormant" | "hidden";

const FILTERS: FilterKey[] = ["all", "verified", "community", "dormant", "hidden"];

export function AdminOrgsClient({ initialOrgs }: { initialOrgs: AdminOrgRow[] }) {
  const [orgs, setOrgs] = useState<AdminOrgRow[]>(initialOrgs);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  /** One notice per club, rendered in that club's own card. */
  const [notes, setNotes] = useState<Record<string, RowNote>>({});
  /** The club whose Hide is waiting on a second press. */
  const [confirming, setConfirming] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orgs.filter((o) => {
      if (filter === "verified" && !o.verified) return false;
      if (filter === "community" && (o.verified || o.dormant)) return false;
      if (filter === "dormant" && !o.dormant) return false;
      if (filter === "hidden" && !o.hidden) return false;
      if (q && !o.name.toLowerCase().includes(q) && !o.handle.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [orgs, filter, search]);

  const counts = useMemo(
    () => ({
      all: orgs.length,
      verified: orgs.filter((o) => o.verified).length,
      community: orgs.filter((o) => !o.verified && !o.dormant).length,
      dormant: orgs.filter((o) => o.dormant).length,
      hidden: orgs.filter((o) => o.hidden).length,
    }),
    [orgs]
  );

  const patch = (id: string, next: Partial<AdminOrgRow>) =>
    setOrgs((prev) => prev.map((o) => (o.id === id ? { ...o, ...next } : o)));

  const say = (id: string, note: RowNote | null) =>
    setNotes((prev) => {
      const next = { ...prev };
      if (note) next[id] = note;
      else delete next[id];
      return next;
    });

  const toggleVerified = async (org: AdminOrgRow) => {
    setBusy(org.handle);
    say(org.id, null);
    const next = !org.verified;
    const r = await adminPost<{ org?: { verified?: boolean } }>(
      `/api/admin/orgs/${encodeURIComponent(org.handle)}/verify`,
      { verified: next },
      `Couldn't ${next ? "verify" : "unverify"} ${org.name}.`
    );
    if (r.ok) {
      const verified = r.data.org?.verified ?? next;
      patch(org.id, { verified, dormant: verified ? false : org.dormant });
      say(org.id, {
        tone: "good",
        text: `${org.name} is ${verified ? "verified" : "no longer verified"}.`,
      });
    } else {
      say(org.id, { tone: "error", text: r.message });
    }
    setBusy(null);
  };

  const toggleHidden = async (org: AdminOrgRow) => {
    setBusy(org.handle);
    setConfirming(null);
    say(org.id, null);
    const next = !org.hidden;
    const r = await adminPost<{ hidden?: boolean; revoked_invites?: number; changed?: boolean }>(
      `/api/admin/orgs/${encodeURIComponent(org.handle)}/hide`,
      { hidden: next },
      `Couldn't ${next ? "hide" : "unhide"} ${org.name}.`
    );
    if (r.ok) {
      const hidden = r.data.hidden ?? next;
      patch(org.id, { hidden });
      const revoked = r.data.revoked_invites ?? 0;
      say(org.id, {
        tone: "good",
        text: hidden
          ? `${org.name} is hidden — only its members can see it.` +
            (revoked > 0
              ? ` ${revoked} pending ${revoked === 1 ? "invite" : "invites"} revoked.`
              : "")
          : `${org.name} is visible again. Invites revoked when it was hidden don't come back.`,
      });
    } else {
      say(org.id, { tone: "error", text: r.message });
    }
    setBusy(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="adm-fields">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or handle…"
          aria-label="Search clubs"
          style={{ ...inputStyle, flex: 1, minWidth: 220 }}
        />
        <div className="adm-nowrap-scroll" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FILTERS.map((k) => {
            const on = filter === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: on ? "1px solid rgba(255,180,150,0.55)" : `1px solid ${COLORS.border}`,
                  background: on
                    ? "linear-gradient(180deg, rgba(255,92,53,0.32) 0%, rgba(255,92,53,0.14) 100%)"
                    : COLORS.panel,
                  color: COLORS.text,
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: on ? 700 : 500,
                  cursor: "pointer",
                  textTransform: "capitalize",
                  whiteSpace: "nowrap",
                }}
              >
                {k} ({counts[k]})
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 ? (
          <Empty>
            {orgs.length === 0
              ? "No clubs yet. Every club a student creates shows up here."
              : "No clubs match that search or filter."}
          </Empty>
        ) : (
          filtered.map((o) => (
            <div
              key={o.id}
              className="adm-card"
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div className="adm-split">
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: o.logo_url
                      ? `url(${o.logo_url}) center/cover`
                      : "rgba(255,255,255,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "Fraunces, serif",
                    fontWeight: 800,
                    fontSize: 15,
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  {!o.logo_url
                    ? o.name
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((s) => s[0])
                        .join("")
                        .toUpperCase()
                    : null}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Link
                      href={`/orgs/${o.handle}`}
                      style={{
                        fontFamily: "Fraunces, serif",
                        fontWeight: 800,
                        fontSize: 16,
                        color: "#fff",
                        textDecoration: "none",
                      }}
                    >
                      {o.name}
                    </Link>
                    {o.verified ? <Badge color={COLORS.verified}>verified</Badge> : null}
                    {o.hidden ? <Badge color={COLORS.warn}>hidden</Badge> : null}
                    {!o.is_public ? <Badge color={COLORS.unknown}>private</Badge> : null}
                    {o.dormant ? <Badge color={COLORS.warn}>dormant</Badge> : null}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: COLORS.muted,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 2,
                    }}
                  >
                    <span>@{o.handle}</span>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>
                      {o.member_count} {o.member_count === 1 ? "member" : "members"}
                    </span>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>active {fmtRelative(o.last_activity_at)}</span>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>created {fmtRelative(o.created_at)}</span>
                  </div>
                </div>

                <div className="adm-actions" style={{ flexShrink: 0 }}>
                  <ActionButton
                    busy={busy === o.handle}
                    onClick={() => toggleVerified(o)}
                    tone={o.verified ? "primary" : "plain"}
                  >
                    {o.verified ? "Unverify" : "Verify"}
                  </ActionButton>
                  <ActionButton
                    busy={busy === o.handle}
                    disabled={confirming === o.id}
                    onClick={() => {
                      // Unhide destroys nothing, so it goes straight through.
                      // Hide asks once more first.
                      if (o.hidden) void toggleHidden(o);
                      else {
                        say(o.id, null);
                        setConfirming(o.id);
                      }
                    }}
                    tone={o.hidden ? "plain" : "danger"}
                    title={
                      o.hidden
                        ? "Put this club back in front of everyone."
                        : "Take this club out of sight for everyone but its members, and revoke its pending invites."
                    }
                  >
                    {o.hidden ? "Unhide" : "Hide"}
                  </ActionButton>
                </div>
              </div>

              {confirming === o.id ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    padding: 12,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: COLORS.text }}>
                    Hide {o.name}? Only its members will be able to see it, its pending
                    invites are revoked, and unhiding doesn&apos;t bring them back.
                  </div>
                  <div className="adm-actions">
                    <ActionButton
                      tone="danger"
                      busy={busy === o.handle}
                      onClick={() => void toggleHidden(o)}
                    >
                      Hide it
                    </ActionButton>
                    <ActionButton disabled={busy === o.handle} onClick={() => setConfirming(null)}>
                      Cancel
                    </ActionButton>
                  </div>
                </div>
              ) : null}

              {notes[o.id] ? (
                <Notice tone={notes[o.id].tone}>{notes[o.id].text}</Notice>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
