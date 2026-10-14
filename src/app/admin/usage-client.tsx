"use client";

/**
 * The Usage tab: how Vibe is used, in five parts. The door (who signs up and
 * gets in), coming back (who returns), what gets used (posts, likes, chat),
 * clubs, and where people are (school and campus).
 *
 * ONE READ. GET /api/admin/usage asks the database's own counter
 * (`admin_usage_summary`, migration 20261014120000) for numbers and nothing
 * else: no ids, no names of people, no emails, no message text. The counting
 * happens inside the database; this page only draws it.
 *
 * FOUNDERS (AND THE STORE-REVIEW ACCOUNTS) ARE LEFT OUT, as people and as
 * the ones doing things. A student's like on a founder's post still counts; a
 * founder's own post does not. So a club a founder helps run (SAE today)
 * reads low on purpose.
 *
 * "<5" IS COSMETIC. The route turns a small grouped cell (1 to 4 in the wave,
 * sign-up week, school, campus and club tables) into "<5" before it leaves
 * the server, so a glance at a row doesn't read as a person. Daily counts and
 * totals go out exact. It is not anonymising: exact totals sit next to the
 * floored cells, with one visible club the "club members" total is that
 * club's own count, and on a quiet day a daily count can be one person's.
 * Don't describe it anywhere as privacy protection.
 */

import { useCallback, useEffect, useState } from "react";

import { type AdminUsage, type Cell, SMALL_CELL_FLOOR, type UsageView } from "@/lib/usage/view";

import { ActionButton, adminGet, type AdminResult, COLORS, Empty, inputStyle, labelStyle, Notice } from "./admin-shell";

type DoorDay = UsageView["door"]["by_day"][number];
type UsedDay = UsageView["used"]["by_day"][number];
type UsedKey = Exclude<keyof UsedDay, "day">;

/** Days and weeks are UTC dates, so they are written out in UTC: no shift to the laptop's zone. */
const DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});

const SHORT_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

function fmtUsageDay(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(ms) ? day : DAY.format(ms);
}

function fmtShortDay(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(ms) ? day : SHORT_DAY.format(ms);
}

const COUNT = new Intl.NumberFormat("en-US");

/** A number as a number; a floored cell ("<5") as it came. */
function fmtCell(value: Cell): string {
  return typeof value === "number" ? COUNT.format(value) : value;
}

function fetchUsage(): Promise<AdminResult<AdminUsage>> {
  return adminGet<AdminUsage>("/api/admin/usage", "Couldn't load the usage numbers.");
}

const cell: React.CSSProperties = { padding: "7px 10px", textAlign: "left", verticalAlign: "top" };
const headCell: React.CSSProperties = { ...labelStyle, ...cell, display: "table-cell", marginBottom: 0 };
const numberHead: React.CSSProperties = { ...headCell, textAlign: "right" };
const numberCell: React.CSSProperties = { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const dayCell: React.CSSProperties = { ...cell, whiteSpace: "nowrap" };
const rowLine: React.CSSProperties = { borderTop: `1px solid ${COLORS.border}` };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13, lineHeight: 1.45 };
const captionStyle: React.CSSProperties = {
  ...labelStyle,
  display: "table-caption",
  textAlign: "left",
  padding: "6px 10px 2px",
};
const noteStyle: React.CSSProperties = { color: COLORS.muted, fontSize: 12, lineHeight: 1.5 };
/** Cards in a row that wraps; `minWidth: 0` keeps a wide child from stretching the page. */
const cardGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

/* ---------------------------------------------------------------- pieces */

/** One of the five parts, with its heading and a line on how to read it. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 800, fontSize: 18, margin: "10px 0 0" }}>{title}</h2>
      {children}
    </section>
  );
}

/** A big number with what it counts under it. */
function Stat({ label, value, note }: { label: string; value: Cell; note?: string }) {
  return (
    <div className="adm-card" style={{ minWidth: 0 }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCell(value)}</div>
      {note ? <div style={noteStyle}>{note}</div> : null}
    </div>
  );
}

/**
 * A row of small bars, one per day or week, oldest on the left. No chart
 * library: each bar is a div whose height is its share of the biggest one. A
 * zero is a hairline, so an empty day still shows as a day. The numbers are
 * in the table under it, so the bars carry one summary line for a screen
 * reader rather than thirty.
 *
 * `people` marks bars that count people, not things: one person active on
 * three days is in three bars, so a sum would read as more people than
 * there are accounts. Those bars say only their peak.
 */
function Bars({
  points,
  label,
  first,
  last,
  people = false,
}: {
  points: ReadonlyArray<{ key: string; title: string; value: number }>;
  label: string;
  first: string;
  last: string;
  people?: boolean;
}) {
  const peak = Math.max(0, ...points.map((p) => p.value));
  const max = Math.max(1, peak);
  const total = points.reduce((sum, p) => sum + p.value, 0);
  const summary = people
    ? `${COUNT.format(peak)} at most in one`
    : `${COUNT.format(total)} in all, ${COUNT.format(peak)} at most in one`;
  return (
    <div className="adm-card" style={{ minWidth: 0 }}>
      <div style={labelStyle}>{label}</div>
      <div
        role="img"
        aria-label={`${label}, ${first} to ${last}: ${summary}`}
        style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 56, marginTop: 4 }}
      >
        {points.map((p) => (
          <div
            key={p.key}
            title={`${p.title}: ${COUNT.format(p.value)}`}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              height: p.value > 0 ? `${Math.max(6, Math.round((p.value / max) * 100))}%` : 1,
              background: p.value > 0 ? COLORS.accent : COLORS.border,
              borderRadius: 2,
            }}
          />
        ))}
      </div>
      <div style={{ ...noteStyle, display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
        <span>{first}</span>
        <span>{last}</span>
      </div>
    </div>
  );
}

/**
 * The numbers behind a row of bars, folded away until asked for: thirty rows
 * a section would bury the next one. Days where every column is 0 are left
 * out, and the newest day is on top. The table scrolls inside its own box,
 * never the page, so it reads on a 375 px phone.
 */
function DayTable<K extends string>({
  summary,
  rows,
  columns,
}: {
  summary: string;
  rows: ReadonlyArray<{ day: string } & Record<K, number>>;
  columns: ReadonlyArray<{ key: K; label: string }>;
}) {
  const shown = rows.filter((row) => columns.some((c) => row[c.key] > 0)).reverse();
  return (
    <details className="adm-card" style={{ minWidth: 0, padding: 6 }}>
      <summary style={{ ...noteStyle, cursor: "pointer", padding: "6px 10px" }}>{summary}</summary>
      {shown.length === 0 ? (
        <div style={{ ...noteStyle, padding: "6px 10px" }}>Nothing on any day in this window.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th scope="col" style={headCell}>Day</th>
                {columns.map((c) => (
                  <th key={c.key} scope="col" style={numberHead}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.day} style={rowLine}>
                  <td style={dayCell}>{fmtUsageDay(row.day)}</td>
                  {columns.map((c) => (
                    <td key={c.key} style={numberCell}>
                      {COUNT.format(row[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

/** Bars for one column of a daily series, oldest day on the left. */
function dayPoints<K extends string>(
  rows: ReadonlyArray<{ day: string } & Record<K, number>>,
  key: K,
): Array<{ key: string; title: string; value: number }> {
  return rows.map((row) => ({ key: row.day, title: fmtUsageDay(row.day), value: row[key] }));
}

/* ---------------------------------------------------------------- the tab */

export function UsageClient() {
  const [usage, setUsage] = useState<AdminUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Asking and reading are split so the mount fetch never sets state
  // synchronously inside the effect (as in numbers-client.tsx).
  const apply = useCallback((r: AdminResult<AdminUsage>) => {
    if (r.ok) {
      setUsage(r.data);
      setErr(null);
    } else {
      setErr(r.message);
    }
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    apply(await fetchUsage());
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    void fetchUsage().then((r) => {
      if (!cancelled) apply(r);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const view = usage?.view ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <div className="adm-actions">
        <ActionButton busy={loading} onClick={() => void load()}>
          Refresh
        </ActionButton>
      </div>

      {err ? <Notice tone="error">{err}</Notice> : null}

      {/* "Not counting yet" is not "nobody did anything", so a database
          without the counter shows this line and no wall of noughts. */}
      {usage && (!usage.ready || !view) ? (
        <Notice tone="info">
          The usage counter is not switched on yet. It starts working the day its database change (20261014120000) is
          applied.
        </Notice>
      ) : view ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, ...noteStyle }}>
            <div>
              {`Days are UTC: a day starts at 8 pm Indiana time (7 pm in winter), and today (${fmtUsageDay(view.today)}) is still filling. Weeks start Monday (Sunday 8 pm Indiana). The daily rows cover ${fmtUsageDay(view.since)} to today, ${COUNT.format(view.days)} days.`}
            </div>
            <div>
              {`Founders and the store-review accounts are left out everywhere, as people and as the ones doing things, and so are the hidden test clubs and test batches. “<${SMALL_CELL_FLOOR}” means 1 to ${SMALL_CELL_FLOOR - 1}: it keeps a small group from reading as a person at a glance, but it doesn’t hide anyone, since the exact totals sit right beside it.`}
            </div>
            <div>
              Undoing something (an unlike, an unfollow, leaving a club, a deleted post or a cancelled event) deletes its
              row, so older days can read a little lower than they were on the day.
            </div>
          </div>

          <DoorSection view={view} />
          <BackSection view={view} />
          <UsedSection view={view} />
          <ClubsSection view={view} />
          <WhereSection view={view} />
        </>
      ) : loading ? (
        <div style={{ color: COLORS.muted, fontSize: 13 }}>Loading the usage numbers…</div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- the door */

const DOOR_COLUMNS: ReadonlyArray<{ key: Exclude<keyof DoorDay, "day">; label: string }> = [
  { key: "signups", label: "Sign-ups" },
  { key: "school_verified", label: "School email" },
  { key: "waitlist_form", label: "Waitlist form" },
  { key: "waitlist_founder_add", label: "Added by us" },
  { key: "codes_sent", label: "Codes sent" },
];

/** The function's word for someone who came in on a code sent without a batch name. */
const NO_BATCH = "no batch";

/** Who signs up and gets in: accounts, the school-email step, the waitlist and the codes. */
function DoorSection({ view }: { view: UsageView }) {
  const { door, waves } = view;
  const first = fmtShortDay(view.since);
  return (
    <Section title="The door">
      <div style={cardGrid}>
        <Stat label="Accounts" value={door.accounts} note="every account, confirmed or not" />
        <Stat label="Confirmed" value={door.accounts_confirmed} note="confirmed their email" />
        <Stat label="School email" value={door.school_verified} note="verified a school address" />
        <Stat label="Finished sign-up" value={door.onboarded} note="got through the first questions" />
      </div>

      <Bars label="Sign-ups per day" points={dayPoints(door.by_day, "signups")} first={first} last="today" />
      <Bars label="Access codes sent per day" points={dayPoints(door.by_day, "codes_sent")} first={first} last="today" />

      <DayTable summary="The door by day" rows={door.by_day} columns={DOOR_COLUMNS} />

      <div style={{ display: "flex", flexDirection: "column", gap: 6, ...noteStyle }}>
        <div>
          A sign-up is a confirmed account, on the day it was made. School email is the day someone confirmed a school
          address (iu.edu or purdue.edu), counted from Oct 8, when sign-up went school email first; earlier days read 0.
        </div>
        <div>
          Waitlist form is a waitlist confirmation email that went out, so someone who fills the form in twice counts
          twice. Added by us is a person a founder put on the waitlist by hand. Codes sent counts every access code
          email, resends included, and leaves out test batches.
        </div>
      </div>

      {waves.length === 0 ? (
        <Empty>No one has signed up with an access code yet. A row lands here for each batch once someone does.</Empty>
      ) : (
        <div className="adm-card" style={{ overflowX: "auto", padding: 6, minWidth: 0 }}>
          <table style={tableStyle}>
            <caption style={captionStyle}>Sign-ups by batch, all time</caption>
            <thead>
              <tr>
                <th scope="col" style={headCell}>Batch</th>
                <th scope="col" style={numberHead}>Sign-ups</th>
              </tr>
            </thead>
            <tbody>
              {waves.map((wave) => (
                <tr key={wave.batch} style={rowLine}>
                  <td style={{ ...cell, wordBreak: "break-all" }}>
                    {wave.batch === NO_BATCH ? "No batch" : wave.batch}
                  </td>
                  <td style={numberCell}>{fmtCell(wave.signups)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/* ---------------------------------------------------------------- coming back */

/**
 * One row per Monday week. `by_week` runs up to this week; `cohorts` stops at
 * last week, so every cohort's following week has at least begun. The two
 * are put side by side here, with a dash where a week has no number of that
 * kind, newest week on top.
 */
function weekRows(back: UsageView["back"]): Array<{
  week: string;
  active: number | null;
  signups: Cell | null;
  returned: Cell | null;
}> {
  const byWeek = new Map<string, { active: number | null; signups: Cell | null; returned: Cell | null }>();
  for (const w of back.by_week) byWeek.set(w.week, { active: w.active, signups: null, returned: null });
  for (const c of back.cohorts) {
    const row = byWeek.get(c.week) ?? { active: null, signups: null, returned: null };
    byWeek.set(c.week, { ...row, signups: c.signups, returned: c.returned });
  }
  return [...byWeek.entries()]
    .map(([week, row]) => ({ week, ...row }))
    .sort((a, b) => b.week.localeCompare(a.week));
}

/** Who comes back: right now, over rolling windows, by day and by week. */
function BackSection({ view }: { view: UsageView }) {
  const { back } = view;
  const weeks = weekRows(back);
  const newestCohort = back.cohorts.length ? back.cohorts[back.cohorts.length - 1].week : null;
  // by_week ends with the week still going, so its count is partial too.
  const thisWeek = back.by_week.length ? back.by_week[back.by_week.length - 1].week : null;
  const firstWeek = back.by_week.length ? `week of ${fmtShortDay(back.by_week[0].week)}` : "";
  return (
    <Section title="Coming back">
      <div style={cardGrid}>
        <Stat label="Right now" value={back.active_now} note="active in the last 5 minutes" />
        <Stat label="Last 24 hours" value={back.active_1d} note="people active" />
        <Stat label="Last 7 days" value={back.active_7d} note="people active" />
        <Stat label="Last 30 days" value={back.active_30d} note="people active" />
      </div>

      <Bars
        label="People who did something, per day"
        points={dayPoints(back.by_day, "active")}
        first={fmtShortDay(view.since)}
        last="today"
        people
      />
      <Bars
        label="People who did something, per week"
        points={back.by_week.map((w) => ({ key: w.week, title: `Week of ${fmtShortDay(w.week)}`, value: w.active }))}
        first={firstWeek}
        last="this week"
        people
      />

      <DayTable summary="People who did something, by day" rows={back.by_day} columns={[{ key: "active", label: "People" }]} />

      {weeks.length === 0 ? null : (
        <div className="adm-card" style={{ overflowX: "auto", padding: 6, minWidth: 0 }}>
          <table style={tableStyle}>
            <caption style={captionStyle}>By week, newest first</caption>
            <thead>
              <tr>
                <th scope="col" style={headCell}>Week of</th>
                <th scope="col" style={numberHead}>Did something</th>
                <th scope="col" style={numberHead}>Signed up</th>
                <th scope="col" style={numberHead}>Back next week</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.week} style={rowLine}>
                  <td style={dayCell}>{fmtShortDay(w.week)}</td>
                  <td style={numberCell}>
                    {w.active === null ? "–" : COUNT.format(w.active)}
                    {w.week === thisWeek && w.active !== null ? (
                      <span style={{ color: COLORS.faint }}> so far</span>
                    ) : null}
                  </td>
                  <td style={numberCell}>{w.signups === null ? "–" : fmtCell(w.signups)}</td>
                  <td style={numberCell}>
                    {w.returned === null ? "–" : fmtCell(w.returned)}
                    {w.week === newestCohort && w.returned !== null ? (
                      <span style={{ color: COLORS.faint }}> so far</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, ...noteStyle }}>
        <div>
          Right now and the rolling windows count anyone who had Campus open, read a chat or a notification, or did
          something. A chat someone was added to without opening it doesn’t count.
        </div>
        <div>
          Did something means a dated action that day or week: a post, comment, like, repost, save, RSVP, reaction or
          poll vote, a follow or club join, a message sent, an event made, a notification read, or a look at someone
          else’s post or profile. The phone feed doesn’t record what scrolls past, so phones read a little low.
        </div>
        <div>
          Back next week is how many of that week’s sign-ups did something in the following Monday-to-Sunday week.
          For the newest sign-up week that following week is this one, still running, so it says so far, as does this
          week’s did something.
        </div>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- what gets used */

type UsedTotals = UsageView["used"]["totals"];

/** The all-time totals, in the order they are drawn, with what each one counts. */
const TOTAL_CARDS: ReadonlyArray<{ key: keyof UsedTotals; label: string; note: string }> = [
  { key: "posts", label: "Posts", note: "published, video posts too" },
  { key: "comments", label: "Comments", note: "on posts" },
  { key: "likes", label: "Likes", note: "on posts" },
  { key: "reposts", label: "Reposts", note: "of posts" },
  { key: "saves", label: "Saves", note: "posts saved" },
  { key: "events", label: "Events", note: "made by a club" },
  { key: "rsvps", label: "RSVPs", note: "any answer" },
  { key: "people_follows", label: "People follows", note: "one person following another" },
  { key: "club_follows", label: "Club follows", note: "followers who didn’t join" },
  { key: "club_members", label: "Club members", note: "memberships" },
  { key: "club_chat_messages", label: "Club chat", note: "messages in club rooms" },
  { key: "direct_messages", label: "Private messages", note: "direct and group chats" },
  { key: "group_messages", label: "Of those, groups", note: "in group chats" },
];

/** The daily columns, in the order the picker and the table list them. */
const USED_COLUMNS: ReadonlyArray<{ key: UsedKey; label: string }> = [
  { key: "posts", label: "Posts" },
  { key: "comments", label: "Comments" },
  { key: "likes", label: "Likes" },
  { key: "reposts", label: "Reposts" },
  { key: "saves", label: "Saves" },
  { key: "events", label: "Events" },
  { key: "rsvps", label: "RSVPs" },
  { key: "people_follows", label: "People follows" },
  { key: "club_relationships", label: "Club follows and joins" },
  { key: "club_chat_messages", label: "Club chat" },
  { key: "direct_messages", label: "Private messages" },
];

function isUsedKey(value: string): value is UsedKey {
  return USED_COLUMNS.some((c) => c.key === value);
}

/** What gets used: all-time totals, then one daily series at a time. */
function UsedSection({ view }: { view: UsageView }) {
  const { used } = view;
  const [series, setSeries] = useState<UsedKey>("posts");
  const picked = USED_COLUMNS.find((c) => c.key === series) ?? USED_COLUMNS[0];
  return (
    <Section title="What gets used">
      <div style={cardGrid}>
        {TOTAL_CARDS.map((t) => (
          <Stat key={t.key} label={t.label} value={used.totals[t.key]} note={t.note} />
        ))}
      </div>

      <div className="adm-fields">
        {/* A width cap, not a flex basis: below 640px .adm-fields stacks into a
            column, where a 260px basis would make the label 260px tall. */}
        <label style={{ display: "flex", flexDirection: "column", minWidth: 0, width: "100%", maxWidth: 260 }}>
          <span style={labelStyle}>Show per day</span>
          <select
            value={series}
            onChange={(e) => {
              if (isUsedKey(e.target.value)) setSeries(e.target.value);
            }}
            style={inputStyle}
          >
            {USED_COLUMNS.map((c) => (
              <option key={c.key} value={c.key} className="adm-option">
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Bars
        label={`${picked.label} per day`}
        points={dayPoints(used.by_day, picked.key)}
        first={fmtShortDay(view.since)}
        last="today"
      />

      <DayTable summary="Everything by day" rows={used.by_day} columns={USED_COLUMNS} />

      <div style={{ display: "flex", flexDirection: "column", gap: 6, ...noteStyle }}>
        <div>
          The cards are all time: everything that is still there today. Something taken down by a moderator still
          counts, since it was sent. Unliked, unfollowed and deleted things are gone, so they aren’t.
        </div>
        <div>
          Club follows leave out the follow that comes with joining a club; those are the club members. Per day, club
          follows and joins is the first time someone followed or joined each club, so it stays put when they later
          leave. Club chat covers every room of a visible club (lounge, board, officers, event rooms); private messages
          are direct and group chats, counts only.
        </div>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- clubs */

/** How clubs are doing: the visible ones only, with a row each. */
function ClubsSection({ view }: { view: UsageView }) {
  const { clubs } = view;
  return (
    <Section title="Clubs">
      <div style={cardGrid}>
        <Stat label="Visible clubs" value={clubs.visible} note="hidden test clubs left out" />
        <Stat label="Officer did something" value={clubs.officer_did_something_7d} note="clubs, in the last 7 days" />
        <Stat label="Event this month" value={clubs.event_this_month} note="clubs with one starting this month" />
        <Stat label="Chat this week" value={clubs.chat_7d} note="clubs, a message in the last 7 days" />
      </div>

      {clubs.per_club.length === 0 ? (
        <Empty>No visible clubs yet. A row lands here for each club that isn’t hidden.</Empty>
      ) : (
        <div className="adm-card" style={{ overflowX: "auto", padding: 6, minWidth: 0 }}>
          <table style={tableStyle}>
            <caption style={captionStyle}>Each visible club, most members first</caption>
            <thead>
              <tr>
                <th scope="col" style={headCell}>Club</th>
                <th scope="col" style={numberHead}>Members</th>
                <th scope="col" style={numberHead}>Chat 7d</th>
                <th scope="col" style={numberHead}>Chat 30d</th>
                <th scope="col" style={numberHead}>Events</th>
              </tr>
            </thead>
            <tbody>
              {clubs.per_club.map((club, i) => (
                // Two clubs can share a public name, so the position is part of the key.
                <tr key={`${i}|${club.name}`} style={rowLine}>
                  <td style={{ ...cell, minWidth: 100 }}>{club.name}</td>
                  <td style={numberCell}>{fmtCell(club.members)}</td>
                  <td style={numberCell}>{club.chat_7d}</td>
                  <td style={numberCell}>{club.chat_30d}</td>
                  <td style={numberCell}>{fmtCell(club.events_this_month)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, ...noteStyle }}>
        <div>
          An officer is a club’s owner, admin or mod. Did something means they made a post for the club, sent a message
          in one of its rooms or made an event, in the last 7 days. Founders’ own activity is left out, so a club a
          founder helps run can read low.
        </div>
        <div>
          Chat 7d and Chat 30d show 0, 1–9 or 10+ messages from people who aren’t founders, over the last 7 and 30
          days, whatever the window above says. Events are the ones starting this calendar month (UTC). A cancelled
          event takes its room’s messages with it.
        </div>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- where */

const SCHOOL_WORDS: Record<string, string> = { iu: "IU", purdue: "Purdue", unknown: "Not known" };

/** Where people are: the same accounts as the door's first card, by school and by campus. */
function WhereSection({ view }: { view: UsageView }) {
  const { where } = view;
  return (
    <Section title="Where">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
        <PlaceTable
          caption="Accounts by school"
          head="School"
          rows={where.by_school.map((r) => ({ name: SCHOOL_WORDS[r.school] ?? r.school, accounts: r.accounts }))}
        />
        <PlaceTable
          caption="Accounts by campus"
          head="Campus"
          rows={where.by_campus.map((r) => ({
            name: r.campus === "not picked" ? "Not picked" : r.campus,
            accounts: r.accounts,
          }))}
        />
      </div>
      <div style={noteStyle}>
        {`Both add up to the Accounts card on The door, give or take the rows shown as <${SMALL_CELL_FLOOR}. The school comes from the school email; not known is an account without one yet. Not picked is someone who hasn’t chosen a campus. Only campuses with an account are listed.`}
      </div>
    </Section>
  );
}

function PlaceTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string;
  rows: ReadonlyArray<{ name: string; accounts: Cell }>;
}) {
  if (rows.length === 0) return <Empty>{`${caption}: none yet.`}</Empty>;
  return (
    <div className="adm-card" style={{ overflowX: "auto", padding: 6, minWidth: 0 }}>
      <table style={tableStyle}>
        <caption style={captionStyle}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col" style={headCell}>{head}</th>
            <th scope="col" style={numberHead}>Accounts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} style={rowLine}>
              <td style={cell}>{row.name}</td>
              <td style={numberCell}>{fmtCell(row.accounts)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
