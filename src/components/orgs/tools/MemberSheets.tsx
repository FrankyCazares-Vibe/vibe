"use client";

/**
 * What the Members and Officers pages' sheets hold (Club tools, the club's
 * view wave 2, C10): one member's choices, their title, and the owner's
 * "Add an officer" picker. One member's sheet stays open while its body
 * moves from the choices to the title or the Remove question (one vaul
 * sheet, never one closing as the next opens). They only collect the
 * choice; MembersScreen sends it and updates the list.
 */
import { useState, type JSX } from "react";

import { busyStyle, inputStyle, primaryButtonStyle, quietStyle, textActionStyle } from "@/components/orgs/club-tool-styles";
import { CLUB_TITLE_MAX, clubFlairLabel, normalizeClubTitle } from "@/lib/profile/club-flair";

import { filterMembers, type MemberAction } from "./member-rules";
import { EmptyLine, FilterBox, PersonLine, SheetAction, ToolSheet, sheetRowStyle } from "./tools-ui";
import type { MemberRow } from "./types";

/** How a sheet names someone: their name, else @handle. */
export function whoIs(m: Pick<MemberRow, "name" | "handle">): string {
  return m.name || (m.handle ? `@${m.handle}` : "This member");
}

const ACTION_LABEL: Record<Exclude<MemberAction, "title">, string> = {
  make_officer: "Make officer",
  make_member: "Make member",
  remove: "Remove from the club",
};

/** One member's choices: their title, their role (the owner's), Remove. */
export function MemberActionRows({
  member,
  actions,
  busy,
  onPick,
  onClose,
}: {
  member: MemberRow;
  actions: MemberAction[];
  busy: boolean;
  onPick: (action: MemberAction) => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <>
      {actions.map((a) => (
        <SheetAction
          key={a}
          label={a === "title" ? (member.title ? "Edit title" : "Add a title") : ACTION_LABEL[a]}
          danger={a === "remove"}
          disabled={busy}
          onClick={() => onPick(a)}
        />
      ))}
      <SheetAction label="Cancel" bold onClick={onClose} />
    </>
  );
}

/**
 * Give someone a title, change it or take it away (the members route's
 * rules: one line, up to 32 characters, no Vibe, Admin, Moderator, Verified
 * or Official). The route also runs the word filter. `onSave(value)` resolves
 * to a line to show under the box when the route said no, or null when saved.
 */
export function TitleForm({
  member,
  clubName,
  onSave,
  onClose,
}: {
  member: MemberRow;
  clubName: string;
  onSave: (title: string | null) => Promise<string | null>;
  onClose: () => void;
}): JSX.Element {
  const current = member.title?.trim() || null;
  const [draft, setDraft] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const checked = normalizeClubTitle(draft);
  const next = checked.ok ? checked.title : null;
  const canSave = checked.ok && next !== null && next !== current && !busy;

  const save = async (value: string | null) => {
    if (busy) return;
    setBusy(true);
    setLine(null);
    const refused = await onSave(value);
    setBusy(false);
    if (refused) setLine(refused);
  };

  const hint =
    draft.trim() && !checked.ok
      ? checked.error
      : next
        ? `On their profile: ${clubFlairLabel(clubName, next)}, unless they hide it.`
        : "Like President or Rush Chair. It shows on their profile unless they hide it.";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) void save(next);
      }}
      style={{ display: "flex", flexDirection: "column", gap: 10, padding: "6px 18px 4px" }}
    >
      <input
        type="text"
        value={draft}
        // Room past the limit, so a long title gets "Keep a title to 32
        // characters" instead of being cut off mid-word.
        maxLength={CLUB_TITLE_MAX * 2}
        aria-label={`Title for ${whoIs(member)}`}
        placeholder="Title"
        enterKeyHint="done"
        onChange={(e) => setDraft(e.target.value)}
        style={inputStyle}
      />
      <p style={{ ...quietStyle, color: draft.trim() && !checked.ok ? "var(--error-ink)" : "var(--ink-muted)" }}>{hint}</p>
      {line ? (
        <p role="alert" style={{ ...quietStyle, color: "var(--error-ink)" }}>
          {line}
        </p>
      ) : null}
      <button type="submit" disabled={!canSave} className="vibe-press" style={{ ...primaryButtonStyle, ...busyStyle(!canSave) }}>
        {busy ? "Saving…" : "Save title"}
      </button>
      <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
        {current ? (
          <button type="button" disabled={busy} onClick={() => void save(null)} style={textActionStyle}>
            Remove title
          </button>
        ) : null}
        <button type="button" disabled={busy} onClick={onClose} style={textActionStyle}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** The owner's "Add an officer": every member who isn't one yet, with a filter. */
export function PickOfficerSheet({
  members,
  busyId,
  onPick,
  onClose,
}: {
  members: MemberRow[];
  busyId: string | null;
  onPick: (m: MemberRow) => void;
  onClose: () => void;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const shown = filterMembers(members, query);
  return (
    <ToolSheet title="Add an officer" note="Officers post on the Board, make events and run check-in." onClose={onClose}>
      {members.length === 0 ? (
        <EmptyLine>Nobody to pick yet. Invite members first.</EmptyLine>
      ) : (
        <>
          {members.length > 6 ? (
            <div style={{ padding: "0 18px" }}>
              <FilterBox value={query} onChange={setQuery} label="Find a member" />
            </div>
          ) : null}
          {shown.length === 0 ? <EmptyLine>No one matches that.</EmptyLine> : null}
          {shown.map((m) => (
            <button
              key={m.user_id}
              type="button"
              disabled={busyId !== null}
              onClick={() => onPick(m)}
              aria-label={`Make ${whoIs(m)} an officer`}
              style={{ ...sheetRowStyle, padding: "10px 18px", ...busyStyle(busyId === m.user_id) }}
            >
              <PersonLine name={m.name} handle={m.handle} avatarUrl={m.avatar_url} sub={m.title ?? undefined} />
            </button>
          ))}
        </>
      )}
      <SheetAction label="Cancel" bold onClick={onClose} />
    </ToolSheet>
  );
}
