"use client";

/**
 * Club tools › Members, and › Officers and titles (the club's view, wave 2,
 * C10). One list from the officer-only roster (GET /api/orgs/[slug]/members):
 * the Members page shows everyone with a filter box; the Officers page the
 * owner and officers, with the owner's "Add an officer". A row tap opens
 * that person's choices (member-rules.ts says which, from the route's own
 * rules); each change updates the row in place, no reload.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { LoadFailed, asLoadFailure, type LoadFailure } from "@/components/feedback/LoadFailed";
import { primaryButtonStyle, quietStyle } from "@/components/orgs/club-tool-styles";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import { memberCountText } from "@/lib/orgs/join-copy";
import { TITLE_ERRORS, type TitleRefusal } from "@/lib/profile/club-flair";

import { MemberActionRows, PickOfficerSheet, TitleForm, whoIs } from "./MemberSheets";
import { filterMembers, memberActions, memberRefusal, withMember, type MemberAction } from "./member-rules";
import { ConfirmRows, EmptyLine, FilterBox, ListSkeleton, ToolSheet } from "./tools-ui";
import { MemberList } from "./MemberList";
import type { MemberRow, ToolsClub } from "./types";

const LOAD_LINE = "Couldn't load members.";

type Sheet =
  | { kind: "actions"; m: MemberRow }
  | { kind: "title"; m: MemberRow }
  | { kind: "remove"; m: MemberRow }
  | { kind: "pick" };

export function MembersScreen({ club, mode }: { club: ToolsClub; mode: "members" | "officers" }) {
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loadedRef = useRef(false);
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const viewer = { role: club.role, selfId: club.viewerId };
  const base = `/api/orgs/${encodeURIComponent(club.handle)}/members`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await vibeRequest<{ members?: MemberRow[] }>(base, { cache: "no-store", quiet: true, failure: LOAD_LINE });
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.members)) {
        loadedRef.current = true;
        setLoadErr(null);
        setRows(r.data.members);
        return;
      }
      const failure = asLoadFailure(r, LOAD_LINE);
      // A re-read after a refused change keeps the rows on screen and toasts.
      if (loadedRef.current) toast({ message: failure.message, tone: "error", action: failure.action });
      else setLoadErr(failure);
    })();
    return () => {
      cancelled = true;
    };
  }, [base, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  /** A refused change: its line, then the row goes, the list is read again, or nothing. */
  const refused = (m: MemberRow, r: { status: number; message: string; action?: { label: string; href: string } }) => {
    const { line, then } = memberRefusal(r.status, r.message);
    toast({ message: r.action ? r.message : line, tone: "error", action: r.action });
    if (then === "drop") setRows((prev) => (prev ? prev.filter((x) => x.user_id !== m.user_id) : prev));
    else if (then === "reload") reload();
    return line;
  };

  const setRole = async (m: MemberRow, role: "admin" | "member") => {
    if (busyId) return;
    setBusyId(m.user_id);
    const r = await vibeRequest(`${base}/${encodeURIComponent(m.user_id)}`, {
      method: "PATCH",
      json: { role },
      quiet: true,
      failure: role === "admin" ? "Couldn't make them an officer." : "Couldn't change their role.",
    });
    setBusyId(null);
    setSheet(null);
    if (!r.ok) return void refused(m, r);
    setRows((prev) => (prev ? withMember(prev, m.user_id, { role }) : prev));
    toast({ message: role === "admin" ? `${whoIs(m)} is now an officer.` : `${whoIs(m)} is a member again.`, tone: "info" });
  };

  const remove = async (m: MemberRow) => {
    if (busyId) return;
    setBusyId(m.user_id);
    const r = await vibeRequest(`${base}/${encodeURIComponent(m.user_id)}`, {
      method: "DELETE",
      quiet: true,
      failure: "Couldn't remove them.",
    });
    setBusyId(null);
    setSheet(null);
    if (!r.ok) return void refused(m, r);
    setRows((prev) => (prev ? prev.filter((x) => x.user_id !== m.user_id) : prev));
    toast({ message: `${whoIs(m)} was removed from ${club.name}.`, tone: "info" });
  };

  /** The title sheet's save: null when saved, else the line to show under the box. */
  const saveTitle = async (m: MemberRow, title: string | null): Promise<string | null> => {
    const r = await vibeRequest<{ title?: unknown }>(`${base}/${encodeURIComponent(m.user_id)}`, {
      method: "PATCH",
      json: { title },
      quiet: true,
      failure: "Couldn't save the title.",
    });
    if (!r.ok) {
      const code = r.code as TitleRefusal | null;
      if (code && code in TITLE_ERRORS) return TITLE_ERRORS[code];
      if (r.status === 422) return r.message;
      // Gone, or their role moved: the sheet closes and the list says so.
      setSheet(null);
      refused(m, r);
      return null;
    }
    const saved = typeof r.data.title === "string" && r.data.title.trim() ? r.data.title.trim() : null;
    setRows((prev) => (prev ? withMember(prev, m.user_id, { title: saved }) : prev));
    setSheet(null);
    toast({ message: saved ? `${whoIs(m)}'s title is now ${saved}.` : `${whoIs(m)}'s title was removed.`, tone: "info" });
    return null;
  };

  const pick = (m: MemberRow, action: MemberAction) => {
    if (action === "title") setSheet({ kind: "title", m });
    else if (action === "remove") setSheet({ kind: "remove", m });
    else void setRole(m, action === "make_officer" ? "admin" : "member");
  };

  if (rows === null) {
    if (loadErr) {
      return (
        <LoadFailed
          failure={loadErr}
          onRetry={() => {
            setLoadErr(null);
            reload();
          }}
        />
      );
    }
    return <ListSkeleton rows={mode === "officers" ? 3 : 5} />;
  }

  const officers = mode === "officers";
  const inScope = officers ? rows.filter((m) => m.role === "owner" || m.role === "admin") : rows;
  const shown = officers ? inScope : filterMembers(inScope, query);
  const candidates = rows.filter((m) => m.role === "member");

  return (
    <>
      {officers ? (
        <p style={{ ...quietStyle, margin: "0 2px 14px", fontSize: 13 }}>
          Titles like President show on their profile, unless they hide them.
          {club.role === "owner" ? " Only you add or remove officers." : " Only the owner adds or removes officers."}
        </p>
      ) : (
        <>
          <FilterBox value={query} onChange={setQuery} label="Find a member" />
          <p style={{ ...quietStyle, margin: "0 2px 10px" }}>{memberCountText(rows.length)}</p>
        </>
      )}

      {shown.length === 0 ? (
        <EmptyLine>{query.trim() ? "No one matches that." : "No members yet."}</EmptyLine>
      ) : (
        <MemberList
          rows={shown}
          selfId={club.viewerId}
          actionsFor={(m) => memberActions(viewer, m)}
          busyId={busyId}
          onOpen={(m) => setSheet({ kind: "actions", m })}
        />
      )}

      {officers && club.role === "owner" ? (
        <button type="button" className="vibe-press" onClick={() => setSheet({ kind: "pick" })} style={{ ...primaryButtonStyle, marginTop: 18 }}>
          Add an officer
        </button>
      ) : null}

      {sheet && sheet.kind !== "pick" ? (
        // One sheet per member: its body moves from the choices to the title
        // or the Remove question, so one vaul sheet never closes as the next opens.
        <ToolSheet title={sheetTitle(sheet)} note={sheetNote(sheet, club.name)} onClose={() => setSheet(null)}>
          {sheet.kind === "actions" ? (
            <MemberActionRows
              member={sheet.m}
              actions={memberActions(viewer, sheet.m)}
              busy={busyId !== null}
              onPick={(a) => pick(sheet.m, a)}
              onClose={() => setSheet(null)}
            />
          ) : sheet.kind === "title" ? (
            <TitleForm member={sheet.m} clubName={club.name} onSave={(t) => saveTitle(sheet.m, t)} onClose={() => setSheet(null)} />
          ) : (
            <ConfirmRows
              confirmLabel="Remove from the club"
              busy={busyId !== null}
              onConfirm={() => void remove(sheet.m)}
              onClose={() => setSheet(null)}
            />
          )}
        </ToolSheet>
      ) : null}
      {sheet?.kind === "pick" ? (
        <PickOfficerSheet members={candidates} busyId={busyId} onPick={(m) => void setRole(m, "admin")} onClose={() => setSheet(null)} />
      ) : null}
    </>
  );
}

type MemberSheet = Exclude<Sheet, { kind: "pick" }>;

function sheetTitle(sheet: MemberSheet): string {
  if (sheet.kind === "remove") return `Remove ${whoIs(sheet.m)}?`;
  if (sheet.kind === "title") return sheet.m.title ? `${whoIs(sheet.m)}'s title` : `A title for ${whoIs(sheet.m)}`;
  return whoIs(sheet.m);
}

function sheetNote(sheet: MemberSheet, clubName: string): string | undefined {
  if (sheet.kind === "remove") {
    return `They leave ${clubName}'s chats and its upcoming events. To come back, they'll have to ask.`;
  }
  return sheet.kind === "actions" ? (sheet.m.title ?? undefined) : undefined;
}
