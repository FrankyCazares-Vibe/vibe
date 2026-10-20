"use client";

/**
 * Admin › Clubs › "New club setup link" (the club's view, wave 1; the board is
 * handoffs/2026-10-20-club-view/project/R2_Setup.dc.html, column 1).
 *
 * For the first 20 clubs a founder meets the president in person, types the
 * club's name here, makes a link and holds up its QR. The president scans it,
 * signs up past the closed waitlist and becomes the owner of a club with this
 * name and handle. "We met in person" makes that club checked (verified).
 *
 * THE LINK IS SHOWN ONCE. Only a hash of its code is kept, so the answer to
 * POST /api/admin/club-links is the one time the link exists in full. It stays
 * on screen until another link is made, or until the list says it is no longer
 * live (cancelled, used): a dead QR left up on a laptop just gets scanned. A
 * reload loses it, and the fix for a lost link is Cancel below and a new one.
 *
 * THE HANDLE FOLLOWS THE NAME until the founder types in it, with the same
 * `suggestClubHandle` the route falls back to. It is the club's address and it
 * is permanent, so it is shown before the link is made, not after.
 *
 * CANCEL ASKS TWICE, like Hide in the clubs list: a cancelled link can't be
 * turned back on, and the president holding it is left with a dead QR.
 */

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { QrCode } from "@/components/events/checkin/QrCode";
import { CLUB_HANDLE_RE, SETUP_LINK_TTL_DAYS, suggestClubHandle } from "@/lib/club-links/code";
import { copyText, vibeRequest } from "@/lib/feedback/request";

import {
  ActionButton,
  adminGet,
  adminPost,
  type AdminResult,
  Badge,
  COLORS,
  Empty,
  fmtDay,
  fmtRelative,
  inputStyle,
  labelStyle,
  Notice,
} from "./admin-shell";

/** One setup link as GET /api/admin/club-links answers it. Never its code. */
export type SetupLinkItem = {
  id: string;
  name: string | null;
  handle: string | null;
  checked: boolean;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  /** "off" is the store's word for cancelled; the list route says "cancelled". */
  state: "live" | "used" | "expired" | "off" | "cancelled";
  /** The club the link made, once it is used. */
  club: { handle: string; name: string } | null;
};

type ListResponse = { ok: boolean; links?: SetupLinkItem[] };
type MakeResponse = { ok: boolean; url: string; link: SetupLinkItem };
type Said = { tone: "error" | "good"; text: string };

/** The route's own rule, word for word, so the form can say it before asking. */
const HANDLE_RULE =
  "The handle is 3 to 31 lowercase letters, numbers, _ or -, starting with a letter or number.";

/** Expired has no colour of its own on the desk: a quiet grey. */
const GREY = "#A8A29A";

function fetchLinks(): Promise<AdminResult<ListResponse>> {
  return adminGet<ListResponse>("/api/admin/club-links", "Couldn't load the setup links.");
}

/**
 * DELETE through vibeRequest, because the shell's adminGet and adminPost only
 * GET and POST. The shell's rule all the same: the route's own sentence ("That
 * link is already used or cancelled.") when it sent one, the mapped line when
 * it only said "Not found".
 */
async function adminDelete(url: string, failure: string): Promise<AdminResult<{ ok: true }>> {
  const r = await vibeRequest<{ ok: true }>(url, { method: "DELETE", failure, quiet: true });
  if (r.ok) return { ok: true, data: r.data };
  const said = r.error?.trim() ?? "";
  const sentence = said.length > 12 && /\s/.test(said) && /[.!?]$/.test(said);
  return { ok: false, message: sentence ? said : r.message, pause: r.status === 429, status: r.status };
}

/** What a row is called: its club's name, or its handle when the name is missing. */
function labelOf(link: SetupLinkItem): string {
  return link.name ?? (link.handle ? `@${link.handle}` : "this club");
}

/** The state chip, and the few words that go with it. */
function StateChip({ link }: { link: SetupLinkItem }) {
  const detail: React.CSSProperties = { fontSize: 12, color: COLORS.muted };
  if (link.state === "live") {
    return (
      <>
        <Badge color={COLORS.good}>Live</Badge>
        <span style={detail}>ends {fmtDay(link.expires_at)}</span>
      </>
    );
  }
  if (link.state === "used") {
    return (
      <>
        <Badge color={COLORS.accent}>Used</Badge>
        {link.club ? (
          <Link
            href={`/orgs/${link.club.handle}`}
            style={{ fontSize: 12, color: COLORS.text, fontWeight: 600 }}
          >
            Open {link.club.name}
          </Link>
        ) : link.used_at ? (
          <span style={detail}>{fmtDay(link.used_at)}</span>
        ) : null}
      </>
    );
  }
  if (link.state === "expired") {
    return (
      <>
        <Badge color={GREY}>Expired</Badge>
        <span style={detail}>ended {fmtDay(link.expires_at)}</span>
      </>
    );
  }
  return <Badge color={COLORS.warn}>Cancelled</Badge>;
}

export function ClubLinksCard() {
  const [name, setName] = useState("");
  /** What the founder typed in Handle; null while it still follows the name. */
  const [typedHandle, setTypedHandle] = useState<string | null>(null);
  const [checked, setChecked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said | null>(null);
  /** The link just made: the one time its full address exists anywhere. */
  const [made, setMade] = useState<{ url: string; link: SetupLinkItem } | null>(null);
  const handleRef = useRef<HTMLInputElement>(null);
  const hintId = useId();

  /** Null until the first load answers. */
  const [links, setLinks] = useState<SetupLinkItem[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  /** The link whose Cancel is in flight, and the one waiting on a second press. */
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  /** One notice per link, rendered in that link's own row. */
  const [notes, setNotes] = useState<Record<string, Said>>({});

  const handle = typedHandle ?? suggestClubHandle(name) ?? "";
  const handleBad = handle !== "" && !CLUB_HANDLE_RE.test(handle);

  const applyList = useCallback((r: AdminResult<ListResponse>) => {
    if (r.ok) {
      setLinks(r.data.links ?? []);
      setListErr(null);
    } else {
      setListErr(r.message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchLinks().then((r) => {
      if (!cancelled) applyList(r);
    });
    return () => {
      cancelled = true;
    };
  }, [applyList]);

  const reload = async () => {
    setReloading(true);
    applyList(await fetchLinks());
    setReloading(false);
  };

  const say = (id: string, note: Said | null) =>
    setNotes((prev) => {
      const next = { ...prev };
      if (note) next[id] = note;
      else delete next[id];
      return next;
    });

  function problem(clean: string): string | null {
    if (clean.length < 2 || clean.length > 50) return "The club's name is 2 to 50 characters.";
    if (!handle) return "Add a handle for the club.";
    if (!CLUB_HANDLE_RE.test(handle)) return HANDLE_RULE;
    return null;
  }

  async function make(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    // The route trims and folds runs of spaces the same way.
    const clean = name.trim().replace(/\s+/g, " ");
    const wrong = problem(clean);
    if (wrong) {
      setSaid({ tone: "error", text: wrong });
      return;
    }
    setBusy(true);
    setSaid(null);
    const r = await adminPost<MakeResponse>(
      "/api/admin/club-links",
      { name: clean, handle, checked },
      `Couldn't make the link for ${clean}.`,
    );
    setBusy(false);
    if (!r.ok) {
      setSaid({ tone: "error", text: r.message });
      // A taken handle is fixed in the handle field, so the cursor goes there.
      if (r.status === 409) handleRef.current?.focus();
      return;
    }
    const link = r.data.link;
    setMade({ url: r.data.url, link });
    setLinks((prev) => [link, ...(prev ?? []).filter((l) => l.id !== link.id)]);
    // Ready for the next club.
    setName("");
    setTypedHandle(null);
    setChecked(true);
  }

  async function cancel(link: SetupLinkItem) {
    setRowBusy(link.id);
    setConfirming(null);
    say(link.id, null);
    const r = await adminDelete(
      `/api/admin/club-links/${encodeURIComponent(link.id)}`,
      `Couldn't cancel the link for ${labelOf(link)}.`,
    );
    if (r.ok) {
      setLinks((prev) => prev?.map((l) => (l.id === link.id ? { ...l, state: "cancelled" } : l)) ?? prev);
      say(link.id, { tone: "good", text: `The link for ${labelOf(link)} is cancelled. It no longer works.` });
    } else {
      say(link.id, { tone: "error", text: r.message });
      // Used or cancelled since the list loaded: show where it stands now.
      if (r.status === 404) applyList(await fetchLinks());
    }
    setRowBusy(null);
  }

  // The QR stays up only while the list still has its link live.
  const madeState = made ? (links?.find((l) => l.id === made.link.id)?.state ?? "live") : null;
  const shown = made && madeState === "live" ? made : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        // Set apart from the clubs list that follows it on the tab.
        paddingBottom: 18,
        marginBottom: 6,
        borderBottom: `1px solid ${COLORS.border}`,
      }}
    >
      <form onSubmit={make} className="adm-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ margin: 0, fontFamily: "Fraunces, serif", fontWeight: 800, fontSize: 18 }}>
          New club setup link
        </h2>
        <div className="adm-fields">
          <label style={{ flex: 1, minWidth: 220 }}>
            <span style={labelStyle}>Club name</span>
            <input
              type="text"
              autoComplete="off"
              maxLength={50}
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ flex: 1, minWidth: 200 }}>
            <span style={labelStyle}>Handle</span>
            <span style={{ ...inputStyle, display: "flex", alignItems: "center", padding: 0 }}>
              <span aria-hidden style={{ paddingLeft: 14, color: COLORS.muted }}>
                @
              </span>
              <input
                ref={handleRef}
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={31}
                value={handle}
                aria-describedby={hintId}
                aria-invalid={handleBad || undefined}
                // Lowercase, no spaces and no leading "@", the way the route reads it.
                onChange={(e) =>
                  setTypedHandle(e.target.value.replace(/^@+/, "").replace(/\s+/g, "").toLowerCase())
                }
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "10px 14px 10px 2px",
                  border: "none",
                  background: "transparent",
                  color: COLORS.text,
                  fontFamily: "inherit",
                  fontSize: 14,
                  outline: "none",
                }}
              />
            </span>
          </label>
        </div>
        <div id={hintId} style={{ fontSize: 12, lineHeight: 1.5, color: COLORS.muted, overflowWrap: "anywhere" }}>
          Permanent. The club&apos;s address: connectvibe.app/orgs/{handle || "…"}
          {handleBad ? <span style={{ display: "block", color: COLORS.warn }}>{HANDLE_RULE}</span> : null}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, cursor: "pointer", padding: "4px 0" }}>
          {/* A real checkbox, announced as a switch, drawn as one. */}
          <span style={{ position: "relative", width: 40, height: 24, flex: "none" }}>
            <input
              type="checkbox"
              role="switch"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              style={{
                appearance: "none",
                WebkitAppearance: "none",
                display: "block",
                boxSizing: "border-box",
                margin: 0,
                width: 40,
                height: 24,
                borderRadius: 999,
                cursor: "pointer",
                background: checked ? COLORS.accent : "rgba(255,255,255,0.12)",
                border: `1px solid ${checked ? COLORS.accent : COLORS.border}`,
              }}
            />
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: 3,
                left: checked ? 19 : 3,
                width: 18,
                height: 18,
                borderRadius: 999,
                background: "#fff",
                pointerEvents: "none",
              }}
            />
          </span>
          We met in person: the club is checked
        </label>
        <div className="adm-actions">
          <ActionButton type="submit" tone="primary" busy={busy}>
            Make the link
          </ActionButton>
        </div>
        {said ? <Notice tone={said.tone}>{said.text}</Notice> : null}

        {shown ? (
          <div className="adm-split" style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 14, marginTop: 4 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flex: "none" }}>
              {/* Black on white in every theme, like the door screen's: many
                  phone cameras misread a light-on-dark code. */}
              <div style={{ padding: 12, borderRadius: 16, background: "#fff", boxShadow: `0 0 0 1px ${COLORS.border}` }}>
                <QrCode
                  text={shown.url}
                  // 240px on a laptop; narrower on a 375px phone so the tile fits.
                  size="min(240px, calc(100vw - 110px))"
                  label={`QR code for ${labelOf(shown.link)}'s setup link`}
                />
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.4, color: COLORS.muted, textAlign: "center", maxWidth: 264 }}>
                Works once, for {SETUP_LINK_TTL_DAYS} days. It lets one person past the waitlist.
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "Fraunces, serif", fontWeight: 800, fontSize: 16, overflowWrap: "anywhere" }}>
                    {labelOf(shown.link)}
                  </span>
                  {shown.link.checked ? <Badge color={COLORS.verified}>checked</Badge> : null}
                </div>
                {shown.link.handle ? (
                  <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>@{shown.link.handle}</div>
                ) : null}
              </div>
              <div className="adm-actions">
                <code
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "9px 12px",
                    borderRadius: 10,
                    background: COLORS.panel,
                    border: `1px solid ${COLORS.border}`,
                    fontSize: 13,
                    lineHeight: 1.4,
                    // A long address wraps instead of scrolling the page sideways.
                    wordBreak: "break-all",
                    userSelect: "all",
                  }}
                >
                  {shown.url}
                </code>
                <ActionButton
                  onClick={() =>
                    void copyText(shown.url, {
                      success: "Setup link copied",
                      failure: "Couldn't copy the link. Select it and copy it by hand.",
                    })
                  }
                >
                  Copy
                </ActionButton>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: COLORS.muted }}>
                Shown once. If you lose it, cancel it below and make a new one.
              </div>
            </div>
          </div>
        ) : null}
      </form>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ ...labelStyle, margin: 0 }}>Setup links</h2>

        {listErr ? (
          <>
            <Notice tone="error">{listErr}</Notice>
            <div className="adm-actions">
              <ActionButton busy={reloading} onClick={() => void reload()}>
                Try again
              </ActionButton>
            </div>
          </>
        ) : null}

        {links === null ? (
          listErr ? null : <div style={{ fontSize: 13, color: COLORS.muted }}>Loading the setup links…</div>
        ) : links.length === 0 ? (
          <Empty>No setup links yet. Make one above when you meet a club&apos;s president.</Empty>
        ) : (
          links.map((l) => {
            const live = l.state === "live";
            return (
              <div key={l.id} className="adm-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="adm-split">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontFamily: "Fraunces, serif",
                          fontWeight: 800,
                          fontSize: 16,
                          color: "#fff",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {l.name ?? "Unnamed club"}
                      </span>
                      <StateChip link={l} />
                      {l.checked ? <Badge color={COLORS.verified}>checked</Badge> : null}
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
                      {l.handle ? (
                        <>
                          <span>@{l.handle}</span>
                          <span style={{ opacity: 0.4 }}>·</span>
                        </>
                      ) : null}
                      <span>made {fmtRelative(l.created_at)}</span>
                    </div>
                  </div>

                  {live ? (
                    <div className="adm-actions" style={{ flexShrink: 0 }}>
                      <ActionButton
                        tone="danger"
                        busy={rowBusy === l.id}
                        disabled={confirming === l.id}
                        title="Stop this link working. The club it would make is never made."
                        onClick={() => {
                          say(l.id, null);
                          setConfirming(l.id);
                        }}
                      >
                        Cancel
                      </ActionButton>
                    </div>
                  ) : null}
                </div>

                {confirming === l.id ? (
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
                      Cancel the link for {labelOf(l)}? It stops working at once, even for someone
                      who already signed up through it, and it can&apos;t be turned back on. You
                      would make a new one.
                    </div>
                    <div className="adm-actions">
                      <ActionButton tone="danger" busy={rowBusy === l.id} onClick={() => void cancel(l)}>
                        Cancel the link
                      </ActionButton>
                      <ActionButton disabled={rowBusy === l.id} onClick={() => setConfirming(null)}>
                        Keep it
                      </ActionButton>
                    </div>
                  </div>
                ) : null}

                {notes[l.id] ? <Notice tone={notes[l.id].tone}>{notes[l.id].text}</Notice> : null}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
