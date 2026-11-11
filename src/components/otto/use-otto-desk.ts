"use client";

import { useCallback, useRef, useState } from "react";

import type { OttoFailedSection, OttoPayload } from "@/app/api/me/otto/route";
import { requestRefusal } from "@/components/orgs/tools/member-rules";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import type { DeskItem, DeskModel } from "@/lib/otto/desk";

/**
 * The computer desk's live state (Wave 2A, Nov 10, 2026): the desk model from
 * `/api/me/otto`, which club it acts as (`?club=`), and the three things a
 * person can do on it today. Each one goes through a route that already
 * exists, and the desk is read again afterwards, so every count on it stays
 * the server's (desk.ts builds "member N" for whoever is accepted next).
 *
 * - Accept a join request: POST /api/orgs/<club>/requests/<id> (approve).
 * - Mark a reminder done: POST /api/me/otto/reminders/<id>/act.
 * - A new reminder from the ask bar: the bar saves it, then `reload`.
 *
 * Nothing here sends anything on its own.
 */

/** "me" (the officer's own desk), a club handle, or null (the server's default). */
export type DeskClubParam = string | null;

const COPY = Object.freeze({
  loadFailed: "Couldn't load your desk.",
  acceptFailed: "Couldn't accept that request.",
  accepted: "Accepted. They're a member now.",
  doneFailed: "Couldn't mark that reminder done.",
});

function payloadUrl(club: DeskClubParam): string {
  return club ? `/api/me/otto?club=${encodeURIComponent(club)}` : "/api/me/otto";
}

/** ready[0] alone carries the coral `primary`, as buildDesk does, after a row leaves. */
function withPrimary(ready: DeskItem[]): DeskItem[] {
  return ready.map((item, i) => {
    const { primary: _drop, ...rest } = item;
    void _drop;
    return i === 0 && rest.verb ? { ...rest, primary: true as const } : rest;
  });
}

function withoutItem(desk: DeskModel, id: string): DeskModel {
  const drop = (list: DeskItem[]) => list.filter((i) => i.id !== id);
  return { ...desk, ready: withPrimary(drop(desk.ready)), scheduled: drop(desk.scheduled) };
}

export function useOttoDesk(initial: OttoPayload, initialClub: DeskClubParam) {
  const [desk, setDesk] = useState<DeskModel | null>(initial.desk ?? null);
  // The route's reads that failed: a pile they feed says so, not "nothing here".
  const [failed, setFailed] = useState<OttoFailedSection[]>(initial.failed ?? []);
  const [club, setClub] = useState<DeskClubParam>(initialClub);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Only the newest read may land: a slow answer for the club you left must
  // not paint over the club you picked.
  const seq = useRef(0);

  const load = useCallback(async (next: DeskClubParam): Promise<boolean> => {
    const n = ++seq.current;
    setLoading(true);
    const r = await vibeRequest<OttoPayload>(payloadUrl(next), { failure: COPY.loadFailed });
    if (n !== seq.current) return false;
    setLoading(false);
    if (!r.ok) return false;
    setFailed(r.data.failed ?? []);
    if (!r.data.desk) {
      toast({ message: COPY.loadFailed, tone: "error" });
      return false;
    }
    setDesk(r.data.desk);
    setClub(next);
    return true;
  }, []);

  const reload = useCallback(() => load(club), [load, club]);

  /** Act as a club (its handle) or as yourself ("me"); the URL keeps the pick. */
  const pickClub = useCallback(
    async (next: string) => {
      const ok = await load(next);
      if (!ok) return;
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("club", next);
        window.history.replaceState(window.history.state, "", url.toString());
      } catch {
        /* no window: nothing to keep */
      }
    },
    [load],
  );

  const accept = useCallback(
    async (item: DeskItem) => {
      const verb = item.verb;
      if (verb?.kind !== "join_request" || busyId) return;
      setBusyId(item.id);
      const r = await vibeRequest(
        `/api/orgs/${encodeURIComponent(verb.orgSlug)}/requests/${encodeURIComponent(verb.requestId)}`,
        { method: "POST", json: { action: "approve" }, quiet: true, failure: COPY.acceptFailed },
      );
      setBusyId(null);
      if (r.ok) {
        setDesk((d) => (d ? withoutItem(d, item.id) : d));
        toast({ message: COPY.accepted, tone: "info" });
        void load(club);
        return;
      }
      // Club tools' words for each refusal; anything the club or the student
      // changed under the card reads the desk again (review L2).
      const { line, then } = requestRefusal(r.status, r.code, r.message);
      toast({ message: r.action ? r.message : line, tone: "error", action: r.action });
      if (then === "drop") setDesk((d) => (d ? withoutItem(d, item.id) : d));
      if (then !== "keep") void load(club);
    },
    [busyId, load, club],
  );

  /** A reminder's id on the desk is `reminder:<id>`. */
  const reminderDone = useCallback(
    async (item: DeskItem) => {
      const id = item.id.startsWith("reminder:") ? item.id.slice("reminder:".length) : null;
      if (!id || busyId) return;
      setBusyId(item.id);
      const r = await vibeRequest(`/api/me/otto/reminders/${encodeURIComponent(id)}/act`, {
        method: "POST",
        failure: COPY.doneFailed,
      });
      setBusyId(null);
      if (r.ok) {
        setDesk((d) => (d ? withoutItem(d, item.id) : d));
        void load(club);
      }
    },
    [busyId, load, club],
  );

  /** After the ask bar saves: an officer's club desk holds the club's things, not their reminders. */
  const reminderSaved = useCallback(() => {
    if (desk?.actingAs) {
      toast({ message: "Reminder saved. It's on your own desk, under You.", tone: "info" });
      return;
    }
    void load(club);
  }, [desk, load, club]);

  return { desk, failed, club, loading, busyId, load, reload, pickClub, accept, reminderDone, reminderSaved };
}
