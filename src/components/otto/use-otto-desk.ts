"use client";

import { useCallback, useRef, useState } from "react";

import type { OttoFailedSection, OttoPayload } from "@/app/api/me/otto/route";
import { DESK_AS_KEY } from "@/components/mobile/use-otto-desk";
import { requestRefusal } from "@/components/orgs/tools/member-rules";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import { deskFx } from "@/lib/motion/feedback";
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

/**
 * Told when the desk's pick on this device changes (detail: the new `?club=`),
 * so a side panel open beside the desk follows it (OttoSidePanel.tsx).
 */
export const DESK_AS_EVENT = "vibe:otto-desk-as";

/**
 * Remembers the pick on this device, under the phone desk's key (DESK_AS_KEY),
 * so the side panel (React and _otto.js) acts as the same club (walk fix,
 * Nov 11). Blocked storage: the pick lasts for this visit.
 */
function writeDeskAs(v: string): void {
  try {
    window.localStorage.setItem(DESK_AS_KEY, v);
  } catch {
    /* blocked storage */
  }
  try {
    window.dispatchEvent(new CustomEvent<string>(DESK_AS_EVENT, { detail: v }));
  } catch {
    /* no window */
  }
}

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

/** `initial`: only its desk and failed reads are used (the side panel starts with neither, Wave 2B). */
export function useOttoDesk(initial: Pick<OttoPayload, "desk" | "failed">, initialClub: DeskClubParam) {
  const [desk, setDesk] = useState<DeskModel | null>(initial.desk ?? null);
  // The route's reads that failed: a pile they feed says so, not "nothing here".
  const [failed, setFailed] = useState<OttoFailedSection[]>(initial.failed ?? []);
  const [club, setClub] = useState<DeskClubParam>(initialClub);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Only the newest read may land: a slow answer for the club you left must
  // not paint over the club you picked.
  const seq = useRef(0);

  /** `quiet`: no toast on a failure (the side panel shows its own failure card, Wave 2B). */
  const load = useCallback(async (next: DeskClubParam, opts?: { quiet?: boolean }): Promise<boolean> => {
    const n = ++seq.current;
    setLoading(true);
    const quiet = opts?.quiet === true;
    const r = await vibeRequest<OttoPayload>(payloadUrl(next), { failure: COPY.loadFailed, quiet });
    if (n !== seq.current) return false;
    setLoading(false);
    if (!r.ok) return false;
    setFailed(r.data.failed ?? []);
    if (!r.data.desk) {
      if (!quiet) toast({ message: COPY.loadFailed, tone: "error" });
      return false;
    }
    setDesk(r.data.desk);
    setClub(next);
    return true;
  }, []);

  const reload = useCallback(() => load(club), [load, club]);

  /**
   * Act as a club (its handle) or as yourself ("me"); the URL keeps the pick,
   * and so does this device (DESK_AS_KEY), as on the phone: only once the
   * switched desk has loaded, so a failed read keeps the old pick.
   */
  const pickClub = useCallback(
    async (next: string) => {
      const ok = await load(next);
      if (!ok) return;
      writeDeskAs(next);
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

  // Cards whose stamp is landing (motion 1 repair): the server has said yes,
  // so the others' buttons are free again at once, while this one's own
  // clicks are ignored until it has left (its row takes no pointer while the
  // stamp lands, motion.css).
  const leaving = useRef(new Set<string>());

  const accept = useCallback(
    async (item: DeskItem) => {
      const verb = item.verb;
      if (verb?.kind !== "join_request" || busyId || leaving.current.has(item.id)) return;
      setBusyId(item.id);
      // Found now, in the click: the card the stamp lands on (motion 1).
      const fx = deskFx(item.id);
      const r = await vibeRequest(
        `/api/orgs/${encodeURIComponent(verb.orgSlug)}/requests/${encodeURIComponent(verb.requestId)}`,
        { method: "POST", json: { action: "approve" }, quiet: true, failure: COPY.acceptFailed },
      );
      if (r.ok) {
        toast({ message: COPY.accepted, tone: "info" });
        leaving.current.add(item.id);
        setBusyId(null);
        // The stamp lands and the card leaves (instant under reduced motion).
        await fx.done();
        leaving.current.delete(item.id);
        setDesk((d) => (d ? withoutItem(d, item.id) : d));
        void load(club);
        return;
      }
      setBusyId(null);
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
      if (!id || busyId || leaving.current.has(item.id)) return;
      setBusyId(item.id);
      const fx = deskFx(item.id);
      const r = await vibeRequest(`/api/me/otto/reminders/${encodeURIComponent(id)}/act`, {
        method: "POST",
        failure: COPY.doneFailed,
      });
      setBusyId(null);
      if (r.ok) {
        leaving.current.add(item.id);
        await fx.done();
        leaving.current.delete(item.id);
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
