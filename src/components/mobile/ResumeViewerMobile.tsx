"use client";

import { useEffect, useRef, useState } from "react";

import { rasterizePdf } from "@/lib/pdfjs-cdn";
import {
  isResumeProxyPath,
  resolveResumeDocUrl,
} from "@/lib/profile/resolve-resume-url";
import type { RedactionBar } from "@/lib/profile/resume-redactions";
import { isIosPlatform } from "@/lib/pwa/display-mode";
import { useIsStandalone, usePlatform } from "@/lib/pwa/use-standalone";

/** A bar plus the identity of the document it covers. `docKey` is that
 *  document's `url` exactly as the portfolio lists it (an
 *  `/api/resume/<key>` path or an external link). Bars saved before
 *  docKey existed carry only `docIndex`, their position in the list.
 *  An intersection, so it holds whether or not the shared type already
 *  declares the field. */
export type DocBar = RedactionBar & { docKey?: string };

/** The one field of a portfolio entry the helpers below read. */
type DocRef = { url?: string | null };

// Bar ↔ document helpers. Pure (no JSX, no hooks). A bar belongs to a
// document by docKey, never by position alone: positions shift when a
// document is removed, and a bar that slides onto its neighbour leaves
// the file it was hiding served in full to everyone else.

/** True when `bar` covers the document `url` in the list `refs` (the
 *  portfolio's urls, in order): by docKey when the bar has one; a legacy
 *  bar covers whatever file is listed at its position, so the same file
 *  listed twice shows it on both. The server's rule exactly
 *  (redactionBarCoversRef), so the owner sees the bars others get. */
export function barCoversDoc(
  bar: DocBar,
  refs: readonly string[],
  url: string,
): boolean {
  if (typeof bar.docKey === "string" && bar.docKey) return bar.docKey === url;
  return bar.docIndex < refs.length && refs[bar.docIndex] === url;
}

/** One edit made in the viewer: a bar drawn, or a bar taken away. */
export type BarChange = { add: DocBar } | { remove: DocBar };

/** Same rectangle on the same page, whatever document it names. */
export function sameBarShape(a: DocBar, b: DocBar): boolean {
  return (
    a.pageNumber === b.pageNumber &&
    a.x === b.x &&
    a.y === b.y &&
    a.w === b.w &&
    a.h === b.h
  );
}

/** The whole bars array to save after one edit to the document `url`,
 *  worked out from the bars and list the server holds right now (not
 *  this screen's copy, which can predate bars saved on another device).
 *  Every bar goes out with its document's docKey. null when the list no
 *  longer has the document, so there is nothing to attach the edit to.
 *  Adding a bar that is already there, or removing one that is gone,
 *  changes nothing, so replaying an edit is harmless. */
export function barsAfterChange(
  bars: readonly DocBar[],
  docs: readonly DocRef[],
  url: string,
  preferredIndex: number,
  change: BarChange,
): DocBar[] | null {
  const refs = docs.map((d) => d.url ?? "");
  const index =
    refs[preferredIndex] === url ? preferredIndex : refs.indexOf(url);
  if (!url || index < 0) return null;
  const others: DocBar[] = [];
  let mine: DocBar[] = [];
  for (const b of bars) (barCoversDoc(b, refs, url) ? mine : others).push(b);
  if ("add" in change) {
    if (!mine.some((b) => sameBarShape(b, change.add))) mine.push(change.add);
  } else {
    mine = mine.filter((b) => !sameBarShape(b, change.remove));
  }
  return [
    ...stampBarsForDocs(others, docs),
    ...mine.map((b) => ({ ...b, docIndex: index, docKey: url })),
  ];
}

/** Every bar with the docKey and docIndex of its document in `docs`,
 *  ready to send. A legacy bar takes the url at its position. A bar
 *  whose document this list doesn't show goes unchanged; the server
 *  keeps it only while its own list still has that document. */
export function stampBarsForDocs(
  bars: readonly DocBar[],
  docs: readonly DocRef[],
): DocBar[] {
  return bars.map((b) => {
    const key = b.docKey || docs[b.docIndex]?.url || "";
    if (!key) return b;
    const index = docs.findIndex((d) => d.url === key);
    return index < 0 ? { ...b, docKey: key } : { ...b, docKey: key, docIndex: index };
  });
}

/** The bars that survive a change of the document list from `prev` to
 *  `next`, each moved to its document's new position: what the server
 *  stores when a list change arrives without bars. A removed document's
 *  bars are dropped, never slid onto the next one. */
export function remapBarsForDocs(
  bars: readonly DocBar[],
  prev: readonly DocRef[],
  next: readonly DocRef[],
): DocBar[] {
  const out: DocBar[] = [];
  for (const b of bars) {
    const key = b.docKey || prev[b.docIndex]?.url || "";
    const index = key ? next.findIndex((d) => d.url === key) : -1;
    if (index >= 0) out.push({ ...b, docKey: key, docIndex: index });
  }
  return out;
}

/** The address that opens a hosted document the way everyone else gets
 *  it, bars burned in (`?view=public` makes the proxy treat the owner
 *  like anyone else). null for an external link: there is no blacked-out
 *  copy of those, everyone opens the link itself. */
export function publicViewHref(url: string): string | null {
  if (!isResumeProxyPath(url)) return null;
  const base = url.split("#")[0] ?? url;
  return `${base}${base.includes("?") ? "&" : "?"}view=public`;
}

type Props = {
  url: string;
  /** "pdf" → rasterize via pdf.js. "image" → render the URL directly. */
  type: "pdf" | "image";
  name: string;
  /** Persisted bars to overlay. Already filtered to this doc by the
   *  caller (`barCoversDoc`); we just split them per page on render. */
  bars: DocBar[];
  /** Index of this doc in `users.resume_docs`. Stamped onto every bar
   *  the user draws here, next to `docKey` (this doc's `url`), which is
   *  what the server actually matches bars to documents by. */
  docIndex?: number;
  /** Owner-only — true on /profile (own page), false in visitor mode.
   *  When true, an "Edit bars" toggle appears and the viewer can draw
   *  new bars or remove existing ones. */
  editable?: boolean;
  /** Called when the user adds or removes a bar in edit mode, with this
   *  doc's bars as now drawn and the one edit that made them. The parent
   *  applies `change` to the bars the server holds (`barsAfterChange`),
   *  so bars saved elsewhere since this screen loaded aren't overwritten. */
  onBarsChange?: (barsForDoc: DocBar[], change: BarChange) => void;
  /** True while a bar edit is on its way to the server. The drawn bars
   *  aren't reset from `bars` meanwhile (a refresh from an earlier save
   *  would wipe a bar drawn after it), and "Open" waits, since the
   *  blacked-out copy doesn't have the new bar yet. */
  saving?: boolean;
  onClose: () => void;
};

/**
 * Full-screen mobile viewer for the user's resume / portfolio.
 * Owner drawing / editing is gated by `editable`; redaction bars are
 * pulled from `vibeUser.resumeRedactions` (server-persisted,
 * cross-device).
 *
 * Visitor mode (`editable` false, `bars` []): the bootstrap sends
 * visitors no bar geometry, and the /api/resume proxy resolves to a
 * server-rendered derivative with the owner's bars already burned in
 * (an image-only PDF, or a re-encoded image). Nothing below reads a
 * PDF text layer — pages are rasterised to canvas — so that derivative
 * renders exactly like an original. The "Open" link opens the same
 * proxy URL, i.e. the derivative, never the un-redacted file.
 *
 * Owner mode (`editable`): the proxy hands the owner the ORIGINAL and
 * the bars are drawn over it here. So once a hosted doc has bars,
 * "Open" goes to `?view=public` (the blacked-out copy everyone else
 * gets), "Open my original" sits in the note strip under the header,
 * and that strip always says in one line who sees what. While a bar
 * edit is saving, "Open" shows "Saving…" instead of a copy that
 * doesn't have the new bar yet.
 *
 * In the installed app on an iPhone, a hosted file shows neither "Open"
 * link (see `hideOpen`); external links keep theirs.
 *
 * For PDFs we rasterize each page to JPEG via pdf.js at scale 1.6,
 * stack the page images vertically, and overlay bars as
 * percentage-positioned absolute children of each page wrap — same
 * coordinate space the desktop viewer uses, so a bar drawn on
 * desktop lands in the right spot on phone.
 *
 * For images, the URL is rendered as a single page so the same
 * page-wrap + bars rendering path applies.
 */
// Pinch-zoom range. 0.8 lets users fit a wider scan into the viewport;
// 4 is enough to read fine print in scanned résumés without exhausting
// the rasterized JPEG (already 1.6× scale during rasterize, so a 4× view
// zoom is ~6.4× effective — still inside the readable range).
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 4;

export function ResumeViewerMobile({
  url,
  type,
  name,
  bars,
  docIndex = 0,
  editable = false,
  onBarsChange,
  saving = false,
  onClose,
}: Props) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  // Local copy of bars-for-this-doc so the user sees their drawing
  // immediately (parent sync is async via onBarsChange). Re-seeded from
  // the saved bars when their CONTENT changes (the parent hands a new
  // array every render) and once the saves drain after a local edit, so
  // a failed save takes its bar back off the screen. Never while a save
  // is in flight: that would drop a bar drawn after the one being sent.
  const savedSig = JSON.stringify(bars);
  const [localBars, setLocalBars] = useState<DocBar[]>(bars);
  const [seed, setSeed] = useState({ sig: savedSig, dirty: false });
  if (!saving && (seed.dirty || seed.sig !== savedSig)) {
    setSeed({ sig: savedSig, dirty: false });
    setLocalBars(bars);
  }
  const editBars = (next: DocBar[], change: BarChange) => {
    setLocalBars(next);
    setSeed((s) => ({ ...s, dirty: true }));
    onBarsChange?.(next, change);
  };
  // Owner-only "draw mode" toggle. Off by default — pinch-zoom +
  // scrolling stay on. On flips the pointer handlers in PageWrap from
  // "ignore" to "draw a new bar / tap to delete".
  const [editing, setEditing] = useState(false);
  // Owner only. The proxy gives the owner the original, so once this doc
  // has bars, "Open" goes to the blacked-out copy everyone else gets and
  // the note strip carries "Open my original". While a bar edit saves,
  // "Open" waits: that copy doesn't have the new bar yet. An external
  // link has no such copy (publicViewHref is null); the note says so.
  const hasBars = localBars.length > 0;
  const hosted = isResumeProxyPath(url);
  const openWaits = editable && hosted && saving;
  const publicHref =
    editable && hasBars && !saving ? publicViewHref(url) : null;
  // The installed app on an iPhone keeps its own sign-in, apart from
  // Safari's. A new window there opens with Safari's, where /api/resume
  // answers 401, and opening the file in the app itself would leave the
  // student with no back button. So a hosted file has no "Open" links
  // there; the pages below already show it. External links need no
  // sign-in and keep "Open" everywhere, and Android's installed app shares
  // Chrome's sign-in, so it keeps them too (plan R16, critic-w1.md item 10).
  const standalone = useIsStandalone();
  const platform = usePlatform();
  const hideOpen = hosted && standalone && isIosPlatform(platform);
  const ownerNote = !hosted
    ? "Links open the original for everyone. Upload the file to black out parts of it."
    : hasBars
      ? "Only you see your original. Everyone else sees the blacked-out copy."
      : editing
        ? "Drag across anything you want hidden. Only you will see the original."
        : "Everyone sees this file as it is. Use Edit bars to black out parts.";
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinchRef = useRef<{ baseDist: number; baseZoom: number; active: boolean }>({
    baseDist: 0,
    baseZoom: 1,
    active: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (type === "image") {
          // `url` may be a private proxy path (/api/resume/...). The
          // same-origin GET 307s to a signed URL, which <img> follows
          // with the session cookie — no resolution needed.
          if (!cancelled) setPages([url]);
          return;
        }
        // PDFs: resolve the proxy path ONCE to a short-lived signed URL
        // so pdf.js's Range requests go straight to storage. Non-proxy
        // inputs (data:, external https) pass through unchanged.
        const src = await resolveResumeDocUrl(url);
        if (cancelled) return;
        const rasterized = await rasterizePdf(src);
        if (cancelled) return;
        if (rasterized.length === 0) {
          setError("Could not render this PDF");
        } else {
          setPages(rasterized);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not open this file");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, type]);

  // Lock page scroll while the viewer is up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Pinch-to-zoom on the scroll container. Single-finger touches pass
  // through to native vertical pan; the moment a second finger lands we
  // capture the gesture, preventDefault to suppress scrolling, and drive
  // a CSS variable on the page stack. The variable scales each page
  // wrapper's max-width — bars positioned as % of the wrap scale with it.
  //
  // Also wires double-tap to toggle between 1× and 2× — same gesture
  // iOS Photos uses, gives users a quick "fit / fill" alternative to
  // pinching.
  const lastTapRef = useRef<{ t: number; x: number; y: number }>({
    t: 0,
    x: 0,
    y: 0,
  });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const onStart = (e: TouchEvent) => {
      // While editing bars, pinch + double-tap-to-zoom are suppressed
      // so a finger drawing a rect doesn't accidentally also zoom or
      // toggle the page. Bars are drawn at 1× zoom anyway.
      if (editing) return;
      if (e.touches.length === 2) {
        pinchRef.current = {
          active: true,
          baseDist: dist(e.touches[0]!, e.touches[1]!),
          baseZoom: zoom,
        };
        return;
      }
      // Single-tap path — record for double-tap detection.
      if (e.touches.length === 1) {
        const t = e.touches[0]!;
        const now = Date.now();
        const prev = lastTapRef.current;
        const dt = now - prev.t;
        const dx = Math.abs(t.clientX - prev.x);
        const dy = Math.abs(t.clientY - prev.y);
        if (dt < 320 && dx < 30 && dy < 30) {
          // Double tap → toggle zoom. 1 → 2, anything else → 1.
          setZoom((z) => (z > 1.05 ? 1 : 2));
          lastTapRef.current = { t: 0, x: 0, y: 0 };
        } else {
          lastTapRef.current = { t: now, x: t.clientX, y: t.clientY };
        }
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current.active) {
        e.preventDefault();
        const d = dist(e.touches[0]!, e.touches[1]!);
        const next = Math.max(
          ZOOM_MIN,
          Math.min(
            ZOOM_MAX,
            pinchRef.current.baseZoom * (d / pinchRef.current.baseDist),
          ),
        );
        setZoom(next);
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current.active = false;
    };
    // passive:false so preventDefault during the pinch actually works.
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [zoom, editing]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${name} viewer`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(20,18,16,0.96)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top bar — safe-area-padded so it clears the iOS notch */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding:
            "calc(env(safe-area-inset-top, 0px) + 10px) 14px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          color: "#fff",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.06)",
            color: "#fff",
            fontSize: 18,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          ×
        </button>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: "DM Sans, sans-serif",
            fontWeight: 600,
            fontSize: 14,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </div>
        {editable ? (
          <button
            type="button"
            onClick={() => {
              if (editing) setZoom(1); // reset zoom so the page coords line up
              setEditing((v) => !v);
            }}
            aria-pressed={editing}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: editing
                ? "1px solid #FF5C35"
                : "1px solid rgba(255,255,255,0.18)",
              background: editing ? "#FF5C35" : "rgba(255,255,255,0.06)",
              color: "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {editing ? "Done" : "Edit bars"}
          </button>
        ) : null}
        {openWaits ? (
          // The blacked-out copy is rebuilt from the saved bars, so the
          // link waits for this edit to land instead of opening a copy
          // that's missing it.
          <span
            role="status"
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.6)",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            Saving…
          </span>
        ) : hideOpen ? null : (
          <a
            href={publicHref ?? url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={
              publicHref ? "Open the blacked-out copy others see" : "Open file"
            }
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            Open
          </a>
        )}
      </header>

      {/* Owner note, right under "Edit bars": one line on who sees what,
          and the owner's own way to the original once others get a
          blacked-out copy. */}
      {editable ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "6px 12px",
            padding: "8px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.72)",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          <span style={{ flex: "1 1 200px", minWidth: 0 }}>{ownerNote}</span>
          {hosted && hasBars && !hideOpen ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#fff",
                fontWeight: 700,
                textDecoration: "underline",
                textUnderlineOffset: 2,
                flexShrink: 0,
              }}
            >
              Open my original
            </a>
          ) : null}
        </div>
      ) : null}

      {/* Pages area. Positioned so the zoom pill anchors to its top edge
          wherever the header and note strip end. */}
      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Zoom reset pill — only visible when the user has zoomed past
            1×. Pinch ↔ this button are the two ways back to fit-to-width. */}
        {zoom > 1.02 ? (
          <button
            type="button"
            onClick={() => setZoom(1)}
            aria-label="Reset zoom"
            style={{
              position: "absolute",
              top: 0,
              right: 14,
              zIndex: 2,
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.22)",
              background: "rgba(20,18,16,0.78)",
              color: "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {Math.round(zoom * 100)}% · Reset
          </button>
        ) : null}

        {/* Scroll area with stacked pages. When the user pinches past 1x
            the pages widen past the viewport, so overflowX flips to auto
            to allow horizontal pan. `touch-action: pan-y` makes single-
            finger gestures continue to vertical-scroll naturally — two
            fingers go to our pinch handler via the useEffect above. */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: zoom > 1 ? "auto" : "hidden",
            overscrollBehavior: "contain",
            padding: "16px 12px calc(24px + env(safe-area-inset-bottom, 0px))",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            touchAction: "pan-x pan-y",
            // CSS var that PageWrap reads to scale its max-width. Cast
            // through `as` since React's CSS types don't know custom vars.
            ["--rv-zoom" as never]: zoom,
          } as React.CSSProperties}
        >
          {error ? (
            <div
              style={{
                color: "#FFB199",
                padding: "32px 18px",
                textAlign: "center",
                fontSize: 14,
              }}
            >
              {error}
            </div>
          ) : pages === null ? (
            <ViewerSkeleton />
          ) : (
            pages.map((pageUrl, i) => {
              const pageNum = i + 1;
              const pageBars = localBars.filter((b) => b.pageNumber === pageNum);
              return (
                <PageWrap
                  key={`${i}-${pageUrl.slice(0, 32)}`}
                  pageUrl={pageUrl}
                  pageNumber={pageNum}
                  bars={pageBars}
                  editing={editing}
                  onAddBar={(bar) => {
                    const added: DocBar = {
                      ...bar,
                      docIndex,
                      docKey: url,
                      pageNumber: pageNum,
                    };
                    editBars([...localBars, added], { add: added });
                  }}
                  onDeleteBar={(barIdxOnPage) => {
                    // Translate page-local idx to the bar itself. The
                    // parent removes by shape, so do the same here.
                    const target = pageBars[barIdxOnPage];
                    if (!target) return;
                    editBars(
                      localBars.filter((b) => !sameBarShape(b, target)),
                      { remove: target },
                    );
                  }}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function PageWrap({
  pageUrl,
  pageNumber,
  bars,
  editing = false,
  onAddBar,
  onDeleteBar,
}: {
  pageUrl: string;
  pageNumber: number;
  bars: RedactionBar[];
  /** When true, pointer drag on the page draws a new bar and tap on a
   *  bar deletes it. When false (the default), bars are static. */
  editing?: boolean;
  onAddBar?: (bar: Pick<RedactionBar, "x" | "y" | "w" | "h">) => void;
  onDeleteBar?: (idxOnPage: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Drag-to-draw state. Stored in % coords (relative to the page wrap)
  // so we can preview the rect using the same coordinate system as
  // persisted bars.
  const [draft, setDraft] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);

  const pctFromEvent = (e: React.PointerEvent) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!editing || !onAddBar) return;
    // Skip if the press landed on an existing bar — those have their
    // own onClick to delete. Without this, tapping a bar would also
    // start a 0×0 drag.
    const target = e.target as HTMLElement;
    if (target.dataset.bar === "1") return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = pctFromEvent(e);
    drawStartRef.current = p;
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!editing || !drawStartRef.current) return;
    const p = pctFromEvent(e);
    const start = drawStartRef.current;
    setDraft({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    });
  };
  const handlePointerEnd = () => {
    if (!editing) return;
    const d = draft;
    drawStartRef.current = null;
    setDraft(null);
    // Drop the rect if it's basically a tap (no drag distance). 1.5% on
    // either axis is roughly a pixel or two of finger travel on phone —
    // anything below that, treat as accidental.
    if (!d || d.w < 1.5 || d.h < 1.5) return;
    onAddBar?.({ x: d.x, y: d.y, w: d.w, h: d.h });
  };

  return (
    <div
      ref={wrapRef}
      data-page={pageNumber}
      onPointerDown={editing ? handlePointerDown : undefined}
      onPointerMove={editing ? handlePointerMove : undefined}
      onPointerUp={editing ? handlePointerEnd : undefined}
      onPointerCancel={editing ? handlePointerEnd : undefined}
      style={{
        position: "relative",
        // Width = viewport-fit base × pinch zoom. At zoom 1 the page
        // tracks the container; at zoom > 1 the page widens past the
        // viewport so the scroll container can horizontal-pan.
        // `flexShrink: 0` keeps the row from collapsing the page when
        // it overflows the cross-axis.
        width: "calc(min(100%, 720px) * var(--rv-zoom, 1))",
        flexShrink: 0,
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
        background: "#fff",
        cursor: editing ? "crosshair" : "default",
        // Suppress native scroll/pinch handling on the page itself
        // while editing — otherwise a one-finger drag tries to scroll.
        touchAction: editing ? "none" : undefined,
        outline: editing ? "2px dashed rgba(255,92,53,0.55)" : "none",
        outlineOffset: editing ? -2 : 0,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pageUrl}
        alt={`Page ${pageNumber}`}
        draggable={false}
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          pointerEvents: editing ? "none" : "auto",
        }}
      />
      {bars.map((bar, j) => (
        <div
          key={`bar-${j}`}
          data-bar="1"
          aria-label={editing ? "Tap to remove bar" : undefined}
          onClick={
            editing && onDeleteBar
              ? (e) => {
                  e.stopPropagation();
                  if (
                    typeof window !== "undefined" &&
                    !window.confirm("Remove this bar?")
                  ) {
                    return;
                  }
                  onDeleteBar(j);
                }
              : undefined
          }
          style={{
            position: "absolute",
            left: `${bar.x}%`,
            top: `${bar.y}%`,
            width: `${bar.w}%`,
            height: `${bar.h}%`,
            background: "#1c1c1e",
            // Subtle inner highlight so the bar reads as a deliberate
            // redaction rather than a missing image region.
            boxShadow:
              "inset 0 0 0 1px rgba(255,255,255,0.06), 0 1px 3px rgba(0,0,0,0.25)",
            cursor: editing ? "pointer" : "default",
            outline: editing ? "1px solid rgba(255,92,53,0.6)" : "none",
          }}
        />
      ))}

      {/* Live draft of the rect being drawn. Same coord system as
          persisted bars; pointer-events none so it doesn't block its
          own pointermove. */}
      {draft ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: `${draft.x}%`,
            top: `${draft.y}%`,
            width: `${draft.w}%`,
            height: `${draft.h}%`,
            background: "rgba(28,28,30,0.6)",
            border: "1px solid rgba(255,92,53,0.95)",
            pointerEvents: "none",
          }}
        />
      ) : null}
    </div>
  );
}

function ViewerSkeleton() {
  return (
    <>
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            width: "100%",
            maxWidth: 720,
            aspectRatio: "8.5/11",
            background: "rgba(255,255,255,0.05)",
            borderRadius: 8,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%)",
              animation: "viewerShimmer 1.4s ease-in-out infinite",
              width: "40%",
            }}
          />
        </div>
      ))}
      <style>{`@keyframes viewerShimmer {
        0% { transform: translateX(-120%); }
        100% { transform: translateX(380%); }
      }`}</style>
    </>
  );
}
