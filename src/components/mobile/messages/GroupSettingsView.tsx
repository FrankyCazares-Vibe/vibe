"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Drawer } from "vaul";

import { ComposeOverlay } from "./ComposeOverlay";
import { initialsOf } from "./format";
import { vaulContentStyle, vaulHandleStyle, vaulOverlayStyle, visuallyHiddenStyle } from "./sheet-styles";
import { MuteDurationSheet, SheetRow } from "./sheets";
import { useNightTheme } from "./theme";
import { type ThreadEntry, type ThreadMember } from "./types";

export function GroupSettingsView({
  threadId,
  thread,
  onClose,
  onLeft,
}: {
  threadId: string;
  thread: ThreadEntry;
  onClose: () => void;
  onLeft: () => void;
}) {
  // Top bar + name field: translucent cream/white with no Night token yet.
  const night = useNightTheme();
  const [name, setName] = useState(thread.name || "Group");
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(thread.name || "");
  const [members, setMembers] = useState<ThreadMember[]>(
    Array.isArray(thread.members) ? thread.members : [],
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(thread.photo_url);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  // Per-member mute state — keyed by member id, value is the "until"
  // ISO string returned by POST /members/:id/mute (or null = unmuted).
  // The threads API doesn't surface this yet, so we treat unknown as
  // unmuted and let taps drive the truth.
  const [memberMutes, setMemberMutes] = useState<Record<string, string | null>>({});
  // Which member's action sheet is open (null = none).
  const [memberSheetFor, setMemberSheetFor] = useState<ThreadMember | null>(null);

  const viewerRole = thread.viewer_role ?? "member";
  const isAdmin = viewerRole === "admin";

  useEffect(() => {
    if (!feedback) return;
    const t = window.setTimeout(() => setFeedback(null), 1800);
    return () => window.clearTimeout(t);
  }, [feedback]);

  // Hide the bottom tab bar while group settings is up. Same trick we
  // use everywhere else with full-screen overlays.
  useEffect(() => {
    document.body.classList.add("vibe-composer-open");
    return () => document.body.classList.remove("vibe-composer-open");
  }, []);

  const saveName = useCallback(async () => {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === name || busy) {
      setEditingName(false);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        },
      );
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Rename failed");
      setName(trimmed);
      setEditingName(false);
      setFeedback("Name updated");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  }, [draftName, name, busy, threadId]);

  const removeMember = useCallback(
    async (m: ThreadMember) => {
      if (busy) return;
      if (
        typeof window !== "undefined" &&
        !window.confirm(`Remove ${m.name || `@${m.handle ?? "user"}`} from the group?`)
      )
        return;
      setBusy(true);
      // Optimistic remove.
      setMembers((prev) => prev.filter((x) => x.id !== m.id));
      try {
        const r = await fetch(
          `/api/me/threads/${encodeURIComponent(threadId)}/members/${encodeURIComponent(m.id)}`,
          { method: "DELETE" },
        );
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Remove failed");
        setFeedback(`${m.name || "Member"} removed`);
      } catch (e) {
        // Roll back.
        setMembers((prev) =>
          [...prev, m].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
        );
        setFeedback(e instanceof Error ? e.message : "Remove failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, threadId],
  );

  const muteMember = useCallback(
    async (m: ThreadMember, hours: number | null) => {
      if (busy) return;
      setBusy(true);
      try {
        const r = await fetch(
          `/api/me/threads/${encodeURIComponent(threadId)}/members/${encodeURIComponent(m.id)}/mute`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(hours ? { duration_hours: hours } : {}),
          },
        );
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Mute failed");
        setMemberMutes((prev) => ({ ...prev, [m.id]: j.until ?? null }));
        setFeedback(`${m.name || "Member"} muted`);
      } catch (e) {
        setFeedback(e instanceof Error ? e.message : "Mute failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, threadId],
  );

  const unmuteMember = useCallback(
    async (m: ThreadMember) => {
      if (busy) return;
      setBusy(true);
      try {
        const r = await fetch(
          `/api/me/threads/${encodeURIComponent(threadId)}/members/${encodeURIComponent(m.id)}/mute`,
          { method: "DELETE" },
        );
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Unmute failed");
        setMemberMutes((prev) => ({ ...prev, [m.id]: null }));
        setFeedback(`${m.name || "Member"} unmuted`);
      } catch (e) {
        setFeedback(e instanceof Error ? e.message : "Unmute failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, threadId],
  );

  const leave = useCallback(async () => {
    if (busy) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Leave ${name}? You won't receive new messages.`)
    )
      return;
    setBusy(true);
    try {
      const meR = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}/messages?limit=1`,
        { cache: "no-store" },
      );
      const meJ = await meR.json();
      const viewerId =
        typeof meJ?.viewer_id === "string" ? (meJ.viewer_id as string) : null;
      if (!viewerId) throw new Error("Could not resolve your id");
      const r = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}/members/${encodeURIComponent(viewerId)}`,
        { method: "DELETE" },
      );
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Leave failed");
      onLeft();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Leave failed");
    } finally {
      setBusy(false);
    }
  }, [busy, name, threadId, onLeft]);

  const addMember = useCallback(
    async (handle: string) => {
      if (busy) return;
      setBusy(true);
      try {
        const r = await fetch(
          `/api/me/threads/${encodeURIComponent(threadId)}/members`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ handle }),
          },
        );
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Add failed");
        if (j.member) {
          setMembers((prev) => [...prev, j.member as ThreadMember]);
        }
        setAddOpen(false);
        setFeedback("Member added");
      } catch (e) {
        setFeedback(e instanceof Error ? e.message : "Add failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, threadId],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Group info"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1250,
        background: "var(--cream)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
      }}
    >
      {/* Top bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "calc(env(safe-area-inset-top, 0px) + 8px) 12px 8px",
          // Cream at .94 (no --cream-94 yet): Night takes the tab bar's step.
          background: night ? "var(--tabbar-bg)" : "rgba(250, 247, 242, 0.94)",
          backdropFilter: "saturate(160%) blur(14px)",
          WebkitBackdropFilter: "saturate(160%) blur(14px)",
          borderBottom: "1px solid rgba(var(--scrim-rgb),0.06)",
          position: "sticky",
          top: 0,
          zIndex: 2,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            border: "none",
            background: "transparent",
            color: "var(--charcoal)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
            <path d="M14 4L7 11l7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 17,
            fontWeight: 800,
            color: "var(--charcoal)",
            flex: 1,
          }}
        >
          Group info
        </span>
      </header>

      {/* Photo + name section */}
      <section
        style={{
          padding: "24px 18px 14px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          borderBottom: "1px solid rgba(var(--scrim-rgb),0.06)",
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 999,
            background: photoUrl
              ? `url(${photoUrl}) center/cover`
              : "linear-gradient(135deg,#FFD3C2 0%,#FF9D7E 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#1C1C1E",
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 28,
            boxShadow: "0 6px 22px rgba(180,120,60,0.18)",
            border: "1px solid rgba(255,255,255,0.6)",
          }}
        >
          {!photoUrl ? initialsOf(name) : null}
        </div>
        {editingName && isAdmin ? (
          <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 320 }}>
            <input
              type="text"
              // 17px on purpose: keep it out of the phone 16px input rule.
              data-keep-font
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              autoFocus
              maxLength={80}
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 14,
                border: "1px solid rgba(var(--scrim-rgb),0.10)",
                // White at .92 (no --paper-92 yet): Night takes the paper.
                background: night ? "var(--paper)" : "rgba(255,255,255,0.92)",
                fontFamily: "Fraunces, serif",
                fontSize: 17,
                fontWeight: 800,
                color: "var(--charcoal)",
                outline: "none",
                textAlign: "center",
              }}
            />
            <button
              type="button"
              onClick={() => void saveName()}
              disabled={busy}
              style={{
                padding: "10px 16px",
                borderRadius: 999,
                border: "none",
                background: "#FF5C35",
                color: "#fff",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Save
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (!isAdmin) return;
              setDraftName(name);
              setEditingName(true);
            }}
            disabled={!isAdmin}
            style={{
              background: "transparent",
              border: "none",
              padding: "6px 12px",
              cursor: isAdmin ? "pointer" : "default",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 22,
                fontWeight: 900,
                color: "var(--charcoal)",
                letterSpacing: "-0.4px",
              }}
            >
              {name}
            </span>
            {isAdmin ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M9.5 2L12 4.5l-7 7H2.5v-2.5z" stroke="#8A8580" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
              </svg>
            ) : null}
          </button>
        )}
        <span
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            color: "var(--ink-muted)",
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          {members.length + 1} {members.length + 1 === 1 ? "member" : "members"}
        </span>
      </section>

      {feedback ? (
        <div
          style={{
            margin: "10px 16px 0",
            padding: "8px 12px",
            borderRadius: 12,
            background: "rgba(var(--scrim-rgb),0.06)",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12.5,
            color: "var(--charcoal)",
            textAlign: "center",
          }}
        >
          {feedback}
        </div>
      ) : null}

      {/* Members list */}
      <section style={{ padding: "16px 0 8px" }}>
        <div
          style={{
            padding: "0 18px 8px",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ink-muted)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Members</span>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              style={{
                background: "transparent",
                border: "none",
                color: "#FF5C35",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 12.5,
                fontWeight: 800,
                letterSpacing: "0.02em",
                cursor: "pointer",
                padding: 0,
                textTransform: "none",
              }}
            >
              + Add
            </button>
          ) : null}
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              muted={
                !!memberMutes[m.id] &&
                new Date(memberMutes[m.id] as string) > new Date()
              }
              onOpenActions={() => setMemberSheetFor(m)}
            />
          ))}
        </ul>
      </section>

      {/* Leave group */}
      <section style={{ padding: "8px 0 28px", marginTop: 8 }}>
        <SheetRow label="Leave group" danger onClick={() => void leave()} />
      </section>

      {addOpen ? (
        <ComposeOverlay
          onCancel={() => setAddOpen(false)}
          onPick={(handle) => void addMember(handle)}
        />
      ) : null}

      {memberSheetFor ? (
        <MemberActionSheet
          member={memberSheetFor}
          muted={
            !!memberMutes[memberSheetFor.id] &&
            new Date(memberMutes[memberSheetFor.id] as string) > new Date()
          }
          canRemove={isAdmin && memberSheetFor.role !== "admin"}
          onClose={() => setMemberSheetFor(null)}
          onMute={(hours) => {
            const m = memberSheetFor;
            setMemberSheetFor(null);
            void muteMember(m, hours);
          }}
          onUnmute={() => {
            const m = memberSheetFor;
            setMemberSheetFor(null);
            void unmuteMember(m);
          }}
          onRemove={() => {
            const m = memberSheetFor;
            setMemberSheetFor(null);
            void removeMember(m);
          }}
        />
      ) : null}
    </div>
  );
}

function MemberRow({
  member,
  muted,
  onOpenActions,
}: {
  member: ThreadMember;
  muted: boolean;
  onOpenActions: () => void;
}) {
  const night = useNightTheme();
  const initials = initialsOf(member.name || member.handle);
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 18px",
        borderTop: "1px solid rgba(var(--scrim-rgb),0.04)",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          background: member.avatar_url
            ? `url(${member.avatar_url}) center/cover`
            : "#FFD3C2",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#1C1C1E",
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: 15,
          border: "1px solid rgba(255,255,255,0.6)",
        }}
      >
        {!member.avatar_url ? initials : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {member.handle ? (
          <Link
            href={`/profile/${member.handle}`}
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 15,
              fontWeight: 700,
              color: "var(--charcoal)",
              textDecoration: "none",
              display: "block",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {member.name || `@${member.handle}`}
          </Link>
        ) : (
          <span
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 15,
              fontWeight: 700,
              color: "var(--charcoal)",
            }}
          >
            {member.name || "Member"}
          </span>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 1,
          }}
        >
          <span
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              color: "var(--ink-muted)",
              fontWeight: 600,
            }}
          >
            {member.handle ? `@${member.handle}` : ""}
          </span>
          {member.role === "admin" ? (
            <span
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontSize: 10,
                fontWeight: 800,
                color: "#FF5C35",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                background: "rgba(255,92,53,0.10)",
                padding: "2px 6px",
                borderRadius: 999,
              }}
            >
              Admin
            </span>
          ) : null}
          {muted ? (
            <span
              aria-label="Muted"
              title="Muted"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontFamily: "DM Sans, sans-serif",
                fontSize: 10,
                fontWeight: 800,
                color: "var(--ink-muted)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                background: "rgba(var(--scrim-rgb),0.08)",
                padding: "2px 6px",
                borderRadius: 999,
              }}
            >
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M3 5h2l3-2v6L5 7H3V5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
                <path d="M2 2l8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Muted
            </span>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenActions}
        aria-label="Member actions"
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          border: "1px solid rgba(var(--scrim-rgb),0.10)",
          // White at .78 (no --paper-78 yet): Night takes --paper-70.
          background: night ? "var(--paper-70)" : "rgba(255,255,255,0.78)",
          color: "var(--charcoal)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="3.5" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="12.5" cy="8" r="1.4" />
        </svg>
      </button>
    </li>
  );
}

function MemberActionSheet({
  member,
  muted,
  canRemove,
  onClose,
  onMute,
  onUnmute,
  onRemove,
}: {
  member: ThreadMember;
  muted: boolean;
  canRemove: boolean;
  onClose: () => void;
  onMute: (hours: number | null) => void;
  onUnmute: () => void;
  onRemove: () => void;
}) {
  const [muteSheetOpen, setMuteSheetOpen] = useState(false);
  return (
    <Drawer.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay style={vaulOverlayStyle} />
        <Drawer.Content style={vaulContentStyle} aria-describedby={undefined}>
          <Drawer.Title style={visuallyHiddenStyle}>
            Actions for {member.name || member.handle || "member"}
          </Drawer.Title>
          <Drawer.Handle style={vaulHandleStyle} />
          <div
            style={{
              padding: "10px 18px 6px",
              fontFamily: "Fraunces, serif",
              fontSize: 16,
              fontWeight: 800,
              color: "var(--charcoal)",
            }}
          >
            {member.name || (member.handle ? `@${member.handle}` : "Member")}
          </div>
          <div style={{ padding: "4px 0 14px" }}>
            {member.handle ? (
              <SheetRow
                label="View profile"
                href={`/profile/${member.handle}`}
                onClose={onClose}
              />
            ) : null}
            {muted ? (
              <SheetRow label="Unmute member" onClick={onUnmute} />
            ) : (
              <SheetRow
                label="Mute member…"
                onClick={() => setMuteSheetOpen(true)}
              />
            )}
            {canRemove ? (
              <SheetRow label="Remove from group" danger onClick={onRemove} />
            ) : null}
            <SheetRow label="Cancel" onClick={onClose} bold />
          </div>

          {muteSheetOpen ? (
            <MuteDurationSheet
              onClose={() => setMuteSheetOpen(false)}
              onPick={(h) => onMute(h)}
            />
          ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
