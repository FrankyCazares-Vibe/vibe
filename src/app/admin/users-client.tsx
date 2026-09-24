"use client";

/**
 * The users tab: find someone, see where they stand, suspend, ban or lift.
 *
 * THE SEARCH TEXT NEVER TOUCHES THE URL. `q` can be a student's email address —
 * GET /api/admin/users matches an address EXACTLY against `email` and
 * `school_email` — and the route deliberately never logs or echoes it. Putting
 * it in `?q=` would undo that on our side: browser history, the Referer header
 * and the deploy's request logs all keep it. So it lives in component state,
 * and only `?tab=` is in the address bar.
 *
 * NO EMAIL COMES BACK, EITHER. You search by address and you get a handle: the
 * list route selects `id, handle, name, school_verified, created_at` and maps
 * out everything else. Nothing on this screen can show one.
 *
 * SUSPEND AND BAN BOTH NEED A REASON CODE — POST …/restrict answers 400 without
 * one — and the codes come from the single shared list, so the sentence the
 * student reads on /account/suspended is the one picked here. A bare day count
 * would file a restriction with no reason a student can read.
 */

import { useCallback, useState } from "react";

import { restrictionReasonOptions } from "@/lib/moderation/reports";

import {
  ActionButton,
  adminGet,
  adminPost,
  Badge,
  COLORS,
  Empty,
  fmtDay,
  inputStyle,
  labelStyle,
  Notice,
  shortId,
} from "./admin-shell";
import { type ApiRestriction, restrictionUntil, restrictionWord } from "./reports-client";

const RESTRICTION_OPTIONS = restrictionReasonOptions();

const STEP_WORDS: Record<string, string> = {
  app_metadata: "the sign-in mirror",
  auth_ban: "the sign-in block",
  billing: "their Vibe+ billing",
};

function incompleteLine(steps: string[] | undefined, applied: boolean): string {
  if (!steps || steps.length === 0) return "";
  const words = steps.map((s) => STEP_WORDS[s] ?? s);
  const list =
    words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  return applied
    ? ` The restriction is in force, but ${list} didn't finish — sort that part by hand.`
    : ` ${list} didn't finish — sort that part by hand.`;
}

type UserRowData = {
  id: string;
  handle: string | null;
  name: string | null;
  school_verified: boolean;
  restriction: ApiRestriction | null;
  restrictionKnown: boolean;
  openReportCount: number;
};

export function UsersClient() {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [users, setUsers] = useState<UserRowData[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pause, setPause] = useState<string | null>(null);

  const load = useCallback(async (q: string, cur: string | null) => {
    setLoading(true);
    const r = await adminGet<{ users?: UserRowData[]; next_cursor?: string | null }>(
      `/api/admin/users?limit=25${q ? `&q=${encodeURIComponent(q)}` : ""}` +
        (cur ? `&cursor=${encodeURIComponent(cur)}` : ""),
      "Couldn't run that search."
    );
    if (r.ok) {
      const incoming = r.data.users ?? [];
      setUsers((prev) => (cur ? [...prev, ...incoming] : incoming));
      setCursor(r.data.next_cursor ?? null);
      setErr(null);
      // A read got through, so whatever pause the write budget hit has passed.
      setPause(null);
    } else {
      setErr(r.message);
    }
    setLoading(false);
    setSearched(true);
  }, []);

  const patch = (id: string, next: Partial<UserRowData>) =>
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...next } : u)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <form
        className="adm-fields"
        onSubmit={(e) => {
          e.preventDefault();
          setCursor(null);
          void load(query.trim(), null);
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Handle, name, or the email they signed up with…"
          aria-label="Search students"
          autoComplete="off"
          style={{ ...inputStyle, flex: 1, minWidth: 220 }}
        />
        <ActionButton type="submit" tone="primary" busy={loading}>
          Search
        </ActionButton>
      </form>

      {pause ? <Notice tone="info">{pause}</Notice> : null}
      {err ? <Notice tone="error">{err}</Notice> : null}

      {/* Only say "nobody matches" when the search actually ran. */}
      {users.length === 0 && !loading && !err ? (
        <Empty>
          {searched
            ? "Nobody matches that. An email address has to match exactly; a handle or name doesn't."
            : "Search by handle, name, or the email they signed up with. What you type stays on this page — it never goes in the address bar."}
        </Empty>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {users.map((u) => (
            <UserCard key={u.id} user={u} onPatch={patch} onPause={setPause} />
          ))}
        </div>
      )}

      {cursor ? (
        <ActionButton busy={loading} onClick={() => void load(query.trim(), cursor)}>
          Load more
        </ActionButton>
      ) : null}
    </div>
  );
}

type Kind = "suspend" | "ban" | "lift";

/**
 * One student. The row cannot pre-grey Restrict for another platform admin —
 * the LIST route doesn't return `is_platform_admin`, only GET /api/admin/users/[id]
 * does — so the three 403s (`cannot_restrict_self`, `cannot_restrict_admin`,
 * `already_restricted`) are answered inline, in the route's own words.
 */
function UserCard({
  user,
  onPatch,
  onPause,
}: {
  user: UserRowData;
  onPatch: (id: string, next: Partial<UserRowData>) => void;
  onPause: (message: string) => void;
}) {
  const [form, setForm] = useState<Kind | null>(null);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [days, setDays] = useState("7");
  // Deliberately empty. A pre-filled picker is a plausible-looking answer
  // nobody has to touch, and the code it would file is the sentence the student
  // reads on /account/suspended and appeals against.
  const [reasonCode, setReasonCode] = useState<string>("");
  const [note, setNote] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const inForce = user.restrictionKnown && user.restriction !== null;
  const working = busy !== null;
  const who = user.handle ? `@${user.handle}` : `this account (${shortId(user.id)})`;

  const fell = (message: string, pause: boolean) => {
    setFailed(message);
    if (pause) onPause(message);
  };

  const doRestrict = async (kind: "suspend" | "ban") => {
    let n = 0;
    if (kind === "suspend") {
      n = Number.parseInt(days, 10);
      if (!Number.isFinite(n) || n < 1 || n > 365) {
        setFailed("How many days? Anything from 1 to 365.");
        return;
      }
    }
    if (!reasonCode) {
      setFailed("Pick the reason the student reads.");
      return;
    }
    setBusy(kind);
    setFailed(null);
    setSaid(null);
    const trimmed = note.trim();
    const r = await adminPost<{
      kind?: string;
      endsAt?: string | null;
      restrictionId?: string;
      incomplete?: string[];
      logged?: boolean;
    }>(
      `/api/admin/users/${encodeURIComponent(user.id)}/restrict`,
      {
        kind: kind === "ban" ? "ban" : "suspension",
        // `days` with a ban is a 400, so it is only ever sent for a suspension.
        ...(kind === "suspend" ? { days: n } : {}),
        reasonCode,
        ...(trimmed ? { note: trimmed.slice(0, 2000) } : {}),
      },
      kind === "ban" ? `Couldn't ban ${who}.` : `Couldn't suspend ${who}.`
    );
    if (r.ok) {
      const endsAt = r.data.endsAt ?? null;
      const appliedKind = r.data.kind ?? (kind === "ban" ? "ban" : "suspension");
      onPatch(user.id, {
        restrictionKnown: true,
        restriction: {
          id: r.data.restrictionId ?? "",
          kind: appliedKind,
          ends_at: endsAt,
          reason_code: reasonCode,
          starts_at: new Date().toISOString(),
        },
      });
      setSaid(
        (appliedKind === "ban" ? "Banned." : `Suspended until ${fmtDay(endsAt)}.`) +
          incompleteLine(r.data.incomplete, true) +
          (r.data.logged === false ? " The moderator log didn't record this one." : "")
      );
      setForm(null);
      setNote("");
    } else {
      fell(r.message, r.pause);
    }
    setBusy(null);
  };

  const doLift = async () => {
    setBusy("lift");
    setFailed(null);
    setSaid(null);
    const trimmed = note.trim();
    const r = await adminPost<{ lifted?: number; incomplete?: string[]; logged?: boolean }>(
      `/api/admin/users/${encodeURIComponent(user.id)}/lift`,
      trimmed ? { note: trimmed.slice(0, 2000) } : {},
      `Couldn't lift the restriction on ${who}.`
    );
    if (r.ok) {
      const lifted = r.data.lifted ?? 0;
      onPatch(user.id, { restriction: null, restrictionKnown: true });
      setSaid(
        (lifted > 0
          ? "Lifted. They can post again."
          : "Nothing was in force, so nothing was lifted.") +
          incompleteLine(r.data.incomplete, false) +
          // Lifting nothing writes no log row on purpose, so an absent one
          // there isn't a gap worth reporting.
          (r.data.logged === false && lifted > 0
            ? " The moderator log didn't record this one."
            : "")
      );
      setForm(null);
      setNote("");
    } else {
      fell(r.message, r.pause);
    }
    setBusy(null);
  };

  const restricted = restrictionWord(user.restriction, user.restrictionKnown);
  const until = restrictionUntil(user.restriction);
  const start = (kind: Kind) => {
    setForm((prev) => (prev === kind ? null : kind));
    setFailed(null);
  };

  return (
    <div className="adm-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {user.handle ? (
          <a
            href={`/profile/${user.handle}`}
            style={{
              fontFamily: "Fraunces, serif",
              fontWeight: 800,
              fontSize: 16,
              color: "#fff",
              textDecoration: "none",
            }}
          >
            @{user.handle}
          </a>
        ) : (
          <span style={{ fontWeight: 700 }}>{shortId(user.id)}</span>
        )}
        {user.name ? (
          <span style={{ color: COLORS.muted, fontSize: 13 }}>{user.name}</span>
        ) : null}
        <Badge color={user.school_verified ? COLORS.good : COLORS.faint}>
          {user.school_verified ? "school email verified" : "school email not verified"}
        </Badge>
        <Badge color={restricted.color}>{restricted.text}</Badge>
        {user.openReportCount > 0 ? (
          <Badge color={COLORS.accent}>
            {user.openReportCount} open {user.openReportCount === 1 ? "report" : "reports"}
          </Badge>
        ) : null}
      </div>

      {until ? <div style={{ fontSize: 12, color: COLORS.muted }}>{until}</div> : null}
      {!user.restrictionKnown ? (
        <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.5 }}>
          That read failed, so this row can&apos;t say where they stand. It does not mean
          they&apos;re free — check again before acting.
        </div>
      ) : null}

      <div className="adm-actions">
        <ActionButton
          disabled={working || inForce}
          title={inForce ? "Lift the current restriction first." : "Pause them for a set number of days."}
          onClick={() => start("suspend")}
        >
          Suspend
        </ActionButton>
        <ActionButton
          tone="danger"
          disabled={working || inForce}
          title={inForce ? "Lift the current restriction first." : "Close the account for good."}
          onClick={() => start("ban")}
        >
          Ban
        </ActionButton>
        <ActionButton
          // Enabled when the read failed: "we couldn't check" must not become
          // "you can't act". Greyed only when the row actually knows there is
          // nothing in force, so the click can't spend one of the 60 writes an
          // operator gets every ten minutes to be told nothing happened.
          disabled={working || (user.restrictionKnown && user.restriction === null)}
          title={
            user.restrictionKnown && user.restriction === null
              ? "Nothing is in force on this account."
              : "Clear whatever restriction is on this account."
          }
          onClick={() => start("lift")}
        >
          Lift
        </ActionButton>
      </div>

      {form ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: 12,
            borderRadius: 10,
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${COLORS.border}`,
          }}
        >
          {form === "suspend" ? (
            <div style={{ maxWidth: 180 }}>
              <label style={labelStyle} htmlFor={`${user.id}-days`}>
                Days (1–365)
              </label>
              <input
                id={`${user.id}-days`}
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                style={inputStyle}
              />
            </div>
          ) : null}

          {form === "suspend" || form === "ban" ? (
            <>
              <div>
                <label style={labelStyle} htmlFor={`${user.id}-code`}>
                  The reason the student reads
                </label>
                <select
                  id={`${user.id}-code`}
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                  style={inputStyle}
                >
                  <option value="" style={{ color: "#111" }}>
                    Pick the reason they&apos;ll read…
                  </option>
                  {RESTRICTION_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code} style={{ color: "#111" }}>
                      {o.line}
                    </option>
                  ))}
                </select>
              </div>
              {form === "ban" ? (
                <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.5 }}>
                  A ban has no end date, cancels their Vibe+ with no refund, and stops the
                  same school email being verified onto a new account.
                </div>
              ) : null}
            </>
          ) : null}

          <div>
            <label style={labelStyle} htmlFor={`${user.id}-note`}>
              Private note on the restriction (optional — the student never sees it)
            </label>
            <textarea
              id={`${user.id}-note`}
              value={note}
              rows={2}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              style={{ ...inputStyle, resize: "vertical" }}
            />
            {/* It is stored on `account_restrictions.note`, not in the log —
                `moderation_actions.meta` records only that a note exists. So
                the Log tab can never show it back. */}
            <div style={{ fontSize: 12, color: COLORS.faint, lineHeight: 1.5, marginTop: 5 }}>
              Only a moderator reading this account&apos;s history can see it — it
              doesn&apos;t show up on the Log tab.
            </div>
          </div>

          <div className="adm-actions">
            <ActionButton
              tone="primary"
              busy={busy === form}
              onClick={() => {
                if (form === "suspend") void doRestrict("suspend");
                else if (form === "ban") void doRestrict("ban");
                else void doLift();
              }}
            >
              {form === "suspend" ? "Suspend" : form === "ban" ? "Ban" : "Lift it"}
            </ActionButton>
            <ActionButton
              disabled={working}
              onClick={() => {
                setForm(null);
                setFailed(null);
              }}
            >
              Cancel
            </ActionButton>
          </div>
        </div>
      ) : null}

      {failed ? <Notice tone="error">{failed}</Notice> : null}
      {said ? <Notice tone="good">{said}</Notice> : null}
    </div>
  );
}
