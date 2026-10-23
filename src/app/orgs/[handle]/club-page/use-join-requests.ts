"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { asLoadFailure, type LoadFailure } from "@/components/feedback/LoadFailed";
import { requestRefusal } from "@/components/orgs/tools/member-rules";
import type { RequestRow } from "@/components/orgs/tools/types";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

import { displayName } from "./club-tools-arc";

export type { RequestRow };

/**
 * The people waiting to join a club, and the two answers (Oct 23, 2026).
 * Lifted out of the Arc's Join requests card (ClubToolsLauncherRequests.tsx)
 * so the phone's Club tools tray can show the oldest one under "Needs you"
 * with the same calls, toasts and refusals. The list is the officer-only
 * GET /api/orgs/[slug]/requests, oldest first; an answer is
 * POST .../requests/[id]. A row leaves once it's answered, the count follows
 * (`onCount`), and `onChanged` says the page should be read again. Every
 * refusal gets the same answer as the phone's Requests screen
 * (`requestRefusal`): some drop the row, some read the list again.
 * `enabled: false` reads nothing (a tray that's shut, say).
 */

const LOAD_LINE = "Couldn't load join requests.";

export function useJoinRequests({
  handle,
  clubName,
  enabled = true,
  onCount,
  onChanged,
}: {
  handle: string;
  clubName: string;
  enabled?: boolean;
  onCount?: (n: number) => void;
  onChanged?: () => void;
}): {
  rows: RequestRow[] | null;
  failure: LoadFailure | null;
  busy: ReadonlySet<string>;
  act: (row: RequestRow, action: "approve" | "deny") => Promise<void>;
  retry: () => void;
} {
  const base = `/api/orgs/${encodeURIComponent(handle)}/requests`;
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [tick, setTick] = useState(0);
  const loaded = useRef(false);

  // The latest callbacks, so an inline arrow from the caller never re-runs
  // the count below on every render (written in an effect).
  const onCountRef = useRef(onCount);
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onCountRef.current = onCount;
    onChangedRef.current = onChanged;
  }, [onCount, onChanged]);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void (async () => {
      const r = await vibeRequest<{ requests?: RequestRow[] }>(base, { cache: "no-store", quiet: true, failure: LOAD_LINE });
      if (!live) return;
      if (r.ok && Array.isArray(r.data.requests)) {
        loaded.current = true;
        setFailure(null);
        setRows(r.data.requests);
        return;
      }
      const f = asLoadFailure(r, LOAD_LINE);
      // A re-read after an answer keeps the rows on screen and toasts.
      if (loaded.current) toast({ message: f.message, tone: "error", action: f.action });
      else setFailure(f);
    })();
    return () => {
      live = false;
    };
  }, [base, tick, enabled]);

  // The planet's and the bubble's count follow the list once it's read.
  useEffect(() => {
    if (rows) onCountRef.current?.(rows.length);
  }, [rows]);

  const drop = (id: string) => setRows((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
  const mark = (id: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const act = async (row: RequestRow, action: "approve" | "deny") => {
    if (busy.has(row.id)) return;
    mark(row.id, true);
    const r = await vibeRequest(`${base}/${encodeURIComponent(row.id)}`, {
      method: "POST",
      json: { action },
      quiet: true,
      failure: action === "approve" ? "Couldn't approve this request." : "Couldn't decline this request.",
    });
    mark(row.id, false);
    if (r.ok) {
      drop(row.id);
      onChangedRef.current?.();
      toast({
        message: action === "approve" ? `${displayName(row.name, row.handle)} joined ${clubName}.` : "Request declined.",
        tone: "info",
      });
      return;
    }
    // A Sign in or See details refusal keeps its own line and button.
    const { line, then } = requestRefusal(r.status, r.code, r.message);
    toast({ message: r.action ? r.message : line, tone: "error", action: r.action });
    if (then === "drop") {
      drop(row.id);
      onChangedRef.current?.();
    } else if (then === "reload") setTick((t) => t + 1);
  };

  const retry = useCallback(() => {
    setFailure(null);
    setTick((t) => t + 1);
  }, []);

  return { rows, failure, busy, act, retry };
}
