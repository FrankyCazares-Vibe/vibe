"use client";

/**
 * The log tab: the last 50 things a moderator did, newest first.
 *
 * WHY IT IS HERE. `is_platform_admin` is set by hand in SQL and hands one
 * person the power to take anyone's posts down. `moderation_actions` is the
 * only record of that, and it is append-only — no client grants, no policies,
 * and a trigger that refuses UPDATE and DELETE — so a wrong row can never be
 * quietly fixed, including by us.
 *
 * WHAT IT CANNOT SAY, AND DOESN'T PRETEND TO. GET /api/admin/actions resolves
 * a handle for the MODERATOR and for nobody else. A restrict or a lift carries
 * `meta.handle` for the person it was about; a content takedown carries only
 * `meta.author_id`. So a takedown reads as "a post (3f2a…)", with the author's
 * id and no name — a guessed handle in a log is worse than a short id.
 *
 * `meta` on a restriction carries `has_note`, never the note: the note is
 * private to the admin who wrote it and lives on the restriction row.
 */

import { useCallback, useEffect, useState } from "react";

import {
  type ImageSlot,
  imageSlotLabel,
  isImageSlot,
  isImageTargetType,
} from "@/lib/moderation/media-quarantine-images";
import { restrictionReasonLine } from "@/lib/moderation/reports";

import {
  ActionButton,
  adminGet,
  adminPost,
  type AdminResult,
  COLORS,
  Empty,
  fmtDay,
  fmtWhen,
  Notice,
  shortId,
} from "./admin-shell";

type ActionRow = {
  id: string;
  actorId: string | null;
  actorHandle: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reportId: string | null;
  reason: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

/** Every action the log can hold, in the words a person would use. */
const VERBS: Record<string, string> = {
  report_action: "closed reports on",
  report_dismiss: "dismissed reports on",
  post_remove: "removed",
  post_restore: "restored",
  comment_remove: "removed",
  comment_restore: "restored",
  message_remove: "removed",
  message_restore: "restored",
  org_hide: "hid",
  org_unhide: "unhid",
  org_verify: "verified",
  org_unverify: "unverified",
  user_suspend: "suspended",
  user_ban: "banned",
  user_lift: "lifted the restriction on",
  image_remove: "took down a photo on",
  image_restore: "put back a photo on",
  waitlist_invite: "sent an access code to",
  waitlist_add: "added",
  waitlist_remove: "removed",
  waitlist_reveal: "looked at the email address of",
};

const TYPE_WORDS: Record<string, string> = {
  post: "a post",
  comment: "a comment",
  message: "a message",
  user: "an account",
  org: "a club",
  event: "an event",
  channel: "a chat",
  report: "a report",
  waitlist: "a waitlist entry",
};

function num(meta: Record<string, unknown> | null, key: string): number | null {
  const v = meta?.[key];
  return typeof v === "number" ? v : null;
}

function str(meta: Record<string, unknown> | null, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v ? v : null;
}

/**
 * Who or what it was done to. A handle when the log has one, a short id when it
 * doesn't — and the club routes log `meta.handle` as the CLUB's handle, which
 * is a separate namespace from a student's, so an org row says so.
 */
function targetPhrase(row: ActionRow): string {
  const handle = str(row.meta, "handle");
  if (handle) return row.targetType === "org" ? `the club @${handle}` : `@${handle}`;
  const word = row.targetType ? TYPE_WORDS[row.targetType] ?? row.targetType : "something";
  return `${word} (${shortId(row.targetId)})`;
}

/**
 * `moderation_actions.reason` is free text for a takedown, a dismissal and a
 * restore — but the restrict route writes the reason CODE there, so a
 * suspension would otherwise read as a bare “ban_evasion”. The shared list
 * already owns the sentence a student is shown for each code.
 */
const CODE_REASON_ACTIONS = new Set(["user_suspend", "user_ban"]);

function reasonLine(row: ActionRow): { text: string; quoted: boolean } | null {
  if (!row.reason) return null;
  return CODE_REASON_ACTIONS.has(row.action)
    ? { text: restrictionReasonLine(row.reason), quoted: false }
    : { text: row.reason, quoted: true };
}

/** The numbers worth reading back: how many, how long, what didn't finish. */
function detailLine(row: ActionRow): string {
  const bits: string[] = [];
  const days = num(row.meta, "days");
  const endsAt = str(row.meta, "ends_at");
  if (days !== null) bits.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (endsAt) bits.push(`until ${fmtDay(endsAt)}`);
  const lifted = num(row.meta, "lifted");
  if (lifted !== null) bits.push(`${lifted} lifted`);
  const resolved = num(row.meta, "resolved");
  if (resolved !== null) bits.push(`${resolved} closed`);
  const unchanged = num(row.meta, "unchanged");
  if (unchanged) bits.push(`${unchanged} already closed`);
  const closedByRemoval = num(row.meta, "resolved_reports");
  if (closedByRemoval !== null) {
    bits.push(`${closedByRemoval} ${closedByRemoval === 1 ? "report" : "reports"} closed`);
  }
  if (row.meta?.already_removed === true) bits.push("it was already removed");
  const author = str(row.meta, "author_id");
  if (author) bits.push(`author ${shortId(author)}`);
  const incomplete = Array.isArray(row.meta?.incomplete)
    ? (row.meta.incomplete as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  if (incomplete.length > 0) bits.push(`didn't finish: ${incomplete.join(", ")}`);
  if (row.meta?.has_note === true) bits.push("a private note is on the restriction");
  const batch = str(row.meta, "batch");
  if (batch) bits.push(`batch ${batch}`);
  if (row.action === "waitlist_invite" && row.meta?.single === true) bits.push("sent on its own");
  const photos = photoSlots(row);
  if (photos.length > 0) bits.push(photos.map((p) => p.label.toLowerCase()).join(" and "));
  const left = row.meta?.left as Record<string, unknown> | undefined;
  const stillOnline = ["post", "other", "foreign", "external"].reduce(
    (n, k) => n + (typeof left?.[k] === "number" ? (left[k] as number) : 0),
    0,
  );
  if (stillOnline > 0) bits.push(`${stillOnline} left where it was (not their file)`);
  const swept = Array.isArray(row.meta?.swept) ? (row.meta.swept as unknown[]).length : 0;
  if (swept > 0) bits.push(`${swept} older ${swept === 1 ? "copy" : "copies"} taken offline too`);
  return bits.join(" · ");
}

/** The photo slots an image_* row names, with the words the panel uses. */
function photoSlots(row: ActionRow): Array<{ slot: string; label: string }> {
  const type = row.targetType;
  if (!isImageTargetType(type) || !Array.isArray(row.meta?.slots)) return [];
  return (row.meta.slots as unknown[])
    .filter((s): s is ImageSlot => isImageSlot(type, s))
    .map((s) => ({ slot: s, label: imageSlotLabel(type, s) }));
}

/**
 * Put back what THIS image_remove row took down. It sends the row's id: the
 * server puts back only when this takedown (or a restore of it) is still the
 * newest change to that photo, and otherwise answers in words (409 not_latest:
 * a later takedown came after it; 409 replaced_since: they set a new photo),
 * so a Put back here can never bring back a later takedown's picture.
 */
function PutBack({ row }: { row: ActionRow }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ tone: "good" | "info" | "error"; text: string } | null>(null);
  const slot = photoSlots(row)[0]?.slot;
  if (!slot || !row.targetId) return null;
  const go = async () => {
    setBusy(true);
    setSaid(null);
    const r = await adminPost<{ changed?: boolean; finished?: boolean; nothing?: boolean; not_put_back?: number }>(
      "/api/admin/images/restore",
      { targetType: row.targetType, targetId: row.targetId, slot, removalId: row.id },
      "Couldn't put that photo back.",
    );
    setBusy(false);
    if (!r.ok) return setSaid({ tone: "error", text: r.message });
    const d = r.data;
    const missed = d.not_put_back
      ? ` ${d.not_put_back} ${d.not_put_back === 1 ? "picture wasn't" : "pictures weren't"} put back: they set a new one there since, removed that entry, or a newer takedown covers it.`
      : "";
    setSaid(
      d.nothing
        ? { tone: "info", text: "There's no takedown to undo there any more." }
        : { tone: "good", text: d.finished ? "Finished putting it back." : `Put back.${missed} Refresh to see it in the log.` },
    );
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      <div className="adm-actions">
        <ActionButton busy={busy} onClick={() => void go()}>
          Put back
        </ActionButton>
      </div>
      {said ? <Notice tone={said.tone}>{said.text}</Notice> : null}
    </div>
  );
}

type LogPage = AdminResult<{ actions?: ActionRow[] }>;

function fetchLog(): Promise<LogPage> {
  return adminGet("/api/admin/actions?limit=50", "Couldn't load the log.");
}

export function LogClient() {
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Asking and reading are split so the mount fetch never sets state
  // synchronously inside the effect.
  const apply = useCallback((r: LogPage) => {
    if (r.ok) {
      setRows(r.data.actions ?? []);
      setErr(null);
    } else {
      setErr(r.message);
    }
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    apply(await fetchLog());
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    void fetchLog().then((r) => {
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

      {/* An empty log and a log we couldn't read are different things. */}
      {rows.length === 0 && !loading && !err ? (
        <Empty>
          Nothing yet. Every removal, photo takedown, dismissal, hide, verification,
          suspension, ban and lift lands here the moment it happens.
        </Empty>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((row) => {
            const detail = detailLine(row);
            const why = reasonLine(row);
            return (
              <div key={row.id} className="adm-card" style={{ fontSize: 13, lineHeight: 1.6 }}>
                <div>
                  <span style={{ fontWeight: 700 }}>
                    {row.actorHandle ? `@${row.actorHandle}` : "a moderator whose account is gone"}
                  </span>{" "}
                  {VERBS[row.action] ?? row.action.replace(/_/g, " ")} {targetPhrase(row)}
                  <span style={{ color: COLORS.muted }}> · {fmtWhen(row.createdAt)}</span>
                </div>
                {detail ? (
                  <div style={{ color: COLORS.muted, fontSize: 12 }}>{detail}</div>
                ) : null}
                {why ? (
                  <div
                    style={{
                      color: COLORS.muted,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {why.quoted ? `“${why.text}”` : why.text}
                  </div>
                ) : null}
                {row.action === "image_remove" ? <PutBack row={row} /> : null}
              </div>
            );
          })}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13 }}>Loading the log…</div>
      ) : null}
    </div>
  );
}
