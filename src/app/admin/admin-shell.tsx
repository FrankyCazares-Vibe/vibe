"use client";

/**
 * The moderation desk's chrome, and the small parts every tab is drawn with.
 *
 * WHY THE SHELL OWNS THE SURFACE. /admin is its own dark page — no LeftNav, no
 * MobileShell — and before wave 2 the club list carried that surface itself.
 * Four tabs later that would be four copies of the same header, back row and
 * colour table, drifting apart one tab at a time. The shell holds it once and
 * the tabs hold only their own rows.
 *
 * THE TAB IS IN THE URL (`?tab=…`) AND NOTHING ELSE IS. A page you can link a
 * cofounder to is worth the address bar; a cursor, an in-flight action and
 * above all the users search are not. `q` can be a student's email address, and
 * the URL is the one place that would carry it into browser history, the
 * Referer header and the deploy's request logs — which is exactly what
 * GET /api/admin/users refuses to log on its own side.
 *
 * NOT IMPORTED FROM HERE: anything `server-only`. This file and every tab is a
 * client component, so `@/lib/moderation/reports` (pure) is fine and
 * `access.ts`, `actions.ts` and `require-platform-admin.ts` are not.
 */

import Link from "next/link";

import { vibeRequest } from "@/lib/feedback/request";

export type AdminTab = "reports" | "clubs" | "users" | "log";

export const COLORS = {
  bg: "#0F0D17",
  text: "#F5F1E9",
  muted: "rgba(245,241,233,0.6)",
  faint: "rgba(245,241,233,0.4)",
  panel: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.1)",
  accent: "#FF5C35",
  verified: "#F0C84A",
  warn: "#E84D4D",
  unknown: "#9B7BFF",
  good: "#6FD08C",
} as const;

const TABS: Array<{ key: AdminTab; label: string; title: string; blurb: string }> = [
  {
    key: "reports",
    label: "Reports",
    title: "Reports",
    blurb:
      "What students flagged, grouped by the thing they reported — five reports on one post is one decision, not five.",
  },
  {
    key: "clubs",
    label: "Clubs",
    title: "Clubs",
    blurb:
      "Verify legit clubs to surface them above community-created ones in Discover. Verified clubs are exempt from dormancy decay. Hiding takes a club out of sight for everyone but its members.",
  },
  {
    key: "users",
    label: "Users",
    title: "Users",
    blurb:
      "Look someone up by handle, name or email address. Search stays on this page — it never goes in the address bar.",
  },
  {
    key: "log",
    label: "Log",
    title: "Moderator log",
    blurb:
      "The last 50 things a moderator did, newest first. The log can't be edited or deleted by anyone, including us.",
  },
];

/** Times read in Indiana, the way /account/suspended writes them. */
const WHEN = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Indiana/Indianapolis",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Indiana/Indianapolis",
  month: "long",
  day: "numeric",
  year: "numeric",
});

/** A timestamp with the time on it. An unparseable one says so rather than "Invalid Date". */
export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "unknown" : WHEN.format(ms);
}

/** A date with no clock on it — for "suspended until". */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "unknown" : DAY.format(ms);
}

export function fmtRelative(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(mo / 12);
  return `${yr}y ago`;
}

/**
 * The first chunk of a uuid, for the one place a name is not available: a
 * content takedown in the log carries `meta.author_id` and no handle, and
 * GET /api/admin/actions resolves no handle for `targetId`. A shortened id is
 * honest; a guessed handle would not be.
 */
export function shortId(id: string | null | undefined): string {
  if (!id) return "unknown";
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

/* ---------------------------------------------------------------- calling */

export type AdminResult<T> =
  | { ok: true; data: T }
  /**
   * `status` is the HTTP status the route answered with (0 when the request
   * never got there). A tab reads it to tell a refusal it can explain — a 403
   * `already_restricted`, a 429 — from a 500, which is the server saying only
   * "Request failed": the reports queue answers a database that is missing the
   * moderation migration and a database that is genuinely unwell with the same
   * body, and the reports tab asks a second question before it decides which
   * it is looking at.
   */
  | { ok: false; message: string; pause: boolean; status: number };

/**
 * Is this the server talking to a person, or a code?
 *
 * The admin API answers `{ok:false, error, code}` and the useful half is
 * usually `error`: "That account is already banned. Lift it first if you want
 * to change it.", "Restrictions aren't set up on this deploy yet. Nothing was
 * changed.", "Slow down a moment." None of those are in
 * src/lib/feedback/failure-copy.ts and none may be added there — that table is
 * written to students, and this screen is not a student. So the route's own
 * sentence is shown here when it IS a sentence, and `describeFailure`'s mapped
 * line ("You've been signed out…") is shown when the body only says
 * "Unauthorized" or "Request failed".
 */
function isSentence(value: string | null): boolean {
  if (!value) return false;
  const t = value.trim();
  return t.length > 12 && /\s/.test(t) && /[.!?]$/.test(t);
}

async function run<T>(
  url: string,
  failure: string,
  init: { method?: string; json?: unknown },
): Promise<AdminResult<T>> {
  const r = await vibeRequest<T>(url, {
    failure,
    quiet: true, // Every refusal is rendered inline, next to the thing it refused.
    ...(init.method ? { method: init.method } : {}),
    ...(init.json === undefined ? {} : { json: init.json }),
  });
  if (r.ok) return { ok: true, data: r.data };
  const sentence = r.error;
  return {
    ok: false,
    message: isSentence(sentence) && sentence ? sentence.trim() : r.message,
    // A 429 is shared across every moderation write (one `admin-write:<id>`
    // key, 60 per 10 minutes), so it isn't this button's fault and it won't be
    // fixed by pressing it again. The shell shows it as a pause.
    pause: r.status === 429,
    status: r.status,
  };
}

export function adminGet<T>(url: string, failure: string): Promise<AdminResult<T>> {
  return run<T>(url, failure, {});
}

export function adminPost<T>(
  url: string,
  json: unknown,
  failure: string,
): Promise<AdminResult<T>> {
  return run<T>(url, failure, { method: "POST", json });
}

/* ---------------------------------------------------------------- pieces */

export const inputStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.panel,
  color: COLORS.text,
  fontFamily: "inherit",
  fontSize: 14,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

export const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: COLORS.faint,
  marginBottom: 5,
};

function rgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color,
        background: rgba(color, 0.18),
        border: `1px solid ${rgba(color, 0.4)}`,
      }}
    >
      {children}
    </span>
  );
}

/** An inline sentence about what just happened. Never a toast: the desk needs it next to the row. */
export function Notice({
  tone = "error",
  children,
}: {
  tone?: "error" | "info" | "good";
  children: React.ReactNode;
}) {
  const color =
    tone === "error" ? COLORS.warn : tone === "good" ? COLORS.good : COLORS.unknown;
  return (
    <div
      // A refusal is assertive: `role="status"` is a polite live region, and a
      // 403 `already_restricted` or a 503 queued behind whatever else is
      // speaking reads to a screen reader as the button having done nothing.
      role={tone === "error" ? "alert" : "status"}
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        background: rgba(color, 0.16),
        border: `1px solid ${rgba(color, 0.4)}`,
        color: COLORS.text,
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

/**
 * One moderation action. `busy` is a real disabled state plus `aria-busy`, so a
 * second press can't fire a second write against the shared 60-per-10-minutes
 * budget, and a screen reader hears that something is in flight.
 */
export function ActionButton({
  children,
  onClick,
  busy = false,
  disabled = false,
  tone = "plain",
  title,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: "plain" | "danger" | "primary";
  title?: string;
  type?: "button" | "submit";
}) {
  const color =
    tone === "danger" ? COLORS.warn : tone === "primary" ? COLORS.accent : null;
  const off = busy || disabled;
  return (
    <button
      type={type}
      className="adm-btn"
      title={title}
      aria-busy={busy || undefined}
      disabled={off}
      onClick={onClick}
      style={{
        padding: "8px 14px",
        borderRadius: 10,
        border: `1px solid ${color ? rgba(color, 0.5) : COLORS.border}`,
        background: color
          ? `linear-gradient(180deg, ${rgba(color, 0.3)} 0%, ${rgba(color, 0.12)} 100%)`
          : COLORS.panel,
        color: COLORS.text,
        fontFamily: "inherit",
        fontWeight: 700,
        fontSize: 12,
        cursor: off ? "default" : "pointer",
        opacity: off ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

/** What an empty list says: not "nothing here", but what would put something here. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 28,
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 14,
        color: COLORS.muted,
        textAlign: "center",
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}

/**
 * One column below 640px, everywhere. Inline styles can't carry a media query,
 * so the handful of rules that have to change with the viewport live here and
 * the tabs reach them by class name.
 */
const CSS = `
.adm-wrap { padding: 32px 24px; }
.adm-inner { max-width: 1100px; margin: 0 auto; }
.adm-card {
  padding: 14px; border-radius: 14px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
}
/* Centred on a wide row, stacked and full-width below 640px. It lives here
   rather than in an inline \`style\`, because an inline attribute beats a
   stylesheet rule and would leave the phone rule below half-applied. */
.adm-split { display: flex; align-items: center; gap: 14px; }
.adm-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.adm-fields { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
.adm-btn { white-space: nowrap; }
@media (max-width: 640px) {
  .adm-wrap { padding: 20px 14px; }
  .adm-split { flex-direction: column; align-items: stretch; }
  .adm-actions { flex-direction: column; align-items: stretch; }
  .adm-fields { flex-direction: column; align-items: stretch; }
  .adm-actions > .adm-btn { width: 100%; }
  .adm-nowrap-scroll { overflow-x: auto; }
}
`;

export function AdminShell({
  tab,
  adminName,
  children,
}: {
  tab: AdminTab;
  adminName: string;
  children: React.ReactNode;
}) {
  const active = TABS.find((t) => t.key === tab) ?? TABS[0];
  return (
    <div
      className="adm-wrap"
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(120% 80% at 0% 0%, rgba(40,30,60,0.55) 0%, rgba(40,30,60,0) 60%), " +
          "linear-gradient(180deg, #0F0D17 0%, #14111E 50%, #0F0D17 100%)",
        color: COLORS.text,
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <style>{CSS}</style>
      <div className="adm-inner">
        {/* Admin is its own dark surface, so the LeftNav doesn't render here.
            An explicit "← Campus" gives a way back without the browser button. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 18,
            fontSize: 12,
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/campus"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 13px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: COLORS.text,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            ← Campus
          </Link>
          <Link href="/profile" style={{ color: COLORS.muted, textDecoration: "none", fontWeight: 500 }}>
            Profile
          </Link>
          <Link href="/network" style={{ color: COLORS.muted, textDecoration: "none", fontWeight: 500 }}>
            Network
          </Link>
          <Link href="/settings" style={{ color: COLORS.muted, textDecoration: "none", fontWeight: 500 }}>
            Settings
          </Link>
        </div>

        <header style={{ marginBottom: 18 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#FFB89C",
              marginBottom: 6,
            }}
          >
            Platform admin · {adminName}
          </div>
          <h1
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: "-1px",
              margin: 0,
            }}
          >
            {active.title}
          </h1>
          <p style={{ marginTop: 6, color: COLORS.muted, fontSize: 14, lineHeight: 1.55 }}>
            {active.blurb}
          </p>
        </header>

        <nav
          aria-label="Moderation sections"
          className="adm-nowrap-scroll"
          style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}
        >
          {TABS.map((t) => {
            const on = t.key === active.key;
            return (
              <Link
                key={t.key}
                href={`/admin?tab=${t.key}`}
                aria-current={on ? "page" : undefined}
                style={{
                  padding: "8px 16px",
                  borderRadius: 999,
                  border: on ? "1px solid rgba(255,180,150,0.55)" : `1px solid ${COLORS.border}`,
                  background: on
                    ? "linear-gradient(180deg, rgba(255,92,53,0.32) 0%, rgba(255,92,53,0.14) 100%)"
                    : COLORS.panel,
                  color: COLORS.text,
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: on ? 700 : 500,
                  whiteSpace: "nowrap",
                }}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </div>
  );
}
