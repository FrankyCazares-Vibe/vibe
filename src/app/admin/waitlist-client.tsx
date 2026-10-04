"use client";

/**
 * The waitlist tab: who asked to join, and who gets an access code next.
 *
 * ONE READ, THEN THE BROWSER. GET /api/admin/waitlist sends the newest 2000
 * rows (masked addresses only); filtering and counting happen here
 * (src/lib/waitlist/view.ts), so a filter costs no request and no filter
 * value ever reaches a URL or a log.
 *
 * BATCHES. Tick up to 25 people who confirmed and have no code yet, with a
 * day or more left before their entry is deleted ("Select shown" picks from
 * the filtered list and skips the rest), name the batch, press Send codes.
 * The route sends one email at a time, refuses more than today's email
 * budget allows, and answers per person: sent, skipped (not confirmed, a
 * code already went, or the entry is deleted within a day) or failed (the
 * code was taken back). A batch name is a fixed word and a number (wave-1),
 * never free text: it stays with each account in user_cohorts.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { ACCESS_CODE_TTL_DAYS } from "@/lib/waitlist/access-code";
import {
  type AdminWaitlistInviteResponse,
  type AdminWaitlistList,
  WAITLIST_BATCH_MAX_NUMBER,
  WAITLIST_BATCH_PREFIXES,
  WAITLIST_PURGE_AFTER_DAYS,
  WAITLIST_RETENTION_DAYS,
  WAITLIST_UNCONFIRMED_RETENTION_DAYS,
  waitlistBatchName,
} from "@/lib/waitlist/types";
import {
  canBatchInvite,
  countWaitlistRows,
  EMPTY_WAITLIST_FILTERS,
  filterWaitlistRows,
  selectShown,
  WAITLIST_BATCH_CAP,
  WAITLIST_LEAVING_SOON_DAYS,
  type WaitlistFilters,
} from "@/lib/waitlist/view";

import { ActionButton, adminGet, adminPost, type AdminResult, COLORS, Empty, inputStyle, labelStyle, Notice } from "./admin-shell";
import { WaitlistAdd } from "./waitlist-add";
import { WaitlistFilterBar } from "./waitlist-filters";
import { WaitlistRowCard } from "./waitlist-rows";

type Said = { tone: "good" | "error" | "info"; text: string };

/**
 * The last day of an entry a code can go out and still get its full 14
 * days: the entry is deleted on day 38 (types.ts), so day 24.
 * retention.test.ts checks the number.
 */
const FULL_CODE_BY_DAY = WAITLIST_PURGE_AFTER_DAYS - ACCESS_CODE_TTL_DAYS;

function fetchList(): Promise<AdminResult<AdminWaitlistList>> {
  return adminGet<AdminWaitlistList>("/api/admin/waitlist", "Couldn't load the waitlist.");
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What one Send codes press did, in a sentence. */
function inviteSummary(res: AdminWaitlistInviteResponse): Said {
  const sent = res.results.filter((r) => r.outcome === "sent").length;
  const skipped = res.results.filter((r) => r.outcome === "skipped").length;
  const failed = res.results.filter((r) => r.outcome === "failed").length;
  const bits = [`Sent ${plural(sent, "code", "codes")}.`];
  if (skipped) {
    bits.push(`${plural(skipped, "person was", "people were")} skipped: not confirmed, a code already went, or their entry is deleted within a day.`);
  }
  if (failed) bits.push(`${plural(failed, "email", "emails")} didn't go, and those codes were taken back. Try them again.`);
  return { tone: failed ? "error" : skipped ? "info" : "good", text: bits.join(" ") };
}

export function WaitlistClient() {
  const [list, setList] = useState<AdminWaitlistList | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pause, setPause] = useState<string | null>(null);
  const [filters, setFilters] = useState<WaitlistFilters>(EMPTY_WAITLIST_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [batchWord, setBatchWord] = useState<string>(WAITLIST_BATCH_PREFIXES[0]);
  const [batchNumber, setBatchNumber] = useState("");
  const [sending, setSending] = useState(false);
  const [said, setSaid] = useState<Said | null>(null);
  const [adding, setAdding] = useState(false);
  // The row "Add someone" found already on the list; filters are cleared so
  // it is in view, and the list scrolls to it once it is drawn.
  const [focusId, setFocusId] = useState<string | null>(null);

  // Asking and reading are split so the mount fetch never sets state
  // synchronously inside the effect (as in log-client.tsx).
  const apply = useCallback((r: AdminResult<AdminWaitlistList>) => {
    if (r.ok) {
      setList(r.data);
      setErr(null);
      // Anyone who no longer can take a batch code drops out of the pick
      // (a code went, or their entry now has less than a day left).
      const now = new Date();
      const open = new Set(r.data.rows.filter((row) => canBatchInvite(row, now)).map((row) => row.id));
      setSelected((prev) => new Set([...prev].filter((id) => open.has(id))));
    } else {
      setErr(r.message);
    }
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    apply(await fetchList());
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    void fetchList().then((r) => {
      if (!cancelled) apply(r);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`wl-row-${focusId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusId, list]);

  const found = (id: string) => {
    setFilters(EMPTY_WAITLIST_FILTERS);
    setFocusId(id);
    void load();
  };

  const rows = useMemo(() => list?.rows ?? [], [list]);
  const shown = useMemo(() => filterWaitlistRows(rows, filters), [rows, filters]);
  const counts = useMemo(() => countWaitlistRows(rows), [rows]);
  const batch = waitlistBatchName(batchWord, batchNumber);
  const budget = list?.budget ?? null;
  const left = budget ? Math.max(0, budget.cap - budget.used) : 0;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < WAITLIST_BATCH_CAP) next.add(id);
      return next;
    });

  async function sendCodes() {
    if (sending || selected.size === 0) return;
    if (!batch) {
      setSaid({ tone: "error", text: `Name the batch first: pick a word and a number from 1 to ${WAITLIST_BATCH_MAX_NUMBER}, like wave-1.` });
      return;
    }
    if (budget && selected.size > left) {
      setSaid({ tone: "error", text: `Only ${plural(left, "email", "emails")} left today. Pick fewer people, or send the rest tomorrow.` });
      return;
    }
    setSending(true);
    setSaid({ tone: "info", text: `Sending ${plural(selected.size, "code", "codes")}. This takes about a second a person.` });
    const r = await adminPost<AdminWaitlistInviteResponse>(
      "/api/admin/waitlist/invite",
      { ids: [...selected], batch },
      "Couldn't send the codes.",
    );
    setSending(false);
    if (!r.ok) {
      setSaid({ tone: "error", text: r.message });
      if (r.pause) setPause(r.message);
      return;
    }
    setSaid(inviteSummary(r.data));
    const failed = new Set(r.data.results.filter((x) => x.outcome === "failed").map((x) => x.id));
    setSelected(failed);
    void load();
  }

  const removed = (id: string) => {
    setList((prev) => (prev ? { ...prev, rows: prev.rows.filter((row) => row.id !== id) } : prev));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="adm-actions">
        <ActionButton busy={loading} onClick={() => void load()}>Refresh</ActionButton>
        <ActionButton tone={adding ? "plain" : "primary"} onClick={() => setAdding((a) => !a)}>
          {adding ? "Close" : "Add someone"}
        </ActionButton>
      </div>

      {pause ? <Notice tone="info">{pause}</Notice> : null}
      {err ? <Notice tone="error">{err}</Notice> : null}
      {adding ? <WaitlistAdd batch={batch} onAdded={() => void load()} onFound={found} onPause={setPause} /> : null}

      {list ? (
        <>
          <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.6 }}>
            {`${plural(counts.total, "person", "people")} · ${counts.status.waiting} waiting · ${counts.status.unconfirmed} unconfirmed · ${counts.status.invited} with a code · ${counts.status.expired} code expired · ${counts.status.joined} joined`}
            <br />
            {`IU ${counts.school.iu} · Purdue ${counts.school.purdue}${counts.school.none ? ` · other address ${counts.school.none}` : ""} · ${counts.officers} run a club`}
            {counts.leavingSoon ? ` · ${counts.leavingSoon} leave within ${WAITLIST_LEAVING_SOON_DAYS} days` : ""}
            {counts.sources.length ? ` · from ${counts.sources.map((s) => `${s.source === "none" ? "no tag" : s.source} ${s.count}`).join(", ")}` : ""}
          </div>
          <div style={{ color: COLORS.faint, fontSize: 12, lineHeight: 1.5 }}>
            {`Each entry is deleted within ${WAITLIST_RETENTION_DAYS} days of joining the list, whatever its state (unconfirmed ones within ${WAITLIST_UNCONFIRMED_RETENTION_DAYS} days of their last confirm email); each row shows its date. Someone unconfirmed who fills in the form again starts over from that day. A code never outlives its entry: for its full ${ACCESS_CODE_TTL_DAYS} days, send it by day ${FULL_CODE_BY_DAY} of an entry; one sent later ends on the entry’s date, and its email says when; none goes out in an entry’s last day. Once an entry is past its date it counts as gone: the same person can join again, or be added again, as a fresh entry. Someone who made an account keeps it; only their batch and dates stay with it.`}
          </div>
          {list.truncated ? <Notice tone="info">Showing the newest 2000. Older people aren’t in this list or its counts.</Notice> : null}

          <WaitlistFilterBar filters={filters} onChange={setFilters} sources={counts.sources.map((s) => s.source)} />

          <div className="adm-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="adm-fields">
              <label style={{ flex: 1, minWidth: 130 }}>
                <span style={labelStyle}>Batch</span>
                <select value={batchWord} onChange={(e) => setBatchWord(e.target.value)} style={inputStyle}>
                  {WAITLIST_BATCH_PREFIXES.map((w) => (
                    <option key={w} value={w} className="adm-option">{w}</option>
                  ))}
                </select>
              </label>
              <label style={{ flex: 1, minWidth: 90 }}>
                <span style={labelStyle}>Number</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={WAITLIST_BATCH_MAX_NUMBER}
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  placeholder="1"
                  autoComplete="off"
                  style={inputStyle}
                />
              </label>
              <ActionButton onClick={() => setSelected((prev) => selectShown(shown, prev))} disabled={sending}>
                Select shown
              </ActionButton>
              <ActionButton onClick={() => setSelected(new Set())} disabled={sending || selected.size === 0}>
                Clear
              </ActionButton>
              <ActionButton tone="primary" busy={sending} disabled={selected.size === 0} onClick={() => void sendCodes()}>
                {selected.size ? `Send ${plural(selected.size, "code", "codes")}` : "Send codes"}
              </ActionButton>
            </div>
            <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.5 }}>
              {`${selected.size} of ${WAITLIST_BATCH_CAP} picked. Only people who confirmed, have no code yet and have more than a day before their entry is deleted can be picked.`}
              {batch ? ` Batch ${batch}.` : batchNumber.trim() ? ` Batch numbers run 1 to ${WAITLIST_BATCH_MAX_NUMBER}.` : ""}
              {budget ? ` Access-code emails in the last 24 hours: ${budget.used} of ${budget.cap} (${left} left).` : ""}
              {list.confirmBudget
                ? ` Confirm emails from the form (a separate allowance): ${list.confirmBudget.used} of ${list.confirmBudget.cap}.`
                : ""}
            </div>
            {said ? <Notice tone={said.tone}>{said.text}</Notice> : null}
          </div>

          <div style={{ color: COLORS.faint, fontSize: 12 }}>{`Showing ${shown.length} of ${rows.length}.`}</div>
          {shown.length === 0 ? (
            <Empty>
              {rows.length === 0
                ? "Nobody yet. People land here when they fill in the form at /waitlist, or when you add someone."
                : "Nobody matches these filters."}
            </Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {shown.map((row) => (
                <WaitlistRowCard
                  key={row.id}
                  row={row}
                  selected={selected.has(row.id)}
                  focused={row.id === focusId}
                  onToggle={toggle}
                  canReveal={list.canReveal}
                  batch={batch}
                  onChanged={() => void load()}
                  onRemoved={removed}
                  onPause={setPause}
                />
              ))}
            </div>
          )}
        </>
      ) : loading ? (
        <div style={{ color: COLORS.muted, fontSize: 13 }}>Loading the waitlist…</div>
      ) : null}
    </div>
  );
}
