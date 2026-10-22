"use client";

/**
 * Club tools › Club settings (the club's view, wave 2, C10): may followers
 * read the Board (the desktop's Settings › Followers switch, the same
 * setting and helpers as the Rooms dialog, `rooms-dialog-rules.ts`), then
 * leaving (an officer) or deleting the club (the owner, after typing its
 * handle, as the desktop's Danger tab asks). Leaving lands on the club
 * page; deleting on Campus › Orgs.
 *
 * In the club page's tools panel on a computer (ClubToolsPanel.tsx; Oct 22,
 * 2026) the host passes `onLeft` / `onDeleted`, so it can close the panel
 * first and then read the page again or go; without them, the page goes
 * where it always has.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { LoadFailed, asLoadFailure, type LoadFailure } from "@/components/feedback/LoadFailed";
import {
  BOARD_FOLLOWERS_HIDDEN_LINE,
  BOARD_FOLLOWERS_LABEL,
  BOARD_SETTING_LOAD_LINE,
  BOARD_SETTING_SAVE_LINE,
  boardFollowersHelp,
  boardSettingBody,
  boardSettingOf,
  boardSettingSavedLine,
  clubUrl,
  savedBoardSetting,
} from "@/components/desktop/messages/rooms-dialog-rules";
import { busyStyle, inputStyle, lineStyle, pillStyle, quietStyle } from "@/components/orgs/club-tool-styles";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import { clearClubsYouRunCache, readSwitchedClub, sameHandle, setSwitchedClub } from "@/lib/orgs/club-switch";
import { clearClubsInCache } from "@/lib/orgs/clubs-in";
import { ORG_COPY, fillCopy, leaveToastText, orgErrorCopy } from "@/lib/orgs/join-copy";

import { LeaveWarning, useLeavePreview } from "../LeaveWarning";
import { ConfirmRows, Group, SheetAction, ToolSheet, cardStyle } from "./tools-ui";
import type { ToolsClub } from "./types";

export function SettingsScreen({
  club,
  onLeft,
  onDeleted,
}: {
  club: ToolsClub;
  /** After leaving (the toast is said): instead of going to the club page. */
  onLeft?: () => void;
  /** After deleting (the toast is said): instead of going to Campus › Orgs. */
  onDeleted?: () => void;
}) {
  return (
    <>
      <BoardSetting club={club} />
      {club.role === "owner" ? <DeleteClub club={club} onDeleted={onDeleted} /> : <LeaveClub club={club} onLeft={onLeft} />}
    </>
  );
}

/** The Board switch: read from the club, saved at once; a refusal toasts and leaves it as it was. */
function BoardSetting({ club }: { club: ToolsClub }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [seq, setSeq] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void vibeRequest<unknown>(clubUrl(club.handle), { cache: "no-store", quiet: true, failure: BOARD_SETTING_LOAD_LINE }).then((r) => {
      if (cancelled) return;
      setOn(r.ok ? boardSettingOf(r.data) : null);
      setFailure(r.ok ? null : asLoadFailure(r, BOARD_SETTING_LOAD_LINE));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [club.handle, seq]);

  const flip = async () => {
    if (on === null || savingRef.current) return;
    const next = !on;
    savingRef.current = true;
    setSaving(true);
    const r = await vibeRequest<unknown>(clubUrl(club.handle), {
      method: "PATCH",
      json: boardSettingBody(next),
      failure: BOARD_SETTING_SAVE_LINE,
    });
    savingRef.current = false;
    setSaving(false);
    if (!r.ok) return;
    const saved = savedBoardSetting(r.data, next);
    setOn(saved);
    toast({ message: boardSettingSavedLine(saved), tone: "info" });
  };

  if (failure) {
    return (
      <div style={{ marginBottom: 18 }}>
        <LoadFailed
          compact
          failure={failure}
          onRetry={() => {
            setFailure(null);
            setSeq((n) => n + 1);
          }}
        />
      </div>
    );
  }
  // Loading, or a server without the setting: no switch rather than a wrong one.
  if (!loaded) return <div aria-hidden style={{ ...cardStyle, height: 96, marginBottom: 18, opacity: 0.6 }} />;
  if (on === null) return null;

  return (
    <Group label="The Board">
      <li style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 44 }}>
          <span id="board-followers-label" style={{ ...lineStyle, flex: 1, color: "var(--charcoal)", fontWeight: 600, fontSize: 15 }}>
            {BOARD_FOLLOWERS_LABEL}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby="board-followers-label"
            disabled={saving}
            onClick={() => void flip()}
            style={{ ...switchStyle(on), ...busyStyle(saving) }}
          >
            <span aria-hidden style={knobStyle(on)} />
          </button>
        </div>
        <p style={{ ...quietStyle, marginTop: 4 }}>{boardFollowersHelp(on)}</p>
        {club.hidden ? <p style={{ ...quietStyle, marginTop: 6 }}>{BOARD_FOLLOWERS_HIDDEN_LINE}</p> : null}
      </li>
    </Group>
  );
}

/** 52×32 track, 44px tall with its margin; on is coral (this screen's one coral thing), off a grey. */
function switchStyle(on: boolean): CSSProperties {
  return {
    position: "relative",
    flexShrink: 0,
    width: 52,
    height: 32,
    margin: "6px 0",
    padding: 0,
    borderRadius: 999,
    border: "none",
    background: on ? "var(--coral)" : "rgba(var(--scrim-rgb),0.18)",
    cursor: "pointer",
    transition: "background 160ms ease",
  };
}

function knobStyle(on: boolean): CSSProperties {
  return {
    position: "absolute",
    top: 3,
    left: on ? 23 : 3,
    width: 26,
    height: 26,
    borderRadius: 999,
    background: "var(--paper)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
    transition: "left 160ms ease",
  };
}

/**
 * An officer's way out. They keep following (the members' feed stays theirs);
 * the owner can't leave. The confirm warns about the club's Members only
 * events they're going to, which leaving takes them off (Oct 22, 2026), and
 * the toast says how many came off.
 */
function LeaveClub({ club, onLeft }: { club: ToolsClub; onLeft?: () => void }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const vars = { org: club.name };

  const leave = async () => {
    if (busy) return;
    setBusy(true);
    const r = await vibeRequest<{ org_follow_state?: unknown; rsvps_dropped?: unknown }>(`/api/orgs/${encodeURIComponent(club.handle)}/join`, {
      method: "DELETE",
      // A hidden club has nothing to keep following (the desktop sends no body either).
      ...(club.hidden ? {} : { json: { keep_following: true } }),
      quiet: true,
      failure: fillCopy(ORG_COPY.menu.leaveFailed, vars),
    });
    setBusy(false);
    if (!r.ok) {
      setAsking(false);
      toast({ message: r.action ? r.message : (orgErrorCopy(r.code) ?? r.message), tone: "error", action: r.action });
      return;
    }
    // No longer an officer: the Profile tab goes back to you, and the menus ask again.
    if (sameHandle(readSwitchedClub()?.handle, club.handle)) setSwitchedClub(null);
    clearClubsYouRunCache();
    clearClubsInCache();
    toast({ message: leaveToastText(club.name, r.data), tone: "info" });
    if (onLeft) onLeft();
    else router.replace(`/orgs/${encodeURIComponent(club.handle)}`);
  };

  return (
    <>
      <Group label="Leaving">
        <DangerRow
          title={ORG_COPY.menu.leaveIntroTitle}
          body={club.hidden ? ORG_COPY.menu.leaveBody : `${ORG_COPY.menu.leaveBody} You'll keep following it.`}
          action={ORG_COPY.menu.leave}
          onClick={() => setAsking(true)}
        />
      </Group>
      {asking ? (
        <LeaveConfirm club={club} busy={busy} onConfirm={() => void leave()} onClose={() => setAsking(false)} />
      ) : null}
    </>
  );
}

/**
 * "Leave SAE?": ConfirmSheet's sheet with the members-only warning between
 * the note and the two rows. Its own component so the preview is read when
 * the sheet opens, not when Club settings does.
 */
function LeaveConfirm({ club, busy, onConfirm, onClose }: { club: ToolsClub; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  const membersOnly = useLeavePreview(club.handle);
  return (
    <ToolSheet title={fillCopy(ORG_COPY.menu.leaveTitle, { org: club.name })} note={ORG_COPY.menu.leaveBody} onClose={onClose}>
      <LeaveWarning events={membersOnly} style={{ margin: "4px 18px 10px" }} />
      <ConfirmRows confirmLabel={ORG_COPY.menu.leaveConfirm} busy={busy} onConfirm={onConfirm} onClose={onClose} />
    </ToolSheet>
  );
}

/** The owner's delete: the club, its chats, posts and events, after typing its handle. A hidden club can't be. */
function DeleteClub({ club, onDeleted }: { club: ToolsClub; onDeleted?: () => void }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = typed.trim().replace(/^@/, "").toLowerCase() === club.handle.toLowerCase();

  const destroy = async () => {
    if (busy || !matches) return;
    setBusy(true);
    const r = await vibeRequest(`/api/orgs/${encodeURIComponent(club.handle)}`, {
      method: "DELETE",
      failure: "Couldn't delete the club.",
    });
    setBusy(false);
    if (!r.ok) return;
    // The phone's Profile tab and the desktop menu forget the club at once
    // (review F2), or they'd open a page that no longer exists.
    if (sameHandle(readSwitchedClub()?.handle, club.handle)) setSwitchedClub(null);
    clearClubsYouRunCache();
    clearClubsInCache();
    toast({ message: `${club.name} was deleted.`, tone: "info" });
    if (onDeleted) onDeleted();
    else router.replace("/campus?tab=orgs");
  };

  return (
    <>
      <Group label="Owner">
        <li style={{ padding: "12px 14px" }}>
          <p style={{ ...lineStyle, color: "var(--charcoal)", fontWeight: 600, fontSize: 15 }}>Leaving</p>
          <p style={{ ...quietStyle, marginTop: 2 }}>Owners can&rsquo;t leave. Handing the club to an officer is coming soon.</p>
        </li>
        {club.hidden ? (
          <li style={{ padding: "12px 14px", borderTop: "1px solid var(--hairline)" }}>
            <p style={{ ...lineStyle, color: "var(--charcoal)", fontWeight: 600, fontSize: 15 }}>Delete the club</p>
            <p style={{ ...quietStyle, marginTop: 2 }}>This club is hidden, so it can&rsquo;t be deleted right now.</p>
          </li>
        ) : (
          <DangerRow
            title="Delete the club"
            body="Removes the club with all its chats, messages, members, posts and events. This can't be undone."
            action="Delete club"
            onClick={() => {
              setTyped("");
              setAsking(true);
            }}
          />
        )}
      </Group>
      {asking ? (
        <ToolSheet
          title={`Delete ${club.name}?`}
          note={`Everything goes: its chats, posts and events. Type its handle, ${club.handle}, to delete it.`}
          onClose={() => setAsking(false)}
        >
          <div style={{ padding: "4px 18px 10px" }}>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label={`Type ${club.handle} to delete the club`}
              placeholder={club.handle}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              style={inputStyle}
            />
          </div>
          <SheetAction label={busy ? "Deleting…" : "Delete forever"} danger disabled={!matches || busy} onClick={() => void destroy()} />
          <SheetAction label="Cancel" bold disabled={busy} onClick={() => setAsking(false)} />
        </ToolSheet>
      ) : null}
    </>
  );
}

/** A row of the danger groups: what it does, and its red-worded pill. */
function DangerRow({ title, body, action, onClick }: { title: string; body: string; action: string; onClick: () => void }) {
  return (
    <li style={{ padding: "12px 14px", borderTop: "1px solid var(--hairline)", marginTop: -1 }}>
      <p style={{ ...lineStyle, color: "var(--charcoal)", fontWeight: 600, fontSize: 15 }}>{title}</p>
      <p style={{ ...quietStyle, marginTop: 2 }}>{body}</p>
      <button type="button" className="vibe-press" onClick={onClick} style={{ ...pillStyle, marginTop: 10, color: "var(--error-ink)", borderColor: "var(--error-ink)" }}>
        {action}
      </button>
    </li>
  );
}
