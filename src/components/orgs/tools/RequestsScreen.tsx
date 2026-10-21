"use client";

/**
 * Club tools › Join requests (the club's view, wave 2, C10): everyone
 * waiting to get in, oldest first, from the officer-only route
 * (GET /api/orgs/[slug]/requests). Each: photo, name, @handle, their note,
 * "Removed before", and why they can't be let in when they can't. Approve
 * is an outline pill with coral words (a coral button per row would be
 * too many), Deny a quiet pill. A row leaves the list once it's answered.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { LoadFailed, asLoadFailure, type LoadFailure } from "@/components/feedback/LoadFailed";
import { busyStyle, lineStyle, pillStyle, quietStyle } from "@/components/orgs/club-tool-styles";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

import { ineligibleLine, requestRefusal } from "./member-rules";
import { EmptyLine, ListSkeleton, PersonLine, cardStyle, chipStyle, rowItemStyle } from "./tools-ui";
import type { RequestRow, ToolsClub } from "./types";

const LOAD_LINE = "Couldn't load join requests.";

export function RequestsScreen({ club }: { club: ToolsClub }) {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);
  const loadedRef = useRef(false);
  const base = `/api/orgs/${encodeURIComponent(club.handle)}/requests`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await vibeRequest<{ requests?: RequestRow[] }>(base, { cache: "no-store", quiet: true, failure: LOAD_LINE });
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.requests)) {
        loadedRef.current = true;
        setLoadErr(null);
        setRows(r.data.requests);
        return;
      }
      const failure = asLoadFailure(r, LOAD_LINE);
      // A re-read after an answer keeps the rows on screen and toasts.
      if (loadedRef.current) toast({ message: failure.message, tone: "error", action: failure.action });
      else setLoadErr(failure);
    })();
    return () => {
      cancelled = true;
    };
  }, [base, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const drop = (id: string) => setRows((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
  const setRowBusy = (id: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const act = async (row: RequestRow, action: "approve" | "deny") => {
    if (busy.has(row.id)) return;
    setRowBusy(row.id, true);
    const r = await vibeRequest(`${base}/${encodeURIComponent(row.id)}`, {
      method: "POST",
      json: { action },
      quiet: true,
      failure: action === "approve" ? "Couldn't approve this request." : "Couldn't deny this request.",
    });
    setRowBusy(row.id, false);
    if (r.ok) {
      drop(row.id);
      if (action === "approve") toast({ message: `${row.name || "They"} joined ${club.name}.`, tone: "info" });
      return;
    }
    // A Sign in or See details refusal keeps its own line and button.
    const { line, then } = requestRefusal(r.status, r.code, r.message);
    toast({ message: r.action ? r.message : line, tone: "error", action: r.action });
    if (then === "drop") drop(row.id);
    else if (then === "reload") reload();
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
    return <ListSkeleton rows={3} />;
  }
  if (rows.length === 0) return <EmptyLine>No requests right now.</EmptyLine>;

  return (
    <>
    {/* The approve route refuses every approve on a hidden club (409
        org_hidden): Approve isn't offered there, Deny still is (review F1). */}
    {club.hidden ? (
      <p style={{ ...quietStyle, margin: "0 0 10px" }}>
        This club is hidden, so nobody new can join it. You can still deny requests.
      </p>
    ) : null}
    <ul style={cardStyle}>
      {rows.map((row) => {
        const isBusy = busy.has(row.id);
        const canApprove = !club.hidden && row.eligible !== false && row.can_approve !== false;
        return (
          <li key={row.id} style={{ ...rowItemStyle, padding: "12px 14px" }}>
            <PersonLine
              name={row.name}
              handle={row.handle}
              avatarUrl={row.avatar_url}
              end={row.removed_before ? <span style={chipStyle}>Removed before</span> : null}
            />
            {row.message ? (
              <p style={{ ...lineStyle, margin: "8px 0 0 52px", overflowWrap: "anywhere" }}>
                &ldquo;{row.message}&rdquo;
              </p>
            ) : null}
            {row.eligible === false ? (
              <p style={{ ...quietStyle, margin: "6px 0 0 52px" }}>{ineligibleLine(row.ineligible_reason)}</p>
            ) : null}
            <div style={{ display: "flex", gap: 8, margin: "10px 0 0 52px" }}>
              {canApprove ? (
                <button
                  type="button"
                  className="vibe-press"
                  disabled={isBusy}
                  aria-label={`Approve ${row.name || row.handle || "this request"}`}
                  onClick={() => void act(row, "approve")}
                  style={{ ...approveStyle, ...busyStyle(isBusy) }}
                >
                  Approve
                </button>
              ) : null}
              <button
                type="button"
                className="vibe-press"
                disabled={isBusy}
                aria-label={`Deny ${row.name || row.handle || "this request"}`}
                onClick={() => void act(row, "deny")}
                style={{ ...denyStyle, ...busyStyle(isBusy) }}
              >
                Deny
              </button>
            </div>
          </li>
        );
      })}
    </ul>
    </>
  );
}

/** Coral words on an outline: the row's yes, without a coral fill (`--tag-ink` reads on both themes). */
const approveStyle: CSSProperties = { ...pillStyle, minWidth: 96, border: "1px solid var(--tag-ink)", color: "var(--tag-ink)" };

const denyStyle: CSSProperties = { ...pillStyle, minWidth: 80, color: "var(--ink-2)", border: "1px solid var(--hairline)" };
