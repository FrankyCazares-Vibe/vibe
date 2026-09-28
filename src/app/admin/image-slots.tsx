"use client";

/**
 * The photo panel: take down (or put back) a student's profile photo, cover
 * and experience / working-on logos, a club's logo and banner, or a group
 * chat's photo (S67 security wave 2, wave B, batch B1; finding #2).
 *
 * Mounted from the Users and Clubs tabs (no reports: nothing is closed)
 * and from a report card about a person, club or chat. On a card, the panel
 * lists that card's open reports with a tick box each: the ones about an
 * intimate image, sexual content or child safety start ticked, the rest
 * start unticked, and only the ticked ones close when a photo comes down
 * (a person's other reports may be about something else entirely).
 *
 * WHAT YOU SAW IS WHAT COMES DOWN. Each slot carries the token the server
 * made from the value it showed; Take down sends it back, and if the student
 * set a new photo meanwhile the server answers 409 and the card offers
 * Refresh. A refreshed preview starts blurred again.
 *
 * PREVIEWS ARE BLURRED until the moderator presses Show: a reported photo can
 * be the very thing nobody should have to see by accident. An outside address
 * is never loaded here (it would tell that site who is looking); it is a link
 * to open on purpose.
 *
 * The admin desk is its own dark surface (admin-shell COLORS), not a student
 * screen, so it uses the shell's palette like every other tab.
 *
 * THE CACHE NOTE IS ALWAYS ON SCREEN. A profile photo is a public file behind
 * a CDN: taking it down here does not clear every cached copy at once
 * (the cache fix is deferred). Club and chat photos are private and stop
 * loading within an hour.
 */

import { useCallback, useEffect, useState } from "react";

import {
  CACHE_NOTE,
  type ImageSlot,
  type ImageTargetType,
  PRIVATE_CACHE_NOTE,
  UNFURL_NOTE,
} from "@/lib/moderation/media-quarantine-images";
import { reportReasonLabel } from "@/lib/moderation/reports";
import { isUuid } from "@/lib/pgrest";

import { ActionButton, adminGet, adminPost, Badge, COLORS, fmtWhen, inputStyle, labelStyle, Notice } from "./admin-shell";

type SlotView = {
  slot: ImageSlot;
  label: string;
  isPublic: boolean;
  /** Hash of the value shown; sent back with Take down (409 when it changed). */
  token: string;
  current: Array<{ kind: string; viewUrl: string | null; href: string | null }>;
  removed: { actionId: string; at: string | null; reason: string; slots: ImageSlot[]; previewUrl: string | null } | null;
};
type SlotsData = { target: { type: ImageTargetType; id: string; name: string | null }; slots: SlotView[] };

type RemoveAnswer = {
  changed?: boolean;
  finished?: boolean;
  nothing?: boolean;
  slots?: string[];
  swept?: number;
  notes?: string[];
  resolvedReports?: number;
  resolvedReportIds?: string[];
};
type RestoreAnswer = { changed?: boolean; finished?: boolean; nothing?: boolean; not_put_back?: number };

type Said = { tone: "good" | "info" | "error"; lines: string[] };

const KIND_WORDS: Record<string, string> = {
  own: "their own file",
  post: "also one of their posts",
  other: "their file, stored for something else",
  foreign: "another account's file",
  external: "hosted on another site",
  private: "private club / chat file",
};

/** One blurred picture with its own Show toggle. */
function Preview({ url, label }: { url: string | null; label: string }) {
  const [shown, setShown] = useState(false);
  if (!url) {
    return (
      <div style={{ fontSize: 12, color: COLORS.faint }}>No preview for this one.</div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 10,
          overflow: "hidden",
          background: "rgba(255,255,255,0.06)",
          border: `1px solid ${COLORS.border}`,
          flexShrink: 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed / public storage URLs */}
        <img
          src={url}
          alt={shown ? label : `${label}, blurred`}
          referrerPolicy="no-referrer"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: shown ? "none" : "blur(18px)",
          }}
        />
      </div>
      <ActionButton onClick={() => setShown((s) => !s)}>{shown ? "Blur" : "Show"}</ActionButton>
    </div>
  );
}

function closedLine(n: number | undefined): string {
  if (!n) return "";
  return ` ${n} ${n === 1 ? "report" : "reports"} closed.`;
}

function SlotCard({
  view,
  targetType,
  targetId,
  reportIds,
  onDone,
  onRefresh,
  onPause,
}: {
  view: SlotView;
  targetType: ImageTargetType;
  targetId: string;
  /** The ticked, validated report ids; exactly these close. */
  reportIds: string[];
  onDone: (closedIds: string[]) => void;
  onRefresh: () => void;
  onPause?: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"remove" | "restore" | null>(null);
  const [said, setSaid] = useState<Said | null>(null);
  // Set when Take down answered 409: the photo changed since the panel loaded.
  const [stale, setStale] = useState(false);
  const field = `${targetId}-${view.slot}-why`;
  const hasPhoto = view.current.length > 0;

  const fail = (message: string, pause: boolean) => {
    setSaid({ tone: "error", lines: [message] });
    if (pause) onPause?.(message);
  };

  const remove = async () => {
    const text = reason.trim();
    if (!text) {
      setSaid({ tone: "error", lines: ["Write why it's coming down first. It's kept in the log."] });
      return;
    }
    setBusy("remove");
    setSaid(null);
    setStale(false);
    const r = await adminPost<RemoveAnswer>(
      "/api/admin/images/remove",
      {
        targetType,
        targetId,
        slot: view.slot,
        reason: text.slice(0, 500),
        // What this card showed: the server refuses (409) if it changed since.
        expected: view.token,
        ...(reportIds.length ? { reportIds } : {}),
      },
      `Couldn't take down the ${view.label.toLowerCase()}.`,
    );
    setBusy(null);
    if (!r.ok) {
      if (r.status === 409) setStale(true);
      return fail(r.message, r.pause);
    }
    const d = r.data;
    const both = (d.slots?.length ?? 0) > 1 ? " The same picture was in their other photo slot, so both came down." : "";
    const swept = d.swept ? ` ${d.swept} older ${d.swept === 1 ? "copy" : "copies"} in their folder went offline too.` : "";
    const head = d.nothing
      ? "There's nothing up in that slot."
      : d.finished
        ? "Finished taking it down."
        : `Taken down.${both}${swept}`;
    setSaid({ tone: d.nothing ? "info" : "good", lines: [head + closedLine(d.resolvedReports), ...(d.notes ?? [])] });
    setReason("");
    onDone(Array.isArray(d.resolvedReportIds) ? d.resolvedReportIds : []);
  };

  const refresh = () => {
    setSaid(null);
    setStale(false);
    onRefresh();
  };

  const restore = async () => {
    setBusy("restore");
    setSaid(null);
    setStale(false);
    const r = await adminPost<RestoreAnswer>(
      "/api/admin/images/restore",
      {
        targetType,
        targetId,
        slot: view.slot,
        // The takedown this card shows: if someone acted on this photo since
        // the panel loaded, the server answers 409 instead of undoing theirs.
        ...(view.removed ? { removalId: view.removed.actionId } : {}),
        ...(reason.trim() ? { reason: reason.trim().slice(0, 500) } : {}),
      },
      `Couldn't put the ${view.label.toLowerCase()} back.`,
    );
    setBusy(null);
    if (!r.ok) return fail(r.message, r.pause);
    const d = r.data;
    const missed = d.not_put_back
      ? ` ${d.not_put_back} ${d.not_put_back === 1 ? "picture wasn't" : "pictures weren't"} put back: they've set a new one there since, removed that entry, or a newer takedown covers it.`
      : "";
    setSaid({
      tone: d.nothing ? "info" : "good",
      lines: [d.nothing ? "There's no takedown to undo here." : d.finished ? "Finished putting it back." : `Put back.${missed}`],
    });
    onDone([]);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 12,
        borderRadius: 10,
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${COLORS.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{view.label}</span>
        {hasPhoto ? <Badge color={COLORS.accent}>up</Badge> : <Badge color={COLORS.faint}>empty</Badge>}
        {view.removed ? <Badge color={COLORS.warn}>taken down</Badge> : null}
      </div>

      {view.current.map((c, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 12, color: COLORS.muted }}>{KIND_WORDS[c.kind] ?? c.kind}</div>
          {c.href ? (
            <a href={c.href} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.text, fontSize: 13 }}>
              Open the outside address (it will know you looked)
            </a>
          ) : (
            // Keyed by address: a different picture after a refresh starts blurred.
            <Preview key={c.viewUrl ?? "none"} url={c.viewUrl} label={view.label} />
          )}
        </div>
      ))}

      {view.removed ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.5 }}>
            Taken down {fmtWhen(view.removed.at)}
            {view.removed.reason ? ` · “${view.removed.reason}”` : ""}
          </div>
          <Preview
            key={view.removed.previewUrl ?? "none"}
            url={view.removed.previewUrl}
            label={`Removed ${view.label.toLowerCase()}`}
          />
        </div>
      ) : null}

      {hasPhoto || view.removed ? (
        <div>
          <label style={labelStyle} htmlFor={field}>
            {hasPhoto ? "Why it's coming down (kept in the log)" : "Why it's going back (optional, kept in the log)"}
          </label>
          <textarea
            id={field}
            value={reason}
            rows={2}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>
      ) : null}

      <div className="adm-actions">
        {hasPhoto ? (
          <ActionButton tone="danger" busy={busy === "remove"} disabled={busy !== null} onClick={() => void remove()}>
            Take down
          </ActionButton>
        ) : null}
        {view.removed ? (
          <ActionButton busy={busy === "restore"} disabled={busy !== null} onClick={() => void restore()}>
            Put back
          </ActionButton>
        ) : null}
      </div>

      {said ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {said.lines.map((line, i) => (
            <Notice key={i} tone={i === 0 ? said.tone : "info"}>
              {line}
            </Notice>
          ))}
          {stale ? (
            <div className="adm-actions">
              <ActionButton onClick={refresh}>Refresh</ActionButton>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** One open report a card lists, as the panel's tick list needs it. */
export type PanelReport = { id: string; reason: string; reporterHandle: string | null; createdAt: string };

/** Reports about these start ticked: a photo takedown is usually the answer to them. */
const PRETICK_REASONS: ReadonlySet<string> = new Set(["intimate_image", "sexual", "child_safety"]);

/** The card's open reports, each with a tick box; only ticked ones close. */
function ReportTicks({
  reports,
  isTicked,
  onToggle,
}: {
  reports: PanelReport[];
  isTicked: (r: PanelReport) => boolean;
  onToggle: (r: PanelReport, on: boolean) => void;
}) {
  const ticked = reports.filter(isTicked).length;
  return (
    <fieldset
      style={{
        margin: 0,
        padding: 12,
        borderRadius: 10,
        border: `1px solid ${COLORS.border}`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 0,
      }}
    >
      <legend style={{ ...labelStyle, padding: "0 4px", marginBottom: 0 }}>
        When a photo comes down, close these reports
      </legend>
      {reports.map((r) => (
        <label
          key={r.id}
          style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, lineHeight: 1.5, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={isTicked(r)}
            onChange={(e) => onToggle(r, e.target.checked)}
            style={{ marginTop: 3, accentColor: COLORS.accent, flexShrink: 0 }}
          />
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            <span style={{ fontWeight: 700 }}>{reportReasonLabel(r.reason)}</span>
            <span style={{ color: COLORS.muted }}>
              {" · "}
              {r.reporterHandle ? `@${r.reporterHandle}` : "an account that's gone"}
              {" · "}
              {fmtWhen(r.createdAt)}
            </span>
          </span>
        </label>
      ))}
      <div style={{ fontSize: 12, color: COLORS.faint, lineHeight: 1.5 }}>
        {ticked === 0
          ? "None ticked: every report here stays open."
          : ticked === reports.length
            ? "All of them close."
            : "Unticked reports stay open."}
      </div>
    </fieldset>
  );
}

/**
 * The panel. `reports` only from a report card (its open reports): the
 * moderator ticks which close when a photo comes down, and only those ids
 * are sent. `onReportsClosed` gets the ids the server closed, so the card
 * drops exactly those without a reload.
 */
export function ImageSlots({
  targetType,
  targetId,
  reports = [],
  onReportsClosed,
  onPause,
}: {
  targetType: ImageTargetType;
  targetId: string;
  reports?: PanelReport[];
  onReportsClosed?: (closedIds: string[]) => void;
  onPause?: (message: string) => void;
}) {
  // Only what the moderator changed; everything else follows PRETICK_REASONS,
  // so a report that arrives after the panel opened gets the same default.
  const [choice, setChoice] = useState<Record<string, boolean>>({});
  const isTicked = (r: PanelReport) => choice[r.id] ?? PRETICK_REASONS.has(r.reason);
  const tickedIds = [...new Set(reports.filter((r) => isUuid(r.id) && isTicked(r)).map((r) => r.id))].slice(0, 100);
  const [data, setData] = useState<SlotsData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSlots = useCallback(
    () =>
      adminGet<SlotsData>(
        `/api/admin/images?type=${encodeURIComponent(targetType)}&id=${encodeURIComponent(targetId)}`,
        "Couldn't load the photos.",
      ),
    [targetType, targetId],
  );

  const apply = useCallback((r: Awaited<ReturnType<typeof fetchSlots>>) => {
    if (r.ok) {
      setData(r.data);
      setErr(null);
    } else {
      setErr(r.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchSlots().then((r) => {
      if (!cancelled) apply(r);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchSlots, apply]);

  const reload = () => {
    setLoading(true);
    void fetchSlots().then(apply);
  };

  const onDone = (closedIds: string[]) => {
    if (closedIds.length > 0) onReportsClosed?.(closedIds);
    reload();
  };

  const slots = data?.slots ?? [];
  const isPublic = targetType === "user";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-busy={loading || undefined}>
      {err ? <Notice tone="error">{err}</Notice> : null}
      {loading && !data ? <div style={{ fontSize: 13, color: COLORS.muted }}>Loading the photos…</div> : null}
      {data && slots.length === 0 ? (
        <div style={{ fontSize: 13, color: COLORS.muted }}>No photos here.</div>
      ) : null}
      {reports.length > 0 && slots.length > 0 ? (
        <ReportTicks
          reports={reports}
          isTicked={isTicked}
          onToggle={(r, on) => setChoice((prev) => ({ ...prev, [r.id]: on }))}
        />
      ) : null}
      {slots.map((view) => (
        <SlotCard
          key={view.slot}
          view={view}
          targetType={targetType}
          targetId={targetId}
          reportIds={tickedIds}
          onDone={onDone}
          onRefresh={reload}
          onPause={onPause}
        />
      ))}
      <div style={{ fontSize: 12, color: COLORS.faint, lineHeight: 1.5 }}>
        {isPublic ? CACHE_NOTE : PRIVATE_CACHE_NOTE} {UNFURL_NOTE} Nothing tells the {isPublic ? "student" : "owner"} a
        photo was taken down, and they can set a new one.
      </div>
    </div>
  );
}
