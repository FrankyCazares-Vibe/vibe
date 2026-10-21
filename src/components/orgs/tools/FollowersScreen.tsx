"use client";

/**
 * Club tools › Followers (the club's view, wave 2, C10; the desktop's
 * Settings › Followers, phone first): who follows the club, newest first,
 * 30 at a time from the officer-only route, with "Load more". The count is
 * exact (only officers get here). A member's row says Member (members follow
 * automatically); anyone else's has Remove, behind a confirm sheet.
 *
 * Removing isn't a ban: they stop getting the club's posts, can't read its
 * Board unless they join, can follow again, and aren't told.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { LoadFailed, asLoadFailure, type LoadFailure } from "@/components/feedback/LoadFailed";
import { busyStyle, pillStyle, quietStyle } from "@/components/orgs/club-tool-styles";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import { ORG_COPY, fillCopy, followsSinceText, orgErrorCopy } from "@/lib/orgs/join-copy";

import { ConfirmSheet, EmptyLine, ListSkeleton, PersonLine, cardStyle, chipStyle, rowItemStyle } from "./tools-ui";
import type { FollowerRow, ToolsClub } from "./types";

type FollowersPage = { followers?: FollowerRow[]; next_cursor?: string | null; follower_count?: number | null };

const LOAD_LINE = "Couldn't load followers.";

/** A later page can repeat a row the first one had (someone re-followed): keep the first. */
function appendNew(rows: FollowerRow[], more: FollowerRow[]): FollowerRow[] {
  const seen = new Set(rows.map((r) => r.id));
  const out = rows.slice();
  for (const r of more) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

export function FollowersScreen({ club }: { club: ToolsClub }) {
  const [rows, setRows] = useState<FollowerRow[] | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirm, setConfirm] = useState<FollowerRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const aliveRef = useRef(true);
  const base = `/api/orgs/${encodeURIComponent(club.handle)}/followers`;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await vibeRequest<FollowersPage>(`${base}?limit=30`, { cache: "no-store", quiet: true, failure: LOAD_LINE });
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.followers)) {
        setLoadErr(null);
        // The server's order (first followed, newest first), never re-sorted here.
        setRows(r.data.followers);
        setCursor(r.data.next_cursor ?? null);
        setCount(typeof r.data.follower_count === "number" ? r.data.follower_count : null);
        return;
      }
      setLoadErr(asLoadFailure(r, LOAD_LINE));
    })();
    return () => {
      cancelled = true;
    };
  }, [base, reloadKey]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const r = await vibeRequest<FollowersPage>(`${base}?limit=30&cursor=${encodeURIComponent(cursor)}`, {
      cache: "no-store",
      quiet: true,
      failure: LOAD_LINE,
    });
    if (!aliveRef.current) return;
    setLoadingMore(false);
    if (r.ok && Array.isArray(r.data.followers)) {
      const more = r.data.followers;
      setRows((prev) => appendNew(prev ?? [], more));
      setCursor(r.data.next_cursor ?? null);
      if (typeof r.data.follower_count === "number") setCount(r.data.follower_count);
      return;
    }
    const failure = asLoadFailure(r, LOAD_LINE);
    toast({ message: failure.message, tone: "error", action: failure.action });
  };

  const remove = async (row: FollowerRow) => {
    if (busyId) return;
    setBusyId(row.id);
    const r = await vibeRequest<{ removed?: boolean; follower_count?: number | null }>(
      `${base}/${encodeURIComponent(row.id)}`,
      { method: "DELETE", quiet: true, failure: "Couldn't remove this follower." },
    );
    if (!aliveRef.current) return;
    setBusyId(null);
    setConfirm(null);
    if (r.ok) {
      setRows((prev) => (prev ?? []).filter((x) => x.id !== row.id));
      // No number: the count read failed on the way back; show none rather than one too many.
      setCount(typeof r.data.follower_count === "number" ? r.data.follower_count : null);
      // removed:false means they had already unfollowed; the row just goes.
      if (r.data.removed === true) toast({ message: "Follower removed.", tone: "info" });
      return;
    }
    if (r.code === "member_follows") {
      // They joined meanwhile: their row now says Member.
      setRows((prev) => (prev ?? []).map((x) => (x.id === row.id && x.member_role == null ? { ...x, member_role: "member" } : x)));
      toast({ message: `${orgErrorCopy("member_follows")} Remove them from Members instead.`, tone: "error" });
      return;
    }
    const line = r.status === 429 ? "Too many tries. Try again in a minute." : (orgErrorCopy(r.code) ?? r.message);
    toast({ message: r.action ? r.message : line, tone: "error", action: r.action });
  };

  if (rows === null) {
    if (loadErr) {
      return (
        <LoadFailed
          failure={loadErr}
          onRetry={() => {
            setLoadErr(null);
            setReloadKey((k) => k + 1);
          }}
        />
      );
    }
    return <ListSkeleton rows={5} />;
  }

  // The count includes people the list leaves out for blocks and mutes.
  const someUnlisted = cursor === null && count !== null && rows.length < count;
  const heading = count === null ? null : count === 1 ? "1 follower" : `${count} followers`;

  return (
    <>
      <p style={{ ...quietStyle, margin: "0 2px 10px" }}>
        {heading ? `${heading} · ` : null}Only officers can see this list.
      </p>
      {someUnlisted ? (
        <p style={{ ...quietStyle, margin: "0 2px 10px" }}>Some followers aren&rsquo;t listed because of blocks or mutes.</p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyLine>{fillCopy(ORG_COPY.inviteSheet.noFollowers, { org: club.name })}</EmptyLine>
      ) : (
        <ul style={cardStyle}>
          {rows.map((row) => (
            <li key={row.id} style={{ ...rowItemStyle, padding: "10px 14px" }}>
              <PersonLine
                name={row.name}
                handle={row.handle}
                avatarUrl={row.avatar_url}
                sub={followsSinceText(row.follows_since) ?? undefined}
                end={
                  row.member_role != null ? (
                    <span style={chipStyle}>
                      {row.member_role === "owner" ? "Owner" : row.member_role === "admin" ? "Officer" : "Member"}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="vibe-press"
                      disabled={busyId === row.id}
                      aria-label={`Remove ${row.name || row.handle || "this follower"}`}
                      onClick={() => setConfirm(row)}
                      style={{ ...removeStyle, ...busyStyle(busyId === row.id) }}
                    >
                      Remove
                    </button>
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}

      {cursor ? (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
          <button type="button" className="vibe-press" disabled={loadingMore} onClick={() => void loadMore()} style={{ ...pillStyle, ...busyStyle(loadingMore) }}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}

      {confirm ? (
        <ConfirmSheet
          title={`Remove ${confirm.name || (confirm.handle ? `@${confirm.handle}` : "this follower")}?`}
          note={`They'll stop getting ${club.name}'s posts and can't read its Board unless they join. They can follow again, and they aren't told.`}
          confirmLabel="Remove follower"
          busy={busyId !== null}
          onConfirm={() => void remove(confirm)}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </>
  );
}

const removeStyle: CSSProperties = { ...pillStyle, padding: "0 14px", color: "var(--ink-2)", border: "1px solid var(--hairline)" };
