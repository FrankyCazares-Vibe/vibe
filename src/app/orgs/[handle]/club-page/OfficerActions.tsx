"use client";

/**
 * The officer's buttons on the club page (wave 2, C9; the page mounts them).
 * They replace the officer bar (`OrgProfileAdminBar`): Banner and Logo moved
 * into Edit page, New post into + Post, Invite people and the members' link
 * into Club tools.
 *
 * - EditPageButton: the Edit page dialog (since Oct 22, 2026 it opens on
 *   Look: photo, cover and background, then the club's name;
 *   LookSection.tsx). Since Oct 22, 2026 (PLAN-5; phones the same day) Edit
 *   page lives in Club settings and Club tools, not the row: its button
 *   carries `vibe-club-edit-page`, which the CSS hides, but it stays mounted
 *   so every door still opens the dialog. The address `?edit=1` (Club
 *   tools' "Edit the page", Club settings' Edit page on a phone) opens it
 *   once, then comes off the address so a reload or Back doesn't open it
 *   again; the computer's Arc and tools panel open it directly
 *   (`openEditPage`, club-tools-launcher.ts), as many times as they like.
 * - SharePageButton: the half-width "Share page" pill, or the 44px square;
 *   since Oct 23, 2026 either opens the Share sheet (ShareSheet.tsx).
 * - RowPostButton and RowClubToolsButton: the cover's old + and ≡ as pills
 *   in the row under the bio (Franky, Oct 22, 2026: they made no sense in
 *   the cover's corner, which is empty now on every screen).
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type CSSProperties, type JSX, useEffect, useRef, useState } from "react";

import type { JoinPolicy, OrgAudience } from "@/lib/orgs/join-state";

import { EditPageModal, UploadAssetModal } from "../admin-actions";
import { openClubToolsLauncher, registerEditPageOpener } from "./club-tools-launcher";
import { PlusSheet } from "./PlusSheet";
import { ShareSheet, type ShareViewer } from "./ShareSheet";

type EditProps = {
  orgHandle: string;
  orgName: string;
  hidden: boolean;
  openToCampus: { name: string; shared: boolean } | null;
  /** The club's name as stored: Edit page's Name field starts here (Oct 22, 2026). */
  initialName: string;
  /** The stored `orgs.backdrop_preset`: Look's picker starts here ("cream" shows as the default). */
  initialBackdrop: string;
  /** The page's own picture addresses, for Look's thumbnails and the phone's preview card. */
  logoUrl: string | null;
  bannerUrl: string | null;
  joinPolicy: JoinPolicy;
  audience: OrgAudience;
  initialDescription: string;
  initialLinks: { label: string; url: string }[];
  initialPhilanthropy: string;
  initialMeetingTime: string;
  /** False: the database has no meeting_time column yet, so the field stays out. */
  meetingTimeReady: boolean;
};

/** On the page and drawn: not removed, not under `display: none`. */
function showing(el: HTMLElement | null): el is HTMLElement {
  return !!el && el.isConnected && el.getClientRects().length > 0;
}

/**
 * What had focus as Edit page opens, kept when `button` is out of sight
 * (`el` null when nothing did); null when the button is in sight.
 */
function focusToKeep(button: HTMLElement | null): { el: HTMLElement | null } | null {
  if (showing(button)) return null;
  const active = document.activeElement;
  return { el: active instanceof HTMLElement && active !== document.body ? active : null };
}

/**
 * "kept" = Edit page is mounted but out of sight under a picture upload,
 * because something in it was typed; it comes back when the upload closes.
 */
type EditState = "closed" | "open" | "kept";

export function EditPageButton(props: EditProps): JSX.Element {
  const { orgHandle, hidden } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [edit, setEdit] = useState<EditState>("closed");
  const [asset, setAsset] = useState<"logo" | "banner" | null>(null);
  const tookEditParam = useRef(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const editRef = useRef<EditState>("closed");
  useEffect(() => {
    editRef.current = edit;
  });

  // Opened while this button is out of sight (Club settings in the app
  // frame, Oct 22, 2026): the dialog can't hand focus back to a hidden
  // button, so we keep what had it and hand it back ourselves on close.
  // Null when the button is in sight: the dialog's own return (ModalShell,
  // admin-actions.tsx) brings focus back to it.
  const returnTo = useRef<{ el: HTMLElement | null } | null>(null);
  // A frame late, after the dialog's own return: where focus was if it is
  // still there and drawn (the Arc's row is gone by then), else the Arc's
  // door (the planet from 1024px, the row's Club tools pill from 900 to
  // 1023px), else this button if a narrower window shows it again, else
  // left be. Opened from the button in sight but closing with it hidden (the
  // window grew past 900px meanwhile): the dialog's return can't land on
  // it, so the same doors are tried.
  const giveFocusBack = () => {
    const back = returnTo.current ?? (showing(buttonRef.current) ? null : { el: null });
    if (!back) return;
    returnTo.current = null;
    window.requestAnimationFrame(() => {
      const planet = document.querySelector<HTMLElement>(".vibe-arc-planet-hit");
      const rowTools = document.querySelector<HTMLElement>(".vibe-club-row-tools");
      [back.el, planet, rowTools, buttonRef.current].find(showing)?.focus({ preventScroll: true });
    });
  };

  // The tools panel's "Edit the page". A button in sight takes focus first,
  // so closing the dialog brings it back here, as if it had been pressed.
  // Already open: nothing moves.
  useEffect(
    () =>
      registerEditPageOpener(() => {
        if (editRef.current === "closed") {
          returnTo.current = focusToKeep(buttonRef.current);
          if (!returnTo.current) buttonRef.current?.focus({ preventScroll: true });
        }
        setEdit("open");
      }),
    [],
  );

  useEffect(() => {
    if (tookEditParam.current || searchParams.get("edit") !== "1") return;
    tookEditParam.current = true;
    returnTo.current = focusToKeep(buttonRef.current);
    setEdit("open");
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete("edit");
    const query = rest.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}${window.location.hash}`, { scroll: false });
  }, [searchParams, pathname, router]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="vibe-press vibe-club-edit-page"
        aria-haspopup="dialog"
        onClick={() => {
          returnTo.current = null;
          setEdit("open");
        }}
        style={halfPillStyle}
      >
        Edit page
      </button>

      {edit !== "closed" ? (
        <EditPageModal
          orgHandle={orgHandle}
          hidden={hidden}
          openToCampus={props.openToCampus}
          initialName={props.initialName}
          initialBackdrop={props.initialBackdrop}
          logoUrl={props.logoUrl}
          bannerUrl={props.bannerUrl}
          initialJoinPolicy={props.joinPolicy}
          initialAudience={props.audience}
          initialDescription={props.initialDescription}
          initialLinks={props.initialLinks}
          initialPhilanthropy={props.initialPhilanthropy}
          initialMeetingTime={props.initialMeetingTime}
          meetingTimeReady={props.meetingTimeReady}
          concealed={edit === "kept"}
          // A hidden club keeps Edit page and nothing else (plan §7 F6), as
          // the officer bar did: no photo or cover buttons there.
          onChangeAsset={
            hidden
              ? undefined
              : (kind, dirty) => {
                  setAsset(kind);
                  setEdit(dirty ? "kept" : "closed");
                }
          }
          onClose={() => {
            setEdit("closed");
            giveFocusBack();
          }}
        />
      ) : null}

      {asset && !hidden ? (
        <UploadAssetModal
          orgHandle={orgHandle}
          kind={asset}
          onClose={() => {
            // Kept: Edit page comes back and takes focus. Otherwise the
            // picture was the last dialog up.
            if (editRef.current !== "kept") giveFocusBack();
            setAsset(null);
            setEdit((e) => (e === "kept" ? "open" : e));
          }}
        />
      ) : null}
    </>
  );
}

/**
 * `compact`: a 44px square with the share glyph, for the row a visitor or a
 * member sees, where the join control often holds two actions with a line
 * under each and needs the room; officers keep the two halves.
 *
 * Since Oct 23, 2026 (wave 3, B2) both open the Share sheet (ShareSheet.tsx):
 * the club's link picture, Send it, Copy link and, for `viewer` "officer",
 * the table card. The Arc and the tools rows keep sharing straight away
 * (shareClubPage).
 */
export function SharePageButton({
  orgHandle,
  orgName,
  compact = false,
  viewer = "visitor",
}: {
  orgHandle: string;
  orgName: string;
  compact?: boolean;
  viewer?: ShareViewer;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  // Back to the button when the sheet is done (the phone sheet doesn't hand
  // focus back on its own), a frame late, after the dialog's own return.
  const close = () => {
    setOpen(false);
    window.requestAnimationFrame(() => {
      if (ref.current?.isConnected) ref.current.focus({ preventScroll: true });
    });
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="vibe-press"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        aria-label={compact ? "Share page" : undefined}
        style={compact ? squarePillStyle : halfPillStyle}
      >
        {compact ? <ShareGlyph /> : "Share page"}
      </button>
      {open ? <ShareSheet handle={orgHandle} name={orgName} viewer={viewer} onClose={close} /> : null}
    </>
  );
}

/**
 * "+ Post", the row's first pill, in coral (PLAN-5, Oct 22, 2026; on phones
 * too the same day): the PlusSheet the cover's + used to open. The page
 * leaves it out on a hidden club (nothing new goes on one).
 */
export function RowPostButton({
  orgId,
  orgHandle,
  orgName,
  verified,
  viewerRole,
  boardId,
}: {
  orgId: string;
  orgHandle: string;
  orgName: string;
  verified: boolean;
  viewerRole: "owner" | "admin";
  boardId: string | null;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  // Back to the pill when the sheet is done (the event form doesn't hand
  // focus back on its own), a frame late, after the sheet's own return.
  const close = () => {
    setOpen(false);
    window.requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }));
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="vibe-press vibe-club-row-post"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        style={postPillStyle}
      >
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Post
      </button>
      {open ? (
        <PlusSheet club={{ orgId, orgHandle, orgName, verified, viewerRole, boardId }} onClose={close} />
      ) : null}
    </>
  );
}

/**
 * Club tools as a pill in the row (PLAN-5, Oct 22, 2026): on a phone it is
 * the Club tools page; on a computer it brings the Arc out, and from 1024px,
 * where the Arc's planet shows, the CSS hides it (`vibe-club-row-tools`).
 * A hidden club keeps it, or its officers couldn't reach the members, the
 * officers or Leave on a phone (review F5).
 */
export function RowClubToolsButton({ orgHandle }: { orgHandle: string }): JSX.Element {
  return (
    <Link
      href={`/orgs/${encodeURIComponent(orgHandle)}/tools`}
      className="vibe-press vibe-club-row-tools"
      onClick={(e) => {
        // A new tab or window still gets the page.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (openClubToolsLauncher(e.currentTarget)) e.preventDefault();
      }}
      style={{ ...halfPillStyle, textDecoration: "none" }}
    >
      Club tools
    </Link>
  );
}

// ─── Looks ────────────────────────────────────────────────────────────────

/** Half of the button row (C9 item 4): the page's dark glass, 44px. */
const halfPillStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid rgba(var(--scrim-rgb),0.10)",
  background: "rgba(var(--scrim-rgb),0.09)",
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14.5,
  fontWeight: 700,
  whiteSpace: "nowrap",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const squarePillStyle: CSSProperties = {
  ...halfPillStyle,
  flex: "0 0 44px",
  width: 44,
  padding: 0,
};

/** The row's + Post: the half pill in the brand coral, dark ink on it. */
const postPillStyle: CSSProperties = {
  ...halfPillStyle,
  gap: 6,
  border: "1px solid var(--coral)",
  background: "var(--coral)",
  color: "var(--on-coral)",
};

function ShareGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}
