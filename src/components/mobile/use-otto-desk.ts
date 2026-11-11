"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { OttoFailedSection, OttoPayload } from "@/app/api/me/otto/route";
import { requestRefusal } from "@/components/orgs/tools/member-rules";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import { readSwitchedClub, sameHandle } from "@/lib/orgs/club-switch";
import type { DeskItem, DeskModel } from "@/lib/otto/desk";

import type { SavedReminder } from "./ReminderBar";

/**
 * The phone desk's state (Nov 10, 2026, the Otto build's Wave 2A): the model
 * from /api/me/otto, which club it acts as, and the three things the desk
 * can do today (Accept a join request through the existing approve route,
 * mark a reminder done, save a reminder). After each one the desk is read
 * again, so its counts, its one coral button and Otto's line stay true.
 *
 * ACTING AS. `?club=<handle>` (or "me", an officer's own desk). The desk
 * remembers its own pick on this phone (DESK_AS_KEY); with none it follows
 * the phone's club switch (club-switch.ts), else the server's first club.
 * Picking here never changes the Profile tab.
 */

export const DESK_AS_KEY = "vibe.otto-desk-as.v1";

function readDeskAs(): string | null {
  try {
    return window.localStorage.getItem(DESK_AS_KEY);
  } catch {
    return null;
  }
}

function writeDeskAs(v: string): void {
  try {
    window.localStorage.setItem(DESK_AS_KEY, v);
  } catch {
    /* blocked storage: the pick lasts for this visit */
  }
}

/** The `?club=` for a desk: its club's handle, "me" for an officer's own desk, null for a student. */
export function deskClubParam(desk: DeskModel | null): string | null {
  if (!desk) return null;
  if (desk.actingAs) return desk.actingAs.handle;
  return desk.clubs.length > 0 ? "me" : null;
}

/** ready[0] alone carries the coral `primary`, as buildDesk does, after a row leaves. */
function withPrimary(ready: DeskItem[]): DeskItem[] {
  return ready.map((item, i) => {
    const { primary: _drop, ...rest } = item;
    void _drop;
    return i === 0 && rest.verb ? { ...rest, primary: true as const } : rest;
  });
}

function without(desk: DeskModel | null, id: string): DeskModel | null {
  if (!desk) return desk;
  return {
    ...desk,
    ready: withPrimary(desk.ready.filter((i) => i.id !== id)),
    scheduled: desk.scheduled.filter((i) => i.id !== id),
  };
}

export function useOttoDesk(initial: OttoPayload) {
  const [desk, setDesk] = useState<DeskModel | null>(initial.desk ?? null);
  const [failed, setFailed] = useState<OttoFailedSection[]>(initial.failed ?? []);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const seq = useRef(0);
  const want = useRef<string | null>(deskClubParam(initial.desk ?? null));

  /** Reads the desk for `club`; `quiet` keeps a failed background read from toasting. */
  const load = useCallback(async (club: string | null, quiet: boolean): Promise<boolean> => {
    const my = ++seq.current;
    setLoading(true);
    const url = club ? `/api/me/otto?club=${encodeURIComponent(club)}` : "/api/me/otto";
    const r = await vibeRequest<OttoPayload>(url, { method: "GET", cache: "no-store", quiet, failure: "Couldn't load your desk." });
    if (my !== seq.current) return false;
    setLoading(false);
    if (!r.ok) return false;
    setFailed(r.data.failed ?? []);
    if (!r.data.desk) {
      if (!quiet) toast({ message: "Couldn't load your desk.", tone: "error" });
      return false;
    }
    setDesk(r.data.desk);
    want.current = deskClubParam(r.data.desk);
    return true;
  }, []);

  const refresh = useCallback(() => load(want.current, true), [load]);
  const retry = useCallback(() => load(want.current, false), [load]);

  /** Act as `handle`, or as you with null. */
  const actAs = useCallback(
    (handle: string | null) => {
      const v = handle ?? "me";
      writeDeskAs(v);
      want.current = v;
      void load(v, false);
    },
    [load],
  );

  // Once, after the first paint: this phone's own pick, else its club switch.
  useEffect(() => {
    const first = initial.desk;
    if (!first || first.clubs.length === 0) return;
    // A link that names the club (`?club=`) wins: the server already drew it.
    try {
      if (new URLSearchParams(window.location.search).get("club")) return;
    } catch {
      /* no location: fall through to the stored pick */
    }
    const known = (h: string | null | undefined) => !!h && first.clubs.some((c) => sameHandle(c.handle, h));
    const stored = readDeskAs();
    const target =
      stored === "me" || known(stored) ? stored : known(readSwitchedClub()?.handle) ? readSwitchedClub()!.handle : null;
    const now = deskClubParam(first);
    if (!target || target === now || (target !== "me" && sameHandle(target, now))) return;
    want.current = target;
    // A tick later, so the read starts outside the effect's own render pass.
    const t = window.setTimeout(() => void load(target, true), 0);
    return () => window.clearTimeout(t);
  }, [initial.desk, load]);

  const accept = useCallback(
    async (item: DeskItem) => {
      const v = item.verb;
      if (!v || v.kind !== "join_request" || busyId) return;
      setBusyId(item.id);
      const url = `/api/orgs/${encodeURIComponent(v.orgSlug)}/requests/${encodeURIComponent(v.requestId)}`;
      const r = await vibeRequest(url, {
        method: "POST",
        json: { action: "approve" },
        quiet: true,
        failure: "Couldn't accept this request.",
      });
      setBusyId(null);
      if (r.ok) {
        setDesk((d) => without(d, item.id));
        const club = desk?.actingAs?.name;
        toast({ message: club ? `Accepted. They're a member of ${club} now.` : "Accepted.", tone: "info" });
        void refresh();
        return;
      }
      const { line, then } = requestRefusal(r.status, r.code, r.message);
      toast({ message: r.action ? r.message : line, tone: "error", action: r.action });
      if (then === "drop") setDesk((d) => without(d, item.id));
      if (then !== "keep") void refresh();
    },
    [busyId, desk, refresh],
  );

  const reminderDone = useCallback(
    async (item: DeskItem) => {
      if (busyId) return;
      const id = item.id.replace(/^reminder:/, "");
      setBusyId(item.id);
      const before = desk;
      setDesk((d) => without(d, item.id));
      const r = await vibeRequest(`/api/me/otto/reminders/${encodeURIComponent(id)}/act`, {
        method: "POST",
        failure: "Couldn't mark that reminder done.",
      });
      setBusyId(null);
      if (!r.ok && before) setDesk(before);
      void refresh();
    },
    [busyId, desk, refresh],
  );

  const reminderSaved = useCallback(
    (saved: SavedReminder) => {
      // An officer's club desk holds the club's things; reminders are their own.
      if (desk?.actingAs) {
        toast({ message: "Reminder saved. It's on your own desk, under You.", tone: "info" });
        return;
      }
      toast({ message: saved.remind_at ? "Reminder saved to Scheduled." : "Reminder saved to Ready for you.", tone: "info" });
      void refresh();
    },
    [desk, refresh],
  );

  return { desk, failed, loading, busyId, actAs, retry, accept, reminderDone, reminderSaved };
}
