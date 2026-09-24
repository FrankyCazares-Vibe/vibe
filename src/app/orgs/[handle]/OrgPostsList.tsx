"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

import { useReportedPostIds } from "@/app/campus/campus-home";
import { ReportSheet } from "@/components/safety/ReportSheet";

/**
 * A club's "Recent posts" on /orgs/<handle>, with Report on each post.
 *
 * WHY IT IS A CLIENT FILE. The page is a server component, so a Report button
 * (state plus ReportSheet) and the `vibe:content-reported` listener can't live
 * there. The page still reads and filters the posts (service role, removed and
 * restricted authors dropped) and hands this list plain rows, dates already
 * formatted: a date formatted here would be the server's time zone in the HTML
 * and the student's after hydration.
 *
 * WHAT A REPORT DOES HERE. The post leaves this list once the report sheet has
 * closed, for this visit only. The page reads posts with the service role and
 * no report filter, so a reload brings it back; the campus feed is where
 * hiding a reported post for good matters (critic-s1 item 3, accepted).
 */

/** This page's own phone breakpoint, copied from OrgContent.tsx (not exported
 *  there): globals.css swaps the 2-column grid for tabs at 720px, and the
 *  report shell follows the layout the student is actually looking at. */
const PHONE_QUERY = "(max-width: 720px)";

function subscribePhone(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function isPhoneNow(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(PHONE_QUERY).matches;
}

/** Server always renders the desktop shell; the client reads the real
 *  viewport on the first paint after hydration. */
function serverSnapshot(): boolean {
  return false;
}

/** One post as the server page hands it over. */
export type OrgPostItem = {
  id: string;
  content: string;
  media_url: string | null;
  /** "Sep 24, 2026", formatted by the server page. */
  date_label: string;
  /** Every edited published post says so (founder decision). */
  edited: boolean;
  /** The officer who hit publish; null when their account is gone. */
  author: { id: string; handle: string; name: string } | null;
};

export function OrgPostsList({
  posts,
  orgName,
  orgLogoUrl,
  viewerId,
}: {
  posts: OrgPostItem[];
  orgName: string;
  orgLogoUrl: string | null;
  /** The signed-in viewer; null for a signed-out visitor, who gets no Report. */
  viewerId: string | null;
}) {
  const phone = useSyncExternalStore(subscribePhone, isPhoneNow, serverSnapshot);
  // Posts reported on this visit, and officers blocked from a report's
  // "Block" offer. Kept as sets rather than a copy of `posts`, so a server
  // refresh of the page (a join, say) can't bring either back.
  const [reported, setReported] = useState<ReadonlySet<string>>(() => new Set());
  const [blocked, setBlocked] = useState<ReadonlySet<string>>(() => new Set());
  // One sheet for the whole list, outside the rows: dropping the reported row
  // can never unmount the sheet that reported it.
  const [reportFor, setReportFor] = useState<OrgPostItem | null>(null);

  const dropReportedPost = useCallback(
    (postId: string) => setReported((prev) => new Set(prev).add(postId)),
    [],
  );
  useReportedPostIds(dropReportedPost);

  const orgInitials = orgName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  const visible = posts.filter(
    (p) => !reported.has(p.id) && !(p.author && blocked.has(p.author.id)),
  );

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {visible.map((p) => (
          <article
            key={p.id}
            style={{
              padding: 14,
              borderRadius: 12,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* Posts on the org page belong to the org, not the admin who
                hit publish. Surface the org's identity here; we still
                surface the admin in fine print after the org name. */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: orgLogoUrl
                    ? `url(${orgLogoUrl}) center/cover`
                    : "linear-gradient(135deg, #FF5C35 0%, #7B5FE0 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Fraunces, serif",
                  fontWeight: 800,
                  fontSize: 12,
                  color: "#fff",
                  flexShrink: 0,
                  border: "1px solid rgba(255,255,255,0.18)",
                }}
              >
                {!orgLogoUrl ? orgInitials : null}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{orgName}</div>
                {p.author?.handle ? (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                    posted by @{p.author.handle}
                  </div>
                ) : null}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                {p.date_label}
                {p.edited ? " · Edited" : null}
              </div>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
              }}
            >
              {p.content}
            </p>
            {p.media_url ? (
              <img
                src={p.media_url}
                alt=""
                style={{
                  display: "block",
                  width: "100%",
                  height: "auto",
                  marginTop: 12,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              />
            ) : null}
            {/* Signed out there is nobody to file a report as. On your own
                post the route answers 400 "You can't report something of
                your own", and every other surface keeps Report off your own
                things rather than letting the route say no. */}
            {viewerId && p.author?.id !== viewerId ? (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setReportFor(p)}
                  style={{
                    padding: "6px 0",
                    background: "transparent",
                    border: "none",
                    color: "rgba(255,255,255,0.55)",
                    fontFamily: "DM Sans, sans-serif",
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: "underline",
                    cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  Report post
                </button>
              </div>
            ) : null}
          </article>
        ))}
        {visible.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
            No other posts to show.
          </p>
        ) : null}
      </div>

      {reportFor ? (
        // Bottom sheet on the phone layout, centered dialog on the desktop
        // grid, the same split OrgContent makes for "Report this club".
        <ReportSheet
          variant={phone ? "sheet" : "modal"}
          target={{
            type: "post",
            id: reportFor.id,
            // A club post attributes to the officer who wrote it, so Block
            // reaches that account, the same as on the campus feed.
            authorId: reportFor.author?.id ?? null,
            authorName:
              reportFor.author?.name ||
              (reportFor.author?.handle ? `@${reportFor.author.handle}` : null),
          }}
          onClose={() => setReportFor(null)}
          // Their posts leave this list now. The page reads posts with the
          // service role and no block filter, so this lasts for the visit.
          onBlocked={(userId) => setBlocked((prev) => new Set(prev).add(userId))}
        />
      ) : null}
    </>
  );
}
