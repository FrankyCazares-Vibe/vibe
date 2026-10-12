"use client";

/**
 * The Numbers tab: how many times the front page, the waitlist page and the
 * sign-up page were opened (launch checklist item 19). Put next to the
 * Waitlist tab's joins per label, it answers "what share of visitors join".
 *
 * ONE READ. GET /api/admin/numbers sends today and the 29 days before it as
 * plain rows (day, page, label, opens) and the totals per page, already
 * added up on the server from its own clock.
 *
 * THESE ARE TOTALS, NOT PEOPLE. The table behind this holds a day, a page
 * name, a link label and a number: no account, no IP address, no browser,
 * no cookie. So there is nothing here to mask, and nothing to look anyone up
 * by. Keep it that way: never post a link whose label is one person's name.
 */

import { useCallback, useEffect, useState } from "react";

import {
  OPENS_ALL_NETWORKS_PER_HOUR,
  OPENS_PER_NETWORK_PER_DAY,
  OPENS_PER_NETWORK_PER_HOUR,
} from "@/lib/tally/limits";
import { TALLY_PAGE_PATHS, TALLY_PAGES, type TallyPage } from "@/lib/tally/open";
import { type AdminNumbers, NUMBERS_DAYS, NUMBERS_WEEK_DAYS } from "@/lib/tally/view";

import { ActionButton, adminGet, type AdminResult, COLORS, Empty, labelStyle, Notice } from "./admin-shell";

const PAGE_WORDS: Record<TallyPage, string> = {
  home: "Front page",
  waitlist: "Waitlist page",
  signup: "Sign-up page",
};

/** A tally day is a UTC date, so it is written out in UTC: no shift to the laptop's zone. */
const DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});

function fmtTallyDay(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(ms) ? day : DAY.format(ms);
}

const COUNT = new Intl.NumberFormat("en-US");

function fetchNumbers(): Promise<AdminResult<AdminNumbers>> {
  return adminGet<AdminNumbers>("/api/admin/numbers", "Couldn't load the numbers.");
}

const cell: React.CSSProperties = { padding: "7px 10px", textAlign: "left", verticalAlign: "top" };
const headCell: React.CSSProperties = { ...labelStyle, ...cell, display: "table-cell", marginBottom: 0 };
const numberCell: React.CSSProperties = { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" };

export function NumbersClient() {
  const [numbers, setNumbers] = useState<AdminNumbers | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Asking and reading are split so the mount fetch never sets state
  // synchronously inside the effect (as in log-client.tsx).
  const apply = useCallback((r: AdminResult<AdminNumbers>) => {
    if (r.ok) {
      setNumbers(r.data);
      setErr(null);
    } else {
      setErr(r.message);
    }
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    apply(await fetchNumbers());
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    void fetchNumbers().then((r) => {
      if (!cancelled) apply(r);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="adm-actions">
        <ActionButton busy={loading} onClick={() => void load()}>
          Refresh
        </ActionButton>
      </div>

      {err ? <Notice tone="error">{err}</Notice> : null}

      {/* "Not counting yet" and "counting, and nobody came" are different things, so
          a database without the tally shows this line and no row of noughts. */}
      {numbers && !numbers.ready ? (
        <Notice tone="info">
          The counter isn’t switched on in the database yet, so nothing has been counted. It starts the day its
          database change (20261012180000) is applied.
        </Notice>
      ) : numbers ? (
        <>
          {numbers.truncated ? (
            <Notice tone="info">There were more rows than this page reads, so the totals below are short.</Notice>
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            {TALLY_PAGES.map((page) => (
              <div key={page} className="adm-card">
                <div style={labelStyle}>{`${PAGE_WORDS[page]} · ${TALLY_PAGE_PATHS[page]}`}</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {COUNT.format(numbers.totals[page].last7)}
                </div>
                <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.5 }}>
                  {`opens in the last ${NUMBERS_WEEK_DAYS} days`}
                  <br />
                  {`${COUNT.format(numbers.totals[page].last30)} in the last ${NUMBERS_DAYS} days`}
                </div>
              </div>
            ))}
          </div>

          {/* How to read the numbers, a short paragraph per point. The limits are
              limits.ts's own, so these words can't drift from what the route does. */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: 6, color: COLORS.muted, fontSize: 12, lineHeight: 1.5 }}
          >
            <div>
              An open is one load of the page by someone who isn’t signed in, so your own visits while signed in aren’t
              here. A reload counts again, so these are opens, not people.
            </div>
            <div>
              The label is the ?src= on the link they came in on; “no label” is everyone who came in on a plain link.
              Use lowercase letters, digits and dashes in a label (ig-vibe), 32 at most, and never one person’s name. A
              label counts only on the page its link points at. Someone who lands on the front page from an ig-vibe
              link and taps the button shows as “landing” on the waitlist page (or as no label on the sign-up page,
              once sign-up is open), not as ig-vibe.
            </div>
            <div>
              Read these as a guide, not an exact count. Anyone can add opens by loading a page. Search engines and
              other tools that say what they are aren’t counted, but a tool that looks like a normal browser is. A
              school mail system that opens the link in an invite email is one, so sign-up page opens right after you
              send invites can run high.
            </div>
            <div>
              {`To make the numbers hard to pump up, one network adds at most ${COUNT.format(OPENS_PER_NETWORK_PER_HOUR)} opens an hour and ${COUNT.format(OPENS_PER_NETWORK_PER_DAY)} a day (a whole campus Wi-Fi can be one network), and all networks together at most ${COUNT.format(OPENS_ALL_NETWORKS_PER_HOUR)} an hour. Opens past a limit are dropped. This page can’t show that, but the server log (Vercel) gets a line starting [tally/open], so look there after a big day.`}
            </div>
            <div>
              {`Days are UTC: a day starts at 8 pm Indiana time (7 pm in winter), and today (${fmtTallyDay(numbers.today)}) is still filling. Nothing here is deleted, so older days stay in the database after they leave this list.`}
            </div>
          </div>

          {numbers.rows.length === 0 ? (
            <Empty>
              {`No opens counted in the last ${NUMBERS_DAYS} days. A row lands here when someone who isn’t signed in opens the front page, the waitlist page or the sign-up page.`}
            </Empty>
          ) : (
            <div className="adm-card" style={{ overflowX: "auto", padding: 6 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, lineHeight: 1.45 }}>
                <caption style={{ ...labelStyle, display: "table-caption", textAlign: "left", padding: "6px 10px 2px" }}>
                  {`Opens by day, ${fmtTallyDay(numbers.since)} to ${fmtTallyDay(numbers.today)}, newest first`}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" style={headCell}>Day</th>
                    <th scope="col" style={headCell}>Page</th>
                    <th scope="col" style={headCell}>Label</th>
                    <th scope="col" style={{ ...headCell, textAlign: "right" }}>Opens</th>
                  </tr>
                </thead>
                <tbody>
                  {numbers.rows.map((row) => (
                    <tr key={`${row.day}|${row.page}|${row.label}`} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      <td style={{ ...cell, whiteSpace: "nowrap" }}>{fmtTallyDay(row.day)}</td>
                      <td style={cell}>{PAGE_WORDS[row.page]}</td>
                      <td style={{ ...cell, wordBreak: "break-all", color: row.label ? COLORS.text : COLORS.muted }}>
                        {row.label || "no label"}
                      </td>
                      <td style={numberCell}>{COUNT.format(row.opens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : loading ? (
        <div style={{ color: COLORS.muted, fontSize: 13 }}>Loading the numbers…</div>
      ) : null}
    </div>
  );
}
