"use client";

/**
 * The officer's buttons on the club page (wave 2, C9; the page mounts them).
 * They replace the officer bar (`OrgProfileAdminBar`): Banner and Logo moved
 * into Edit page, New post into +, Invite people and the members' link into
 * Club tools.
 *
 * - EditPageButton: the half-width "Edit page" pill and its dialog. The
 *   address `?edit=1` (Club tools' "Edit the page") opens it once, then comes
 *   off the address so a reload or Back doesn't open it again.
 * - SharePageButton: the half-width "Share page" pill (share-page.ts).
 * - CoverOfficerButtons: + and Club tools, two round buttons for the cover's
 *   top-right corner. They draw no position of their own: the page places
 *   the row. In the app frame on a computer, Club tools brings out the
 *   Club tools panel (club-tools-drawer.ts); elsewhere it is the page.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type CSSProperties, type JSX, useEffect, useRef, useState } from "react";

import type { JoinPolicy, OrgAudience } from "@/lib/orgs/join-state";

import { EditPageModal, UploadAssetModal } from "../admin-actions";
import { openClubToolsDrawer } from "./club-tools-drawer";
import { PlusSheet } from "./PlusSheet";
import { shareClubPage } from "./share-page";

type EditProps = {
  orgHandle: string;
  orgName: string;
  hidden: boolean;
  openToCampus: { name: string; shared: boolean } | null;
  joinPolicy: JoinPolicy;
  audience: OrgAudience;
  initialDescription: string;
  initialLinks: { label: string; url: string }[];
  initialPhilanthropy: string;
  initialMeetingTime: string;
  /** False: the database has no meeting_time column yet, so the field stays out. */
  meetingTimeReady: boolean;
};

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

  useEffect(() => {
    if (tookEditParam.current || searchParams.get("edit") !== "1") return;
    tookEditParam.current = true;
    setEdit("open");
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete("edit");
    const query = rest.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}${window.location.hash}`, { scroll: false });
  }, [searchParams, pathname, router]);

  return (
    <>
      <button
        type="button"
        className="vibe-press"
        aria-haspopup="dialog"
        onClick={() => setEdit("open")}
        style={halfPillStyle}
      >
        Edit page
      </button>

      {edit !== "closed" ? (
        <EditPageModal
          orgHandle={orgHandle}
          hidden={hidden}
          openToCampus={props.openToCampus}
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
          onClose={() => setEdit("closed")}
        />
      ) : null}

      {asset && !hidden ? (
        <UploadAssetModal
          orgHandle={orgHandle}
          kind={asset}
          onClose={() => {
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
 */
export function SharePageButton({
  orgHandle,
  orgName,
  compact = false,
}: {
  orgHandle: string;
  orgName: string;
  compact?: boolean;
}): JSX.Element {
  // One sheet at a time: a second tap while one is up would be refused and
  // fall through to a copy.
  const sharing = useRef(false);
  const share = async () => {
    if (sharing.current) return;
    sharing.current = true;
    try {
      await shareClubPage({ handle: orgHandle, name: orgName });
    } finally {
      sharing.current = false;
    }
  };
  return (
    <button
      type="button"
      className="vibe-press"
      onClick={() => void share()}
      aria-label={compact ? "Share page" : undefined}
      style={compact ? squarePillStyle : halfPillStyle}
    >
      {compact ? <ShareGlyph /> : "Share page"}
    </button>
  );
}

export function CoverOfficerButtons({
  orgId,
  orgHandle,
  orgName,
  verified,
  viewerRole,
  boardId,
  hidden = false,
}: {
  orgId: string;
  orgHandle: string;
  orgName: string;
  verified: boolean;
  viewerRole: "owner" | "admin";
  boardId: string | null;
  /**
   * A club Vibe hid: no + (nothing new goes on it, as the officer bar had no
   * New post there), but Club tools stays, or its officers couldn't reach
   * the members, the officers or Leave on a phone (review F5).
   */
  hidden?: boolean;
}): JSX.Element {
  const [plusOpen, setPlusOpen] = useState(false);
  const plusRef = useRef<HTMLButtonElement | null>(null);
  // Back to + when whatever it opened is done (the event form doesn't hand
  // focus back on its own); a frame late, after the sheet's own return.
  const closePlus = () => {
    setPlusOpen(false);
    window.requestAnimationFrame(() => plusRef.current?.focus({ preventScroll: true }));
  };
  return (
    <>
      <div className="vibe-club-cover-actions" style={{ display: "flex", gap: 4 }}>
        {hidden ? null : (
          <button
            type="button"
            className="vibe-press"
            ref={plusRef}
            aria-label="Post"
            aria-haspopup="dialog"
            onClick={() => setPlusOpen(true)}
            style={roundHitStyle}
          >
            <span aria-hidden style={roundFaceStyle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          </button>
        )}
        <Link
          href={`/orgs/${encodeURIComponent(orgHandle)}/tools`}
          className="vibe-press"
          aria-label="Club tools"
          onClick={(e) => {
            // A new tab or window still gets the page.
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            if (openClubToolsDrawer(e.currentTarget)) e.preventDefault();
          }}
          style={roundHitStyle}
        >
          <span aria-hidden style={roundFaceStyle}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 7h14M5 12h14M5 17h14" />
            </svg>
          </span>
        </Link>
      </div>
      {plusOpen ? (
        <PlusSheet
          club={{ orgId, orgHandle, orgName, verified, viewerRole, boardId }}
          onClose={closePlus}
        />
      ) : null}
    </>
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

function ShareGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

/** A 44px target around the drawn 40px circle. */
const roundHitStyle: CSSProperties = {
  width: 44,
  height: 44,
  display: "grid",
  placeItems: "center",
  padding: 0,
  border: "none",
  borderRadius: 999,
  background: "transparent",
  color: "var(--charcoal)",
  textDecoration: "none",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

/**
 * Dark glass that reads on any cover, a white one included: the Night glass
 * token under a blur, a light rim, and a soft shadow off the picture.
 */
const roundFaceStyle: CSSProperties = {
  width: 40,
  height: 40,
  display: "grid",
  placeItems: "center",
  borderRadius: 999,
  background: "var(--glass-65)",
  border: "1px solid rgba(var(--scrim-rgb),0.16)",
  boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
  backdropFilter: "blur(10px) saturate(140%)",
  WebkitBackdropFilter: "blur(10px) saturate(140%)",
  color: "var(--charcoal)",
};
