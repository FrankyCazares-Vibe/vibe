"use client";

import { AnimatePresence } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX } from "react";
import { createPortal } from "react-dom";

import { OrgInviteSheet } from "@/components/orgs/OrgInviteSheet";
import type { ToolsClub } from "@/components/orgs/tools/types";
import type { JoinPolicy, OrgAudience } from "@/lib/orgs/join-state";

import { ARC, FRAME_MENU_WIDTH, arcLayout, planetCount, planetLabel, type ArcToolId } from "./club-tools-arc";
import { LAUNCHER_QUERY, openEditPage, registerClubToolsLauncher } from "./club-tools-launcher";
import { openPanelAt, panelBack, panelBloom, type PanelEntry, type PanelState } from "./club-tools-panel";
import { ClubToolsArc } from "./ClubToolsLauncherArc";
import type { ArcClub, RosterRead } from "./ClubToolsLauncherCards";
import { ClubToolsPlanet } from "./ClubToolsLauncherPlanet";
import type { ClubToolsSetup, PanelHost } from "./ClubToolsPanel";

/**
 * Club tools on a computer, in the app frame: the Arc (Oct 22, 2026,
 * Franky picked it from the space boards, `FloatArc.dc.html`; it replaces
 * the slide-out panel). The owner and officers get a little planet half
 * tucked into the window's right edge (ClubToolsLauncherPlanet.tsx), with a
 * coral count while someone wants to join. It, or the cover's Club tools
 * button (club-tools-launcher.ts), brings the tools out of it in an arc
 * (ClubToolsLauncherArc.tsx): Invite and share, Members, Followers, Join
 * requests in the middle, Officers and titles, Past events, Club settings.
 * Each opens a card beside the arc with the real thing from the club's own
 * routes (approve a request, invite a follower, see the officers), and the
 * way to that tool's whole page.
 *
 * The page mounts this only in the frame and only for them. The planet shows
 * from 1024px, where the page leaves it a margin; from 900px the cover's
 * button opens the arc; under 900px it is the Club tools page, as on a
 * phone. The arc closes on the planet, its close target, Escape (after the
 * card), a click outside, a page change and a window narrower than 900px;
 * focus goes back to whatever opened it, unless a link is leaving the page.
 * After something changed the club (a request approved or declined), the
 * page is read again as the arc closes, so its counts catch up.
 *
 * Tools open in place (Oct 22, 2026; PLAN-2.md T1): with the officer's
 * `role`, a card's "Open Join requests", "See all members" and the rest no
 * longer leave the page. The planet grows into the tools panel
 * (ClubToolsPanel.tsx), the phone's Club tools screens in it, and the arc
 * folds into the planet while it is out; ‹ goes back a screen and then to
 * the arc, with the card that opened it; × or Escape closes everything.
 * Opening a screen counts as a change (they act on the club), so the page is
 * read again on the way back to the arc and when it all closes.
 */
export type ClubToolsLauncherProps = {
  handle: string;
  orgId: string;
  orgName: string;
  verified: boolean;
  hidden: boolean;
  joinPolicy: JoinPolicy;
  audience: OrgAudience;
  /** The officers' exact numbers; each null when its read failed (no number shows). */
  counts: { requests: number | null; members: number | null; followers: number | null };
  /** The viewer, so the Members and Officers cards can say "you". Optional. */
  viewerId?: string | null;
  /**
   * The viewer's role in the club. With it, the cards' links open the tools
   * in place, in the panel; without it, they go to the Club tools pages.
   */
  role?: "owner" | "admin";
  /** The setup list, for the panel's setup screen and members' link; absent, it shows the members' link alone. */
  setup?: ClubToolsSetup | null;
};

const noSubscribe = () => () => {};
const onResize = (notify: () => void) => {
  window.addEventListener("resize", notify);
  return () => window.removeEventListener("resize", notify);
};
// The window's size WITHOUT its scroll bars (review, Oct 22, 2026): the
// planet (`right`, `top: 50%`) and the arc's `inset: 0` box are fixed to
// that, and `innerWidth` counts a classic scroll bar (Windows, or a Mac with
// a mouse plugged in), which put the arc's centre and the close target 15px
// right of the planet. Read again on every render, so opening the arc picks
// up a scroll bar that came or went without a resize.
const windowSize = () => `${document.documentElement.clientWidth}x${document.documentElement.clientHeight}`;

export function ClubToolsLauncher({
  handle,
  orgId,
  orgName,
  verified,
  hidden,
  joinPolicy,
  audience,
  counts,
  viewerId = null,
  role,
  setup = null,
}: ClubToolsLauncherProps): JSX.Element | null {
  const router = useRouter();
  const pathname = usePathname();
  // The planet and the arc go to <body>, so nothing on the page can trap
  // them in its stacking: after hydration only, the same render on the
  // server and the first client pass.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const size = useSyncExternalStore(onResize, windowSize, () => "0x0");

  // The page it was opened on: a page change closes it with no effect to run.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn !== null && openOn === pathname;
  const [tool, setTool] = useState<ArcToolId | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  // The arc is on screen: open, or still flying back into the planet. Under
  // 1024px the planet shows only while this is true, so it doesn't vanish
  // before the bubbles reach it (review, Oct 22, 2026).
  const [arcShown, setArcShown] = useState(false);
  // A tool open in place, and the bloom on its way back into the planet
  // after ‹ (the planet stays hidden until it is back).
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [returning, setReturning] = useState(false);

  // The planet's count follows the Join requests card once it has read the
  // list, until the page sends a new number.
  const [liveRequests, setLiveRequests] = useState<number | null>(null);
  const [seenRequests, setSeenRequests] = useState(counts.requests);
  if (seenRequests !== counts.requests) {
    setSeenRequests(counts.requests);
    setLiveRequests(null);
  }
  const live = useMemo(
    () => ({ ...counts, requests: liveRequests ?? counts.requests }),
    [counts, liveRequests],
  );

  const planetRef = useRef<HTMLButtonElement | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const rosterRef = useRef<RosterRead | null>(null);
  const changed = useRef(false);

  const show = useCallback(
    (from: HTMLElement | null) => {
      returnTo.current = from;
      rosterRef.current = null;
      setTool(null);
      setInviteOpen(false);
      setPanel(null);
      setReturning(false);
      setArcShown(true);
      setOpenOn(pathname);
    },
    [pathname],
  );
  useEffect(() => registerClubToolsLauncher(show), [show]);

  /** Closed: focus goes back where it came from, unless a link is leaving the page. */
  const close = useCallback(
    (giveFocusBack: boolean) => {
      setOpenOn(null);
      setInviteOpen(false);
      setPanel(null);
      setReturning(false);
      if (changed.current) {
        changed.current = false;
        router.refresh();
      }
      if (!giveFocusBack) return;
      window.requestAnimationFrame(() => {
        // The opener, else the planet, else the cover's button: whichever is
        // still on the page and showing (the planet hides under 1024px).
        const back = [returnTo.current, planetRef.current, document.querySelector<HTMLElement>('a[aria-label="Club tools"]')].find(
          (el) => !!el && el.isConnected && el.getClientRects().length > 0,
        );
        back?.focus({ preventScroll: true });
      });
    },
    [router],
  );

  /** A link in a card: leaving the page, focus goes with it; one on this page (Past events) gives it back. */
  const leave = useCallback(
    (href: string) => {
      const samePage = new URL(href, window.location.href).pathname === window.location.pathname;
      close(samePage);
    },
    [close],
  );

  // A window going under 900px closes it. Subscribed once per opening, not
  // on every render: a resize re-renders this (the layout follows the
  // window), and a listener swapped mid-resize would miss the change itself.
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia(LAUNCHER_QUERY);
    const onChange = () => {
      if (!mq.matches) closeRef.current(true);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open]);

  // The arc, and the panel's bloom round the open planet, in this window.
  const { layout, bloom } = useMemo(() => {
    const [w, h] = size.split("x").map(Number);
    const width = w || 1280;
    const height = h || 800;
    const arc = arcLayout(width, height, FRAME_MENU_WIDTH + ARC.margin);
    return { layout: arc, bloom: panelBloom(width, height, arc.hub, arc.closeSpot.size) };
  }, [size]);

  const club: ArcClub = useMemo(
    () => ({ handle, orgId, name: orgName, verified, hidden, joinPolicy, audience, viewerId }),
    [handle, orgId, orgName, verified, hidden, joinPolicy, audience, viewerId],
  );

  const markChanged = useCallback(() => {
    changed.current = true;
  }, []);

  const closeInvite = useCallback(() => {
    setInviteOpen(false);
    // Back to Invite members in the card, once the arc under the sheet takes focus again.
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-arc-invite]")?.focus({ preventScroll: true }));
  }, []);

  // ── Tools in place ──────────────────────────────────────────────────────

  // The phone's screens' club, from the page's own props (only the fields
  // they read: no logo, no owner). No role, no panel.
  const toolsClub: ToolsClub | null = useMemo(
    () =>
      role
        ? { id: orgId, handle, name: orgName, logoUrl: null, verified, hidden, joinPolicy, audience, ownerId: null, role, viewerId: viewerId ?? "" }
        : null,
    [role, orgId, handle, orgName, verified, hidden, joinPolicy, audience, viewerId],
  );

  /** A card's link, or a row of All Club tools: that screen, in place, the card it came from remembered. */
  const openPanel = useCallback(
    (entry: PanelEntry) => {
      // Every screen can change the club; whatever shows next reads the roster afresh.
      changed.current = true;
      rosterRef.current = null;
      setReturning(false);
      setPanel((p) => openPanelAt(p, entry, tool));
      setTool(null);
    },
    [tool],
  );

  /** ‹ : a screen back; from the first, back to the arc, with the card that opened it. */
  const backPanel = useCallback(() => {
    if (!panel) return;
    rosterRef.current = null;
    // What changed in there shows on the numbers now: the arc's and the
    // page's, and All Club tools' too when ‹ comes back to it (its counts
    // are the page's; review, Oct 22, 2026: a request approved on Join
    // requests still showed on its row until the arc).
    if (changed.current) {
      changed.current = false;
      router.refresh();
    }
    const next = panelBack(panel);
    if (next) {
      setPanel(next);
      return;
    }
    setPanel(null);
    setReturning(true);
    setTool(panel.from);
  }, [panel, router]);

  const onReturned = useCallback(() => setReturning(false), []);
  // The planet never stays hidden if the bloom's way back is cut short.
  useEffect(() => {
    if (!returning) return;
    const t = window.setTimeout(() => setReturning(false), 1200);
    return () => window.clearTimeout(t);
  }, [returning]);

  const clubPath = `/orgs/${encodeURIComponent(handle)}`;
  // Edit page lives in Club settings on a computer (Oct 22, 2026): the
  // arc's card and the panel's screen both open it here. Edit page gives
  // focus back itself (OfficerActions.tsx), so there is none to hand back.
  const editPage = useCallback(() => {
    close(false);
    if (!openEditPage()) router.push(`${clubPath}?edit=1`, { scroll: false });
  }, [close, router, clubPath]);
  const panelHost: PanelHost | null = useMemo(() => {
    if (!toolsClub) return null;
    return {
      club: toolsClub,
      setup,
      counts: live,
      rosterRef,
      onBack: backPanel,
      onClose: () => close(true),
      onOpen: openPanel,
      onEditPage: editPage,
      onPastEvents: () => {
        // As the Past events card's link: the Events tab, on this page.
        close(true);
        router.push(`${clubPath}?tab=events`);
      },
      onLeft: () => {
        // No longer an officer: the page, read again, draws no Club tools.
        changed.current = true;
        close(false);
      },
      onDeleted: () => {
        // The club is gone: nothing to read again, off to Campus › Orgs.
        changed.current = false;
        close(false);
        router.replace("/campus?tab=orgs");
      },
    };
  }, [toolsClub, setup, live, backPanel, close, openPanel, editPage, router, clubPath]);

  if (!mounted) return null;
  return createPortal(
    <>
      <ClubToolsPlanet
        open={open}
        shown={open || arcShown}
        merged={!!panel || returning}
        count={planetCount(live.requests)}
        label={planetLabel(live.requests)}
        buttonRef={planetRef}
        onOpen={(el) => show(el)}
      />
      <AnimatePresence onExitComplete={() => setArcShown(false)}>
        {open ? (
          <ClubToolsArc
            key="club-tools-arc"
            club={club}
            counts={live}
            layout={layout}
            tool={tool}
            inviteOpen={inviteOpen}
            rosterRef={rosterRef}
            onPick={setTool}
            onCloseCard={() => setTool(null)}
            onClose={close}
            onLeave={leave}
            onInvite={() => setInviteOpen(true)}
            onEditPage={editPage}
            onCount={setLiveRequests}
            onChanged={markChanged}
            panel={panel}
            returning={returning}
            panelGeo={bloom}
            panelHost={panelHost}
            onReturned={onReturned}
          />
        ) : null}
      </AnimatePresence>
      {open && inviteOpen ? (
        <OrgInviteSheet handle={handle} orgName={orgName} audience={audience} presentation="modal" onClose={closeInvite} />
      ) : null}
    </>,
    document.body,
  );
}
