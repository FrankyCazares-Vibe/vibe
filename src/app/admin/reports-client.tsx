"use client";

/**
 * The reports tab: the queue, grouped by the thing that was reported.
 *
 * WHAT THIS SCREEN REFUSES TO GUESS. `hiddenKnown: false` and
 * `restrictionKnown: false` both mean the read failed, never "visible" or "not
 * restricted" — they render as "couldn't check". That difference is what stops
 * someone being banned twice, so it is a rule here, not a styling choice.
 *
 * TWO BUTTONS, NOT THREE. "Remove and dismiss" isn't a thing wave 1 can do:
 * POST /api/admin/content/remove already closes the reports it answers, as
 * `actioned`, and a follow-up resolve would be a no-op that spends one of the
 * 60 writes an operator gets every ten minutes — all moderation writes share
 * one `admin-write:<id>` key. So: Remove (which closes them) and Dismiss.
 *
 * ONLY WHAT THE ROUTE CAN DO. Remove takes `post`, `comment` and `message`
 * only; a reported club, event, chat or person has no takedown in wave 1, and
 * a button that can only 404 is worse than no button. Suspend and Ban need an
 * owner, and a 1:1 or group chat has none.
 *
 * SUSPEND AND BAN ACT ON A PERSON, ALWAYS. For a reported `org` the queue's
 * `owner` is the club's owner_id, and for an `event` it is the creator_id — so
 * on those cards the buttons name the human they restrict. "Ban the author"
 * under a heading that reads "Reported club" is how a student gets banned for
 * a club description, with their Vibe+ cancelled and their school email locked
 * out of Vibe for good.
 *
 * THE SNAPSHOT IS THE MOST PRIVATE THING ON THIS PAGE — for a `message` target
 * it is somebody's DM. It is rendered here and nowhere else: never in a URL,
 * a share link or the page title.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  reportReasonLabel,
  reportTargetLabel,
  restrictionReasonOptions,
} from "@/lib/moderation/reports";

import {
  ActionButton,
  adminGet,
  adminPost,
  type AdminResult,
  Badge,
  COLORS,
  Empty,
  fmtDay,
  fmtWhen,
  inputStyle,
  labelStyle,
  Notice,
  shortId,
} from "./admin-shell";

/** The three things POST /api/admin/content/remove will take. Nothing else gets a Remove. */
const REMOVABLE = new Set(["post", "comment", "message"]);

export type QueueStatus = "open" | "actioned" | "dismissed";

const STATUSES: QueueStatus[] = ["open", "actioned", "dismissed"];

export type ApiRestriction = {
  id: string;
  kind: string;
  ends_at: string | null;
  reason_code: string | null;
  starts_at: string;
};

export type ReportGroupData = {
  target: {
    type: string;
    id: string;
    snapshot: Record<string, unknown> | null;
    live: { exists: boolean; removed: boolean; hidden: boolean; hiddenKnown: boolean };
  };
  owner: {
    id: string;
    handle: string | null;
    name: string | null;
    restriction: ApiRestriction | null;
    restrictionKnown: boolean;
  } | null;
  reports: Array<{
    id: string;
    reason: string;
    details: string;
    reporterHandle: string | null;
    createdAt: string;
  }>;
  openCount: number;
};

export function groupKey(g: ReportGroupData): string {
  return `${g.target.type}:${g.target.id}`;
}

/**
 * Paging is a keyset over REPORTS, not targets, so one target whose reports
 * straddle a page boundary comes back on both pages with the same list and the
 * same count. Keyed by type and id, the second copy collapses into the first.
 */
export function mergeGroups(
  prev: ReportGroupData[],
  next: ReportGroupData[]
): ReportGroupData[] {
  const seen = new Set(prev.map(groupKey));
  return [...prev, ...next.filter((g) => !seen.has(groupKey(g)))];
}

/** Whoever owns the reported thing, in words. Null means nobody does (a group chat). */
export function ownerLine(g: ReportGroupData): string {
  if (!g.owner) return "No one owns this one.";
  const handle = g.owner.handle ? `@${g.owner.handle}` : `someone (${shortId(g.owner.id)})`;
  return g.owner.name ? `${handle} · ${g.owner.name}` : handle;
}

/** A restriction in a word, and "couldn't check" when the read failed. */
export function restrictionWord(
  restriction: ApiRestriction | null,
  known: boolean
): { color: string; text: string } {
  if (!known) return { color: COLORS.unknown, text: "couldn't check" };
  if (!restriction) return { color: COLORS.good, text: "not restricted" };
  return restriction.kind === "ban"
    ? { color: COLORS.warn, text: "banned" }
    : { color: COLORS.warn, text: "suspended" };
}

/**
 * What Suspend and Ban are called on THIS card.
 *
 * The verb is the same everywhere; the noun is not. `owner` on a reported club
 * is the club's owner and on a reported event is whoever created it, so those
 * two say so and carry the handle on the control itself. A person's own card
 * needs no noun at all.
 */
export function restrictLabel(verb: "Suspend" | "Ban", g: ReportGroupData): string {
  const who = g.owner?.handle ? ` @${g.owner.handle}` : "";
  switch (g.target.type) {
    case "user":
      return verb;
    case "org":
      return `${verb} the club's owner${who}`;
    case "event":
      return `${verb} whoever created it${who}`;
    case "channel":
      return `${verb} whoever owns the chat${who}`;
    default:
      return `${verb} the author`;
  }
}

/** The one line under the badge that says how long, when there is a how long. */
export function restrictionUntil(restriction: ApiRestriction | null): string | null {
  if (!restriction) return null;
  if (restriction.kind === "ban") return "Banned — no end date.";
  return restriction.ends_at
    ? `Suspended until ${fmtDay(restriction.ends_at)}.`
    : "Suspended, with no end date recorded.";
}

/**
 * The evidence, as it was when the report was filed. An arbitrary jsonb, so
 * only keys we know are read and anything else is left alone rather than
 * dumped on screen.
 */
export function SnapshotBox({
  snapshot,
  liveOwnerHandle,
}: {
  snapshot: Record<string, unknown> | null;
  /** Who the route resolved as the owner NOW, for the one comparison worth making. */
  liveOwnerHandle?: string | null;
}) {
  if (!snapshot) {
    return (
      <div style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.6 }}>
        Nothing was captured — this was reported before Vibe started keeping a copy.
        Open the live thing if it is still there.
      </div>
    );
  }
  const str = (key: string): string =>
    typeof snapshot[key] === "string" ? (snapshot[key] as string) : "";
  const heading = str("title") || str("name") || (str("handle") ? `@${str("handle")}` : "");
  const body = str("content") || str("description") || str("bio") || str("tagline");
  const hasMedia = !!str("media_url") || !!str("media_thumbnail_url");
  // The snapshot records who owned the reported thing at the moment it was
  // reported. When that disagrees with the owner resolved now, the
  // disagreement is the interesting part — a club changing hands between the
  // report and the decision is exactly the case a moderator must not miss.
  const wasHandle = str("owner_handle");
  const wasName = str("owner_name");
  const moved = !!wasHandle && !!liveOwnerHandle && wasHandle !== liveOwnerHandle;
  return (
    <div style={{ fontSize: 13, lineHeight: 1.6 }}>
      {heading ? <div style={{ fontWeight: 700, marginBottom: 4 }}>{heading}</div> : null}
      {wasHandle || wasName ? (
        <div style={{ fontSize: 12, color: moved ? COLORS.warn : COLORS.faint, marginBottom: 6 }}>
          Captured as {wasHandle ? `@${wasHandle}` : "an account with no handle"}
          {wasName ? ` · ${wasName}` : ""}
          {moved ? ` — it belongs to @${liveOwnerHandle} now.` : ""}
        </div>
      ) : null}
      {body ? (
        <div
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 220,
            overflowY: "auto",
            color: COLORS.text,
          }}
        >
          {body}
        </div>
      ) : (
        <div style={{ color: COLORS.muted }}>No text was captured.</div>
      )}
      {hasMedia ? (
        <div style={{ marginTop: 6 }}>
          <Badge color={COLORS.unknown}>has media</Badge>
        </div>
      ) : null}
    </div>
  );
}

const EMPTY_LINE: Record<QueueStatus, string> = {
  open: "Nothing waiting. A report lands here the moment a student files one, and every platform admin gets an email.",
  actioned: "Nothing actioned yet. A report you answer with a takedown moves here.",
  dismissed: "Nothing dismissed yet. A report you decide is fine moves here.",
};

type QueuePage = AdminResult<{
  groups?: ReportGroupData[];
  next_cursor?: string | null;
}>;

/** The queue, plus the one thing its own answer can't tell us (below). */
type QueueRead = { page: QueuePage; notReady: boolean };

/**
 * IS THE MODERATION DATABASE UPDATE ON THIS DEPLOY?
 *
 * GET /api/admin/reports selects `status`, `target_owner_id` and
 * `target_snapshot`, which the moderation migration adds. Where it hasn't been
 * applied — production, today — every read of the queue is a 500, and the body
 * says `request_failed` exactly as it would for a database that is genuinely
 * unwell. The desk must not read one as the other: "Couldn't load the queue"
 * sends a founder hunting a fault that isn't there, and a soothing "not applied
 * yet" on a real outage is worse.
 *
 * GET /api/admin/users can tell them apart, because it was built to survive
 * this window: it answers 200 and reports every student as
 * `restrictionKnown: false`, which is what a service-role read of
 * `account_restrictions` — a table the SAME migration creates — looks like when
 * the table isn't there. Every student on the page unknown means the moderation
 * schema is missing. Anything else (a working read, no students at all, a
 * failed read) leaves the queue's 500 the real error it looks like.
 *
 * One extra read, only after a 500, on the 240-per-10-minutes budget.
 */
async function moderationSchemaMissing(): Promise<boolean> {
  const r = await adminGet<{ users?: Array<{ restrictionKnown?: boolean }> }>(
    "/api/admin/users?limit=5",
    "Couldn't check this deploy."
  );
  if (!r.ok) return false;
  const users = r.data.users ?? [];
  return users.length > 0 && users.every((u) => u.restrictionKnown === false);
}

async function fetchQueue(s: QueueStatus, cur: string | null): Promise<QueueRead> {
  const page: QueuePage = await adminGet(
    `/api/admin/reports?status=${s}&limit=25${cur ? `&cursor=${encodeURIComponent(cur)}` : ""}`,
    "Couldn't load the queue."
  );
  // Only a server error can be the missing update. A 401, a 403, a 429 and a
  // request that never arrived all mean what they say.
  if (page.ok || page.status < 500) return { page, notReady: false };
  return { page, notReady: await moderationSchemaMissing() };
}

export function ReportsClient() {
  const [status, setStatus] = useState<QueueStatus>("open");
  const [groups, setGroups] = useState<ReportGroupData[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  /** The queue can't be read because the database update isn't here yet. */
  const [notReady, setNotReady] = useState(false);
  const [pause, setPause] = useState<string | null>(null);

  /**
   * Which read is still allowed to paint.
   *
   * Press "Load more" on Open and then the Actioned chip while it is in
   * flight, and without this the chip's own page lands first and the older
   * page of OPEN groups is appended underneath the actioned list — with
   * nothing on screen to tell them apart, and Remove and Ban sitting on rows
   * from a queue the operator thinks they left. Every read takes a ticket and
   * only the newest one is applied.
   */
  const ticket = useRef(0);

  // Reading the answer is separate from asking for it, so the mount fetch can
  // hand its result in from a promise callback instead of setting state
  // synchronously inside the effect.
  const apply = useCallback((r: QueueRead, cur: string | null, mine: number) => {
    if (mine !== ticket.current) return;
    const { page } = r;
    if (page.ok) {
      const incoming = page.data.groups ?? [];
      setGroups((prev) => (cur ? mergeGroups(prev, incoming) : mergeGroups([], incoming)));
      setCursor(page.data.next_cursor ?? null);
      setErr(null);
      setNotReady(false);
      // A read got through, so whatever pause the write budget hit has passed.
      setPause(null);
    } else if (r.notReady) {
      // Not broken, just early: the panel below says so, and an error notice
      // beside it would be the desk contradicting itself.
      setErr(null);
      setNotReady(true);
    } else {
      setErr(page.message);
      setNotReady(false);
    }
    setLoading(false);
  }, []);

  const load = useCallback(
    async (s: QueueStatus, cur: string | null) => {
      const mine = (ticket.current += 1);
      setLoading(true);
      apply(await fetchQueue(s, cur), cur, mine);
    },
    [apply]
  );

  useEffect(() => {
    // Changing the status takes a new ticket, which is what drops a "Load
    // more" still in flight for the tab we just left.
    const mine = (ticket.current += 1);
    void fetchQueue(status, null).then((r) => apply(r, null, mine));
  }, [status, apply]);

  const patch = useCallback(
    (key: string, next: (g: ReportGroupData) => ReportGroupData) => {
      setGroups((prev) => prev.map((g) => (groupKey(g) === key ? next(g) : g)));
    },
    []
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="adm-actions">
        <div className="adm-nowrap-scroll" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STATUSES.map((s) => {
            const on = s === status;
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  if (s === status) return;
                  setStatus(s);
                  setCursor(null);
                  setPause(null);
                  setLoading(true);
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: on ? "1px solid rgba(255,180,150,0.55)" : `1px solid ${COLORS.border}`,
                  background: on
                    ? "linear-gradient(180deg, rgba(255,92,53,0.32) 0%, rgba(255,92,53,0.14) 100%)"
                    : COLORS.panel,
                  color: COLORS.text,
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: on ? 700 : 500,
                  cursor: "pointer",
                  textTransform: "capitalize",
                  whiteSpace: "nowrap",
                }}
              >
                {s}
              </button>
            );
          })}
        </div>
        <ActionButton busy={loading} onClick={() => void load(status, null)}>
          Refresh
        </ActionButton>
      </div>

      {pause ? <Notice tone="info">{pause}</Notice> : null}
      {/* The database update hasn't reached this deploy. Nothing is wrong and
          nothing is lost, so this is not an error — but it does say which
          reports a student can't file yet, because a founder reading "reports
          are still being filed" will otherwise wonder why a reported comment
          never turned up. */}
      {notReady ? (
        <Notice tone="info">
          The database update this queue reads hasn&apos;t been applied to this deploy yet,
          so there is nothing here to read. Students can still report a post, a person, a
          message or a chat and every one of those is kept — a comment, a club or an event
          is the exception, and they&apos;re told to try again after the update. The queue
          fills the moment it lands.
        </Notice>
      ) : null}
      {err ? <Notice tone="error">{err}</Notice> : null}

      {/* "Nothing waiting" is only true when the read worked. On production
          today the queue answers 500 until the moderation migration lands
          there, and an empty state beside that error would be a lie. */}
      {groups.length === 0 && !loading && !err && !notReady ? (
        <Empty>{EMPTY_LINE[status]}</Empty>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {groups.map((g) => (
            <ReportGroup
              key={groupKey(g)}
              group={g}
              status={status}
              onPatch={patch}
              onPause={(m) => setPause(m)}
            />
          ))}
        </div>
      )}

      {loading && groups.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13 }}>Loading the queue…</div>
      ) : null}

      {cursor ? (
        <ActionButton busy={loading} onClick={() => void load(status, cursor)}>
          Load more
        </ActionButton>
      ) : null}
    </div>
  );
}

type FormKind = "remove" | "dismiss" | "suspend" | "ban";

/** The picker's codes come from the one list the whole app shares. */
const RESTRICTION_OPTIONS = restrictionReasonOptions();

/**
 * A restrict can land the rows and still miss a follow-up step. That is a 200,
 * not an error: the student IS restricted, and the operator needs to know which
 * step to finish rather than being told it failed.
 */
const STEP_WORDS: Record<string, string> = {
  app_metadata: "the sign-in mirror",
  auth_ban: "the sign-in block",
  billing: "their Vibe+ billing",
};

function incompleteLine(steps: string[] | undefined): string {
  if (!steps || steps.length === 0) return "";
  const words = steps.map((s) => STEP_WORDS[s] ?? s);
  const list =
    words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  return ` The restriction is in force, but ${list} didn't finish — sort that part by hand.`;
}

function closedLine(n: number): string {
  if (n === 0) return "No reports were open on it.";
  return `${n} ${n === 1 ? "report" : "reports"} closed.`;
}

function ReportGroup({
  group,
  status,
  onPatch,
  onPause,
}: {
  group: ReportGroupData;
  /** Which tab this card came off. Dismiss only makes sense on the open one. */
  status: QueueStatus;
  onPatch: (key: string, next: (g: ReportGroupData) => ReportGroupData) => void;
  onPause: (message: string) => void;
}) {
  const key = groupKey(group);
  const [form, setForm] = useState<FormKind | null>(null);
  const [busy, setBusy] = useState<FormKind | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState("7");
  // Deliberately empty: a pre-filled picker is a plausible-looking answer
  // nobody has to touch, and this code is the sentence the student reads on
  // /account/suspended and appeals against.
  const [reasonCode, setReasonCode] = useState<string>("");
  const [said, setSaid] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const start = (kind: FormKind) => {
    setForm((prev) => (prev === kind ? null : kind));
    setFailed(null);
  };

  const after = (result: { ok: boolean; message?: string; pause?: boolean }) => {
    setBusy(null);
    if (!result.ok && result.message) {
      setFailed(result.message);
      if (result.pause) onPause(result.message);
    }
  };

  const doRemove = async () => {
    const text = reason.trim();
    if (!text) {
      // The helper text under this box says who reads it, and for a post or a
      // comment that is now the student themselves (J1 put `removed_reason` on
      // the wire). Kept short here so the refusal doesn't get ahead of the line
      // it is refusing against for a reported message, where nothing shows it.
      setFailed("Write the reason first — it's stored with the takedown.");
      return;
    }
    setBusy("remove");
    setFailed(null);
    setSaid(null);
    const r = await adminPost<{ changed?: boolean; resolvedReports?: number; logged?: boolean }>(
      "/api/admin/content/remove",
      { type: group.target.type, id: group.target.id, reason: text.slice(0, 500) },
      "Couldn't remove that."
    );
    if (r.ok) {
      const closed = r.data.resolvedReports ?? 0;
      onPatch(key, (g) => ({
        ...g,
        target: { ...g.target, live: { ...g.target.live, removed: true } },
        // Remove names no ids, so it closes EVERY open report on this content.
        // On the open tab that is every report listed under the card; leaving
        // them on screen with their reasons reads as if nothing happened.
        ...(status === "open" ? { reports: [] } : {}),
        openCount: Math.max(0, g.openCount - closed),
      }));
      setSaid(
        `${r.data.changed ? "Removed." : "It was already removed, so nothing changed."} ${closedLine(closed)}` +
          (r.data.logged === false ? " The moderator log didn't record this one." : "")
      );
      setForm(null);
      setReason("");
    }
    after(r.ok ? { ok: true } : { ok: false, message: r.message, pause: r.pause });
  };

  const doDismiss = async () => {
    const ids = group.reports.map((x) => x.id).slice(0, 100);
    if (ids.length === 0) {
      setFailed("There are no reports on this one to dismiss.");
      return;
    }
    setBusy("dismiss");
    setFailed(null);
    setSaid(null);
    const trimmed = note.trim();
    const r = await adminPost<{
      resolved?: number;
      unchanged?: number;
      missing?: number;
      logged?: boolean;
    }>(
      "/api/admin/reports/resolve",
      {
        reportIds: ids,
        resolution: "dismissed",
        ...(trimmed ? { note: trimmed.slice(0, 2000) } : {}),
      },
      "Couldn't dismiss those reports."
    );
    if (r.ok) {
      const resolved = r.data.resolved ?? 0;
      const unchanged = r.data.unchanged ?? 0;
      const missing = r.data.missing ?? 0;
      const sent = new Set(ids);
      const left = Math.max(0, group.openCount - resolved);
      onPatch(key, (g) => ({
        ...g,
        // The rows we just closed stop being listed. Left on screen they read
        // as if the button did nothing, and the obvious next press is a second
        // write against the shared 60-per-10-minutes budget for `unchanged: 5`.
        reports: g.reports.filter((x) => !sent.has(x.id)),
        openCount: left,
      }));
      setSaid(
        `${resolved} dismissed.` +
          (unchanged > 0 ? ` ${unchanged} ${unchanged === 1 ? "was" : "were"} already closed.` : "") +
          (missing > 0 ? ` ${missing} no longer ${missing === 1 ? "exists" : "exist"}.` : "") +
          (left > 0
            ? ` ${left} more ${left === 1 ? "is" : "are"} still open on this one — refresh and dismiss again.`
            : "")
      );
      setForm(null);
      setNote("");
    }
    after(r.ok ? { ok: true } : { ok: false, message: r.message, pause: r.pause });
  };

  const doRestrict = async (kind: "suspend" | "ban") => {
    const owner = group.owner;
    if (!owner) return;
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
      `/api/admin/users/${encodeURIComponent(owner.id)}/restrict`,
      {
        // A ban must not carry `days` at all — the route answers 400 for it.
        kind: kind === "ban" ? "ban" : "suspension",
        ...(kind === "suspend" ? { days: n } : {}),
        reasonCode,
        ...(trimmed ? { note: trimmed.slice(0, 2000) } : {}),
      },
      kind === "ban" ? "Couldn't ban that account." : "Couldn't suspend that account."
    );
    if (r.ok) {
      const endsAt = r.data.endsAt ?? null;
      const appliedKind = r.data.kind ?? (kind === "ban" ? "ban" : "suspension");
      onPatch(key, (g) =>
        g.owner
          ? {
              ...g,
              owner: {
                ...g.owner,
                restrictionKnown: true,
                restriction: {
                  id: r.data.restrictionId ?? "",
                  kind: appliedKind,
                  ends_at: endsAt,
                  reason_code: reasonCode,
                  starts_at: new Date().toISOString(),
                },
              },
            }
          : g
      );
      setSaid(
        (appliedKind === "ban" ? "Banned." : `Suspended until ${fmtDay(endsAt)}.`) +
          incompleteLine(r.data.incomplete) +
          (r.data.logged === false ? " The moderator log didn't record this one." : "")
      );
      setForm(null);
      setNote("");
    }
    after(r.ok ? { ok: true } : { ok: false, message: r.message, pause: r.pause });
  };

  const t = group.target;
  const restricted = group.owner
    ? restrictionWord(group.owner.restriction, group.owner.restrictionKnown)
    : null;
  const until = group.owner ? restrictionUntil(group.owner.restriction) : null;
  const working = busy !== null;
  // A second restriction is a guaranteed 403 `already_restricted`, and the
  // route rate-limits BEFORE it checks — so the refusal still costs one of the
  // 60 writes an operator gets every ten minutes. `restrictionKnown: false`
  // leaves both buttons live: "we couldn't check" must not become "you can't act".
  const inForce = !!group.owner?.restrictionKnown && group.owner?.restriction !== null;
  // Only the open tab holds report ids that dismissing would actually change.
  const canDismiss = status === "open" && group.reports.length > 0;
  const beyondPage = status === "open" ? Math.max(0, group.openCount - group.reports.length) : 0;

  return (
    <div className="adm-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "Fraunces, serif", fontWeight: 800, fontSize: 16 }}>
          Reported {reportTargetLabel(t.type)}
        </span>
        <Badge color={group.openCount > 0 ? COLORS.accent : COLORS.faint}>
          {group.openCount} open
        </Badge>
        {!t.live.exists ? <Badge color={COLORS.warn}>gone</Badge> : null}
        {t.live.removed ? <Badge color={COLORS.warn}>already removed</Badge> : null}
        {t.type === "user" ? (
          t.live.hiddenKnown ? (
            t.live.hidden ? <Badge color={COLORS.warn}>restricted</Badge> : null
          ) : (
            <Badge color={COLORS.unknown}>couldn&apos;t check</Badge>
          )
        ) : t.live.hidden ? (
          <Badge color={COLORS.unknown}>already out of sight</Badge>
        ) : null}
      </div>

      <div style={{ fontSize: 12, color: COLORS.muted, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span>
          {group.owner?.handle ? (
            <a
              href={`/profile/${group.owner.handle}`}
              style={{ color: COLORS.text, textDecoration: "none", fontWeight: 600 }}
            >
              @{group.owner.handle}
            </a>
          ) : (
            ownerLine(group)
          )}
          {group.owner?.handle && group.owner.name ? ` · ${group.owner.name}` : ""}
        </span>
        {restricted ? (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <Badge color={restricted.color}>{restricted.text}</Badge>
          </>
        ) : null}
        {until ? (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{until}</span>
          </>
        ) : null}
        <span style={{ opacity: 0.4 }}>·</span>
        <span>id {shortId(t.id)}</span>
      </div>

      <div
        style={{
          padding: 12,
          borderRadius: 10,
          background: "rgba(0,0,0,0.25)",
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <SnapshotBox snapshot={t.snapshot} liveOwnerHandle={group.owner?.handle ?? null} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {group.reports.map((x) => (
          <div key={x.id} style={{ fontSize: 13, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700 }}>{reportReasonLabel(x.reason)}</span>
            <span style={{ color: COLORS.muted }}>
              {" · "}
              {/* A reporter gives up their handle and nothing else, and it is
                  never a link: nothing here joins it back to a lookup. */}
              {x.reporterHandle ? `@${x.reporterHandle}` : "an account that's gone"}
              {" · "}
              {fmtWhen(x.createdAt)}
            </span>
            {x.details ? (
              <div
                style={{
                  color: COLORS.muted,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                “{x.details}”
              </div>
            ) : null}
          </div>
        ))}
        {group.reports.length >= 20 ? (
          <div style={{ fontSize: 12, color: COLORS.faint }}>
            Showing the 20 newest. The count above is all of them.
          </div>
        ) : null}
      </div>

      {/* Said before the buttons, because for a club or an event the buttons
          below act on a PERSON and this is the sentence that sets that up. */}
      {!REMOVABLE.has(t.type) ? (
        <div style={{ fontSize: 12, color: COLORS.faint, lineHeight: 1.5 }}>
          {t.type === "org"
            ? "There's no takedown for a club here — hide it from the Clubs tab. The buttons below restrict the person who owns it, not the club."
            : t.type === "event"
              ? "There's no takedown for an event here. The buttons below restrict whoever created it, not the event."
              : t.type === "user"
                ? "A person isn't taken down. Suspend or ban the account."
                : "There's no takedown for this one yet. Dismiss it, or act on whoever owns it."}
        </div>
      ) : null}

      <div className="adm-actions">
        {REMOVABLE.has(t.type) ? (
          <ActionButton
            tone="danger"
            disabled={working || !t.live.exists}
            title={
              !t.live.exists
                ? "The row is gone from the database, so there's nothing left to remove."
                : "Takes it down and closes the reports about it."
            }
            onClick={() => start("remove")}
          >
            Remove
          </ActionButton>
        ) : null}
        {canDismiss ? (
          <ActionButton disabled={working} onClick={() => start("dismiss")}>
            Dismiss
          </ActionButton>
        ) : null}
        {group.owner ? (
          <>
            <ActionButton
              disabled={working || inForce}
              title={
                inForce
                  ? "Lift the current restriction first."
                  : "Pause this person for a set number of days."
              }
              onClick={() => start("suspend")}
            >
              {restrictLabel("Suspend", group)}
            </ActionButton>
            <ActionButton
              tone="danger"
              disabled={working || inForce}
              title={
                inForce
                  ? "Lift the current restriction first."
                  : "Close this person's account for good."
              }
              onClick={() => start("ban")}
            >
              {restrictLabel("Ban", group)}
            </ActionButton>
          </>
        ) : null}
      </div>

      {/* `reports[]` is capped at 20 and filtered to this tab, while
          `openCount` counts every open report on the target. Dismiss can only
          close the ids it holds, and silently leaving the rest open is how a
          queue looks clear when it isn't. */}
      {canDismiss && beyondPage > 0 ? (
        <div style={{ fontSize: 12, color: COLORS.faint, lineHeight: 1.5 }}>
          Dismiss closes the {group.reports.length} shown here. {beyondPage} more{" "}
          {beyondPage === 1 ? "is" : "are"} still open on this one — refresh and dismiss
          again.
        </div>
      ) : null}
      {status === "open" && group.reports.length === 0 && group.openCount > 0 ? (
        <div style={{ fontSize: 12, color: COLORS.faint, lineHeight: 1.5 }}>
          {group.openCount} more {group.openCount === 1 ? "report is" : "reports are"} still
          open on this one. Refresh to bring them in.
        </div>
      ) : null}

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
          {form === "remove" ? (
            <div>
              <label style={labelStyle} htmlFor={`${key}-reason`}>
                Why it&apos;s coming down (kept on the record)
              </label>
              <textarea
                id={`${key}-reason`}
                value={reason}
                rows={3}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Say it the way you would say it to them."
                style={{ ...inputStyle, resize: "vertical" }}
              />
              {/* A post and a comment now carry the reason to their author:
                  the feed, the post, the profile grid and the thread all send
                  `removed_reason` back to the one person who can still see the
                  row. A message doesn't — GET /api/me/threads/[id]/messages
                  still selects a column list without it — and telling a
                  moderator their words are being read when they aren't is
                  exactly the promise this line must not make. */}
              <div style={{ fontSize: 12, color: COLORS.faint, lineHeight: 1.5, marginTop: 5 }}>
                It&apos;s stored with the takedown.{" "}
                {t.type === "message"
                  ? "The sender will be shown it once the removed-message notice ships."
                  : `The student reads it on the removed ${t.type === "comment" ? "comment" : "post"}, and nobody else does.`}
              </div>
            </div>
          ) : null}

          {form === "suspend" ? (
            <div style={{ maxWidth: 180 }}>
              <label style={labelStyle} htmlFor={`${key}-days`}>
                Days (1–365)
              </label>
              <input
                id={`${key}-days`}
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
                <label style={labelStyle} htmlFor={`${key}-code`}>
                  The reason the student reads
                </label>
                <select
                  id={`${key}-code`}
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
              {/* The card is headed by the reported thing; the restriction is
                  not. Name the account it lands on, right above the button. */}
              {t.type !== "user" ? (
                <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.5 }}>
                  This is an account restriction. It lands on{" "}
                  <strong>{ownerLine(group)}</strong> — the person — and not on the{" "}
                  {reportTargetLabel(t.type)} that was reported.
                </div>
              ) : null}
              {form === "ban" ? (
                <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.5 }}>
                  A ban has no end date, cancels their Vibe+ with no refund, and stops the
                  same school email being verified onto a new account.
                </div>
              ) : null}
            </>
          ) : null}

          {/* Two different notes with two different homes. Dismiss's note goes
              to `moderation_actions.reason`, which the Log tab prints back. A
              restrict's goes to `account_restrictions.note`, which only that
              account's history shows — the log records `has_note` and nothing
              more. Calling both "note for the log" is how a moderator writes
              "third strike, see the DM from 9/14" and never reads it again. */}
          {form !== "remove" ? (
            <div>
              <label style={labelStyle} htmlFor={`${key}-note`}>
                {form === "dismiss"
                  ? "Note for the log (optional — the student never sees it)"
                  : "Private note on the restriction (optional — the student never sees it)"}
              </label>
              <textarea
                id={`${key}-note`}
                value={note}
                rows={2}
                maxLength={2000}
                onChange={(e) => setNote(e.target.value)}
                style={{ ...inputStyle, resize: "vertical" }}
              />
              {form === "dismiss" ? null : (
                <div style={{ fontSize: 12, color: COLORS.faint, lineHeight: 1.5, marginTop: 5 }}>
                  Only a moderator reading this account&apos;s history can see it — it
                  doesn&apos;t show up on the Log tab.
                </div>
              )}
            </div>
          ) : null}

          <div className="adm-actions">
            <ActionButton
              tone="primary"
              busy={busy === form}
              onClick={() => {
                if (form === "remove") void doRemove();
                else if (form === "dismiss") void doDismiss();
                else if (form === "suspend") void doRestrict("suspend");
                else if (form === "ban") void doRestrict("ban");
              }}
            >
              {form === "remove"
                ? "Remove it"
                : form === "dismiss"
                  ? "Dismiss the reports"
                  : form === "suspend"
                    ? "Suspend"
                    : "Ban"}
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
