"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import { VIBE_BLOOM_HOST, VibeBloom } from "@/components/bloom/VibeBloom";
import { CampusAppShell } from "@/components/campus-app-shell";
import { CampusBrowsePicker } from "@/components/campus/CampusBrowsePicker";
import { RollingStrip } from "@/components/campus/RollingStrip";
import { useStripData } from "@/components/campus/strip-data";
// "What's the vibe tonight?" (Oct 19 2026): the Feed's side panels and the
// Events tab's Tonight block, chips and school cards. Contract:
// handoffs/2026-10-19-tonight-build/CONTRACT.md §6.1 and §6.3.
import { EventFilterChips } from "@/components/campus/tonight/EventFilterChips";
import { QuietBoundary } from "@/components/campus/tonight/QuietBoundary";
import { IconCalendar, IconPin } from "@/components/campus/tonight/TonightBits";
import { FeedSideLayout } from "@/components/campus/tonight/FeedSideLayout";
import { SchoolEventCard } from "@/components/campus/tonight/SchoolEventCard";
import { mergeComingUp, TONIGHT_COPY, upcomingSchool } from "@/components/campus/tonight/tonight-view";
import { TonightSection } from "@/components/campus/tonight/TonightSection";
import type { TonightFilter } from "@/components/campus/tonight/types";
import { useCampusNow } from "@/components/campus/tonight/use-campus-now";
import { useSchoolEvents } from "@/components/campus/tonight/use-school-events";
import {
  isOpenCampus,
  useViewingCampus,
  VISITING_COPY,
  visitingComposerNote,
  visitingEyebrow,
  withCampus,
} from "@/components/campus/viewing-campus";
import { VisitingBanner } from "@/components/campus/VisitingBanner";
import { FriendRepostLine } from "@/components/feed/FriendRepostLine";
import { compactCount } from "@/lib/feed/compact-count";
import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { ImageCropperModal } from "@/components/ImageCropperModal";
import { emitCalendarChanged } from "@/components/LeftNav";
import {
  BOARD_FOLLOWERS_HIDDEN_LINE,
  BOARD_FOLLOWERS_LABEL,
  BOARD_SETTING_LOAD_LINE,
  BOARD_SETTING_SAVE_LINE,
  boardFollowersHelp,
  boardSettingBody,
  boardSettingOf,
  boardSettingSavedLine,
  clubUrl,
  savedBoardSetting,
} from "@/components/desktop/messages/rooms-dialog-rules";
// Event check-in (Oct 19 2026): the card's student slot and officer pill, and
// the attendee list's "Mark as here". Contract:
// handoffs/2026-10-19-checkin-build/CONTRACT.md §4.1 and §4.2.
import { CheckinSlot } from "@/components/events/checkin/CheckinSlot";
import { HereToggle, hereRequestsOut, type ConfirmOff } from "@/components/events/checkin/HereToggle";
import { StartCheckinAction } from "@/components/events/checkin/StartCheckinAction";
import { useClubMute, type ClubMuteFn } from "@/components/mobile/PostViewerMobile";
import { SharePostSheet } from "@/components/mobile/SharePostSheet";
import { UserCard, type UserCardProps } from "@/components/network/UserCard";
import { OrgInviteSheet } from "@/components/orgs/OrgInviteSheet";
import { OrgJoinControl } from "@/components/orgs/OrgJoinControl";
import {
  PostAudienceList,
  type PostAudienceUser,
} from "@/components/posts/PostAudienceList";
import {
  CONTENT_REPORTED_EVENT,
  type ContentReportedDetail,
  RemovedContentCard,
  ReportSheet,
} from "@/components/safety/ReportSheet";
import { MouseSpotlight } from "@/components/ui/mouse-spotlight";
import { BOARD_POSTER_ROLES } from "@/lib/chat/room-rules";
import {
  REFUSAL_SENTENCES,
  type RefusalCode,
  type RoomKind,
  type ThreadMessagesResponse,
} from "@/lib/chat/types";
import {
  bindMentionPicker,
  capturePosterFrame,
  extractHashtags,
} from "@/lib/composer/helpers";
import {
  ATTENDEES_POLL_MS,
  type AttendeesCheckin,
  type AttendeesResponse,
  CHECKIN_COPY,
  CHECKIN_ERRORS,
  checkinPhase,
  type ClearResponse,
  clearConfirmLine,
  type EventAttendee,
  markPhase,
  showCheckinSplit,
  splitAttendees,
} from "@/lib/events/event-checkin";
import { captionSegments } from "@/lib/feed/caption-segments";
import { copyText, type VibeFailure, type VibeResult, vibeRequest } from "@/lib/feedback/request";
import { toast, type ToastInput } from "@/lib/feedback/toast";
import {
  allowedCampusId,
  type Campus,
  campusRowById,
  isSchoolSystem,
  isSharedCampus,
  type SchoolSystem,
} from "@/lib/iu/campuses";
import { IU_SCHOOLS, schoolForMajorIn } from "@/lib/iu/majors";
import {
  IU_CREAM,
  PURDUE_GOLD,
  SCHOOL_TILES,
  SCHOOL_ZONE_PALETTES,
  type SchoolSkin,
  type SchoolZone,
  type SchoolZonePalette,
  schoolSkinFor,
  schoolZonesFor,
} from "@/lib/iu/school-colors";
import { PURDUE_INDIANAPOLIS_SCHOOLS } from "@/lib/iu/majors-purdue-indianapolis";
import { VIDEO_LOCATION_HINT } from "@/lib/media/copy";
import { LikeBurst } from "@/lib/motion/LikeBurst";
import { Reveal } from "@/lib/motion/Reveal";
import { SPRING_SNAPPY, SPRING_SOFT } from "@/lib/motion/springs";
import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import {
  AUDIENCE_HELP,
  audienceChip,
  fillCopy,
  followerCountText,
  followsSinceText,
  inviteSubText,
  keepFollowingDefault,
  memberCountText,
  MOD_READONLY,
  OFFICER_FOLLOW_HELP,
  ORG_COPY,
  openToFact,
  openToOptions,
  type OrgControlChange,
  orgErrorCopy,
  type OrgRelation,
  orgRowView,
  policyChip,
  WHO_CAN_JOIN_OPTIONS,
  whoCanJoinFact,
} from "@/lib/orgs/join-copy";
import type { JoinPolicy, JoinState, OrgAudience } from "@/lib/orgs/join-state";
import { followButtonFor } from "@/lib/people/follow-label";
import {
  checkPostEdit,
  EDITED_LABEL,
  type EditedPost,
  editedPostFrom,
  POST_MAX_CHARS,
} from "@/lib/posts/edit";
import {
  beginEngagementTap,
  engagementFromFeedPost,
  engagementReadToken,
  patchEngagement,
  readEngagement,
  seedEngagementFromFeed,
  usePostEngagement,
} from "@/lib/posts/engagement-store";
import { feedClubOf, muteClubRowLabel, type FeedClub, withoutClubPosts } from "@/lib/posts/feed-actions";
import { CLUB_TITLE_MAX, clubFlairLabel, normalizeClubTitle } from "@/lib/profile/club-flair";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useIsMobile } from "@/lib/use-is-mobile";
import { campusStatsLine, type CampusStats } from "@/lib/usage/active-now";
import { countOpen, touchActivity } from "@/lib/usage/touch-client";

declare global {
  interface Window {
    OttoTour?: {
      start: (
        steps: Array<{
          selector: string;
          title: string;
          body: string;
          endLabel?: string;
          nextLabel?: string;
        }>,
        options?: {
          onDone?: () => void;
          onSkip?: () => void;
        },
      ) => void;
      isRunning: () => boolean;
    };
  }
}

const OTTO_TOUR_SCRIPT = "/html/_otto-tour.js";
function loadOttoTourScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.OttoTour) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${OTTO_TOUR_SCRIPT}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = OTTO_TOUR_SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("otto tour failed to load"));
    document.head.appendChild(s);
  });
}

function stripWelcomeParam() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("welcome")) return;
    url.searchParams.delete("welcome");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  } catch {
    /* never block render on param strip */
  }
}

// Same for `?manage=<handle>` once the door has been used: left in the
// address, Back, a refresh or a remount would open the settings again.
function stripManageParam() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("manage")) return;
    url.searchParams.delete("manage");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  } catch {
    /* never block render on param strip */
  }
}

const CAMPUS_TAB_KEYS: ReadonlyArray<CampusTab> = [
  "feed",
  "events",
  "orgs",
  "chat",
  "map",
];

function parseInitialTab(raw: string | null): CampusTab {
  if (raw && (CAMPUS_TAB_KEYS as readonly string[]).includes(raw)) {
    return raw as CampusTab;
  }
  return "feed";
}

type Role = "owner" | "admin" | "mod" | "member";

type Org = {
  id: string;
  handle: string;
  name: string;
  description: string;
  logo_url: string | null;
  banner_url: string | null;
  backdrop_preset: BackdropKey;
  role: Role;
  verified?: boolean;
  last_activity_at?: string | null;
  links?: Array<{ label: string; url: string }>;
  philanthropy?: string;
  // Sent by the membership list the rail loads, the create 201 and the
  // settings PATCH. The rail header and the settings modal read these.
  join_policy?: JoinPolicy;
  audience?: OrgAudience;
  hidden?: boolean;
  campus_id?: string | null;
};

export type BackdropKey = "cream" | "sand-purple" | "ember" | "deep-violet" | "forest" | "midnight";

type Channel = {
  id: string;
  name: string;
  topic: string | null;
  is_private: boolean;
  pinned: boolean;
  position: number;
  created_at: string;
  /** Club chat v1: sent by the list. A row without it (a create or save
   *  answer, a server without the chat schema) is a plain "room". */
  kind?: RoomKind;
};

// Color palette for org icons — deterministic per-id so colors stay stable
// across reloads without needing a stored color column.
const ORG_PALETTE = [
  "#FF5C35", // brand orange
  "#7B5FE0", // sand purple
  "#1C5C2E", // forest
  "#5A9CFF", // sky
  "#D4A30E", // amber
  "#9B7BFF", // lavender
  "#E84D4D", // red
  "#2A8A8A", // teal
];

function colorForOrg(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return ORG_PALETTE[hash % ORG_PALETTE.length];
}


function initialsForOrg(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}

const COLORS = {
  bg: "var(--cream)",
  border: "var(--hairline)",
  borderStrong: "rgba(var(--scrim-rgb),0.12)",
  text: "var(--charcoal)",
  muted: "var(--ink-2)",
  faint: "var(--ink-muted)",
  accent: "#FF5C35",
  // Words and icons drawn ON a coral fill (a button, a badge): dark, the way
  // the landing page's button does it. White on coral is only 3.1:1; this is
  // 6.3:1 in both looks.
  onAccent: "var(--on-coral, #160A06)",
  // Coral as WORDS on the page's own paper (a link, a group title). Raw coral
  // is 2.9:1 on cream, so they read --tag-ink (a shade lighter on Night).
  accentInk: "var(--tag-ink)",
  accentSand: "#7B5FE0",

  // Glass surfaces (translucent dark over the gradient backdrop)
  serverRail: "rgba(12,10,18,0.62)",
  channelRail: "rgba(10,8,16,0.72)",
  railBorder: "rgba(255,255,255,0.08)",
  railText: "#F2EEE9",
  railMuted: "rgba(242,238,233,0.55)",
  railHover: "rgba(255,255,255,0.06)",
  railActive: "rgba(255,255,255,0.12)",

  // Glass card defaults (used in main pane)
  glassFill: "rgba(255,255,255,0.06)",
  glassBorder: "rgba(255,255,255,0.14)",
  glassRim: "rgba(255,255,255,0.28)",
  glassText: "#FFFFFF",
  glassMuted: "rgba(255,255,255,0.62)",
};

const GLASS_SURFACE = {
  background: COLORS.glassFill,
  backdropFilter: "blur(28px) saturate(180%)",
  WebkitBackdropFilter: "blur(28px) saturate(180%)",
  border: `1px solid ${COLORS.glassBorder}`,
  boxShadow: [
    "inset 0 1px 0 rgba(255,255,255,0.22)", // top rim light
    "inset 0 -1px 0 rgba(0,0,0,0.08)",
    "0 8px 32px rgba(20,8,40,0.25)", // outer drop
  ].join(", "),
} as const;

// Backdrop presets — admins/owners pick one in org settings.
// Each composes 3 radial color washes over a dark base.
export const BACKDROP_PRESETS: Record<BackdropKey, { label: string; css: string }> = {
  cream: {
    label: "Cream paper",
    css:
      "radial-gradient(120% 80% at 0% 0%, rgba(255,222,180,0.45) 0%, rgba(255,222,180,0) 60%), " +
      "radial-gradient(110% 80% at 100% 100%, rgba(255,200,170,0.35) 0%, rgba(255,200,170,0) 60%), " +
      "linear-gradient(180deg, #FAF7F2 0%, #F4EDE2 100%)",
  },
  "sand-purple": {
    label: "Sand purple",
    css:
      "radial-gradient(120% 80% at 0% 0%, rgba(123,95,224,0.55) 0%, rgba(123,95,224,0) 55%), " +
      "radial-gradient(110% 90% at 100% 100%, rgba(255,92,53,0.5) 0%, rgba(255,92,53,0) 55%), " +
      "radial-gradient(140% 100% at 70% 20%, rgba(255,140,90,0.18) 0%, rgba(255,140,90,0) 60%), " +
      "linear-gradient(180deg, #1B1530 0%, #241B40 50%, #2E1F35 100%)",
  },
  ember: {
    label: "Ember",
    css:
      "radial-gradient(120% 90% at 10% 0%, rgba(255,92,53,0.55) 0%, rgba(255,92,53,0) 55%), " +
      "radial-gradient(110% 90% at 100% 100%, rgba(255,200,90,0.35) 0%, rgba(255,200,90,0) 55%), " +
      "radial-gradient(140% 100% at 70% 30%, rgba(180,40,40,0.35) 0%, rgba(180,40,40,0) 60%), " +
      "linear-gradient(180deg, #1A0F12 0%, #2A1418 55%, #1F0E12 100%)",
  },
  "deep-violet": {
    label: "Deep violet",
    css:
      "radial-gradient(120% 90% at 0% 0%, rgba(138,90,255,0.55) 0%, rgba(138,90,255,0) 55%), " +
      "radial-gradient(110% 90% at 100% 100%, rgba(80,40,200,0.45) 0%, rgba(80,40,200,0) 55%), " +
      "radial-gradient(140% 100% at 50% 50%, rgba(200,140,255,0.18) 0%, rgba(200,140,255,0) 60%), " +
      "linear-gradient(180deg, #110826 0%, #1B0F38 50%, #0E0820 100%)",
  },
  forest: {
    label: "Forest",
    css:
      "radial-gradient(120% 90% at 0% 0%, rgba(70,160,110,0.5) 0%, rgba(70,160,110,0) 55%), " +
      "radial-gradient(110% 90% at 100% 100%, rgba(40,100,140,0.45) 0%, rgba(40,100,140,0) 55%), " +
      "radial-gradient(140% 100% at 60% 30%, rgba(180,220,140,0.18) 0%, rgba(180,220,140,0) 60%), " +
      "linear-gradient(180deg, #0E1A18 0%, #122620 55%, #0B1614 100%)",
  },
  midnight: {
    label: "Midnight",
    css:
      "radial-gradient(120% 90% at 0% 0%, rgba(60,90,200,0.4) 0%, rgba(60,90,200,0) 55%), " +
      "radial-gradient(110% 90% at 100% 100%, rgba(180,120,255,0.28) 0%, rgba(180,120,255,0) 55%), " +
      "radial-gradient(140% 100% at 50% 50%, rgba(120,180,255,0.12) 0%, rgba(120,180,255,0) 60%), " +
      "linear-gradient(180deg, #07091A 0%, #0E1230 55%, #050614 100%)",
  },
};

const DEFAULT_BACKDROP: BackdropKey = "cream";

// Cream paper backdrop for the Feed tab — warm, cozy, "community noticeboard".
// The gradient itself is the `--feed-backdrop` token in globals.css (light and
// night values live there), so the page follows the theme without a re-render.
const FEED_BACKDROP = "var(--feed-backdrop)";

// Neutral dark backdrop for the chat tab chrome — banner, tabs, server rail,
// channel rail. Each org's preset only paints its own ChannelMain pane so the
// surrounding navigation stays visually consistent across orgs.
const CHAT_CHROME_BACKDROP =
  "radial-gradient(120% 80% at 0% 0%, rgba(40,30,60,0.55) 0%, rgba(40,30,60,0) 60%), " +
  "radial-gradient(110% 90% at 100% 100%, rgba(20,18,30,0.6) 0%, rgba(20,18,30,0) 60%), " +
  "linear-gradient(180deg, #0F0D17 0%, #14111E 50%, #0F0D17 100%)";

type Tone = "light" | "dark";

function getTabScene(tab: CampusTab): { css: string; tone: Tone } {
  // Chat keeps a darker chrome so the channel rail + messages list stand
  // out, but events / orgs / map all share the cream Feed backdrop now —
  // the user wanted less visual whiplash hopping between tabs.
  if (tab === "chat") return { css: CHAT_CHROME_BACKDROP, tone: "light" };
  if (tab === "feed") return { css: FEED_BACKDROP, tone: "dark" };
  if (tab === "events") return { css: FEED_BACKDROP, tone: "dark" };
  if (tab === "orgs") return { css: FEED_BACKDROP, tone: "dark" };
  if (tab === "map") return { css: FEED_BACKDROP, tone: "dark" };
  return { css: FEED_BACKDROP, tone: "dark" };
}

type CampusTab = "feed" | "events" | "orgs" | "chat" | "map";

// `short` is the pill in the desktop top bar, which has no room for the
// long names; `label` is the full name.
const TABS: { key: CampusTab; label: string; short: string }[] = [
  { key: "feed", label: "Feed", short: "Feed" },
  { key: "events", label: "Events", short: "Events" },
  { key: "orgs", label: "Organizations", short: "Orgs" },
  { key: "chat", label: "Chat", short: "Chat" },
  { key: "map", label: "Campus Map", short: "Map" },
];

// The campus banner's identity (title, monogram, colour) comes from the
// viewer's own campus via `useViewerCampus` (next to `CampusBanner`), and its
// stats line from /api/stats/campus. There is no hardcoded school anymore.

/** A scene eyebrow: "Feed · Indianapolis", or just "Feed" with no campus. */
function campusEyebrow(tab: string, label: string | null): string {
  return label ? `${tab} · ${label}` : tab;
}

/**
 * The campus on screen (S67 wave 4, contracts C5). `?campus=<id>` is the
 * truth (`useViewingCampus`); home is the viewer's own campus
 * (`useViewerCampus`). `url()` builds every campus read through `withCampus`,
 * so at home each URL is exactly the bare one it always was.
 *
 * CampusHome provides it. The default is "home, not provided", so the pieces
 * the phone and the org page share (CampusBanner, EventCard) behave as they
 * did unless something tells them otherwise.
 */
type CampusView = {
  provided: boolean;
  viewingId: string | null;
  homeId: string | null;
  isVisiting: boolean;
  /** The campus on screen's full name, for eyebrows and hints ("IU Bloomington"). */
  label: string | null;
  url(path: string): string;
};

const HOME_CAMPUS_VIEW: CampusView = {
  provided: false,
  viewingId: null,
  homeId: null,
  isVisiting: false,
  label: null,
  url: (path) => path,
};

const CampusViewContext = createContext<CampusView>(HOME_CAMPUS_VIEW);

function useCampusView(): CampusView {
  return useContext(CampusViewContext);
}

// A campus read refused because of the campus itself: 400 `unknown_campus`
// (a bad id in a shared link) or 403 `campus_not_in_system` (an account with
// no verified university). A retry would only fail again, so the way out is
// home: a full navigation to bare /campus, which drops `?campus=`.
const CAMPUS_REFUSAL_CODES = new Set(["unknown_campus", "campus_not_in_system"]);
const BACK_HOME_ACTION = { label: "Back home", href: "/campus" } as const;

/** `asLoadFailure`, except a campus refusal gets "Back home" instead of Retry. */
function campusLoadFailure(r: VibeResult<unknown>, line: string): LoadFailure {
  if (!r.ok && r.code && CAMPUS_REFUSAL_CODES.has(r.code)) {
    return { message: r.message, action: { ...BACK_HOME_ACTION } };
  }
  return asLoadFailure(r, line);
}

export function CampusHome({
  showSchoolVerifiedBanner,
  desktopChat = false,
}: {
  showSchoolVerifiedBanner: boolean;
  /**
   * The `chat_desktop` switch (from the server, page.tsx). On: club chat
   * lives on /messages, so there is no Chat pill here, the tab can never be
   * "chat" (no rails, no dark backdrop, no 100dvh lock, no hidden Otto orb),
   * and `?manage=<handle>` opens that club's settings. Off: today's page.
   */
  desktopChat?: boolean;
}) {
  const [orgs, setOrgs] = useState<Org[] | null>(null); // null = loading
  // Set when loading your orgs fails; the Chat tab shows it with Retry.
  const [orgsLoadErr, setOrgsLoadErr] = useState<LoadFailure | null>(null);
  const [orgsLoadKey, setOrgsLoadKey] = useState(0);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [channelsByOrg, setChannelsByOrg] = useState<Record<string, Channel[]>>({});
  // Per-org channel-load failures, kept beside the cache (never cached as []).
  const [channelsErrByOrg, setChannelsErrByOrg] = useState<Record<string, LoadFailure>>({});
  // Per-org user-selected channel. Falls back to the org's first channel
  // when no explicit pick exists. Derived rather than effect-driven so we
  // don't trip React 19's set-state-in-effect rule.
  const [selectedChannelByOrg, setSelectedChannelByOrg] = useState<Record<string, string>>({});
  // Initial tab is seeded from `?tab=` so deep links (e.g. "← Return to
  // Organizations" on an org page) land in the right place. We only read
  // the param once — subsequent tab changes don't push to the URL to
  // keep things simple. Refreshes preserve the tab via the same param.
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<CampusTab>(() => {
    // When the campus tour is triggered (?welcome=1 or pending-flag) land
    // on the Feed tab so the first highlighted surface — #campus-feed —
    // actually exists in the DOM regardless of what tab a deep link may
    // have requested. Same goes for /campus?post=<id> deep links from
    // Otto mention notifications — they only make sense on the feed.
    if (searchParams.get("welcome") === "1") return "feed";
    if (searchParams.get("post")) return "feed";
    // Same for /campus?tag=<t> hashtag links — the filter is feed-only.
    if (searchParams.get("tag")) return "feed";
    if (typeof window !== "undefined") {
      try {
        if (localStorage.getItem("vibe_tour_pending") === "campus") return "feed";
      } catch {
        /* localStorage may be unavailable */
      }
    }
    const asked = parseInitialTab(searchParams.get("tab"));
    // The server page already sends `?tab=chat` to /messages for these
    // people; this keeps the tab off "chat" whatever the address says.
    return desktopChat && asked === "chat" ? "feed" : asked;
  });

  // ?tab=chat&org=<handle>&channel=<id> deep link from /orgs/[handle]
  // Channels section. Captured into refs so the chain of effects below
  // (orgs load → activeOrgId set → channels load → channel set) can
  // consume the values as each step completes.
  const pendingDeepLinkOrgHandleRef = useRef<string | null>(
    searchParams.get("org"),
  );
  const pendingDeepLinkChannelIdRef = useRef<string | null>(
    searchParams.get("channel"),
  );
  // ?manage=<handle>: the door from desktop Messages' "Manage club" to this
  // club's settings modal, which still lives here. Read once, like ?org=,
  // and only with the `chat_desktop` switch; consumed when the clubs load.
  const pendingManageHandleRef = useRef<string | null>(
    desktopChat ? searchParams.get("manage") : null,
  );
  // Seeded from `?tag=` (hashtag links on /posts/[id] and in the post
  // viewer point at /campus?tab=feed&tag=<t>). Read once, like ?tab=.
  // Normalized the way /api/feed does it, so the header never reads "##".
  const [feedTagFilter, setFeedTagFilter] = useState<string | null>(() => {
    const tag = (searchParams.get("tag") ?? "").trim().toLowerCase().replace(/^#+/, "");
    return tag || null;
  });
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [channelSettingsId, setChannelSettingsId] = useState<string | null>(null);

  // Trending click-through: switches to Feed tab and applies a tag filter.
  const onPickTag = useCallback((tag: string) => {
    setTab("feed");
    setFeedTagFilter(tag);
  }, []);

  // An RSVP'd event chip on the rolling strip: switch to Events and hand
  // the id down so EventsTabBody can scroll to and flash that card. There
  // is no event page, so the card IS the destination. Seeded once from
  // `?event=` (the search bar's event rows link there) like ?tag=; the
  // Events tab reports back through onHighlightDone and the id is cleared,
  // so a later visit to Events never re-flashes a stale card.
  const [pendingEventId, setPendingEventId] = useState<string | null>(
    () => searchParams.get("event") || null,
  );
  const onPickEvent = useCallback((eventId: string) => {
    setPendingEventId(eventId);
    setTab("events");
  }, []);
  const onEventHighlighted = useCallback(() => setPendingEventId(null), []);

  // Hide the bottom-right OttoCorner orb while we're on the Chat tab —
  // it sits on top of the message composer's send button. Driven from
  // here (not CampusAppShell) because tab changes don't push to the URL,
  // so useSearchParams in the shell can't see them. Body class is the
  // simplest cross-component signal.
  useEffect(() => {
    if (tab === "chat") {
      document.body.classList.add("vibe-hide-otto");
      return () => document.body.classList.remove("vibe-hide-otto");
    }
    return undefined;
  }, [tab]);

  // Campus tour: triggered by `?welcome=1` (post-onboarding) or by a
  // `vibe_tour_pending=campus` localStorage flag (handed off from the
  // profile leg; survives redirects that strip the URL param). Walks the
  // user through feed, tabs, and search, and ends here on /campus with
  // "Got it" (no hand-off to /network; the phone tour ends the same way).
  useEffect(() => {
    // Desktop-only tour. The mobile equivalent lives in `useMobileTour`
    // and targets the mobile-specific element IDs in `CampusMobile`. If
    // this effect fires on a mobile viewport (CampusSwitch picks the
    // tree at hydration time, but the desktop branch can still mount
    // briefly during the SSR → mobile-viewport swap), the desktop
    // selectors don't exist and the engine falls back to a centered
    // bubble with desktop copy.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 899px)").matches) {
      return;
    }
    const fromUrl = searchParams.get("welcome") === "1";
    let fromPending = false;
    try { fromPending = localStorage.getItem("vibe_tour_pending") === "campus"; } catch {}
    if (!fromUrl && !fromPending) return;
    const seenKey = "vibe_campus_tour_seen_v1";
    if (typeof localStorage !== "undefined" && localStorage.getItem(seenKey) === "1") {
      stripWelcomeParam();
      try { localStorage.removeItem("vibe_tour_pending"); } catch {}
      return;
    }
    let cancelled = false;
    // The feed bubble names the viewer's campus. Wait for it (the banner
    // shares this cached request) but never longer than 1.5 s; `label` is
    // deliberately NOT an effect dep, so an already-started tour never
    // starts twice.
    Promise.all([
      loadOttoTourScript(),
      Promise.race([
        viewerCampusPromise(),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1500)),
      ]),
    ]).then(([, viewer]) => {
      if (cancelled) return;
      // From the fixed campus table (never the URL or a server string), so
      // it's safe inside the tour bubble's HTML.
      const campusName = viewer?.campus?.shortName ?? null;
      const feedBody = campusName
        ? `What students at ${campusName} are posting. People and clubs you follow rise to the top.`
        : "What students on your campus are posting. People and clubs you follow rise to the top.";
      window.OttoTour?.start(
        [
          {
            // Heads-up about the LeftNav profile chip first — without an
            // avatar + banner, the chip renders as a grey shell, which
            // is the #1 thing users miss after onboarding. Tap it and
            // they land on /profile in edit mode to fix it.
            selector: "#nav-identity-chip",
            title: "This is <span class=\"accent\">you</span> on Vibe.",
            body: "Pop in a profile picture and a banner — click your card to jump into your profile and customize it. Without them, the card stays grey.",
          },
          {
            selector: "#campus-feed",
            title: "Your campus <span class=\"accent\">pulse</span>.",
            body: feedBody,
          },
          {
            selector: "#campus-tabs",
            title: "Switch lanes anytime.",
            body: "Feed, Events, Orgs, Map — same Otto, different angle on what's happening.",
          },
          {
            // Below 1024px the top bar folds search into its round button
            // (#campus-search-toggle); point at what's actually on screen.
            selector: window.matchMedia(TOPBAR_SEARCH_COLLAPSED_QUERY).matches
              ? "#campus-search-toggle"
              : "#campus-search",
            title: "Find your <span class=\"accent\">people</span>.",
            body: "Search students, clubs, or events. Otto threads the right matches in.",
            endLabel: "Got it",
          },
        ],
        {
          // The tour ends where it is: seen, nothing pending, no redirect.
          onDone: () => {
            try {
              localStorage.setItem(seenKey, "1");
              localStorage.removeItem("vibe_tour_pending");
            } catch {}
            stripWelcomeParam();
          },
          onSkip: () => {
            try {
              localStorage.setItem(seenKey, "1");
              localStorage.removeItem("vibe_tour_pending");
            } catch {}
            stripWelcomeParam();
          },
        },
      );
    }).catch(() => {
      /* the tour script didn't load; the page works without it */
    });
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  // Load joined orgs on mount, and again on Retry after a failed load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await vibeRequest<{ orgs?: Org[] }>("/api/orgs?filter=mine", {
        cache: "no-store",
        quiet: true,
        failure: "Couldn't load your orgs.",
      });
      if (cancelled) return;
      if (!r.ok || !Array.isArray(r.data.orgs)) {
        // orgs stays null, so the Chat tab shows this with Retry instead of
        // the "create or browse orgs" card meant for someone in no orgs.
        setOrgsLoadErr(asLoadFailure(r, "Couldn't load your orgs."));
        return;
      }
      const list = r.data.orgs;
      setOrgsLoadErr(null);
      setOrgs(list);
      // ?manage=<handle>: select that club and open its settings over the
      // tab that is showing (the modal mounts outside the tab body). One
      // shot; a handle that is not one of my clubs does nothing. Either way
      // the param leaves the address, so the door never opens twice.
      const manageHandle = pendingManageHandleRef.current;
      if (manageHandle) {
        pendingManageHandleRef.current = null;
        stripManageParam();
        const manageMatch = list.find(
          (o) => o.handle.toLowerCase() === manageHandle.toLowerCase(),
        );
        if (manageMatch) {
          setActiveOrgId(manageMatch.id);
          setShowSettings(true);
          return;
        }
      }
      // If we arrived from /orgs/<handle> → Chat tab with a
      // pending org handle, prefer that org over the default
      // first-in-list so the requested channel's org is what
      // mounts the channel rail.
      const pendingHandle = pendingDeepLinkOrgHandleRef.current;
      const pendingMatch = pendingHandle
        ? list.find((o) => o.handle.toLowerCase() === pendingHandle.toLowerCase())
        : null;
      if (pendingMatch) {
        setActiveOrgId(pendingMatch.id);
        // Clear the org-handle ref; channel-id ref stays until the
        // channels-load effect consumes it.
        pendingDeepLinkOrgHandleRef.current = null;
      } else if (list.length > 0) {
        setActiveOrgId(list[0].id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgsLoadKey]);

  const activeOrg = (orgs ?? []).find((o) => o.id === activeOrgId) ?? null;
  const activeChannels: Channel[] = activeOrg ? channelsByOrg[activeOrg.id] ?? [] : [];
  const activeChannelId = activeOrg
    ? selectedChannelByOrg[activeOrg.id] ?? activeChannels[0]?.id ?? null
    : null;
  const activeChannel = activeChannels.find((c) => c.id === activeChannelId) ?? null;
  const activeChannelsErr = activeOrg ? channelsErrByOrg[activeOrg.id] ?? null : null;

  // When the active org changes and we don't yet have its channels cached,
  // fetch them. Selecting the active channel is derived above, so this
  // effect only writes to channelsByOrg. A failed load is never cached (an
  // empty list would read as "no channels" for good): it goes in
  // channelsErrByOrg, and Retry deletes that entry to fetch again.
  useEffect(() => {
    if (!activeOrg) return;
    if (channelsByOrg[activeOrg.id] || channelsErrByOrg[activeOrg.id]) return;
    let cancelled = false;
    (async () => {
      const r = await vibeRequest<{ channels?: Channel[] }>(
        `/api/orgs/${activeOrg.handle}/channels`,
        { cache: "no-store", quiet: true, failure: "Couldn't load this org's channels." },
      );
      if (cancelled) return;
      if (!r.ok || !Array.isArray(r.data.channels)) {
        const failure = asLoadFailure(r, "Couldn't load this org's channels.");
        setChannelsErrByOrg((prev) => ({ ...prev, [activeOrg.id]: failure }));
        return;
      }
      const list = r.data.channels;
      setChannelsByOrg((prev) => ({ ...prev, [activeOrg.id]: list }));
      // Consume the pending channel deep link if this is the right
      // org and the requested channel exists in the loaded list.
      const pendingChannelId = pendingDeepLinkChannelIdRef.current;
      if (pendingChannelId) {
        const match = list.find((c) => c.id === pendingChannelId);
        if (match) {
          setSelectedChannelByOrg((prev) => ({
            ...prev,
            [activeOrg.id]: pendingChannelId,
          }));
          pendingDeepLinkChannelIdRef.current = null;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOrg, channelsByOrg, channelsErrByOrg]);

  const handleSelectChannel = useCallback(
    (channelId: string) => {
      if (!activeOrg) return;
      setSelectedChannelByOrg((prev) => ({ ...prev, [activeOrg.id]: channelId }));
    },
    [activeOrg]
  );

  // Retry after a failed channel load: forget the failure, plus anything
  // cached for the org since (a channel created meanwhile would otherwise
  // pass for the whole list), so the effect above fetches again.
  const retryChannels = useCallback(() => {
    if (!activeOrg) return;
    const orgId = activeOrg.id;
    setChannelsErrByOrg((prev) => {
      const next = { ...prev };
      delete next[orgId];
      return next;
    });
    setChannelsByOrg((prev) => {
      if (!(orgId in prev)) return prev;
      const next = { ...prev };
      delete next[orgId];
      return next;
    });
  }, [activeOrg]);

  const isLoading = orgs === null;
  const isEmpty = orgs !== null && orgs.length === 0;

  // Backdrop is read-only at the campus level — admins change it from
  // the org Settings modal, which has its own save handler.
  const activeBackdropKey: BackdropKey = activeOrg?.backdrop_preset ?? DEFAULT_BACKDROP;
  const activeBackdrop = BACKDROP_PRESETS[activeBackdropKey].css;

  const handleOrgCreated = useCallback((org: Org) => {
    setOrgs((prev) => [org, ...(prev ?? [])]);
    setActiveOrgId(org.id);
    setShowCreateOrg(false);
  }, []);

  const handleChannelCreated = useCallback(
    (channel: Channel) => {
      if (!activeOrg) return;
      setChannelsByOrg((prev) => ({
        ...prev,
        [activeOrg.id]: [...(prev[activeOrg.id] ?? []), channel],
      }));
      setSelectedChannelByOrg((prev) => ({ ...prev, [activeOrg.id]: channel.id }));
      setShowCreateChannel(false);
    },
    [activeOrg]
  );

  const handleOrgUpdated = useCallback((org: Org) => {
    setOrgs((prev) => (prev ?? []).map((o) => (o.id === org.id ? { ...o, ...org } : o)));
  }, []);

  const handleOrgRemoved = useCallback((orgId: string) => {
    setOrgs((prev) => {
      const next = (prev ?? []).filter((o) => o.id !== orgId);
      return next;
    });
    setActiveOrgId((prev) => {
      if (prev !== orgId) return prev;
      const next = (orgs ?? []).filter((o) => o.id !== orgId);
      return next[0]?.id ?? null;
    });
    setChannelsByOrg((prev) => {
      const next = { ...prev };
      delete next[orgId];
      return next;
    });
    setShowSettings(false);
  }, [orgs]);

  const handleChannelUpdated = useCallback(
    (channel: Channel) => {
      if (!activeOrg) return;
      setChannelsByOrg((prev) => ({
        ...prev,
        [activeOrg.id]: (prev[activeOrg.id] ?? []).map((c) =>
          c.id === channel.id ? { ...c, ...channel } : c
        ),
      }));
    },
    [activeOrg]
  );

  const handleChannelRemoved = useCallback(
    (channelId: string) => {
      if (!activeOrg) return;
      setChannelsByOrg((prev) => ({
        ...prev,
        [activeOrg.id]: (prev[activeOrg.id] ?? []).filter((c) => c.id !== channelId),
      }));
      setSelectedChannelByOrg((prev) => {
        if (prev[activeOrg.id] !== channelId) return prev;
        const next = { ...prev };
        delete next[activeOrg.id];
        return next;
      });
    },
    [activeOrg]
  );

  // A verified student with no campus yet gets the "Pick your campus" strip
  // under the banner (never inside it: the phone shares the banner).
  const viewerCampus = useViewerCampus();
  const needsCampusPick =
    viewerCampus.ready && viewerCampus.system !== null && viewerCampus.campusId === null;

  // The campus on screen (C5). `?campus=` is the truth; at home it's absent
  // and every read below stays the bare URL it was.
  const viewing = useViewingCampus(viewerCampus.campusId);
  const { viewingId, homeId, isVisiting, setViewing } = viewing;
  const campusView = useMemo<CampusView>(
    () => ({
      provided: true,
      viewingId,
      homeId,
      isVisiting,
      label: isVisiting ? (campusRowById(viewingId)?.name ?? null) : viewerCampus.label,
      url: (path: string) => withCampus(path, viewingId, homeId),
    }),
    [viewingId, homeId, isVisiting, viewerCampus.label],
  );
  const [browseOpen, setBrowseOpen] = useState(false);
  // The picker's home row says when the 45-day lock lifts. The profile
  // bootstrap carries that date; read it once, the first time the picker
  // opens. Quiet: on a failure the row just says "Home".
  const [homeLockAt, setHomeLockAt] = useState<string | null>(null);
  const homeLockAskedRef = useRef(false);
  useEffect(() => {
    if (!browseOpen || homeLockAskedRef.current) return;
    homeLockAskedRef.current = true;
    void vibeRequest<{ campusChangeAvailableAt?: unknown }>("/api/me/profile-bootstrap", {
      cache: "no-store",
      quiet: true,
      failure: "Couldn't load your campus.",
    }).then((r) => {
      if (r.ok && typeof r.data.campusChangeAvailableAt === "string") {
        setHomeLockAt(r.data.campusChangeAvailableAt);
      }
    });
  }, [browseOpen]);
  // A campus that isn't open has only a handful of students, and its map
  // would name them by major (R3), so the Map tab hides while visiting one.
  // Derived, not stored: a Map tab left open falls back to Feed, and Back
  // home brings the student's own tab back.
  const mapHidden = isVisiting && !isOpenCampus(viewingId);
  const shownTab: CampusTab = tab === "map" && mapHidden ? "feed" : tab;

  const showThreeColumn = tab === "chat" && !isEmpty && !isLoading;
  const scene = getTabScene(shownTab);
  // The living bloom (components/bloom/VibeBloom.tsx): on every scene that
  // is the feed backdrop, the host class paints it (or goes transparent over
  // the drifting layer when motion is allowed). Chat keeps its own inline
  // chrome, which is opaque, and no bloom is mounted there.
  const bloomScene = scene.css === FEED_BACKDROP;

  return (
    <CampusAppShell>
      <CampusViewContext.Provider value={campusView}>
      <style>{SHEEN_KEYFRAMES}</style>
      <div
        className={bloomScene ? VIBE_BLOOM_HOST : undefined}
        style={{
          // Feed / events / orgs / map can grow with content (minHeight),
          // but chat needs to be locked to the viewport so the message
          // composer pins to the bottom edge instead of getting pushed
          // below the fold. 100dvh > 100vh on mobile browsers where the
          // URL bar collapses.
          ...(tab === "chat"
            ? { height: "100dvh", overflow: "hidden" }
            : { minHeight: "100vh" }),
          ...(bloomScene ? {} : { background: scene.css }),
          backgroundAttachment: "fixed",
          color: scene.tone === "light" ? COLORS.glassText : COLORS.text,
          transition: "background 600ms ease",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {bloomScene ? <VibeBloom /> : null}
        {/* One desktop top bar (S68, Franky's "diagonal" pick): the campus
            name, Campuses and search on the left, the tab pills on the
            right, in the school's colours. It replaces the old banner +
            search row + tabs row on every tab (Chat gains that height). The
            phone keeps CampusBanner (CampusMobile). */}
        <CampusTopBar
          active={shownTab}
          onTabChange={setTab}
          hideMap={mapHidden}
          hideChat={desktopChat}
          onOpenCampuses={() => setBrowseOpen(true)}
        />
        {needsCampusPick ? <PickCampusStrip /> : null}
        {/* Away from home: "Viewing Bloomington · home is Indianapolis" with
            Back home, on every tab (Chat too: it's still the student's own
            clubs, and the pill says where the rest of the page is). */}
        {isVisiting ? (
          <div style={{ padding: "10px 24px 0", display: "flex", justifyContent: "center" }}>
            <VisitingBanner
              viewingId={viewingId}
              homeId={homeId}
              onBackHome={() => setViewing(null)}
              style={{ maxWidth: 720 }}
            />
          </div>
        ) : null}

        {orgsLoadErr && tab === "chat" ? (
          <main
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 32,
            }}
          >
            <LoadFailed
              tone="dark"
              failure={orgsLoadErr}
              onRetry={() => {
                setOrgsLoadErr(null);
                setOrgsLoadKey((k) => k + 1);
              }}
            />
          </main>
        ) : isLoading && tab === "chat" ? (
          <LoadingPane />
        ) : showThreeColumn ? (
          // Crossfades in over "Loading your campus…" (motion pass, Oct 18):
          // opacity only, so no transform ever sits over the rails.
          <Reveal
            rise={false}
            className="campus-three-rail"
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: "72px 240px 1fr",
              minHeight: 0,
            }}
          >
            <div className="campus-three-rail-server">
              <ServerRail
                orgs={orgs ?? []}
                activeOrgId={activeOrgId}
                onSelectOrg={(id) => setActiveOrgId(id)}
                onCreateOrg={() => setShowCreateOrg(true)}
              />
            </div>
            <div className="campus-three-rail-channel">
              <ChannelRail
                org={activeOrg}
                channels={activeChannels}
                loadErr={activeChannelsErr}
                onRetryLoad={retryChannels}
                activeChannelId={activeChannelId}
                onSelectChannel={handleSelectChannel}
                onOpenCreateChannel={() => setShowCreateChannel(true)}
                onOpenSettings={() => setShowSettings(true)}
                onOpenChannelSettings={(id) => setChannelSettingsId(id)}
              />
            </div>
            <ChannelMain
              org={activeOrg}
              channel={activeChannel}
              backdropCss={activeBackdrop}
              showSchoolVerifiedBanner={showSchoolVerifiedBanner}
            />
          </Reveal>
        ) : isEmpty && tab === "chat" ? (
          <EmptyState
            showSchoolVerifiedBanner={showSchoolVerifiedBanner}
            onCreateOrg={() => setShowCreateOrg(true)}
            onBrowseOrgs={() => setTab("orgs")}
          />
        ) : (
          <div
            className="campus-feed-grid"
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <TabBody
              // A new campus is a new page: remount, so the last campus's
              // rows never sit under the new campus's name while it loads.
              key={isVisiting ? `visit:${viewingId}` : "home"}
              tab={shownTab}
              onCreateOrg={() => setShowCreateOrg(true)}
              feedTagFilter={feedTagFilter}
              onClearTagFilter={() => setFeedTagFilter(null)}
              onPickTag={onPickTag}
              onPickEvent={onPickEvent}
              highlightEventId={pendingEventId}
              onHighlightDone={onEventHighlighted}
              onOpenTab={setTab}
            />
          </div>
        )}

        {showCreateOrg ? (
          <CreateOrgModal
            onClose={() => setShowCreateOrg(false)}
            onCreated={handleOrgCreated}
          />
        ) : null}

        {showCreateChannel && activeOrg ? (
          <CreateChannelModal
            org={activeOrg}
            onClose={() => setShowCreateChannel(false)}
            onCreated={handleChannelCreated}
          />
        ) : null}

        {showSettings && activeOrg ? (
          <OrgSettingsModal
            org={activeOrg}
            // null until the org's list is cached, so the Channels tab
            // says "Loading" rather than "No channels yet." mid-fetch.
            channels={activeOrg.id in channelsByOrg ? activeChannels : null}
            channelsErr={activeChannelsErr}
            onRetryChannels={retryChannels}
            onClose={() => setShowSettings(false)}
            onOrgUpdated={handleOrgUpdated}
            onOrgRemoved={handleOrgRemoved}
            onChannelUpdated={handleChannelUpdated}
            onChannelRemoved={handleChannelRemoved}
          />
        ) : null}

        {channelSettingsId && activeOrg
          ? (() => {
              const ch = activeChannels.find((c) => c.id === channelSettingsId);
              if (!ch) return null;
              return (
                <ChannelSettingsModal
                  org={activeOrg}
                  channel={ch}
                  allChannels={activeChannels}
                  onClose={() => setChannelSettingsId(null)}
                  onChannelUpdated={handleChannelUpdated}
                  onChannelRemoved={(id) => {
                    handleChannelRemoved(id);
                    setChannelSettingsId(null);
                  }}
                  onChannelsReordered={(orderedIds) => {
                    setChannelsByOrg((prev) => {
                      if (!activeOrg) return prev;
                      const list = prev[activeOrg.id] ?? [];
                      const byId = new Map(list.map((c) => [c.id, c]));
                      const reordered = orderedIds
                        .map((id, idx) => {
                          const c = byId.get(id);
                          return c ? { ...c, position: idx } : null;
                        })
                        .filter((c): c is Channel => c !== null);
                      // Pinned channels (not in orderedIds list) stay where they are.
                      const pinnedKept = list.filter((c) => !orderedIds.includes(c.id));
                      return { ...prev, [activeOrg.id]: [...pinnedKept, ...reordered] };
                    });
                  }}
                />
              );
            })()
          : null}

        {/* "Look around.": every campus, grouped Shared · IU · Purdue. Picking
            one rewrites `?campus=`; picking home drops it. */}
        <CampusBrowsePicker
          variant="modal"
          open={browseOpen}
          homeId={homeId}
          viewingId={viewingId}
          homeChangeAvailableAt={homeLockAt}
          onPick={(id) => {
            setViewing(id);
            setBrowseOpen(false);
          }}
          onClose={() => setBrowseOpen(false)}
        />
      </div>
      </CampusViewContext.Provider>
    </CampusAppShell>
  );
}

function LoadingPane() {
  return (
    <main
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: COLORS.glassMuted,
        fontFamily: "DM Sans, sans-serif",
        fontSize: 14,
      }}
    >
      Loading your campus…
    </main>
  );
}

function CreateOrgModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (org: Org) => void;
}) {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [description, setDescription] = useState("");
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>("open");
  const [audience, setAudience] = useState<OrgAudience>("both");
  const [backdrop, setBackdrop] = useState<BackdropKey>("sand-purple");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The POST stamps the creator's own campus, so "Open to" names it. It also
  // refuses (400 `audience_excludes_owner`) any audience that would lock the
  // creator out of their own org, so the other university's option is
  // disabled here. Only on a KNOWN university: a null system is also what a
  // failed `/api/campuses` read looks like, and disabling both narrow options
  // then would leave an IU student unable to make an IU-only club with
  // nothing on screen saying why. With the system unknown the server's 400
  // says it instead, the same way officer settings leaves the check to it.
  const { system, campus } = useViewerCampus();
  const openToCampus = campus ? { name: campus.name, shared: isSharedCampus(campus) } : null;
  const openToChoices = openToOptions(openToCampus).map((o) => ({
    value: o.value,
    label: o.label,
    disabled: o.value !== "both" && system !== null && o.value !== system,
  }));

  // Auto-derive handle from name until the user explicitly edits the handle field.
  const [handleTouched, setHandleTouched] = useState(false);
  const handleNameChange = (next: string) => {
    setName(next);
    if (!handleTouched) {
      const derived = next
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 31);
      setHandle(derived);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          handle: handle.trim().toLowerCase(),
          description: description.trim(),
          join_policy: joinPolicy,
          audience,
          backdrop_preset: backdrop,
        }),
      });
      // A 429 from the rate limiter carries no `code` (and may not be JSON).
      if (res.status === 429) {
        setError("Too many tries. Try again in a minute.");
        return;
      }
      const data = await res.json();
      if (!data?.ok) {
        setError(data?.error || "Failed to create org");
        return;
      }
      onCreated({ ...data.org, role: "owner", hidden: false } as Org);
    } catch (err) {
      console.error("[campus] create org", err);
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      {/* Motion pass (Oct 18): tint fades in, the form (the frosted surface
          itself) fades and settles from 0.97. Enter only. */}
      <ModalScrim tint="rgba(8,4,16,0.55)" />
      <motion.form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        {...MODAL_PANEL_ENTER_FADE}
        style={{
          ...GLASS_SURFACE,
          // Positioned so it paints over the scrim layers once it settles.
          position: "relative",
          background:
            "linear-gradient(180deg, rgba(40,20,50,0.85) 0%, rgba(20,10,30,0.85) 100%)",
          borderRadius: 22,
          padding: 28,
          width: "min(480px, 92vw)",
          color: "#fff",
          fontFamily: "DM Sans, sans-serif",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontWeight: 900,
              fontSize: 22,
              letterSpacing: "-0.01em",
              marginBottom: 4,
            }}
          >
            Create an org
          </div>
          <p style={{ margin: 0, fontSize: 13, color: COLORS.glassMuted }}>
            Default channels <code>#general</code> + <code>#announcements</code> are added
            automatically.
          </p>
        </div>

        <Field label="Name">
          <input
            type="text"
            required
            maxLength={50}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Kelley Investment Club"
            style={inputStyle}
          />
        </Field>

        <Field label="Handle" hint="Lowercase letters, numbers, _-. Used in the URL.">
          <input
            type="text"
            required
            maxLength={31}
            value={handle}
            onChange={(e) => {
              setHandleTouched(true);
              setHandle(e.target.value.toLowerCase());
            }}
            placeholder="kelley-invest"
            style={inputStyle}
          />
        </Field>

        <Field label="Description" hint="Shown on Discover.">
          <textarea
            rows={3}
            maxLength={400}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this org about?"
            style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
          />
        </Field>

        <ChoiceField
          label="Who can join"
          options={WHO_CAN_JOIN_OPTIONS}
          value={joinPolicy}
          onChange={(v) => setJoinPolicy(v as JoinPolicy)}
        />

        <ChoiceField
          label="Open to"
          hint={AUDIENCE_HELP}
          options={openToChoices}
          value={audience}
          onChange={(v) => setAudience(v as OrgAudience)}
        />

        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: -6 }}>
          {OFFICER_FOLLOW_HELP}
        </div>

        <Field label="Backdrop" hint="Officers can change it later.">
          <div style={{ display: "flex", gap: 6 }}>
            {(Object.keys(BACKDROP_PRESETS) as BackdropKey[]).map((key) => {
              const preset = BACKDROP_PRESETS[key];
              const on = key === backdrop;
              return (
                <button
                  key={key}
                  type="button"
                  title={preset.label}
                  onClick={() => setBackdrop(key)}
                  style={{
                    flex: 1,
                    height: 28,
                    borderRadius: 6,
                    background: preset.css,
                    border: on
                      ? "1.5px solid rgba(255,255,255,0.85)"
                      : "1px solid rgba(255,255,255,0.14)",
                    boxShadow: on
                      ? "0 0 0 2px rgba(255,255,255,0.18), inset 0 1px 0 rgba(255,255,255,0.3)"
                      : "inset 0 1px 0 rgba(255,255,255,0.18)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              );
            })}
          </div>
        </Field>

        {error ? (
          <div
            style={{
              fontSize: 13,
              color: "#FFB8A8",
              background: "rgba(232,77,77,0.12)",
              border: "1px solid rgba(232,77,77,0.35)",
              padding: "8px 12px",
              borderRadius: 8,
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "#fff",
              fontFamily: "inherit",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,180,150,0.5)",
              background:
                "linear-gradient(180deg, rgba(255,92,53,0.55) 0%, rgba(255,92,53,0.28) 100%)",
              color: "#fff",
              fontFamily: "inherit",
              fontWeight: 700,
              cursor: busy ? "default" : "pointer",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 16px rgba(255,92,53,0.28)",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Creating…" : "Create org"}
          </button>
        </div>
      </motion.form>
    </div>
  );
}

/**
 * Club chat v1: a refusal is matched on its `code`, never on the status or
 * the sentence, and the line shown is the one the server sent ("This room
 * can't be renamed, hidden or deleted."). Null for any other failure, which
 * keeps the line it had.
 */
function chatRefusalLine(code: unknown, error: unknown): string | null {
  if (typeof code !== "string") return null;
  if (!Object.prototype.hasOwnProperty.call(REFUSAL_SENTENCES, code)) return null;
  return (typeof error === "string" && error.trim()) || REFUSAL_SENTENCES[code as RefusalCode];
}

/**
 * Club chat v1: the Board, the Lounge and Officers keep their name, their
 * privacy and their place in the club (the server answers room_locked);
 * their topic, pin and position still change. A row without `kind` is a
 * plain room.
 */
function isCoreRoom(channel: Channel): boolean {
  return channel.kind === "board" || channel.kind === "lounge" || channel.kind === "officers";
}

/** Club chat v1: all an event's chat offers in the room editors. */
const EVENT_ROOM_NOTE = "This event chat follows its event.";

function CreateChannelModal({
  org,
  onClose,
  onCreated,
}: {
  org: Org;
  onClose: () => void;
  onCreated: (channel: Channel) => void;
}) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/orgs/${org.handle}/channels`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim().toLowerCase(),
          topic: topic.trim() || null,
          is_private: isPrivate,
        }),
      });
      const data = await res.json();
      if (!data?.ok) {
        setError(
          chatRefusalLine(data?.code, data?.error) ?? (data?.error || "Failed to create channel"),
        );
        return;
      }
      onCreated(data.channel as Channel);
    } catch (err) {
      console.error("[campus] create channel", err);
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <form onSubmit={submit} style={modalFormStyle}>
        <div>
          <div style={modalTitleStyle}>Create a channel</div>
          <p style={modalSubtitleStyle}>
            In <strong style={{ color: "#fff" }}>{org.name}</strong>. Channel names
            must be lowercase letters, numbers, or <code>_-</code>.
          </p>
        </div>

        <Field label="Name" hint="Lowercase, 2–31 chars. No spaces.">
          <input
            type="text"
            required
            maxLength={31}
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            placeholder="general"
            style={inputStyle}
          />
        </Field>

        <Field label="Topic" hint="Shown under the channel header.">
          <input
            type="text"
            maxLength={200}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Where the chapter coordinates"
            style={inputStyle}
          />
        </Field>

        <Field label="Privacy">
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { v: false, label: "Public", sub: "All members can view" },
              { v: true, label: "Private", sub: "Officers only" },
            ].map((opt) => {
              const on = isPrivate === opt.v;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setIsPrivate(opt.v)}
                  style={modalSegmentStyle(on)}
                >
                  <div style={{ fontWeight: 700 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: COLORS.glassMuted, marginTop: 2 }}>
                    {opt.sub}
                  </div>
                </button>
              );
            })}
          </div>
        </Field>

        {error ? <div style={modalErrorStyle}>{error}</div> : null}

        <div style={modalFooterStyle}>
          <button type="button" onClick={onClose} style={modalCancelStyle}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            style={modalSubmitStyle(!busy && !!name.trim())}
          >
            {busy ? "Creating…" : "Create channel"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

type SettingsTab =
  | "overview"
  | "channels"
  | "members"
  | "followers"
  | "invites"
  | "requests"
  | "danger";

function OrgSettingsModal({
  org,
  channels,
  channelsErr,
  onRetryChannels,
  onClose,
  onOrgUpdated,
  onOrgRemoved,
  onChannelUpdated,
  onChannelRemoved,
}: {
  org: Org;
  // null while the org's channel list is still loading.
  channels: Channel[] | null;
  // The same failure the rail shows; the Channels tab shows it too.
  channelsErr: LoadFailure | null;
  onRetryChannels: () => void;
  onClose: () => void;
  onOrgUpdated: (org: Org) => void;
  onOrgRemoved: (orgId: string) => void;
  onChannelUpdated: (channel: Channel) => void;
  onChannelRemoved: (channelId: string) => void;
}) {
  const canManage = org.role === "owner" || org.role === "admin";
  const isStaff = canManage || org.role === "mod";
  const isOwner = org.role === "owner";
  // Invites are refused for a hidden club (the org page's officer bar drops
  // "Invite people" too), so the tab and the Followers button go with it.
  const canInvite = canManage && !org.hidden;
  const baseAudience: OrgAudience = org.audience ?? "both";

  // Followers: owner/admin only, the same roles the followers route allows
  // (mods get 403). Requests: every staff role under every policy, because a
  // visiting student can still request an open club.
  const tabs: { key: SettingsTab; label: string; show: boolean }[] = [
    { key: "overview", label: "Overview", show: true },
    { key: "channels", label: "Channels", show: canManage },
    { key: "members", label: "Members", show: true },
    { key: "followers", label: "Followers", show: canManage },
    { key: "invites", label: "Invites", show: canInvite },
    { key: "requests", label: "Requests", show: isStaff },
    { key: "danger", label: "Danger", show: true },
  ];
  const visibleTabs = tabs.filter((t) => t.show);
  const [tab, setTab] = useState<SettingsTab>(visibleTabs[0].key);

  return (
    <ModalShell onClose={onClose}>
      <div
        style={{
          ...modalFormStyle,
          width: "min(760px, 94vw)",
          maxHeight: "min(86vh, 800px)",
          padding: 0,
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div>
            <div style={modalTitleStyle}>{org.name}</div>
            <div
              style={{
                ...modalSubtitleStyle,
                marginTop: 4,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              @{org.handle}
              <span style={{ opacity: 0.5 }}>·</span>
              <RoleChip role={org.role} />
            </div>
          </div>
          <button type="button" onClick={onClose} style={modalIconButtonStyle} aria-label="Close">
            ✕
          </button>
        </header>

        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "8px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            overflowX: "auto",
          }}
        >
          {visibleTabs.map((t) => {
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                style={modalTabPillStyle(on)}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {tab === "overview" ? (
            <SettingsOverview org={org} canManage={canManage} onOrgUpdated={onOrgUpdated} />
          ) : null}
          {tab === "channels" ? (
            <SettingsChannels
              org={org}
              channels={channels}
              loadErr={channelsErr}
              onRetryLoad={onRetryChannels}
              onChannelUpdated={onChannelUpdated}
              onChannelRemoved={onChannelRemoved}
            />
          ) : null}
          {tab === "members" ? (
            <SettingsMembers org={org} canManage={canManage} isOwner={isOwner} />
          ) : null}
          {tab === "followers" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Club model (Oct 16): the Board switch, above the list. */}
              <BoardFollowersSetting org={org} />
              <SettingsFollowers
                org={org}
                canInvite={canInvite}
                onInvite={() => setTab("invites")}
              />
            </div>
          ) : null}
          {/* Mounted per visit, so its followers list refetches after a Remove.
              `inline` is the sheet's dark-glass variant: no panel around it. */}
          {tab === "invites" ? (
            <OrgInviteSheet
              handle={org.handle}
              orgName={org.name}
              audience={baseAudience}
              presentation="inline"
            />
          ) : null}
          {tab === "requests" ? <SettingsRequests org={org} /> : null}
          {tab === "danger" ? (
            <SettingsDanger
              org={org}
              isOwner={isOwner}
              onOrgRemoved={onOrgRemoved}
            />
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}

function SettingsOverview({
  org,
  canManage,
  onOrgUpdated,
}: {
  org: Org;
  canManage: boolean;
  onOrgUpdated: (org: Org) => void;
}) {
  const basePolicy: JoinPolicy = org.join_policy ?? "open";
  const baseAudience: OrgAudience = org.audience ?? "both";
  const [name, setName] = useState(org.name);
  const [description, setDescription] = useState(org.description ?? "");
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>(basePolicy);
  const [audience, setAudience] = useState<OrgAudience>(baseAudience);
  const [backdrop, setBackdrop] = useState<BackdropKey>(org.backdrop_preset);
  const [philanthropy, setPhilanthropy] = useState(org.philanthropy ?? "");
  const [links, setLinks] = useState<Array<{ label: string; url: string }>>(
    Array.isArray(org.links) ? org.links : []
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const initialLinksKey = JSON.stringify(org.links ?? []);
  const currentLinksKey = JSON.stringify(links);
  const dirty =
    name.trim() !== org.name ||
    description.trim() !== (org.description ?? "") ||
    joinPolicy !== basePolicy ||
    audience !== baseAudience ||
    backdrop !== org.backdrop_preset ||
    philanthropy.trim() !== (org.philanthropy ?? "") ||
    initialLinksKey !== currentLinksKey;

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Switching a club to invite-only leaves any pending requests in place.
  // Say how many, read once, the first time the switch is picked. A failed
  // read (or none pending) says nothing.
  const showPendingLine = canManage && !org.hidden && joinPolicy === "invite" && basePolicy !== "invite";
  const pendingAskedRef = useRef(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  useEffect(() => {
    if (!showPendingLine || pendingAskedRef.current) return;
    pendingAskedRef.current = true;
    void vibeRequest<{ requests?: unknown[] }>(`/api/orgs/${org.handle}/requests`, {
      cache: "no-store",
      quiet: true,
      failure: "Couldn't load join requests.",
    }).then((r) => {
      if (!aliveRef.current) return;
      setPendingCount(r.ok && Array.isArray(r.data.requests) ? r.data.requests.length : null);
    });
  }, [showPendingLine, org.handle]);
  const pendingLine =
    !showPendingLine || !pendingCount
      ? null
      : pendingCount === 1
        ? "1 pending request stays in Requests until you approve or deny it."
        : `${pendingCount} pending requests stay in Requests until you approve or deny them.`;

  // The read-only view's "Followers" row: the club route already floors the
  // count for anyone who isn't an owner or admin. Failure means no row.
  const [readOnlyFollowers, setReadOnlyFollowers] = useState<number | null>(null);
  useEffect(() => {
    if (canManage) return;
    let cancelled = false;
    void vibeRequest<{ org?: { follower_count?: number | null } }>(`/api/orgs/${org.handle}`, {
      cache: "no-store",
      quiet: true,
      failure: "Couldn't load this club.",
    }).then((r) => {
      if (cancelled) return;
      const n = r.ok ? r.data.org?.follower_count : null;
      setReadOnlyFollowers(typeof n === "number" ? n : null);
    });
    return () => {
      cancelled = true;
    };
  }, [canManage, org.handle]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const json: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim(),
      backdrop_preset: backdrop,
      philanthropy: philanthropy.trim(),
      links: links
        .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
        .filter((l) => l.label && l.url),
    };
    // Only what changed, and never on a hidden club (the PATCH refuses it).
    // Never the legacy public flag: the PATCH maps a stray one into a join policy.
    if (!org.hidden) {
      if (joinPolicy !== basePolicy) json.join_policy = joinPolicy;
      if (audience !== baseAudience) json.audience = audience;
    }
    const r = await vibeRequest<{ org?: Partial<Org> }>(`/api/orgs/${org.handle}`, {
      method: "PATCH",
      json,
      quiet: true,
      failure: "Couldn't save your changes.",
    });
    if (!aliveRef.current) return;
    setBusy(false);
    if (r.ok) {
      // The response has join_policy, audience and hidden, but no role.
      onOrgUpdated({ ...org, ...r.data.org });
      setMsg({ tone: "ok", text: "Saved." });
      return;
    }
    setMsg({
      tone: "err",
      text: r.status === 429 ? "Too many tries. Try again in a minute." : (r.error ?? r.message),
    });
    if (r.action) toast({ message: r.message, tone: "error", action: r.action });
  };

  if (!canManage) {
    // Mods and members get a read-only view.
    const whoCanJoin = whoCanJoinFact(org.join_policy);
    const openTo = openToFact(org.audience);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14, color: "#fff" }}>
        <PermissionsCard role={org.role} />
        <div style={{ fontSize: 12, color: COLORS.glassMuted, marginTop: -6 }}>{MOD_READONLY}</div>
        <ReadOnlyRow label="Name" value={org.name} />
        <ReadOnlyRow label="Handle" value={`@${org.handle}`} />
        <ReadOnlyRow label="Description" value={org.description || "—"} />
        {whoCanJoin ? <ReadOnlyRow label="Who can join" value={whoCanJoin} /> : null}
        {openTo ? <ReadOnlyRow label="Open to" value={openTo} /> : null}
        {/* Without this, a member of a hidden club reads "Who can join:
            Anyone" with nothing saying nobody can find the club to join it.
            The manager view has its own hidden line. */}
        {org.hidden ? (
          <div style={{ fontSize: 12, color: COLORS.glassMuted, marginTop: -6 }}>
            {ORG_COPY.notices.hidden}
          </div>
        ) : null}
        {followerCountText(readOnlyFollowers) ? (
          <ReadOnlyRow label="Followers" value={String(readOnlyFollowers)} />
        ) : null}
        <ReadOnlyRow label="Backdrop" value={BACKDROP_PRESETS[org.backdrop_preset].label} />
      </div>
    );
  }

  const openToRow = campusRowById(org.campus_id);
  const openToCampus = openToRow
    ? { name: openToRow.name, shared: isSharedCampus(openToRow) }
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <PermissionsCard role={org.role} />
      <Field label="Name">
        <input
          type="text"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="Description" hint="Shown on Discover.">
        <textarea
          value={description}
          maxLength={400}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
        />
      </Field>
      {org.hidden ? (
        <>
          <ReadOnlyRow label="Who can join" value={whoCanJoinFact(basePolicy) ?? "—"} />
          <ReadOnlyRow label="Open to" value={openToFact(baseAudience) ?? "—"} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: -6 }}>
            {"This org is hidden, so its join settings can't change."}
          </div>
        </>
      ) : (
        <>
          <ChoiceField
            label="Who can join"
            options={WHO_CAN_JOIN_OPTIONS}
            value={joinPolicy}
            onChange={(v) => setJoinPolicy(v as JoinPolicy)}
          />
          {pendingLine ? (
            <div style={{ fontSize: 12, color: COLORS.glassMuted, marginTop: -6 }}>
              {pendingLine}
            </div>
          ) : null}
          {/* No disabled options: an admin can't know the owner's university,
              so the PATCH's 400 `audience_excludes_owner` is the check. */}
          <ChoiceField
            label="Open to"
            hint={AUDIENCE_HELP}
            options={openToOptions(openToCampus)}
            value={audience}
            onChange={(v) => setAudience(v as OrgAudience)}
          />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: -6 }}>
            {OFFICER_FOLLOW_HELP}
          </div>
        </>
      )}
      <Field label="Backdrop">
        <div style={{ display: "flex", gap: 6 }}>
          {(Object.keys(BACKDROP_PRESETS) as BackdropKey[]).map((key) => {
            const p = BACKDROP_PRESETS[key];
            const active = key === backdrop;
            return (
              <button
                key={key}
                type="button"
                title={p.label}
                onClick={() => setBackdrop(key)}
                style={{
                  flex: 1,
                  height: 32,
                  borderRadius: 8,
                  background: p.css,
                  border: active ? "1.5px solid #fff" : "1px solid rgba(255,255,255,0.14)",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            );
          })}
        </div>
      </Field>

      <Field
        label="Links"
        hint="Up to 10 — Instagram, GroupMe, website, application form, etc. Only https:// URLs are accepted."
      >
        <LinksEditor value={links} onChange={setLinks} />
      </Field>

      <Field
        label="Philanthropy"
        hint="What does this org support? Shown on the public profile."
      >
        <textarea
          value={philanthropy}
          maxLength={1000}
          rows={3}
          onChange={(e) => setPhilanthropy(e.target.value)}
          placeholder="e.g. Annual fundraiser supporting Riley Children's Hospital — $40k raised in 2025."
          style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
        />
      </Field>

      {msg ? (
        <div style={msg.tone === "ok" ? modalOkStyle : modalErrorStyle}>{msg.text}</div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={save}
          style={modalSubmitStyle(dirty && !busy)}
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function SettingsChannels({
  org,
  channels,
  loadErr,
  onRetryLoad,
  onChannelUpdated,
  onChannelRemoved,
}: {
  org: Org;
  channels: Channel[] | null;
  loadErr: LoadFailure | null;
  onRetryLoad: () => void;
  onChannelUpdated: (channel: Channel) => void;
  onChannelRemoved: (channelId: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ ...modalSubtitleStyle, margin: "0 0 4px" }}>
        Rename, change topic, toggle privacy, or delete a channel. Deleting is
        permanent — messages are removed too.
      </p>
      {/* The failure wins even over a cached list: a channel created after
          it caches a one-item list that isn't the org's real one. */}
      {loadErr ? (
        <LoadFailed tone="dark" failure={loadErr} onRetry={onRetryLoad} />
      ) : channels === null ? (
        <div style={{ color: COLORS.glassMuted, fontSize: 14 }}>Loading channels…</div>
      ) : channels.length === 0 ? (
        <div style={{ color: COLORS.glassMuted, fontSize: 14 }}>No channels yet.</div>
      ) : (
        channels.map((c) => (
          <ChannelEditorRow
            key={c.id}
            org={org}
            channel={c}
            onUpdated={onChannelUpdated}
            onRemoved={onChannelRemoved}
          />
        ))
      )}
    </div>
  );
}

function ChannelEditorRow({
  org,
  channel,
  onUpdated,
  onRemoved,
}: {
  org: Org;
  channel: Channel;
  onUpdated: (channel: Channel) => void;
  onRemoved: (channelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic ?? "");
  const [isPrivate, setIsPrivate] = useState(channel.is_private);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Club chat v1: no rename, privacy or Delete on the club's own rooms;
  // nothing to edit on an event's chat.
  const core = isCoreRoom(channel);

  const dirty =
    name.trim() !== channel.name ||
    (topic.trim() || null) !== (channel.topic ?? null) ||
    isPrivate !== channel.is_private;

  const save = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/orgs/${org.handle}/channels/${channel.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim().toLowerCase(),
          topic: topic.trim() || null,
          is_private: isPrivate,
        }),
      });
      const data = await res.json();
      if (!data?.ok) {
        setErr(chatRefusalLine(data?.code, data?.error) ?? (data?.error || "Failed to save"));
        return;
      }
      onUpdated(data.channel as Channel);
      setOpen(false);
    } catch (e) {
      console.error("[campus] save channel", e);
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete #${channel.name}? Messages will be removed too.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orgs/${org.handle}/channels/${channel.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data?.ok) {
        setErr(chatRefusalLine(data?.code, data?.error) ?? (data?.error || "Failed to delete"));
        return;
      }
      onRemoved(channel.id);
    } catch (e) {
      console.error("[campus] delete channel", e);
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 10,
        padding: 12,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          background: "transparent",
          border: "none",
          color: "#fff",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 14,
          cursor: "pointer",
          padding: 0,
          textAlign: "left",
        }}
      >
        <span style={{ color: COLORS.glassMuted, display: "inline-flex", alignItems: "center" }}>
          {channel.is_private ? <LockIcon size={12} /> : "#"}
        </span>
        <span style={{ flex: 1, fontWeight: 600 }}>{channel.name}</span>
        <span style={{ color: COLORS.glassMuted, fontSize: 12 }}>{open ? "Hide" : "Edit"}</span>
      </button>

      {open && channel.kind === "event" ? (
        <p style={{ ...modalSubtitleStyle, marginTop: 10 }}>{EVENT_ROOM_NOTE}</p>
      ) : open ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          {core ? (
            <ReadOnlyRow label="Name" value={channel.name} />
          ) : (
          <Field label="Name">
            <input
              type="text"
              value={name}
              maxLength={31}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              style={inputStyle}
            />
          </Field>
          )}
          <Field label="Topic">
            <input
              type="text"
              value={topic}
              maxLength={200}
              onChange={(e) => setTopic(e.target.value)}
              style={inputStyle}
            />
          </Field>
          {core ? null : (
          <Field label="Privacy">
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { v: false, label: "Public" },
                { v: true, label: "Private" },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setIsPrivate(opt.v)}
                  style={modalSegmentStyle(isPrivate === opt.v)}
                >
                  <div style={{ fontWeight: 700 }}>{opt.label}</div>
                </button>
              ))}
            </div>
          </Field>
          )}
          {err ? <div style={modalErrorStyle}>{err}</div> : null}
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
            {core ? (
              <span />
            ) : (
            <button type="button" onClick={remove} disabled={busy} style={modalDangerStyle}>
              Delete channel
            </button>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setOpen(false)} style={modalCancelStyle}>
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!dirty || busy}
                style={modalSubmitStyle(dirty && !busy)}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type MemberRow = {
  user_id: string;
  role: string;
  joined_at: string;
  /** The title an owner or admin gave them ("President"); null for none, or
   *  on a server without the column. Members see it whatever the member
   *  chose for their own profile. */
  title?: string | null;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  school_verified: boolean;
};

function SettingsMembers({
  org,
  canManage,
  isOwner,
}: {
  org: Org;
  canManage: boolean;
  isOwner: boolean;
}) {
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // The list itself failing to load; `err` is for role and kick refusals.
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loadedRef = useRef(false);
  // Whose title is being edited (club model, Oct 16): one row at a time.
  const [titleFor, setTitleFor] = useState<string | null>(null);
  // Who is looking, for an admin's own row: an admin titles mods, members and
  // themselves (the PATCH route's rule, which decides). Read from the session
  // already in this browser, no request; null leaves an admin's own row
  // without the button, never another admin's with it.
  const [selfId, setSelfId] = useState<string | null>(null);
  useEffect(() => {
    if (!canManage || isOwner) return;
    let cancelled = false;
    void getSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setSelfId(data.session?.user.id ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canManage, isOwner]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await vibeRequest<{ members?: MemberRow[] }>(
        `/api/orgs/${org.handle}/members`,
        { cache: "no-store", quiet: true, failure: "Couldn't load members." },
      );
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.members)) {
        loadedRef.current = true;
        setLoadErr(null);
        setMembers(r.data.members);
        return;
      }
      const failure = asLoadFailure(r, "Couldn't load members.");
      // A reload after a role change or kick keeps the rows and toasts;
      // only a first load shows the failure in place of the list.
      if (loadedRef.current) toast({ message: failure.message, tone: "error", action: failure.action });
      else setLoadErr(failure);
    })();
    return () => {
      cancelled = true;
    };
  }, [org.handle, reloadKey]);

  const refresh = () => setReloadKey((k) => k + 1);

  const updateRole = async (m: MemberRow, role: string) => {
    setBusyId(m.user_id);
    try {
      const res = await fetch(`/api/orgs/${org.handle}/members/${m.user_id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!data?.ok) {
        setErr(data?.error || "Failed to update role");
        return;
      }
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const kick = async (m: MemberRow) => {
    if (!confirm(`Remove ${m.name || m.handle} from the org?`)) return;
    setBusyId(m.user_id);
    try {
      const res = await fetch(`/api/orgs/${org.handle}/members/${m.user_id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data?.ok) {
        setErr(data?.error || "Failed to remove");
        return;
      }
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  if (members === null) {
    if (loadErr) {
      return (
        <LoadFailed
          tone="dark"
          failure={loadErr}
          onRetry={() => {
            setLoadErr(null);
            refresh();
          }}
        />
      );
    }
    return <div style={{ color: COLORS.glassMuted, fontSize: 14 }}>Loading members…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <RoleLegend />
      {err ? <div style={modalErrorStyle}>{err}</div> : null}
      {members.map((m) => {
        const canTouchThisRow =
          canManage &&
          m.role !== "owner" &&
          (m.role !== "admin" || isOwner);
        const roleOptions: string[] =
          isOwner ? ["admin", "mod", "member"] : ["mod", "member"];
        const canTitle = mayTitleMember({ canManage, isOwner, selfId }, m);
        const title = m.title?.trim() || null;
        return (
          <div
            key={m.user_id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  background: m.avatar_url
                    ? `url(${m.avatar_url}) center/cover`
                    : "rgba(255,255,255,0.1)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Fraunces, serif",
                  fontWeight: 700,
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                {!m.avatar_url ? initialsForOrg(m.name || m.handle || "?") : null}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "DM Sans, sans-serif",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#fff",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {m.name || m.handle || "Unknown"}
                  {m.school_verified ? (
                    <span style={{ marginLeft: 6, fontSize: 11, color: "#9DD89D" }}>·verified</span>
                  ) : null}
                </div>
                <div
                  style={{
                    fontFamily: "DM Sans, sans-serif",
                    fontSize: 12,
                    color: COLORS.glassMuted,
                  }}
                >
                  @{m.handle ?? m.user_id.slice(0, 6)}
                  {title ? <span style={{ color: "#fff" }}>{` · ${title}`}</span> : null}
                </div>
              </div>
              {canTouchThisRow ? (
                <select
                  value={m.role}
                  disabled={busyId === m.user_id}
                  onChange={(e) => updateRole(m, e.target.value)}
                  style={{
                    ...inputStyle,
                    width: "auto",
                    padding: "6px 8px",
                    fontSize: 13,
                  }}
                >
                  {/* Always include the current role even if not in the editable
                      set so the select shows something coherent. */}
                  {!roleOptions.includes(m.role) ? (
                    <option value={m.role}>{roleLabel(m.role)}</option>
                  ) : null}
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </select>
              ) : (
                <RoleChip role={m.role as Role} />
              )}
              {canTitle ? (
                <button
                  type="button"
                  aria-expanded={titleFor === m.user_id}
                  onClick={() => setTitleFor((cur) => (cur === m.user_id ? null : m.user_id))}
                  style={{ ...modalCancelStyle, padding: "6px 10px", fontSize: 12 }}
                >
                  {title ? "Edit title" : "Add title"}
                </button>
              ) : null}
              {canTouchThisRow ? (
                <button
                  type="button"
                  disabled={busyId === m.user_id}
                  onClick={() => kick(m)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(232,77,77,0.45)",
                    background: "rgba(232,77,77,0.18)",
                    color: "#FFD0CC",
                    fontFamily: "DM Sans, sans-serif",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Kick
                </button>
              ) : null}
            </div>
            {canTitle && titleFor === m.user_id ? (
              <MemberTitleEditor
                orgHandle={org.handle}
                orgName={org.name}
                member={m}
                onDone={(saved) => {
                  setTitleFor(null);
                  if (saved === undefined) return;
                  setMembers((prev) =>
                    prev ? prev.map((x) => (x.user_id === m.user_id ? { ...x, title: saved } : x)) : prev,
                  );
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** A role as Settings says it: Owner, Officer (an admin), Mod, Member. */
function roleLabel(role: string): string {
  return role in ROLE_META ? ROLE_META[role as Role].label : role;
}

/**
 * May this viewer give `m` a title? The PATCH route's rule (`members/[userId]`,
 * which decides): the owner titles anyone, themselves included; an admin
 * titles mods, members and themselves. `selfId` null: an admin's own row
 * goes without the button rather than another admin's getting one.
 */
function mayTitleMember(
  viewer: { canManage: boolean; isOwner: boolean; selfId: string | null },
  m: Pick<MemberRow, "user_id" | "role">,
): boolean {
  if (!viewer.canManage) return false;
  if (viewer.isOwner) return true;
  if (m.role === "mod" || m.role === "member") return true;
  return viewer.selfId !== null && m.user_id === viewer.selfId;
}

/**
 * Give a member a title, change it or remove it (club model, Franky, Oct 16),
 * under their row in Settings → Members. The shape is checked here with the
 * route's own rules (`normalizeClubTitle`: one line, 32 characters, no Vibe,
 * Admin, Moderator, Verified or Official); the route also runs the word
 * filter and stamps who set it. The club's members see the title in its
 * member list; it shows on the member's profile as "President · SAE" unless
 * they hide the club or the title. `onDone(saved)`: the stored title (null once
 * removed) after a save, undefined on Cancel.
 */
function MemberTitleEditor({
  orgHandle,
  orgName,
  member,
  onDone,
}: {
  orgHandle: string;
  orgName: string;
  member: MemberRow;
  onDone: (saved: string | null | undefined) => void;
}) {
  const current = member.title?.trim() || null;
  const [draft, setDraft] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  // A refusal from the route, in its words.
  const [line, setLine] = useState<string | null>(null);
  const checked = normalizeClubTitle(draft);
  const next = checked.ok ? checked.title : null;
  const canSave = checked.ok && next !== null && next !== current && !busy;
  const who = member.name || (member.handle ? `@${member.handle}` : "This member");

  const save = async (value: string | null) => {
    if (busy) return;
    setBusy(true);
    setLine(null);
    const r = await vibeRequest<{ title?: unknown }>(
      `/api/orgs/${encodeURIComponent(orgHandle)}/members/${encodeURIComponent(member.user_id)}`,
      { method: "PATCH", json: { title: value }, quiet: true, failure: "Couldn't save the title." },
    );
    setBusy(false);
    if (!r.ok) {
      setLine(r.status === 429 ? "Too many tries. Try again in a minute." : r.message);
      if (r.action) toast({ message: r.message, tone: "error", action: r.action });
      return;
    }
    const saved = typeof r.data.title === "string" && r.data.title.trim() ? r.data.title.trim() : null;
    toast({ message: saved ? `${who}'s title is now ${saved}.` : `${who}'s title was removed.`, tone: "info" });
    onDone(saved);
  };

  const hint =
    draft.trim() && !checked.ok
      ? checked.error
      : next
        ? `On their profile: ${clubFlairLabel(orgName, next)}, unless they hide it.`
        : "Like President or Rush Chair. It shows on their profile unless they hide it.";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) void save(next);
      }}
      style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 42 }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <input
          type="text"
          value={draft}
          autoFocus
          // Room past the limit, so a long title gets the "Keep a title to
          // 32 characters" line instead of being cut off mid-word.
          maxLength={CLUB_TITLE_MAX * 2}
          aria-label={`Title for ${who}`}
          placeholder="Title"
          onChange={(e) => setDraft(e.target.value)}
          style={{ ...inputStyle, flex: "1 1 180px", width: "auto", padding: "6px 10px", fontSize: 13 }}
        />
        <button type="submit" disabled={!canSave} style={modalSubmitStyle(canSave)}>
          {busy ? "Saving…" : "Save"}
        </button>
        {current ? (
          <button type="button" disabled={busy} onClick={() => void save(null)} style={modalCancelStyle}>
            Remove title
          </button>
        ) : null}
        <button type="button" disabled={busy} onClick={() => onDone(undefined)} style={modalCancelStyle}>
          Cancel
        </button>
      </div>
      <div style={{ fontSize: 11, color: COLORS.glassMuted }}>{hint}</div>
      {line ? <div style={modalErrorStyle}>{line}</div> : null}
    </form>
  );
}

/**
 * Settings → Followers, above the list (club model, Franky, Oct 16): may the
 * club's followers read its Board? The same setting as the switch under the
 * Board in Messages' Rooms dialog (`rooms-dialog-rules.ts` holds both), read
 * from the club and saved at once; a refusal toasts why and leaves the choice
 * as it was. Owners and admins only: the tab is theirs, and the PATCH refuses
 * everyone else. Nothing shows while the setting is unknown (loading, or a
 * server without it); a failed read says so, with Retry.
 */
function BoardFollowersSetting({ org }: { org: Org }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  // Retry on a failed read bumps this.
  const [seq, setSeq] = useState(0);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void vibeRequest<unknown>(clubUrl(org.handle), {
      cache: "no-store",
      quiet: true,
      failure: BOARD_SETTING_LOAD_LINE,
    }).then((r) => {
      if (cancelled) return;
      setOn(r.ok ? boardSettingOf(r.data) : null);
      setFailure(r.ok ? null : asLoadFailure(r, BOARD_SETTING_LOAD_LINE));
    });
    return () => {
      cancelled = true;
    };
  }, [org.handle, seq]);

  const pick = async (next: boolean) => {
    if (on === null || next === on || savingRef.current) return;
    savingRef.current = true;
    const r = await vibeRequest<unknown>(clubUrl(org.handle), {
      method: "PATCH",
      json: boardSettingBody(next),
      failure: BOARD_SETTING_SAVE_LINE,
    });
    savingRef.current = false;
    if (!r.ok) return;
    const saved = savedBoardSetting(r.data, next);
    setOn(saved);
    toast({ message: boardSettingSavedLine(saved), tone: "info" });
  };

  if (failure) {
    return (
      <LoadFailed
        tone="dark"
        compact
        failure={failure}
        onRetry={() => {
          setFailure(null);
          setSeq((n) => n + 1);
        }}
      />
    );
  }
  if (on === null) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <ChoiceField
        label={BOARD_FOLLOWERS_LABEL}
        hint={boardFollowersHelp(on)}
        options={[
          { value: "on", label: "On", sub: "Followers read officers' posts" },
          { value: "off", label: "Off", sub: "Members only" },
        ]}
        value={on ? "on" : "off"}
        onChange={(v) => void pick(v === "on")}
      />
      {org.hidden ? (
        <div style={{ fontSize: 11, color: COLORS.glassMuted }}>{BOARD_FOLLOWERS_HIDDEN_LINE}</div>
      ) : null}
    </div>
  );
}

/**
 * One row of the officer followers list (plan §4.2). The route also sends the
 * person-follow state, mutuals, banners, major and year; this list shows none
 * of them.
 */
type FollowerRow = {
  id: string;
  name: string | null;
  handle: string;
  avatar_url: string | null;
  follows_since: string;
  org_follow_source: string | null;
  member_role: Role | null;
};

type FollowersPage = {
  followers?: FollowerRow[];
  next_cursor?: string | null;
  follower_count?: number | null;
};

/** The rows of `more` whose id isn't already listed, appended in the server's order. */
function appendNewFollowers(rows: FollowerRow[], more: FollowerRow[]): FollowerRow[] {
  const seen = new Set(rows.map((r) => r.id));
  const out = rows.slice();
  for (const r of more) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

function SettingsFollowers({
  org,
  canInvite,
  onInvite,
}: {
  org: Org;
  canInvite: boolean;
  onInvite: () => void;
}) {
  const [rows, setRows] = useState<FollowerRow[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loadedRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await vibeRequest<FollowersPage>(`/api/orgs/${org.handle}/followers?limit=30`, {
        cache: "no-store",
        quiet: true,
        failure: "Couldn't load followers.",
      });
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.followers)) {
        loadedRef.current = true;
        setLoadErr(null);
        // The server's order (first followed, newest first). Never re-sorted here.
        setRows(r.data.followers);
        setCursor(r.data.next_cursor ?? null);
        setCount(r.data.follower_count ?? null);
        return;
      }
      const failure = asLoadFailure(r, "Couldn't load followers.");
      // A failure never reads as "0 followers": a first load shows it in place
      // of the list; a later one keeps the rows and toasts.
      if (loadedRef.current) toast({ message: failure.message, tone: "error", action: failure.action });
      else setLoadErr(failure);
    })();
    return () => {
      cancelled = true;
    };
  }, [org.handle, reloadKey]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const r = await vibeRequest<FollowersPage>(
      `/api/orgs/${org.handle}/followers?limit=30&cursor=${encodeURIComponent(cursor)}`,
      { cache: "no-store", quiet: true, failure: "Couldn't load followers." },
    );
    if (!aliveRef.current) return;
    setLoadingMore(false);
    if (r.ok && Array.isArray(r.data.followers)) {
      const more = r.data.followers;
      setRows((prev) => appendNewFollowers(prev ?? [], more));
      setCursor(r.data.next_cursor ?? null);
      const n = r.data.follower_count;
      if (typeof n === "number") setCount(n);
      return;
    }
    // Rows and cursor stay, so "Show more" can be tried again.
    const failure = asLoadFailure(r, "Couldn't load followers.");
    toast({ message: failure.message, tone: "error", action: failure.action });
  };

  // Not a ban: they stop getting the club's posts and can follow again. It
  // also keeps them off the Board until they join (club model: the server
  // writes a bar), and nobody tells them. Nothing leaves the list until the
  // server says so, and nothing is refetched after.
  const remove = async (row: FollowerRow) => {
    const who = row.name || "@" + row.handle;
    if (
      !window.confirm(
        `Remove ${who} from ${org.name}'s followers? They'll stop getting its posts and can't read its Board unless they join. They can follow again, and they aren't told.`,
      )
    ) {
      return;
    }
    setBusyId(row.id);
    const r = await vibeRequest<{ removed?: boolean; follower_count?: number | null }>(
      `/api/orgs/${org.handle}/followers/${encodeURIComponent(row.id)}`,
      { method: "DELETE", quiet: true, failure: "Couldn't remove this follower." },
    );
    if (!aliveRef.current) return;
    setBusyId(null);
    if (r.ok) {
      setRows((prev) => (prev ?? []).filter((x) => x.id !== row.id));
      const n = r.data.follower_count;
      // No number means the count read failed on the way back. Keeping the
      // old one would leave the header one too high AND turn on the
      // blocks-and-mutes line for a gap this removal just made, so the header
      // falls back to "Followers" until the tab is reopened.
      setCount(typeof n === "number" ? n : null);
      // removed:false means they had already unfollowed; the row just goes.
      if (r.data.removed === true) toast({ message: "Follower removed", tone: "info" });
      return;
    }
    if (r.code === "member_follows") {
      setRows((prev) =>
        (prev ?? []).map((x) =>
          x.id === row.id && x.member_role == null ? { ...x, member_role: "member" } : x,
        ),
      );
      toast({ message: orgErrorCopy("member_follows") ?? r.message, tone: "error" });
      return;
    }
    if (r.code === "not_found") {
      toast({ message: orgErrorCopy("not_found") ?? r.message, tone: "error" });
      return;
    }
    if (r.status === 429) {
      toast({ message: "Too many tries. Try again in a minute.", tone: "error" });
      return;
    }
    toast({ message: r.message, tone: "error", action: r.action });
  };

  if (rows === null) {
    if (loadErr) {
      return (
        <LoadFailed
          tone="dark"
          failure={loadErr}
          onRetry={() => {
            setLoadErr(null);
            setReloadKey((k) => k + 1);
          }}
        />
      );
    }
    return <div style={{ color: COLORS.glassMuted, fontSize: 14 }}>Loading followers…</div>;
  }

  // Exact, with no floor: only owners and admins reach this tab.
  const heading = count === null ? "Followers" : count === 1 ? "1 follower" : `${count} followers`;
  // The count includes people the list leaves out for blocks and mutes.
  const someUnlisted = cursor === null && count !== null && rows.length < count;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ fontFamily: "Fraunces, serif", fontWeight: 800, fontSize: 16, color: "#fff" }}>
            {heading}
          </div>
          {canInvite ? (
            <button type="button" onClick={onInvite} style={modalSubmitStyle(true)}>
              Invite followers
            </button>
          ) : null}
        </div>
        <div style={{ fontSize: 12, color: COLORS.glassMuted, marginTop: 4 }}>
          Only officers can see this list.
        </div>
        {someUnlisted ? (
          <div style={{ fontSize: 12, color: COLORS.glassMuted, marginTop: 2 }}>
            {"Some followers aren't listed because of blocks or mutes."}
          </div>
        ) : null}
      </div>

      {rows.length === 0 && cursor === null ? (
        <div style={{ color: COLORS.glassMuted, fontSize: 14 }}>
          {fillCopy(ORG_COPY.inviteSheet.noFollowers, { org: org.name })}
        </div>
      ) : null}

      {rows.map((row) => (
        <FollowerListRow
          key={row.id}
          row={row}
          busy={busyId === row.id}
          onRemove={() => void remove(row)}
        />
      ))}

      {cursor !== null ? (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadMore()}
            style={modalCancelStyle}
          >
            {loadingMore ? "Loading…" : "Show more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** A followers-list row. A member can't be removed: members follow automatically. */
function FollowerListRow({
  row,
  busy,
  onRemove,
}: {
  row: FollowerRow;
  busy: boolean;
  onRemove: () => void;
}) {
  const since = followsSinceText(row.follows_since);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: row.avatar_url
            ? `url(${JSON.stringify(row.avatar_url)}) center/cover`
            : "rgba(255,255,255,0.1)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Fraunces, serif",
          fontWeight: 700,
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        {!row.avatar_url ? initialsForOrg(row.name || row.handle || "?") : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link
          href={`/profile/${encodeURIComponent(row.handle)}`}
          style={{
            display: "block",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 14,
            fontWeight: 600,
            color: "#fff",
            textDecoration: "none",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.name || `@${row.handle}`}
        </Link>
        <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: COLORS.glassMuted }}>
          @{row.handle}
        </div>
        {since ? (
          <div
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              color: "rgba(255,255,255,0.45)",
              marginTop: 2,
            }}
          >
            {since}
          </div>
        ) : null}
      </div>
      {row.member_role != null ? (
        <span
          style={{
            padding: "3px 8px",
            borderRadius: 999,
            fontFamily: "DM Sans, sans-serif",
            fontSize: 11,
            fontWeight: 700,
            color: "#fff",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.14)",
            flexShrink: 0,
          }}
        >
          Member
        </span>
      ) : (
        <button type="button" disabled={busy} onClick={onRemove} style={modalCancelStyle}>
          {busy ? "Removing…" : "Remove"}
        </button>
      )}
    </div>
  );
}

type RequestRow = {
  id: string;
  user_id: string;
  status: string;
  message: string | null;
  requested_at: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  school_verified: boolean;
  // Eligibility is re-checked at approval: the org's audience against the
  // requester's verified school, as of now.
  eligible?: boolean;
  ineligible_reason?: "audience_iu" | "audience_purdue" | "unverified" | null;
  // An officer removed them before and nobody let them back (S67 sec wave 2
  // #15). Letting them back takes an owner or admin, so `can_approve` is
  // false for a mod; they can still Deny.
  removed_before?: boolean;
  can_approve?: boolean;
};

const REQUEST_INELIGIBLE_LABEL: Record<"audience_iu" | "audience_purdue" | "unverified", string> = {
  audience_iu: "Not eligible (Purdue student)",
  audience_purdue: "Not eligible (IU student)",
  unverified: "Not eligible (no verified school email)",
};

function SettingsRequests({ org }: { org: Org }) {
  const [requests, setRequests] = useState<RequestRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // The list itself failing to load; `err` is for approve/deny refusals.
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await vibeRequest<{ requests?: RequestRow[] }>(
        `/api/orgs/${org.handle}/requests`,
        { cache: "no-store", quiet: true, failure: "Couldn't load join requests." },
      );
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.requests)) {
        loadedRef.current = true;
        setLoadErr(null);
        setRequests(r.data.requests);
        return;
      }
      const failure = asLoadFailure(r, "Couldn't load join requests.");
      // A reload after approve or deny keeps the rows and toasts; only a
      // first load shows the failure (and never "No pending requests.").
      if (loadedRef.current) toast({ message: failure.message, tone: "error", action: failure.action });
      else setLoadErr(failure);
    })();
    return () => {
      cancelled = true;
    };
  }, [org.handle, reloadKey]);

  const refresh = () => setReloadKey((k) => k + 1);

  // Through `vibeRequest`, so an infra refusal that isn't JSON (a 429 or 502
  // HTML page) still lands in the error line instead of rejecting a floating
  // promise and showing the officer nothing.
  const act = async (row: RequestRow, action: "approve" | "deny") => {
    setBusyId(row.id);
    const r = await vibeRequest<{ request?: unknown }>(
      `/api/orgs/${org.handle}/requests/${row.id}`,
      {
        method: "POST",
        json: { action },
        quiet: true,
        failure:
          action === "approve" ? "Couldn't approve this request." : "Couldn't deny this request.",
      },
    );
    setBusyId(null);
    if (!r.ok) {
      // The 429 body carries no `code` and may not be JSON. The club refusals
      // (approve_unavailable, removed_needs_admin) get their plain line from
      // `orgErrorCopy`; a request that's gone (404 request_not_found, which is
      // also what a block pair with this officer answers) gets vibeRequest's
      // "That's no longer available." rather than the raw server string.
      setErr(
        r.status === 429
          ? "Too many tries. Try again in a minute."
          : (orgErrorCopy(r.code) ??
              (r.status === 404 ? r.message : (r.error ?? r.message))),
      );
      // Re-read the list, so each row's eligibility is current (an approve
      // can be refused because the club or the student changed since).
      refresh();
      return;
    }
    setErr(null);
    refresh();
  };

  if (requests === null) {
    if (loadErr) {
      return (
        <LoadFailed
          tone="dark"
          failure={loadErr}
          onRetry={() => {
            setLoadErr(null);
            refresh();
          }}
        />
      );
    }
    return <div style={{ color: COLORS.glassMuted, fontSize: 14 }}>Loading requests…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {err ? <div style={modalErrorStyle}>{err}</div> : null}
      {requests.length === 0 ? (
        <div style={{ color: COLORS.glassMuted, fontSize: 14 }}>No pending requests.</div>
      ) : (
        requests.map((r) => (
          <div
            key={r.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: 10,
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                background: r.avatar_url ? `url(${r.avatar_url}) center/cover` : "rgba(255,255,255,0.1)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "Fraunces, serif",
                fontWeight: 700,
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              {!r.avatar_url ? initialsForOrg(r.name || r.handle || "?") : null}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 14, fontWeight: 600, color: "#fff" }}>
                {r.name || r.handle || "Unknown"}
              </div>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: COLORS.glassMuted }}>
                @{r.handle ?? r.user_id.slice(0, 6)}
              </div>
              {r.removed_before ? (
                <span
                  style={{
                    display: "inline-block",
                    marginTop: 4,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "var(--tag-bg)",
                    // --coral, not --tag-ink: this modal is always dark, and
                    // Light's --tag-ink is too dim on it.
                    color: "var(--coral)",
                    fontFamily: "DM Sans, sans-serif",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {ORG_COPY.meta.removedBefore}
                </span>
              ) : null}
              {r.message ? (
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: "DM Sans, sans-serif",
                    fontSize: 13,
                    color: "rgba(255,255,255,0.78)",
                    lineHeight: 1.4,
                  }}
                >
                  “{r.message}”
                </div>
              ) : null}
            </div>
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => act(r, "deny")}
              style={modalCancelStyle}
            >
              Deny
            </button>
            {r.eligible === false ? (
              <span
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 12,
                  color: COLORS.glassMuted,
                  whiteSpace: "nowrap",
                }}
              >
                {REQUEST_INELIGIBLE_LABEL[r.ineligible_reason ?? "unverified"]}
              </span>
            ) : r.can_approve === false ? null : (
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => act(r, "approve")}
                style={modalSubmitStyle(busyId !== r.id)}
              >
                Approve
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function SettingsDanger({
  org,
  isOwner,
  onOrgRemoved,
}: {
  org: Org;
  isOwner: boolean;
  onOrgRemoved: (orgId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // "Leave <club>?" asked in place, with "Keep following" (club model, Oct 16).
  const [leaving, setLeaving] = useState(false);

  const destroy = async () => {
    const confirmed = prompt(
      `Type the handle "${org.handle}" to delete this club, its chats, its posts and its events. This cannot be undone.`
    );
    if (confirmed !== org.handle) {
      if (confirmed !== null) setErr("Handle didn't match — nothing deleted.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/orgs/${org.handle}`, { method: "DELETE" });
      const data = await res.json();
      if (!data?.ok) {
        setErr(data?.error || "Failed to delete");
        return;
      }
      onOrgRemoved(org.id);
    } catch (e) {
      console.error("[campus] delete org", e);
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {err ? <div style={modalErrorStyle}>{err}</div> : null}

      {!isOwner && leaving ? (
        <LeaveClubConfirm
          org={org}
          onCancel={() => setLeaving(false)}
          onLeft={() => onOrgRemoved(org.id)}
        />
      ) : !isOwner ? (
        <DangerCard
          title={ORG_COPY.menu.leaveIntroTitle}
          desc={ORG_COPY.menu.leaveIntro}
          actionLabel={ORG_COPY.menu.leave}
          onClick={() => setLeaving(true)}
          disabled={busy}
        />
      ) : (
        <DangerCard
          title="Transfer or delete"
          desc="Owners can't leave directly — transfer ownership first (coming soon) or delete the org below."
          actionLabel="—"
          onClick={() => {}}
          disabled
        />
      )}

      {isOwner ? (
        <DangerCard
          title="Delete this org"
          desc="Removes the club with all its chats, messages, members, posts and events. This cannot be undone."
          actionLabel={busy ? "Deleting…" : "Delete org"}
          onClick={destroy}
          disabled={busy}
        />
      ) : null}
    </div>
  );
}

function DangerCard({
  title,
  desc,
  actionLabel,
  onClick,
  disabled,
  children,
  onCancel,
}: {
  title: string;
  desc: string;
  actionLabel: string;
  onClick: () => void;
  disabled?: boolean;
  /** Between the words and the button (the leave confirm's Keep following). */
  children?: React.ReactNode;
  /** A Cancel beside the button, for a question asked in place. */
  onCancel?: () => void;
}) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background:
          "linear-gradient(180deg, rgba(232,77,77,0.16) 0%, rgba(232,77,77,0.04) 100%)",
        border: "1px solid rgba(232,77,77,0.35)",
      }}
    >
      <div style={{ fontFamily: "Fraunces, serif", fontWeight: 800, fontSize: 16, color: "#fff" }}>
        {title}
      </div>
      <p
        style={{
          margin: "6px 0 12px",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 13,
          color: "rgba(255,255,255,0.78)",
          lineHeight: 1.5,
        }}
      >
        {desc}
      </p>
      {children}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            border: "1px solid rgba(232,77,77,0.45)",
            background: "rgba(232,77,77,0.22)",
            color: "#FFD0CC",
            fontFamily: "DM Sans, sans-serif",
            fontWeight: 700,
            fontSize: 13,
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.55 : 1,
          }}
        >
          {actionLabel}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} disabled={disabled} style={modalCancelStyle}>
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * "Leave SAE?" in Settings → Danger (club model, Franky, Oct 16): the desktop
 * twin of the club page's ⋯ → Leave club, in its words. DELETE `/join` with
 * `{keep_following}`: ticked, the follow stays (its posts stay in the feed,
 * and the Board stays readable while the club allows it); unticked, any
 * follow left goes too. Every word is `ORG_COPY.menu`'s, the club page's ⋯
 * (wave-2 repair, finding 18). The box starts as `keepFollowingDefault` says
 * (join-copy.ts, the club page's own rule), from
 * the club's answer (`org_follow_source`), unticked until that read lands or
 * if it fails, and the student's own tick always wins. A hidden club asks
 * nothing about following (nobody new may follow one) and sends no body,
 * today's leave. A refusal toasts why (the owner can't leave) and the
 * question stays.
 */
function LeaveClubConfirm({
  org,
  onCancel,
  onLeft,
}: {
  org: Org;
  onCancel: () => void;
  onLeft: () => void;
}) {
  const [keep, setKeep] = useState(false);
  const [boardOn, setBoardOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const touchedRef = useRef(false);

  useEffect(() => {
    if (org.hidden) return;
    let cancelled = false;
    void vibeRequest<{ org?: { org_follow_source?: unknown } }>(clubUrl(org.handle), {
      cache: "no-store",
      quiet: true,
      failure: "Couldn't load this club.",
    }).then((r) => {
      if (cancelled || !r.ok) return;
      const source = r.data.org?.org_follow_source;
      if (!touchedRef.current) setKeep(keepFollowingDefault(typeof source === "string" ? source : null));
      setBoardOn(boardSettingOf(r.data) === true);
    });
    return () => {
      cancelled = true;
    };
  }, [org.handle, org.hidden]);

  const leave = async () => {
    if (busy) return;
    setBusy(true);
    const r = await vibeRequest<{ org_follow_state?: unknown }>(
      `/api/orgs/${encodeURIComponent(org.handle)}/join`,
      {
        method: "DELETE",
        ...(org.hidden ? {} : { json: { keep_following: keep } }),
        failure: fillCopy(ORG_COPY.menu.leaveFailed, { org: org.name }),
      },
    );
    setBusy(false);
    if (!r.ok) return;
    toast({
      message: fillCopy(r.data.org_follow_state === "following" ? ORG_COPY.menu.leftFollowing : ORG_COPY.menu.left, { org: org.name }),
      tone: "info",
    });
    onLeft();
  };

  return (
    <DangerCard
      title={fillCopy(ORG_COPY.menu.leaveTitle, { org: org.name })}
      desc={ORG_COPY.menu.leaveBody}
      actionLabel={busy ? ORG_COPY.menu.leaving : ORG_COPY.menu.leaveConfirm}
      onClick={() => void leave()}
      disabled={busy}
      onCancel={onCancel}
    >
      {org.hidden ? null : (
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            margin: "0 0 12px",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            lineHeight: 1.45,
            cursor: busy ? "default" : "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={keep}
            disabled={busy}
            onChange={(e) => {
              touchedRef.current = true;
              setKeep(e.target.checked);
            }}
            style={{ marginTop: 3, accentColor: COLORS.accent }}
          />
          <span>
            <span style={{ fontWeight: 700 }}>{fillCopy(ORG_COPY.menu.keepFollowing, { org: org.name })}</span>
            <span style={{ display: "block", fontSize: 12, color: COLORS.glassMuted }}>
              {boardOn ? ORG_COPY.menu.keepFollowingSubBoard : ORG_COPY.menu.keepFollowingSub}
            </span>
          </span>
        </label>
      )}
    </DangerCard>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: COLORS.glassMuted,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 14, color: "#fff", marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

type ChannelSettingsTab = "overview" | "access" | "danger";

function ChannelSettingsModal({
  org,
  channel,
  allChannels,
  onClose,
  onChannelUpdated,
  onChannelRemoved,
  onChannelsReordered,
}: {
  org: Org;
  channel: Channel;
  allChannels: Channel[];
  onClose: () => void;
  onChannelUpdated: (channel: Channel) => void;
  onChannelRemoved: (channelId: string) => void;
  onChannelsReordered: (orderedIds: string[]) => void;
}) {
  const canManage = org.role === "owner" || org.role === "admin";
  // Club chat v1: the club's own rooms can't be deleted, and an event's
  // chat follows its event (the Overview tab says so and offers nothing).
  const eventRoom = channel.kind === "event";

  const tabs: { key: ChannelSettingsTab; label: string; show: boolean }[] = [
    { key: "overview", label: "Overview", show: true },
    { key: "access", label: "Access", show: channel.is_private && canManage && !eventRoom },
    { key: "danger", label: "Danger", show: canManage && !eventRoom && !isCoreRoom(channel) },
  ];
  const visibleTabs = tabs.filter((t) => t.show);
  const [tab, setTab] = useState<ChannelSettingsTab>(visibleTabs[0].key);

  return (
    <ModalShell onClose={onClose}>
      <div
        style={{
          ...modalFormStyle,
          width: "min(640px, 94vw)",
          maxHeight: "min(86vh, 760px)",
          padding: 0,
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div>
            <div style={{ ...modalTitleStyle, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: COLORS.glassMuted, display: "inline-flex" }}>
                {channel.is_private ? <LockIcon size={18} /> : "#"}
              </span>
              {channel.name}
            </div>
            <div
              style={{
                ...modalSubtitleStyle,
                marginTop: 4,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {org.name}
              <span style={{ opacity: 0.5 }}>·</span>
              {channel.pinned ? "📌 Pinned" : channel.is_private ? "Private" : "Public"}
            </div>
          </div>
          <button type="button" onClick={onClose} style={modalIconButtonStyle} aria-label="Close">
            ✕
          </button>
        </header>

        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "8px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            overflowX: "auto",
          }}
        >
          {visibleTabs.map((t) => {
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                style={modalTabPillStyle(on)}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {tab === "overview" ? (
            <ChannelOverview
              org={org}
              channel={channel}
              allChannels={allChannels}
              canManage={canManage}
              onChannelUpdated={onChannelUpdated}
              onChannelsReordered={onChannelsReordered}
            />
          ) : null}
          {tab === "access" && visibleTabs.some((t) => t.key === "access") ? (
            <ChannelAccess org={org} channel={channel} />
          ) : null}
          {tab === "danger" && visibleTabs.some((t) => t.key === "danger") ? (
            <ChannelDanger
              org={org}
              channel={channel}
              onChannelRemoved={onChannelRemoved}
            />
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}

function ChannelOverview({
  org,
  channel,
  allChannels,
  canManage,
  onChannelUpdated,
  onChannelsReordered,
}: {
  org: Org;
  channel: Channel;
  allChannels: Channel[];
  canManage: boolean;
  onChannelUpdated: (channel: Channel) => void;
  onChannelsReordered: (orderedIds: string[]) => void;
}) {
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic ?? "");
  const [isPrivate, setIsPrivate] = useState(channel.is_private);
  const [pinned, setPinned] = useState(channel.pinned);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  // One reorder in flight at a time, so a rollback's snapshot is always
  // the order the server last agreed to.
  const [reordering, setReordering] = useState(false);

  const dirty =
    name.trim() !== channel.name ||
    (topic.trim() || null) !== (channel.topic ?? null) ||
    isPrivate !== channel.is_private ||
    pinned !== channel.pinned;

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/orgs/${org.handle}/channels/${channel.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim().toLowerCase(),
          topic: topic.trim() || null,
          is_private: isPrivate,
          pinned,
        }),
      });
      const data = await res.json();
      if (!data?.ok) {
        setMsg({
          tone: "err",
          text: chatRefusalLine(data?.code, data?.error) ?? (data?.error || "Failed to save"),
        });
        return;
      }
      onChannelUpdated(data.channel as Channel);
      setMsg({ tone: "ok", text: "Saved." });
    } catch (e) {
      console.error("[campus] save channel", e);
      setMsg({ tone: "err", text: "Network error" });
    } finally {
      setBusy(false);
    }
  };

  // Reorder helpers — operate only on the non-pinned section. Pinned channels
  // float above and don't share an ordering with regular ones.
  const regular = allChannels.filter((c) => !c.pinned);
  const idx = regular.findIndex((c) => c.id === channel.id);
  const canReorder = canManage && !pinned && idx !== -1;
  const move = async (delta: number) => {
    if (!canReorder || reordering) return;
    const next = idx + delta;
    if (next < 0 || next >= regular.length) return;
    // Snapshot before the swap — the rollback if the server refuses.
    const prevIds = regular.map((c) => c.id);
    const nextOrder = regular.slice();
    [nextOrder[idx], nextOrder[next]] = [nextOrder[next], nextOrder[idx]];
    const orderedIds = nextOrder.map((c) => c.id);
    onChannelsReordered(orderedIds);
    setReordering(true);
    const r = await vibeRequest(`/api/orgs/${org.handle}/channels/reorder`, {
      method: "POST",
      json: { channel_ids: orderedIds },
      failure: "Couldn't move the channel.",
    });
    setReordering(false);
    if (!r.ok) onChannelsReordered(prevIds);
  };

  // Club chat v1: an event's chat offers nothing here; the club's own rooms
  // keep their name and privacy (topic, pin and position still change).
  if (channel.kind === "event") {
    return <p style={modalSubtitleStyle}>{EVENT_ROOM_NOTE}</p>;
  }
  const core = isCoreRoom(channel);

  if (!canManage) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14, color: "#fff" }}>
        <ReadOnlyRow label="Name" value={`#${channel.name}`} />
        <ReadOnlyRow label="Topic" value={channel.topic || "—"} />
        <ReadOnlyRow
          label="Visibility"
          value={channel.is_private ? "Private" : "Public"}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {core ? (
        <ReadOnlyRow label="Name" value={channel.name} />
      ) : (
      <Field label="Name" hint="Lowercase, 2–31 chars.">
        <input
          type="text"
          value={name}
          maxLength={31}
          onChange={(e) => setName(e.target.value.toLowerCase())}
          style={inputStyle}
        />
      </Field>
      )}
      <Field label="Topic">
        <input
          type="text"
          value={topic}
          maxLength={200}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What is this channel for?"
          style={inputStyle}
        />
      </Field>
      {core ? null : (
      <Field label="Visibility">
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { v: false, label: "Public", sub: "All members can view" },
            { v: true, label: "Private", sub: "Officers + invited members" },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setIsPrivate(opt.v)}
              style={modalSegmentStyle(isPrivate === opt.v)}
            >
              <div style={{ fontWeight: 700 }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: COLORS.glassMuted, marginTop: 2 }}>
                {opt.sub}
              </div>
            </button>
          ))}
        </div>
      </Field>
      )}
      <Field label="Pin to top" hint="Pinned channels sit above the rest in the rail.">
        <button
          type="button"
          onClick={() => setPinned((p) => !p)}
          style={{
            ...modalSegmentStyle(pinned),
            flex: "none",
            width: "fit-content",
            padding: "8px 14px",
          }}
        >
          {pinned ? "📌  Pinned" : "Pin this channel"}
        </button>
      </Field>
      <Field
        label="Position"
        hint={
          pinned
            ? "Pinned channels are sorted independently. Unpin to reorder."
            : "Move within the regular channel list."
        }
      >
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={!canReorder || reordering || idx <= 0}
            style={modalCancelStyle}
          >
            ↑ Up
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={!canReorder || reordering || idx >= regular.length - 1}
            style={modalCancelStyle}
          >
            ↓ Down
          </button>
          <span style={{ marginLeft: 8, color: COLORS.glassMuted, fontSize: 12 }}>
            {pinned
              ? `Position N/A (pinned)`
              : idx !== -1
              ? `${idx + 1} of ${regular.length}`
              : ""}
          </span>
        </div>
      </Field>

      {msg ? (
        <div style={msg.tone === "ok" ? modalOkStyle : modalErrorStyle}>{msg.text}</div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={save}
          style={modalSubmitStyle(dirty && !busy)}
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

type ChannelMemberRow = {
  user_id: string;
  added_at: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  school_verified: boolean;
};

function ChannelAccess({ org, channel }: { org: Org; channel: Channel }) {
  const [members, setMembers] = useState<ChannelMemberRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [handleInput, setHandleInput] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/orgs/${org.handle}/channels/${channel.id}/members`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (cancelled) return;
        if (data?.ok && Array.isArray(data.members)) {
          setMembers(data.members as ChannelMemberRow[]);
        } else {
          setErr(data?.error || "Failed to load access list");
          setMembers([]);
        }
      } catch (e) {
        if (cancelled) return;
        console.error("[campus] load channel members", e);
        setErr("Network error");
        setMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org.handle, channel.id, reloadKey]);

  const refresh = () => setReloadKey((k) => k + 1);

  const add = async () => {
    const handle = handleInput.trim().toLowerCase().replace(/^@/, "");
    if (!handle) return;
    setAdding(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/orgs/${org.handle}/channels/${channel.id}/members`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ handle }),
        }
      );
      const data = await res.json();
      if (!data?.ok) {
        setErr(data?.error || "Failed to add member");
        return;
      }
      setHandleInput("");
      refresh();
    } catch (e) {
      console.error("[campus] add channel member", e);
      setErr("Network error");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (m: ChannelMemberRow) => {
    if (!confirm(`Remove ${m.name || m.handle} from #${channel.name}?`)) return;
    setBusyId(m.user_id);
    try {
      const res = await fetch(
        `/api/orgs/${org.handle}/channels/${channel.id}/members/${m.user_id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!data?.ok) {
        setErr(data?.error || "Failed to revoke");
        return;
      }
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ ...modalSubtitleStyle, margin: 0 }}>
        Owner and admin always see <code>#{channel.name}</code>. Anyone else —
        including mods — has to be invited here. Useful for designated leads
        (e.g. a chair who&apos;s a regular member but needs to see <code>#exec</code>).
      </p>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={handleInput}
          onChange={(e) => setHandleInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          placeholder="@handle"
          disabled={adding}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={adding || !handleInput.trim()}
          style={modalSubmitStyle(!adding && !!handleInput.trim())}
        >
          {adding ? "Adding…" : "Grant access"}
        </button>
      </div>

      {err ? <div style={modalErrorStyle}>{err}</div> : null}

      {members === null ? (
        <div style={{ color: COLORS.glassMuted, fontSize: 14 }}>
          Loading access list…
        </div>
      ) : members.length === 0 ? (
        <div
          style={{
            color: COLORS.glassMuted,
            fontSize: 13,
            background: "rgba(255,255,255,0.04)",
            border: "1px dashed rgba(255,255,255,0.12)",
            borderRadius: 10,
            padding: "12px 14px",
          }}
        >
          No additional members have been granted access yet.
        </div>
      ) : (
        members.map((m) => (
          <div
            key={m.user_id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                background: m.avatar_url
                  ? `url(${m.avatar_url}) center/cover`
                  : "rgba(255,255,255,0.1)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "Fraunces, serif",
                fontWeight: 700,
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              {!m.avatar_url ? initialsForOrg(m.name || m.handle || "?") : null}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#fff",
                }}
              >
                {m.name || m.handle || "Unknown"}
                {m.school_verified ? (
                  <span style={{ marginLeft: 6, fontSize: 11, color: "#9DD89D" }}>
                    ·verified
                  </span>
                ) : null}
              </div>
              <div
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 12,
                  color: COLORS.glassMuted,
                }}
              >
                @{m.handle ?? m.user_id.slice(0, 6)}
              </div>
            </div>
            <button
              type="button"
              disabled={busyId === m.user_id}
              onClick={() => remove(m)}
              style={modalDangerStyle}
            >
              Revoke
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function ChannelDanger({
  org,
  channel,
  onChannelRemoved,
}: {
  org: Org;
  channel: Channel;
  onChannelRemoved: (channelId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const destroy = async () => {
    if (!confirm(`Delete #${channel.name}? Messages will be removed too.`)) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/orgs/${org.handle}/channels/${channel.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data?.ok) {
        setErr(chatRefusalLine(data?.code, data?.error) ?? (data?.error || "Failed to delete"));
        return;
      }
      onChannelRemoved(channel.id);
    } catch (e) {
      console.error("[campus] delete channel", e);
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {err ? <div style={modalErrorStyle}>{err}</div> : null}
      <DangerCard
        title="Delete this channel"
        desc="Removes the channel and every message in it. This cannot be undone."
        actionLabel={busy ? "Deleting…" : "Delete channel"}
        onClick={destroy}
        disabled={busy}
      />
    </div>
  );
}

/**
 * A desktop modal's backdrop (motion pass, Oct 18): first child of the fixed
 * overlay. The page blur is a plain layer that appears in one frame, as it
 * always did; only the tint over it fades in (SPRING_SOFT), so no blur ever
 * animates. Both sit beside the panel, never around it, so neither fade
 * reaches the panel's frost. The panel after it needs `position: relative`
 * to paint on top of these absolute layers.
 */
function ModalScrim({ tint }: { tint: string }) {
  return (
    <>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={SPRING_SOFT}
        style={{ position: "absolute", inset: 0, background: tint }}
      />
    </>
  );
}

/** The panel's enter, shared by the desktop modals: settles from 0.97. */
const MODAL_PANEL_ENTER = {
  initial: { scale: 0.97 },
  animate: { scale: 1 },
  transition: SPRING_SOFT,
} as const;

/** The same, fading too: only for a panel that is itself the frosted surface
 *  (or has no frost at all), since a fading parent switches its children's
 *  frost off until it reaches 1. */
const MODAL_PANEL_ENTER_FADE = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  transition: SPRING_SOFT,
} as const;

function ModalShell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Motion pass (Oct 18): the scrim's tint fades in (ModalScrim) and the
  // panel settles from 0.97 on SPRING_SOFT. Enter only; closing is still
  // instant. The panel only scales: it wraps each modal's frosted form, and
  // a fade on it would switch that frost off until the very last frame. The
  // scale settles to `transform: none`.
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <ModalScrim tint="rgba(8,4,16,0.55)" />
      <motion.div
        onClick={(e) => e.stopPropagation()}
        {...MODAL_PANEL_ENTER}
        // Positioned so it paints over the scrim layers once it settles.
        style={{ position: "relative" }}
      >
        {children}
      </motion.div>
    </div>
  );
}

const modalFormStyle: React.CSSProperties = {
  ...GLASS_SURFACE,
  background:
    "linear-gradient(180deg, rgba(40,20,50,0.92) 0%, rgba(20,10,30,0.92) 100%)",
  borderRadius: 22,
  padding: 28,
  width: "min(480px, 92vw)",
  color: "#fff",
  fontFamily: "DM Sans, sans-serif",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const modalTitleStyle: React.CSSProperties = {
  fontFamily: "Fraunces, serif",
  fontWeight: 900,
  fontSize: 22,
  letterSpacing: "-0.01em",
  color: "#fff",
};

const modalSubtitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: COLORS.glassMuted,
  fontFamily: "DM Sans, sans-serif",
  lineHeight: 1.5,
};

const modalFooterStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
  marginTop: 4,
};

const modalCancelStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "#fff",
  fontFamily: "DM Sans, sans-serif",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

function modalSubmitStyle(enabled: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,180,150,0.45)",
    background: enabled
      ? "linear-gradient(180deg, rgba(255,92,53,0.55) 0%, rgba(255,92,53,0.28) 100%)"
      : "rgba(255,255,255,0.06)",
    color: "#fff",
    fontFamily: "DM Sans, sans-serif",
    fontWeight: 700,
    fontSize: 13,
    cursor: enabled ? "pointer" : "default",
    opacity: enabled ? 1 : 0.6,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)",
  };
}

function modalSegmentStyle(on: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 10,
    border: on ? "1px solid rgba(255,180,150,0.55)" : "1px solid rgba(255,255,255,0.12)",
    background: on
      ? "linear-gradient(180deg, rgba(255,92,53,0.32) 0%, rgba(255,92,53,0.14) 100%)"
      : "rgba(255,255,255,0.04)",
    color: "#fff",
    fontFamily: "inherit",
    cursor: "pointer",
    textAlign: "left",
  };
}

const modalIconButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  color: "#fff",
  fontFamily: "inherit",
  fontSize: 14,
  cursor: "pointer",
  lineHeight: 1,
};

// Locked-height pill for modal tab navs. Both org-settings and channel-
// settings use this so the pills line up on the same baseline regardless
// of font-weight changes between active/inactive states.
function modalTabPillStyle(on: boolean): React.CSSProperties {
  return {
    height: 32,
    padding: "0 14px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    border: "none",
    background: on ? "rgba(255,92,53,0.22)" : "transparent",
    color: on ? "#fff" : COLORS.glassMuted,
    fontFamily: "DM Sans, sans-serif",
    fontSize: 13,
    fontWeight: on ? 700 : 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
    lineHeight: 1,
    flexShrink: 0,
  };
}

const modalErrorStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  background: "rgba(232,77,77,0.18)",
  border: "1px solid rgba(232,77,77,0.4)",
  color: "#FFD0CC",
  fontSize: 13,
  fontFamily: "DM Sans, sans-serif",
};

const modalOkStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  background: "rgba(120,220,150,0.18)",
  border: "1px solid rgba(120,220,150,0.4)",
  color: "#D7F5DD",
  fontSize: 13,
  fontFamily: "DM Sans, sans-serif",
};

const modalDangerStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "1px solid rgba(232,77,77,0.45)",
  background: "rgba(232,77,77,0.22)",
  color: "#FFD0CC",
  fontFamily: "DM Sans, sans-serif",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "#fff",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14,
  outline: "none",
};

function LinksEditor({
  value,
  onChange,
}: {
  value: Array<{ label: string; url: string }>;
  onChange: (v: Array<{ label: string; url: string }>) => void;
}) {
  const [draftLabel, setDraftLabel] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const max = 10;

  const add = () => {
    const label = draftLabel.trim().slice(0, 60);
    let url = draftUrl.trim();
    if (!label || !url) return;
    // Default to https:// if the user typed a bare domain.
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    onChange([...value, { label, url }].slice(0, max));
    setDraftLabel("");
    setDraftUrl("");
  };

  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {value.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {value.map((l, idx) => (
            <div
              key={`${l.url}-${idx}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#fff",
                  minWidth: 90,
                }}
              >
                {l.label}
              </span>
              <span
                style={{
                  flex: 1,
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 12,
                  color: COLORS.glassMuted,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {l.url}
              </span>
              <button
                type="button"
                onClick={() => remove(idx)}
                aria-label="Remove link"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.85)",
                  cursor: "pointer",
                  fontSize: 12,
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {value.length < max ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            value={draftLabel}
            placeholder="Label"
            maxLength={60}
            onChange={(e) => setDraftLabel(e.target.value)}
            style={{ ...inputStyle, flex: "0 0 36%" }}
          />
          <input
            type="text"
            value={draftUrl}
            placeholder="https://…"
            maxLength={400}
            onChange={(e) => setDraftUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="button"
            onClick={add}
            disabled={!draftLabel.trim() || !draftUrl.trim()}
            style={modalSubmitStyle(!!draftLabel.trim() && !!draftUrl.trim())}
          >
            Add
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: COLORS.glassMuted }}>
          Max {max} links.
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: COLORS.glassMuted }}>
        {label}
      </span>
      {children}
      {hint ? (
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{hint}</span>
      ) : null}
    </label>
  );
}

/**
 * A row of radio buttons with `Field`'s label and hint. Not a `<label>`
 * element: clicking a label activates the first button inside it, so the
 * hint text would silently pick the first option.
 *
 * It keeps the radiogroup keyboard contract it announces: the group is one
 * tab stop (the picked option, or the first pickable one), and the arrow
 * keys, Home and End move the choice and the focus over the options that
 * aren't disabled. A radio group a screen reader announces but the keyboard
 * can't work is worse than plain buttons.
 */
function ChoiceField({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: ReadonlyArray<{ value: string; label: string; sub?: string; disabled?: boolean }>;
  value: string;
  onChange: (v: string) => void;
}) {
  const buttonsRef = useRef(new Map<string, HTMLButtonElement | null>());
  const pickable = options.filter((o) => !o.disabled);
  // The one tab stop: the picked option when it can be picked, else the first
  // one that can (an already-saved value can be disabled here).
  const stop = pickable.some((o) => o.value === value) ? value : (pickable[0]?.value ?? null);

  const pick = (next: string) => {
    onChange(next);
    buttonsRef.current.get(next)?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (pickable.length === 0) return;
    const at = Math.max(
      0,
      pickable.findIndex((o) => o.value === stop),
    );
    let to: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") to = (at + 1) % pickable.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      to = (at - 1 + pickable.length) % pickable.length;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = pickable.length - 1;
    else return;
    e.preventDefault();
    const next = pickable[to];
    if (next) pick(next.value);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: COLORS.glassMuted }}>
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        onKeyDown={onKeyDown}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
          gap: 8,
        }}
      >
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={o.disabled}
              tabIndex={o.value === stop ? 0 : -1}
              ref={(el) => {
                buttonsRef.current.set(o.value, el);
              }}
              onClick={() => {
                if (!o.disabled) onChange(o.value);
              }}
              style={{
                ...modalSegmentStyle(on),
                ...(o.disabled ? { opacity: 0.45, cursor: "not-allowed" } : null),
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>{o.label}</div>
              {o.sub ? (
                <div style={{ fontSize: 11, color: COLORS.glassMuted, marginTop: 2 }}>{o.sub}</div>
              ) : null}
            </button>
          );
        })}
      </div>
      {hint ? (
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{hint}</span>
      ) : null}
    </div>
  );
}

const SHEEN_KEYFRAMES = `
  @keyframes campus-tab-glow {
    0%, 100% { opacity: 0.55; }
    50% { opacity: 1; }
  }
  @keyframes otto-core-pulse {
    0%, 100% { transform: scale(1); opacity: 0.9; }
    50% { transform: scale(1.15); opacity: 1; }
  }
  @keyframes otto-orbit-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes otto-breath {
    0%, 100% { transform: scale(1); opacity: 0.25; }
    50% { transform: scale(1.4); opacity: 0; }
  }
  @keyframes otto-synapse {
    0%, 100% { opacity: 0.15; }
    50% { opacity: 0.7; }
  }
`;

/**
 * The viewer's own campus, for the banner, the scene eyebrows, the tour and
 * the map. Read from `GET /api/campuses` (the student's verified university
 * and saved campus), then looked up in the fixed campus table, so every name
 * here comes from `src/lib/iu/campuses.ts`, never from a request.
 *
 * `label` is the campus's full name ("Indianapolis", "IU Bloomington",
 * "Purdue West Lafayette"): never "IU", "IUI", "PUI" or a mascot. A failed
 * read, or no campus, is `label: null`, and callers drop the campus from their
 * copy instead of guessing one. `ready` is false only until the first answer.
 */
export type ViewerCampus = {
  system: SchoolSystem | null;
  campusId: string | null;
  campus: Campus | null;
  label: string | null;
  ready: boolean;
};

const VIEWER_CAMPUS_LOADING: ViewerCampus = {
  system: null,
  campusId: null,
  campus: null,
  label: null,
  ready: false,
};
const VIEWER_CAMPUS_UNKNOWN: ViewerCampus = { ...VIEWER_CAMPUS_LOADING, ready: true };

// One request per page, shared by every consumer. It goes stale on purpose:
// after 30 s, when the last consumer unmounts (so a campus picked in
// Settings shows on the next client-side visit to /campus), and on a
// back-forward restore or a return to the tab (via the TTL).
const VIEWER_CAMPUS_TTL_MS = 30_000;
let viewerCampusCache: { at: number; promise: Promise<ViewerCampus> } | null = null;
let viewerCampusConsumers = 0;
// The last answer every consumer paints (stale-while-revalidate), so a tab
// body or a return to /campus shows the campus at once instead of blanking
// while it re-reads. Kept across a full unmount only when it names a campus:
// a "no campus" or failed answer is exactly what Settings changes, so a later
// visit waits for a fresh read rather than flashing the Pick-campus strip.
let viewerCampusLast: ViewerCampus | null = null;
let viewerCampusLoadSeq = 0;
const viewerCampusListeners = new Set<() => void>();

function viewerCampusFrom(raw: unknown): ViewerCampus {
  if (!raw || typeof raw !== "object") return VIEWER_CAMPUS_UNKNOWN;
  const j = raw as { system?: unknown; currentCampusId?: unknown };
  const system = isSchoolSystem(j.system) ? j.system : null;
  // Only a campus the student's own university may call home.
  const campus = campusRowById(allowedCampusId(j.currentCampusId, system));
  return {
    system,
    campusId: campus?.id ?? null,
    campus,
    label: campus?.name ?? null,
    ready: true,
  };
}

/**
 * The shared request behind {@link useViewerCampus}. The desktop tour awaits
 * it directly (with its own timeout) so its feed bubble can name the campus.
 * Never rejects: any failure resolves to "no campus".
 */
export function viewerCampusPromise(): Promise<ViewerCampus> {
  if (typeof window === "undefined") return Promise.resolve(VIEWER_CAMPUS_UNKNOWN);
  const now = Date.now();
  if (viewerCampusCache && now - viewerCampusCache.at < VIEWER_CAMPUS_TTL_MS) {
    return viewerCampusCache.promise;
  }
  const promise = vibeRequest<Record<string, unknown>>("/api/campuses", {
    cache: "no-store",
    credentials: "include",
    quiet: true,
    failure: "Couldn't load your campus.",
  }).then(
    (r) => (r.ok ? viewerCampusFrom(r.data) : VIEWER_CAMPUS_UNKNOWN),
    () => VIEWER_CAMPUS_UNKNOWN,
  );
  viewerCampusCache = { at: now, promise };
  return promise;
}

function sameViewerCampus(a: ViewerCampus, b: ViewerCampus): boolean {
  return a.ready === b.ready && a.system === b.system && a.campusId === b.campusId;
}

/**
 * Re-read (or reuse, inside the TTL) and publish to every consumer. Only the
 * newest load publishes, so an older request can't land over a newer one; an
 * unchanged answer keeps its object, so nothing re-renders or regroups; and a
 * failed re-read never replaces an answer we already have.
 */
function loadViewerCampus(): void {
  const seq = ++viewerCampusLoadSeq;
  void viewerCampusPromise().then((next) => {
    if (seq !== viewerCampusLoadSeq) return;
    const prev = viewerCampusLast;
    if (prev && sameViewerCampus(prev, next)) return;
    if (prev && next === VIEWER_CAMPUS_UNKNOWN) return;
    viewerCampusLast = next;
    viewerCampusListeners.forEach((notify) => notify());
  });
}

// One pair of window listeners for the whole page, not one per consumer.
// Back-forward restore: drop the cached answer and re-read once. Coming back
// to the tab: re-read once the cached answer is past its TTL.
function onViewerCampusPageShow(e: PageTransitionEvent): void {
  if (e.persisted) viewerCampusCache = null;
  loadViewerCampus();
}
function onViewerCampusVisible(): void {
  if (document.visibilityState === "visible") loadViewerCampus();
}

function subscribeViewerCampus(notify: () => void): () => void {
  viewerCampusListeners.add(notify);
  viewerCampusConsumers += 1;
  if (viewerCampusConsumers === 1) {
    window.addEventListener("pageshow", onViewerCampusPageShow);
    document.addEventListener("visibilitychange", onViewerCampusVisible);
    // First consumer of this visit: always re-read (the cache was dropped
    // when the last one left), painting the kept answer meanwhile.
    loadViewerCampus();
  }
  return () => {
    viewerCampusListeners.delete(notify);
    viewerCampusConsumers = Math.max(0, viewerCampusConsumers - 1);
    if (viewerCampusConsumers > 0) return;
    window.removeEventListener("pageshow", onViewerCampusPageShow);
    document.removeEventListener("visibilitychange", onViewerCampusVisible);
    viewerCampusCache = null;
    // A read still in flight belongs to the visit that just ended; the next
    // visit re-reads, so it must not land (a late "no campus" would be kept).
    viewerCampusLoadSeq += 1;
    if (!viewerCampusLast?.campus) viewerCampusLast = null;
  };
}

function viewerCampusSnapshot(): ViewerCampus {
  return viewerCampusLast ?? VIEWER_CAMPUS_LOADING;
}

// The server render and the hydrating render both paint "loading"; React
// then switches to the kept answer, so there is no hydration mismatch.
function viewerCampusServerSnapshot(): ViewerCampus {
  return VIEWER_CAMPUS_LOADING;
}

export function useViewerCampus(): ViewerCampus {
  return useSyncExternalStore(
    subscribeViewerCampus,
    viewerCampusSnapshot,
    viewerCampusServerSnapshot,
  );
}

/** Two letters for the banner tile: "IN", "BL"; "WL" for two words. */
function campusMonogram(shortName: string | null | undefined): string {
  const words = (shortName ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "V";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

type BannerPalette = {
  skin: SchoolSkin;
  /** The tile, name and lines: the leading school (the header's own paint). */
  lead: SchoolZonePalette;
  /** The globe and search cluster: the other school on a shared campus,
   *  else the same zone as `lead`. */
  follow: SchoolZonePalette;
  /** The "/" seam's edge line (gold beside Purdue black, cream beside IU
   *  crimson), or null when there is no seam. */
  seamLine: string | null;
  tile: { background: string; ink: string };
  /** The lift under the sticky banner, tinted by the leading school. */
  dropShadow: string;
};

/** The banner's lift over the feed, per leading zone (the old per-school lifts). */
const BANNER_DROP_SHADOW: Record<SchoolZone, string> = {
  iu: "0 8px 24px rgba(80,5,15,0.25)",
  purdue: "0 8px 24px rgba(0,0,0,0.3)",
  none: "0 8px 24px rgba(0,0,0,0.22)",
};

/**
 * The phone banner in school colours (S68 wave 5, Franky: "match desktop"),
 * the same rule as CampusTopBar: the skin follows the campus ON SCREEN; on a
 * shared campus (Indianapolis, Fort Wayne) the viewer's own school leads and
 * the other one sits behind a "/" seam under the globe and search buttons;
 * a single-school campus wears only its school; nothing known → neutral.
 * School colours are the schools', so Light and Night paint the same.
 */
function bannerPalette(
  campus: Campus | null,
  known: boolean,
  viewerSystem: SchoolSystem | null,
): BannerPalette {
  const skin = known ? schoolSkinFor(campus) : "none";
  const zones = schoolZonesFor(skin, viewerSystem);
  return {
    skin,
    lead: SCHOOL_ZONE_PALETTES[zones.lead],
    follow: SCHOOL_ZONE_PALETTES[zones.follow],
    seamLine: zones.seamLine,
    tile: SCHOOL_TILES[zones.lead],
    dropShadow: BANNER_DROP_SHADOW[zones.lead],
  };
}

// The header's stats line ("{n} at Indianapolis · {m} active now", the
// " · … active now" part only from 5 up) is `campusStatsLine` in
// src/lib/usage/active-now.ts, where it is tested.

function countOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// The banner's buttons: the button zone's hover wash and a focus ring in the
// zone's own ink (coral vanishes on crimson; the desktop top bar does the
// same). Zone colours arrive as --bn-* set inline on the button cluster.
// On a phone the banner pads itself down by the safe-area inset, so the seam
// layers reach up through that padding too, or the status-bar strip would
// be the leading school's colour all the way across. Inline styles can't say
// any of this.
const BANNER_CSS = `
  .vibe-campus-banner .vibe-banner-btn:hover { background: var(--bn-hover) !important; }
  .vibe-campus-banner .vibe-banner-btn:focus-visible { outline: 2px solid var(--bn-ink); outline-offset: 2px; }
  @media (max-width: 899px) {
    .vibe-campus-banner .vibe-banner-seam { top: calc(-1 * env(safe-area-inset-top, 0px)) !important; }
  }
`;

/** Under the banner on /campus for a verified student with no campus yet. */
function PickCampusStrip() {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: "4px 12px",
        padding: "8px 24px",
        background: "#FFF1E8",
        borderBottom: "1px solid rgba(255,92,53,0.25)",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 13,
        lineHeight: 1.4,
        color: "#1C1C1E",
      }}
    >
      <span>Pick your campus to see its clubs, events and map.</span>
      <Link
        href="/settings#campus"
        // The Light value of --eyebrow-ink, written out: this strip is the
        // same pale peach in both looks, and Night's lighter ink fades on it.
        style={{ color: "#B83A1A", fontWeight: 700, textDecoration: "none" }}
      >
        Pick campus →
      </Link>
    </div>
  );
}

/** What the campus header says: the phone's CampusBanner and the desktop
 *  CampusTopBar both read it, so they never disagree. */
type CampusHeader = {
  /** The campus on screen: the visited one while visiting, else home. */
  campus: Campus | null;
  /** False until the first campus answer; nothing guesses a school before it. */
  known: boolean;
  isVisiting: boolean;
  title: string;
  monogram: string;
  /** "IU + Purdue · one community" at home, "IU · JUST LOOKING" away. */
  sharedSub: string | null;
  statsLine: string;
};

/**
 * The campus header's identity and live stats line (lifted out of
 * CampusBanner in S68 so the desktop top bar behaves identically). Each
 * page mounts exactly one header (the phone: CampusBanner; the desktop:
 * CampusTopBar), so the stats are read once per page. It only reads: every
 * page checks in on its own (<ActivityTouch /> in the root layout).
 */
function useCampusHeader(): CampusHeader {
  // Whose campus this is: the title, the tile, the colour and the stats
  // label all follow the campus ON SCREEN (C5): home, or the one `?campus=`
  // names while visiting (plan Q15 colours either way). Until the first
  // answer the banner paints neutral and blank, so it never guesses a name;
  // after that it keeps the last answer while it re-reads.
  const viewer = useViewerCampus();
  // The desktop provides the view; the phone (CampusBanner, which provides
  // nothing) reads `?campus=` here itself. Both read the same URL.
  const shared = useCampusView();
  const own = useViewingCampus(viewer.campusId);
  const viewingId = shared.provided ? shared.viewingId : own.viewingId;
  const homeId = shared.provided ? shared.homeId : own.homeId;
  const isVisiting = shared.provided ? shared.isVisiting : own.isVisiting;
  const campus = isVisiting ? campusRowById(viewingId) : viewer.campus;
  const label = isVisiting ? (campus?.name ?? null) : viewer.label;
  const known = viewer.ready || isVisiting;
  const title = known ? (label ?? "Vibe") : "\u00A0";
  const monogram = known ? campusMonogram(campus?.shortName) : "";
  // "IU · JUST LOOKING" away from home; the shared-community line at home.
  const sharedSub = isVisiting
    ? visitingEyebrow(viewingId)
    : campus && isSharedCampus(campus)
      ? "IU + Purdue · one community"
      : null;
  const statsUrl = withCampus("/api/stats/campus", viewingId, homeId);

  // Live stats for the campus header line, read every 30s while the tab is
  // visible. Every page checks in (ActivityTouch); this only reads. The
  // stats endpoint counts everyone seen in the last 5 minutes, and answers
  // 0 under 5: the line then leaves "active now" out. The first read waits
  // for this tab's check-in (the same request, if ActivityTouch already sent
  // it), so the viewer is in "active now" from the start.
  // The campus numbers (`campusUsers` / `campusActiveNow`) are read when the
  // viewer has a campus; with none, the line falls back to everyone on Vibe.
  // No answer yet, or a failed first read, renders no line at all.
  const [stats, setStats] = useState<CampusStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const r = await fetch(statsUrl, { cache: "no-store" });
        const j = await r.json();
        if (cancelled) return;
        if (r.ok && j?.ok) {
          setStats({
            totalUsers: countOrNull(j.totalUsers) ?? 0,
            activeNow: countOrNull(j.activeNow) ?? 0,
            campusUsers: countOrNull(j.campusUsers),
            campusActiveNow: countOrNull(j.campusActiveNow),
            campusId: typeof j.campusId === "string" ? j.campusId : null,
          });
        }
      } catch {
        /* keep the last good line; never "loading…" */
      }
    };
    void (async () => {
      await touchActivity();
      await refresh();
    })();
    const tick = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      await refresh();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(tick);
    };
  }, [statsUrl]);
  const statsLine = known ? campusStatsLine(stats, label, campus?.id ?? null) : "";
  return { campus, known, isVisiting, title, monogram, sharedSub, statsLine };
}

export function CampusBanner({
  compactSearch = false,
  onSearchTap,
  search = true,
  onOpenCampuses,
}: {
  /** Mobile collapses the search bar into a single icon so the banner
   *  doesn't get bunched up. Tap fires `onSearchTap`. */
  compactSearch?: boolean;
  onSearchTap?: () => void;
  /** `false` drops the banner's own search mount entirely (non-compact
   *  only). The desktop no longer mounts this banner: it has CampusTopBar. */
  search?: boolean;
  /** Shows the "Campuses" button (S67 wave 4), which opens the Look-around
   *  picker. Omitted → no button, exactly as before. */
  onOpenCampuses?: () => void;
} = {}) {
  // Title, sub-line and stats come from the shared header hook (the
  // desktop top bar reads the same one); the colours follow the same rule
  // as the desktop top bar, from the viewer's own school (the same cached
  // request useCampusHeader reads).
  const { campus, known, isVisiting, title, monogram, sharedSub, statsLine } =
    useCampusHeader();
  const { system: viewerSystem } = useViewerCampus();
  const palette = bannerPalette(campus, known, viewerSystem);
  const { lead, follow, seamLine } = palette;
  const shared = seamLine !== null;

  const ellipsis: React.CSSProperties = {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
  const subStyle: React.CSSProperties = {
    ...ellipsis,
    fontFamily: "DM Sans, sans-serif",
    fontSize: 11,
    fontWeight: 600,
    color: lead.secondary,
    lineHeight: 1.2,
    ...(isVisiting ? { letterSpacing: "0.05em" } : null),
  };
  // The globe / search / Messages buttons wear the button zone (C0 rule:
  // hover and focus by class, colours by custom property).
  const buttonColors: React.CSSProperties = {
    background: follow.searchBg,
    border: `1px solid ${follow.searchBorder}`,
    color: follow.ink,
  };
  const clusterVars = {
    "--bn-hover": follow.hover,
    "--bn-ink": follow.ink,
  } as React.CSSProperties;

  return (
    <header
      className="vibe-campus-banner"
      data-skin={palette.skin}
      style={{
        position: "relative",
        height: 64,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "0 24px",
        // Solid school colour: reads the same on every tab, in Light and
        // Night. Purdue adds its gold bottom hairline (as on desktop).
        background: lead.background,
        boxShadow: [lead.shadow, palette.dropShadow].filter(Boolean).join(", "),
        overflow: "hidden",
      }}
    >
      <style>{BANNER_CSS}</style>
      <div
        aria-hidden
        style={{
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: 12,
          background: palette.tile.background,
          color: palette.tile.ink,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Fraunces, serif",
          fontWeight: 900,
          fontSize: 18,
          letterSpacing: "0.03em",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        }}
      >
        {monogram}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <div
            style={{
              ...ellipsis,
              fontFamily: "Fraunces, serif",
              fontWeight: 800,
              fontSize: 18,
              color: lead.ink,
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
            }}
          >
            {title}
          </div>
          {sharedSub && !compactSearch ? <div style={subStyle}>{sharedSub}</div> : null}
        </div>
        {/* The phone banner is narrow: the shared-campus line gets its own row. */}
        {sharedSub && compactSearch ? <div style={subStyle}>{sharedSub}</div> : null}
        {statsLine ? (
          <div
            style={{
              ...ellipsis,
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              color: lead.secondary,
              lineHeight: 1.2,
            }}
          >
            {statsLine}
          </div>
        ) : null}
      </div>
      <div style={{ flex: 1 }} />
      {/* The button cluster. On a shared campus it sits on the other school
          behind the desktop top bar's "/" seam, drawn from this cluster's
          left edge so nothing is measured: the zone's colour starts 14px left
          of it at the top and 30px left at the bottom, over a twin 3px
          further left in the seam line. Both run on under the banner's 24px
          right padding (the header clips them). The extra 12px margin keeps
          the stats line clear of the line where it leans furthest left. */}
      <div
        style={{
          ...clusterVars,
          position: "relative",
          alignSelf: "stretch",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexShrink: 0,
          marginLeft: shared ? 12 : 0,
          isolation: "isolate",
        }}
      >
        {shared ? (
          <>
            <div
              aria-hidden
              className="vibe-banner-seam"
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: -33,
                right: -24,
                background: seamLine,
                clipPath: TOPBAR_SEAM_CLIP,
              }}
            />
            <div
              aria-hidden
              className="vibe-banner-seam"
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: -30,
                right: -24,
                background: follow.background,
                boxShadow: follow.shadow ?? undefined,
                clipPath: TOPBAR_SEAM_CLIP,
              }}
            />
          </>
        ) : null}
        {onOpenCampuses ? (
          <>
            <button
              type="button"
              className="vibe-campuses-btn vibe-banner-btn"
              onClick={onOpenCampuses}
              aria-label="Look around other campuses"
              aria-haspopup="dialog"
              title="Look around other campuses"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                // Phone: a 44px round icon like the search button beside it, so
                // the campus title keeps its room at 375px. Desktop: the word.
                height: compactSearch ? 44 : 38,
                width: compactSearch ? 44 : undefined,
                padding: compactSearch ? 0 : "0 14px",
                borderRadius: 999,
                // Positioned so it paints over the seam layers before it.
                position: "relative",
                ...buttonColors,
                fontFamily: "DM Sans, sans-serif",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                flexShrink: 0,
                transition: "background 140ms ease",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {compactSearch ? (
                // A globe: look around other campuses.
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z" />
                </svg>
              ) : (
                <>
                  Campuses
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </>
              )}
            </button>
          </>
        ) : null}
        {/* Phone-only quick-access to /messages — Instagram's DM-in-header
            pattern. Hidden on desktop because the desktop LeftNav already
            has a Messages link. Also hidden on the mobile shell because
            the bottom tab bar there already has a Messages tab.
            CSS gate lives in globals.css. */}
        {compactSearch ? null : (
        <Link
          href="/messages"
          aria-label="Messages"
          title="Messages"
          className="vibe-campus-messages-btn vibe-banner-btn"
          style={{
            alignItems: "center",
            justifyContent: "center",
            width: 38,
            height: 38,
            borderRadius: 12,
            position: "relative",
            ...buttonColors,
            textDecoration: "none",
            flexShrink: 0,
            transition: "background 140ms ease, transform 140ms ease",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden>
            <path
              d="M2 4A1.6 1.6 0 0 1 3.6 2.4h14.8A1.6 1.6 0 0 1 20 4v10A1.6 1.6 0 0 1 18.4 15.6H6.5L2 19V4z"
              stroke="currentColor"
              strokeWidth="1.7"
              fill="none"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        )}
        {compactSearch ? (
          <button
            type="button"
            className="vibe-banner-btn"
            onClick={() => onSearchTap?.()}
            aria-label="Search campus"
            title="Search"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 38,
              height: 38,
              borderRadius: 12,
              position: "relative",
              ...buttonColors,
              cursor: "pointer",
              flexShrink: 0,
              transition: "background 140ms ease, transform 140ms ease",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth="1.7" />
              <path
                d="M12 12l4 4"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : search ? (
          // Unmounted today (only the phone renders this banner, compact).
          <div style={{ position: "relative" }}>
            <CampusSearchBar />
          </div>
        ) : null}
      </div>
    </header>
  );
}

/** Below this width the top bar folds search into a round button. */
const TOPBAR_SEARCH_COLLAPSED_QUERY = "(max-width: 1023px)";

// The desktop top bar's hovers, focus rings and breakpoints, which inline
// styles can't say. Zone colours arrive as custom properties set inline on
// each zone (--tb-*), so one sheet serves every school. Anything a media
// query toggles (display, padding, width) lives only here, never inline.
// Desktop starts at 900px beside a 200px LeftNav, so the bar can be ~700px:
// - under 1180px the stats line hides and Campuses shrinks to its globe;
// - under 1024px search folds into a round button whose field opens as an
//   overlay over the left zone.
const TOPBAR_CSS = `
  .vibe-campus-topbar .vibe-topbar-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    box-sizing: border-box; height: 36px; padding: 0 14px; flex-shrink: 0;
    border-radius: 999px; border: 1px solid var(--tb-btn-border);
    background: var(--tb-btn-bg); color: var(--tb-ink);
    font-family: "DM Sans", sans-serif; font-size: 12.5px; font-weight: 700;
    cursor: pointer; transition: background 140ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .vibe-campus-topbar .vibe-topbar-btn:hover { background: var(--tb-hover); }
  .vibe-campus-topbar .vibe-topbar-tab { background: transparent; }
  .vibe-campus-topbar .vibe-topbar-tab:not([aria-current]):hover { background: var(--tb-hover); }
  .vibe-campus-topbar .vibe-topbar-btn:focus-visible,
  .vibe-campus-topbar .vibe-topbar-tab:focus-visible {
    outline: 2px solid var(--tb-ink); outline-offset: 2px;
  }
  .vibe-campus-topbar .vibe-topbar-word { display: inline-flex; align-items: center; gap: 6px; }
  .vibe-campus-topbar .vibe-topbar-globe { display: none; }
  .vibe-campus-topbar .vibe-topbar-search-btn { display: none; width: 36px; padding: 0; }
  .vibe-campus-topbar .vibe-topbar-search {
    display: flex; align-items: center; flex: 1 1 220px; min-width: 150px; max-width: 440px;
  }
  @media (max-width: 1179px) {
    .vibe-campus-topbar .vibe-topbar-stats { display: none; }
    .vibe-campus-topbar .vibe-topbar-sub { display: none; }
    .vibe-campus-topbar .vibe-topbar-campuses { width: 36px; padding: 0; }
    .vibe-campus-topbar .vibe-topbar-word { display: none; }
    .vibe-campus-topbar .vibe-topbar-globe { display: inline-flex; }
  }
  @media (max-width: 1023px) {
    .vibe-campus-topbar .vibe-topbar-search-btn { display: inline-flex; }
    .vibe-campus-topbar .vibe-topbar-search { display: none; }
    /* No z-index: it would make a stacking context that caps the fixed
       dropdown inside it (z 1000) at 3, under the Map tab's controls (z 4-6).
       The overlay only covers unpositioned siblings, so auto paints on top. */
    .vibe-campus-topbar .vibe-topbar-search[data-open="true"] {
      display: flex; position: absolute;
      top: 0; bottom: 0; left: 0; right: var(--tb-overlay-right);
      min-width: 0; max-width: none;
      background: var(--tb-bg); box-shadow: var(--tb-shadow);
    }
  }
`;

/** The "/" seam's shape: 16px further right at the top than at the bottom. */
const TOPBAR_SEAM_CLIP = "polygon(16px 0, 100% 0, 100% 100%, 0 100%)";

const TOPBAR_ELLIPSIS: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/**
 * The desktop /campus top bar (S68, Franky's "diagonal" pick): one 64px bar
 * instead of banner + search row + tabs row. Left zone: the campus name,
 * Campuses and search. Right zone: the tab pills. The skin follows the
 * campus ON SCREEN, the same rule as the banner (useCampusHeader):
 * - shared (Indianapolis, Fort Wayne): the VIEWER's own school leads (S68,
 *   Franky): an IU student (or one with no school yet) gets a crimson bar
 *   whose tab zone sits on Purdue black behind a "/" seam lined in gold; a
 *   Purdue student gets the mirror, a black-and-gold bar whose tabs sit on
 *   IU crimson behind a seam lined in cream. Both schools always show;
 * - IU: all crimson; Purdue: all black with a gold bottom hairline;
 * - none (before the first campus answer, or no campus): neutral ink.
 * The phone keeps CampusBanner; each page mounts exactly one of the two.
 */
function CampusTopBar({
  active,
  onTabChange,
  hideMap,
  hideChat,
  onOpenCampuses,
}: {
  active: CampusTab;
  onTabChange: (tab: CampusTab) => void;
  /** Visiting a campus that isn't open: no Map pill (see CampusTabs). */
  hideMap: boolean;
  /** The `chat_desktop` switch is on: no Chat pill (see CampusTabs). */
  hideChat: boolean;
  onOpenCampuses: () => void;
}) {
  const { campus, known, isVisiting, title, sharedSub, statsLine } = useCampusHeader();
  // The viewer's own school (the same cached request useCampusHeader reads),
  // so a shared campus leads with it. Visiting another shared campus keeps
  // the viewer's school in front too.
  const { system: viewerSystem } = useViewerCampus();
  const skin = known ? schoolSkinFor(campus) : "none";
  const shared = skin === "shared";
  const purdueLeads = shared && viewerSystem === "purdue";
  const leftZone =
    skin === "purdue" || purdueLeads ? "purdue" : skin === "none" ? "none" : "iu";
  const left = SCHOOL_ZONE_PALETTES[leftZone];
  const right = SCHOOL_ZONE_PALETTES[shared ? (purdueLeads ? "iu" : "purdue") : leftZone];
  // The seam's edge line is the tab zone's own accent: gold beside Purdue
  // black, cream beside IU crimson.
  const seamLine = purdueLeads ? IU_CREAM : PURDUE_GOLD;
  // Clear room between the search pill and the seam, whose gold edge
  // reaches 33px into this zone at the bottom.
  const leftPadRight = shared ? 44 : 16;

  // Under 1024px search is a round button; pressing it opens the field over
  // the left zone, focused. Escape, or leaving it empty, folds it back.
  // Above that the field always shows and this state changes nothing.
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const openSearch = () => {
    setSearchOpen(true);
    setFocusKey((k) => k + 1);
  };
  const dismissSearch = useCallback((how: "escape" | "blur") => {
    setSearchOpen(false);
    // Escape hands focus back to the button, when it's the one on screen.
    if (how === "escape" && window.matchMedia(TOPBAR_SEARCH_COLLAPSED_QUERY).matches) {
      window.requestAnimationFrame(() => toggleRef.current?.focus());
    }
  }, []);

  const leftVars = {
    "--tb-ink": left.ink,
    "--tb-btn-bg": left.searchBg,
    "--tb-btn-border": left.searchBorder,
    "--tb-hover": left.hover,
    "--tb-bg": left.background,
    "--tb-shadow": left.shadow ?? "none",
    "--tb-overlay-right": `${leftPadRight}px`,
  } as React.CSSProperties;
  const rightVars = { "--tb-ink": right.ink, "--tb-hover": right.hover } as React.CSSProperties;

  return (
    <header
      className="vibe-campus-topbar"
      data-skin={skin}
      style={{
        position: "relative",
        flexShrink: 0,
        boxSizing: "border-box",
        height: 64,
        display: "flex",
        alignItems: "center",
        padding: "0 20px 0 24px",
        background: left.background,
        boxShadow: left.shadow ?? undefined,
        overflow: "hidden",
        // The bar's nowrap name, sub-line and pills add up to more than a
        // 700px column (900px viewport): without this their min-content
        // would widen LeftNav's `1fr` grid track and scroll the page
        // sideways. The bar takes the column's width and ellipsizes instead.
        contain: "inline-size",
      }}
    >
      <style>{TOPBAR_CSS}</style>
      <div
        className="vibe-topbar-left"
        style={{
          ...leftVars,
          position: "relative",
          flex: "1 1 auto",
          minWidth: 0,
          alignSelf: "stretch",
          display: "flex",
          alignItems: "center",
          gap: 12,
          paddingRight: leftPadRight,
        }}
      >
        <div
          style={{
            flex: "0 1 auto",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <div
              title={known ? title : undefined}
              style={{
                ...TOPBAR_ELLIPSIS,
                flex: "0 1 auto",
                fontFamily: "Fraunces, serif",
                fontWeight: 800,
                fontSize: 18,
                color: left.ink,
                letterSpacing: "-0.01em",
                lineHeight: 1.1,
              }}
            >
              {title}
            </div>
            {sharedSub ? (
              <div
                className="vibe-topbar-sub"
                style={{
                  ...TOPBAR_ELLIPSIS,
                  // Gives way long before the campus name does, and hides
                  // under 1180px (TOPBAR_CSS): the colours already say
                  // IU + Purdue, and the visiting pill below says "visiting".
                  flex: "0 10 auto",
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 11,
                  fontWeight: 600,
                  color: left.secondary,
                  lineHeight: 1.2,
                  ...(isVisiting ? { letterSpacing: "0.05em" } : null),
                }}
              >
                {sharedSub}
              </div>
            ) : null}
          </div>
          {statsLine ? (
            <div
              className="vibe-topbar-stats"
              style={{
                ...TOPBAR_ELLIPSIS,
                fontFamily: "DM Sans, sans-serif",
                fontSize: 12,
                color: left.secondary,
                lineHeight: 1.2,
              }}
            >
              {statsLine}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="vibe-topbar-btn vibe-topbar-campuses"
          onClick={onOpenCampuses}
          aria-label="Look around other campuses"
          aria-haspopup="dialog"
          title="Look around other campuses"
        >
          <span className="vibe-topbar-word">
            Campuses
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
          {/* Under 1180px: the globe the phone banner uses. */}
          <span className="vibe-topbar-globe">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z" />
            </svg>
          </span>
        </button>
        <button
          ref={toggleRef}
          type="button"
          id="campus-search-toggle"
          className="vibe-topbar-btn vibe-topbar-search-btn"
          onClick={openSearch}
          aria-label="Search campus"
          aria-expanded={searchOpen}
          aria-controls="campus-search"
          title="Search"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth="1.7" />
            <path d="M12 12l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
        {/* One search mount at every width, so #campus-search is always the
            field: inline from 1024px, an overlay behind the button below. */}
        <div className="vibe-topbar-search" data-open={searchOpen ? "true" : "false"}>
          <CampusSearchBar
            variant="bar"
            palette={left}
            placeholder="Search people, clubs, events"
            focusKey={focusKey}
            onDismiss={dismissSearch}
          />
        </div>
      </div>
      <div
        className="vibe-topbar-right"
        style={{
          ...rightVars,
          position: "relative",
          flexShrink: 0,
          alignSelf: "stretch",
          display: "flex",
          alignItems: "center",
          isolation: "isolate",
        }}
      >
        {shared ? (
          <>
            {/* The "/" seam, drawn from this zone's left edge so nothing is
                measured: the tab zone's colour starts 14px left of it at the
                top and 30px left at the bottom, over a twin 3px further left
                in `seamLine` (gold, or cream when Purdue leads). Both run on
                under the bar's right padding. */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: -33,
                right: -20,
                background: seamLine,
                clipPath: TOPBAR_SEAM_CLIP,
              }}
            />
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: -30,
                right: -20,
                background: right.background,
                boxShadow: right.shadow ?? undefined,
                clipPath: TOPBAR_SEAM_CLIP,
              }}
            />
          </>
        ) : null}
        <CampusTabs
          active={active}
          onChange={onTabChange}
          hideMap={hideMap}
          hideChat={hideChat}
          palette={right}
        />
      </div>
    </header>
  );
}

// Unified typeahead used in the campus banner. Hits /api/search and
// renders people / clubs / events under one dropdown. The dropdown is
// rendered as `position: fixed` because the parent header sets
// `overflow: hidden`, which would clip an absolute-positioned dropdown.
type SearchUser = {
  id: string;
  name: string | null;
  handle: string | null;
  school: string | null;
  major: string | null;
  year: string | null;
  avatar_url: string | null;
  rel?: string;
};
type SearchOrg = {
  id: string;
  handle: string;
  name: string;
  description: string;
  logo_url: string | null;
  // No longer read: the row's meta comes from `join_policy` and `audience`.
  is_public: boolean;
  verified: boolean;
  /** Null when hidden (below 5 for someone outside the club) or unread. */
  member_count: number | null;
  join_policy?: JoinPolicy;
  audience?: OrgAudience;
};
type SearchEvent = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  location: string;
  org: { id: string; handle: string; name: string; logo_url: string | null; verified: boolean } | null;
};
type RecentSearch = {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  av: string;
  rel: string;
  role: string;
};

const RECENT_SEARCHES_KEY = "vibe_recent_searches_v1";
const RECENT_SEARCHES_MAX = 8;

function loadRecentSearches(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as RecentSearch[]) : [];
  } catch {
    return [];
  }
}
function saveRecentSearches(arr: RecentSearch[]) {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(arr));
  } catch {}
}
function pushRecent(row: RecentSearch) {
  if (!row.handle) return;
  const arr = loadRecentSearches().filter((r) => r.handle !== row.handle);
  arr.unshift({ ...row, ts: Date.now() } as RecentSearch);
  if (arr.length > RECENT_SEARCHES_MAX) arr.length = RECENT_SEARCHES_MAX;
  saveRecentSearches(arr);
}

function initials(s: string): string {
  return s
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function CampusSearchBar({
  variant = "banner",
  placeholder = "Search students, orgs, events…",
  palette,
  focusKey = 0,
  onDismiss,
}: {
  /** `banner`: the white-on-dark pill inside a non-compact CampusBanner.
   *  `bar`: the desktop top bar's 36px pill, in its zone's school colours. */
  variant?: "banner" | "bar";
  placeholder?: string;
  /** The top bar zone the `bar` pill sits in (neutral if omitted). */
  palette?: SchoolZonePalette;
  /** Bump to focus the field (the top bar's collapsed search button). */
  focusKey?: number;
  /** Escape, or the field losing focus while empty: the top bar folds its
   *  narrow-width overlay. Presses inside the dropdown don't count. */
  onDismiss?: (how: "escape" | "blur") => void;
} = {}) {
  const bar = variant === "bar" ? (palette ?? SCHOOL_ZONE_PALETTES.none) : null;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Set for the moment a press lands in the dropdown, so the blur it causes
  // doesn't fold the overlay out from under the row being clicked.
  const dropdownPressRef = useRef(false);
  useEffect(() => {
    if (focusKey > 0) inputRef.current?.focus();
  }, [focusKey]);
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [orgs, setOrgs] = useState<SearchOrg[]>([]);
  const [events, setEvents] = useState<SearchEvent[]>([]);
  const [loading, setLoading] = useState(false);
  // The last search failed: the dropdown says so instead of "No results",
  // and Retry reruns the same query by bumping retryKey.
  const [searchErr, setSearchErr] = useState<LoadFailure | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const [coords, setCoords] = useState<{ right: number; top: number; width: number } | null>(null);
  const seqRef = useRef(0);
  // Search follows the campus on screen (C5): bare at home, `?campus=` away.
  const view = useCampusView();
  const searchUrl = debounced
    ? view.url(`/api/search?q=${encodeURIComponent(debounced)}&limit=6`)
    : null;

  // Hydrate recents from localStorage after mount. Wrapped in an async
  // IIFE so the setState happens off the synchronous effect body —
  // matches the pattern used elsewhere in this file.
  useEffect(() => {
    (async () => {
      setRecents(loadRecentSearches());
    })();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), 220);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    if (!searchUrl) {
      // Render layer reads `showResults = !!debounced` and ignores the
      // results lists, so we don't need to clear them here. Stale
      // in-flight fetches are guarded by the seq counter below.
      return;
    }
    const seq = ++seqRef.current;
    (async () => {
      setLoading(true);
      const r = await vibeRequest<{
        users?: SearchUser[];
        orgs?: SearchOrg[];
        events?: SearchEvent[];
      }>(searchUrl, {
        credentials: "include",
        quiet: true,
        failure: "Search failed.",
      });
      // A newer query (or a Retry) owns the dropdown now.
      if (seq !== seqRef.current) return;
      setLoading(false);
      if (
        r.ok &&
        Array.isArray(r.data.users) &&
        Array.isArray(r.data.orgs) &&
        Array.isArray(r.data.events)
      ) {
        setSearchErr(null);
        setUsers(r.data.users);
        setOrgs(r.data.orgs);
        setEvents(r.data.events);
      } else {
        setSearchErr(campusLoadFailure(r, "Search failed."));
      }
    })();
  }, [searchUrl, retryKey]);

  const updateCoords = useCallback(() => {
    const el = wrapRef.current;
    // Folded away (the top bar's overlay, display:none): a scroll measured
    // now would read all zeros and park the dropdown off-screen for the
    // next open. Keep the last real position; focusing re-measures.
    if (!el || el.getClientRects().length === 0) return;
    const r = el.getBoundingClientRect();
    // Right-anchor: pin the dropdown's right edge to the input's right
    // edge so it grows leftward and never clips the viewport.
    setCoords({
      right: Math.max(8, window.innerWidth - r.right),
      top: r.bottom + 6,
      width: r.width,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateCoords();
    const onScroll = () => updateCoords();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", updateCoords);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [open, updateCoords]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (wrapRef.current?.contains(t)) return;
      const dd = document.getElementById("campus-search-dropdown");
      if (dd && t && dd.contains(t)) return;
      setOpen(false);
      // A press in the dropdown (Clear, a recent's remove) already took
      // focus off the field without a blur we act on; fold the top bar's
      // overlay on this outside press instead of leaving it stuck open.
      const input = inputRef.current;
      if (input && document.activeElement !== input && !input.value.trim()) {
        onDismiss?.("blur");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onDismiss]);

  const goPerson = (handle: string, row?: RecentSearch) => {
    if (row) {
      pushRecent(row);
      setRecents(loadRecentSearches());
    }
    if (handle) window.location.assign(`/profile/${encodeURIComponent(handle)}`);
  };
  const goOrg = (handle: string) => {
    if (handle) window.location.assign(`/orgs/${encodeURIComponent(handle)}`);
  };
  // An event found while visiting lives on the campus on screen, so the
  // Events tab it opens keeps `?campus=` (bare at home, as before).
  const goEvent = (id: string) => {
    if (id) window.location.assign(view.url(`/campus?tab=events&event=${encodeURIComponent(id)}`));
  };

  const removeRecent = (handle: string) => {
    const next = loadRecentSearches().filter((r) => r.handle !== handle);
    saveRecentSearches(next);
    setRecents(next);
  };
  const clearRecents = () => {
    saveRecentSearches([]);
    setRecents([]);
  };

  // Focus left the search (field or dropdown) with nothing typed: the top
  // bar folds its narrow-width overlay. Moving between the field and the
  // dropdown (a click, or Tab onto a recent / Clear) doesn't count: the
  // overlay hides the dropdown too, so folding there strands the focus.
  const onFieldFocusOut = (e: React.FocusEvent) => {
    if (dropdownPressRef.current) return;
    const next = e.relatedTarget instanceof Node ? e.relatedTarget : null;
    if (next && wrapRef.current?.contains(next)) return;
    if (next && document.getElementById("campus-search-dropdown")?.contains(next)) return;
    if (!inputRef.current?.value.trim()) onDismiss?.("blur");
  };

  const showResults = !!debounced;
  // A failed search is never "No results"; its failure line renders instead.
  const empty =
    showResults &&
    !loading &&
    !searchErr &&
    users.length === 0 &&
    orgs.length === 0 &&
    events.length === 0;

  return (
    <>
      {bar ? (
        <style>{`
          #campus-search[data-variant="bar"] input::placeholder { color: var(--campus-search-ink); opacity: 1; }
          #campus-search[data-variant="bar"]:focus-within { outline: 2px solid var(--campus-search-ring); outline-offset: 2px; }
        `}</style>
      ) : null}
      <div
        ref={wrapRef}
        id="campus-search"
        data-variant={variant}
        style={
          bar
            ? ({
                // The top bar's pill, in its zone's school colours. The focus
                // ring is the zone's ink: coral fails contrast on crimson.
                "--campus-search-ink": bar.searchInk,
                "--campus-search-ring": bar.ink,
                height: 36,
                boxSizing: "border-box",
                flex: 1,
                minWidth: 0,
                maxWidth: 440,
                borderRadius: 999,
                padding: "0 14px",
                background: bar.searchBg,
                border: `1px solid ${bar.searchBorder}`,
                fontFamily: "DM Sans, sans-serif",
                fontSize: 13,
                color: bar.searchInk,
                display: "flex",
                alignItems: "center",
                gap: 8,
                position: "relative",
              } as React.CSSProperties)
            : {
                ...GLASS_SURFACE,
                background: "rgba(255,255,255,0.12)",
                borderRadius: 999,
                padding: "6px 14px",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 13,
                color: "#fff",
                minWidth: 280,
                marginRight: 80,
                display: "flex",
                alignItems: "center",
                gap: 8,
                position: "relative",
              }
        }
      >
        {bar ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden
            style={{ color: bar.searchInk, flexShrink: 0 }}
          >
            <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth="1.7" />
            <path d="M12 12l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        ) : (
          <span style={{ opacity: 0.7 }}>⌕</span>
        )}
        <input
          ref={inputRef}
          type="text"
          name="vibe_search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => {
            setOpen(true);
            // Re-measure: the dropdown may already be "open" from before the
            // top bar's overlay folded, so the [open] effect won't re-run.
            updateCoords();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !e.nativeEvent.isComposing) onDismiss?.("escape");
          }}
          onBlur={onFieldFocusOut}
          aria-label="Search Vibe"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: bar ? bar.searchInk : "#fff",
            fontFamily: "inherit",
            fontSize: 13,
            padding: 0,
            minWidth: 0,
          }}
        />
      </div>
      {open && coords ? (
        <div
          id="campus-search-dropdown"
          onMouseDown={() => {
            dropdownPressRef.current = true;
            window.setTimeout(() => {
              dropdownPressRef.current = false;
            }, 0);
          }}
          onBlur={onFieldFocusOut}
          style={{
            position: "fixed",
            right: coords.right,
            top: coords.top,
            width: Math.max(coords.width, 320),
            maxHeight: "60vh",
            overflowY: "auto",
            background: COLORS.bg,
            borderRadius: 14,
            border: `1px solid ${COLORS.border}`,
            boxShadow: "0 18px 40px rgba(0,0,0,0.28), 0 4px 10px rgba(0,0,0,0.16)",
            zIndex: 1000,
            fontFamily: "DM Sans, sans-serif",
          }}
        >
          {!showResults ? (
            recents.length ? (
              <>
                <div
                  style={{
                    padding: "12px 16px 6px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={ddSectionLabel}>Recently searched</span>
                  <button
                    onClick={clearRecents}
                    style={{
                      background: "none",
                      border: "none",
                      color: COLORS.faint,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Clear
                  </button>
                </div>
                {recents.slice(0, 5).map((r) => (
                  <PersonRow
                    key={r.handle}
                    name={r.name}
                    role={r.role}
                    handle={r.handle}
                    avatar={r.avatar}
                    av={r.av || initials(r.name || r.handle || "?")}
                    action={followButtonFor(r.rel).label}
                    onClick={() => goPerson(r.handle, r)}
                    onRemove={() => removeRecent(r.handle)}
                    isRecent
                  />
                ))}
              </>
            ) : (
              <div style={{ padding: "20px 16px", color: COLORS.muted, fontSize: 13, textAlign: "center" }}>
                Search students, orgs, and events.
              </div>
            )
          ) : searchErr && !loading ? (
            <div style={{ padding: 12 }}>
              <LoadFailed
                compact
                failure={searchErr}
                onRetry={() => setRetryKey((k) => k + 1)}
              />
            </div>
          ) : empty ? (
            <div style={{ padding: "20px 16px", color: COLORS.muted, fontSize: 13, textAlign: "center" }}>
              No results for &ldquo;{debounced}&rdquo;
            </div>
          ) : (
            <>
              {users.length > 0 && (
                <>
                  <div style={ddSectionLabel}>People</div>
                  {users.map((u) => {
                    const role = [u.major, u.year].filter(Boolean).join(" · ") || u.school || "";
                    // Follow / Following ✓ / Follow back / Connected ✓: the
                    // four words every screen uses for people. PersonRow shows
                    // it as a label; a click on the row opens the profile.
                    const action = followButtonFor(u.rel).label;
                    const display = u.name || (u.handle ? `@${u.handle}` : "");
                    return (
                      <PersonRow
                        key={u.id}
                        name={display}
                        role={role}
                        handle={u.handle || ""}
                        avatar={u.avatar_url || ""}
                        av={initials(display || "?")}
                        action={action}
                        onClick={() =>
                          goPerson(u.handle || "", {
                            id: u.id,
                            name: display,
                            handle: u.handle || "",
                            avatar: u.avatar_url || "",
                            av: initials(display || "?"),
                            rel: u.rel || "none",
                            role,
                          })
                        }
                      />
                    );
                  })}
                </>
              )}
              {orgs.length > 0 && (
                <>
                  <div style={ddSectionLabel}>Clubs &amp; Orgs</div>
                  {orgs.map((o) => (
                    <EntityRow
                      key={o.id}
                      name={o.name}
                      role={[
                        memberCountText(o.member_count),
                        o.verified ? "Verified" : null,
                        o.join_policy && o.join_policy !== "open" ? policyChip(o.join_policy) : null,
                        o.audience ? audienceChip(o.audience) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      avatar={o.logo_url || ""}
                      av={initials(o.name || o.handle)}
                      action="View"
                      bg="#5B3FB7"
                      onClick={() => goOrg(o.handle)}
                    />
                  ))}
                </>
              )}
              {events.length > 0 && (
                <>
                  <div style={ddSectionLabel}>Events</div>
                  {events.map((e) => {
                    let when = "";
                    try {
                      const d = new Date(e.starts_at);
                      when =
                        d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
                        " · " +
                        d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
                    } catch {}
                    const subtitle = [e.org?.name || "", when].filter(Boolean).join(" · ");
                    return (
                      <EntityRow
                        key={e.id}
                        name={e.title || "Event"}
                        role={subtitle}
                        avatar={e.org?.logo_url || ""}
                        av={initials(e.title || "?")}
                        action="Open"
                        bg="#FF5C35"
                        onClick={() => goEvent(e.id)}
                      />
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      ) : null}
    </>
  );
}

const ddSectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "1.5px",
  color: COLORS.faint,
  padding: "12px 16px 6px",
};

// Search-dropdown row hover (PersonRow, ItemRow): --row-hover is #F2EFE9 in
// Light and one step up from the near-black dropdown in Night.
function searchRowHoverBg(): string {
  return "var(--row-hover)";
}

function PersonRow(props: {
  name: string;
  role: string;
  handle: string;
  avatar: string;
  av: string;
  action: string;
  onClick: () => void;
  onRemove?: () => void;
  isRecent?: boolean;
}) {
  return (
    <div
      onClick={props.onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 16px",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = searchRowHoverBg())}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          flexShrink: 0,
          background: props.avatar
            ? `url(${props.avatar}) center/cover`
            : "#1C1C1E",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Fraunces, serif",
          fontSize: 12,
          fontWeight: 700,
          overflow: "hidden",
        }}
      >
        {!props.avatar ? props.av : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {props.name}
        </div>
        <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {props.role}
        </div>
      </div>
      {/* Where you stand with them (Follow / Following ✓ / Follow back /
          Connected ✓), as a label, not a button: it never had a click of
          its own, so a click anywhere on the row opens the profile. */}
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          // Light's --tag-ink written out: the chip is pale peach in both looks.
          color: "#B83A1A",
          background: "#FFF5F2",
          border: "1px solid rgba(255,92,53,0.2)",
          borderRadius: 100,
          padding: "3px 10px",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        {props.action}
      </span>
      {props.isRecent && props.onRemove ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.onRemove?.();
          }}
          title="Remove from recent"
          aria-label="Remove from recent"
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            border: "none",
            background: "transparent",
            color: COLORS.faint,
            fontSize: 14,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            cursor: "pointer",
            marginLeft: -2,
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function EntityRow(props: {
  name: string;
  role: string;
  avatar: string;
  av: string;
  action: string;
  bg: string;
  onClick: () => void;
}) {
  return (
    <div
      onClick={props.onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 16px",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = searchRowHoverBg())}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          flexShrink: 0,
          background: props.avatar ? `url(${props.avatar}) center/cover` : props.bg,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Fraunces, serif",
          fontSize: 12,
          fontWeight: 700,
          overflow: "hidden",
        }}
      >
        {!props.avatar ? props.av : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {props.name}
        </div>
        <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {props.role}
        </div>
      </div>
      <button
        style={{
          fontSize: 11,
          fontWeight: 700,
          // Light's --tag-ink written out: the chip is pale peach in both looks.
          color: "#B83A1A",
          background: "#FFF5F2",
          border: "1px solid rgba(255,92,53,0.2)",
          borderRadius: 100,
          padding: "3px 10px",
          flexShrink: 0,
          cursor: "pointer",
        }}
      >
        {props.action}
      </button>
    </div>
  );
}

function CampusTabs({
  active,
  onChange,
  hideMap = false,
  hideChat = false,
  palette,
}: {
  active: CampusTab;
  onChange: (tab: CampusTab) => void;
  /** Visiting a campus that isn't open (C5): no Map pill. Chat stays for it. */
  hideMap?: boolean;
  /** The `chat_desktop` switch is on: no Chat pill, club chat is on /messages. */
  hideChat?: boolean;
  /** The top bar zone the pills sit in (CampusTopBar's right zone). */
  palette: SchoolZonePalette;
}) {
  const mapTabs = hideMap ? TABS.filter((t) => t.key !== "map") : TABS;
  const tabs = hideChat ? mapTabs.filter((t) => t.key !== "chat") : mapTabs;
  // The pills live in the top bar's right zone (S68). #campus-tabs stays the
  // tour's target. Hover and focus come from TOPBAR_CSS (.vibe-topbar-tab).
  // Each pill has its own fill that crossfades on SPRING_SNAPPY (motion pass,
  // Oct 18), in step with the label's colour. Not a fill sliding across: the
  // inactive labels are the fill's own colour in every zone palette, so any
  // word a moving fill passed under would vanish.
  return (
    <nav
      id="campus-tabs"
      aria-label="Campus sections"
      style={{
        position: "relative",
        zIndex: 1,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: 3,
        borderRadius: 999,
        background: palette.tabsTrack,
      }}
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            className="vibe-topbar-tab vibe-press"
            aria-current={isActive ? "page" : undefined}
            title={t.short === t.label ? undefined : t.label}
            onClick={() => onChange(t.key)}
            style={{
              position: "relative",
              height: 30,
              padding: "0 12px",
              borderRadius: 999,
              border: "none",
              // Inactive pills take their (hover) paint from TOPBAR_CSS; the
              // active one's fill is the span below.
              color: isActive ? palette.activeInk : palette.inactiveInk,
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              fontWeight: isActive ? 700 : 500,
              whiteSpace: "nowrap",
              cursor: "pointer",
              transition: `background 160ms ease, color 160ms ease, ${PRESS_TRANSITION}`,
            }}
          >
            {/* Always mounted, so it fades in place; `initial={false}` paints
                the server's state with no mount fade. */}
            <motion.span
              aria-hidden
              initial={false}
              animate={{ opacity: isActive ? 1 : 0 }}
              transition={SPRING_SNAPPY}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 0,
                borderRadius: 999,
                background: palette.activeBg,
                pointerEvents: "none",
              }}
            />
            <span style={{ position: "relative", zIndex: 1 }}>{t.short}</span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * `.vibe-press` (globals.css) carries its own transform transition, and an
 * inline `transition` replaces it. A button that keeps an inline transition
 * adds this so the release still springs back (motion pass, Oct 18). The
 * quick 90ms press-in is globals.css's `.vibe-press:active` duration, which
 * only beats this inline value when it is marked `!important` there.
 */
const PRESS_TRANSITION = "transform 320ms var(--vibe-spring-snappy)";

function TabBody({
  tab,
  onCreateOrg,
  feedTagFilter,
  onClearTagFilter,
  onPickTag,
  onPickEvent,
  highlightEventId,
  onHighlightDone,
  onOpenTab,
}: {
  tab: CampusTab;
  onCreateOrg: () => void;
  feedTagFilter: string | null;
  onClearTagFilter: () => void;
  onPickTag: (tag: string) => void;
  /** A strip event chip: switch to Events and flash that card. */
  onPickEvent: (eventId: string) => void;
  highlightEventId: string | null;
  onHighlightDone: () => void;
  /** The Feed's side panels: "All in Events" and "Find clubs on campus". */
  onOpenTab: (tab: "events" | "orgs") => void;
}) {
  const view = useCampusView();
  if (tab === "feed")
    return (
      // "Your clubs" left, Tonight right (C2). The panels sit OUTSIDE the
      // tag-keyed FeedTabBody, so picking a tag never refetches them; this
      // TabBody's campus key remounts them when the campus changes.
      <FeedSideLayout
        eventsUrl={view.url("/api/events?limit=50")}
        schoolUrl={view.url("/api/school-events")}
        onPickEvent={onPickEvent}
        onOpenTab={onOpenTab}
      >
        <FeedTabBody
          key={feedTagFilter ?? "all"}
          tagFilter={feedTagFilter}
          onClearTagFilter={onClearTagFilter}
          onPickTag={onPickTag}
          onPickEvent={onPickEvent}
        />
      </FeedSideLayout>
    );
  if (tab === "events")
    return (
      <EventsTabBody highlightEventId={highlightEventId} onHighlightDone={onHighlightDone} />
    );
  if (tab === "orgs") return <OrgsTabBody onCreateOrg={onCreateOrg} />;
  if (tab === "map") return <MapTabBody />;
  return null;
}

function GlassCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        ...GLASS_SURFACE,
        borderRadius: 18,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Dark glass for cards sitting on the cream FEED backdrop (events, orgs).
// White-glass-on-cream washed everything out (the original GlassCard
// expected a dark scene), so we flip the fill to a translucent charcoal
// with a backdrop blur that lets the cream warmth peek through.
const DARK_GLASS_SURFACE: React.CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(20,16,28,0.78) 0%, rgba(14,11,22,0.82) 100%)",
  backdropFilter: "blur(28px) saturate(160%)",
  WebkitBackdropFilter: "blur(28px) saturate(160%)",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: [
    "inset 0 1px 0 rgba(255,255,255,0.10)",
    "inset 0 -1px 0 rgba(0,0,0,0.32)",
    "0 12px 32px rgba(20,8,40,0.22)",
  ].join(", "),
  color: "#fff",
};

function DarkGlassCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        ...DARK_GLASS_SURFACE,
        borderRadius: 18,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

type FeedAuthor = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  school: string | null;
  major: string | null;
  year: number | null;
};

type FeedOrg = {
  id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
  is_public: boolean;
} | null;

export type FeedPost = {
  id: string;
  user_id: string;
  org_id: string | null;
  type: "post";
  content: string;
  tags: string[] | null;
  media_url: string | null;
  media_thumbnail_url: string | null;
  // Client picks the right player from this. "video" for video posts,
  // "image" for image posts, null for text-only.
  media_kind: "video" | "image" | null;
  view_count: number;
  // null = the feed couldn't read it this time (Oct 19, 2026, critique B1):
  // the shared engagement record skips a null instead of writing 0 / false.
  like_count: number | null;
  comment_count: number | null;
  repost_count: number | null;
  viewer_liked: boolean | null;
  viewer_reposted: boolean | null;
  /** True when the viewer has bookmarked this post. The feed now
   *  hydrates this so saved state persists across page loads. */
  viewer_saved?: boolean | null;
  /** Up to 3 most-recent reposters that the viewer follows. Drives the
   *  Instagram-style "X reposted this" social-proof pill. */
  friend_reposters?: Array<{
    id: string;
    name: string | null;
    handle: string | null;
    avatar_url: string | null;
  }>;
  /** Total count of friends who reposted (≥ friend_reposters.length). */
  friend_reposter_count?: number;
  created_at: string;
  /** Set when the author edited the post after publishing (" · Edited"). */
  edited_at?: string | null;
  /**
   * A moderator took this down. `/api/feed` sends both on the author's own
   * removed post (RLS serves a removed row to its author and nobody else), and
   * FeedRow turns it into the "Removed by Vibe moderators" card. OPTIONAL: a
   * deploy without the moderation migration sends neither.
   */
  removed_at?: string | null;
  removed_reason?: string | null;
  /**
   * The server's answer to "may this viewer delete it?" (S68 officer tools,
   * C3; src/lib/posts/viewer-can-delete.ts): the author, or a current owner /
   * admin of the post's club with no restriction; never a removed post.
   * FeedRow reads it only for the officer who ISN'T the author; the author's
   * own menu is unchanged. Missing (an older payload) = no officer Delete.
   */
  viewer_can_delete?: boolean;
  author: FeedAuthor | null;
  org: FeedOrg;
};

type FeedEntry =
  | { kind: "post"; sort_at: string; post: FeedPost }
  | {
      kind: "repost";
      sort_at: string;
      reposter: FeedAuthor;
      reposted_at: string;
      quote: string | null;
      post: FeedPost;
    };

/**
 * How long a reported post stays on screen after the event. The sheet that
 * fired it lives inside the post's own row (FeedRow here, FeedCard's ⋯ menu on
 * the phone), and vaul takes 0.5 s to close: dropping the row any sooner
 * unmounts drawers halfway through closing and strands their scroll lock.
 */
const REPORTED_POST_DROP_MS = 600;

/** The post id in a CONTENT_REPORTED_EVENT (ReportSheet fires it once the
 *  sheet of a report that went through has closed), or null for anything
 *  else. Anything on the page can dispatch a window event, so the detail is
 *  checked rather than trusted. */
function reportedPostIdFrom(e: Event): string | null {
  const detail = (e as CustomEvent<Partial<ContentReportedDetail> | null>).detail;
  if (!detail || detail.targetType !== "post") return null;
  return typeof detail.targetId === "string" && detail.targetId ? detail.targetId : null;
}

/**
 * A post the viewer reports leaves the list they reported it from, so they
 * never have to look at it again (Apple 1.2 / Google UGC ask for exactly this).
 * `drop` runs once per report, REPORTED_POST_DROP_MS later, and removes that
 * post from the caller's state. The returned ref holds every post id reported
 * on this visit: a list that loads again filters the answer through it, so a
 * load already in flight when the report landed can't bring the post back.
 * The feed route also leaves out posts the viewer reported, so a later visit
 * doesn't need the ref.
 */
export function useReportedPostIds(
  drop: (postId: string) => void,
): React.RefObject<Set<string>> {
  const idsRef = useRef<Set<string>>(new Set());
  // The latest `drop`, so a caller's new function never re-subscribes the
  // listener and throws away a drop that is still waiting on its timer.
  const dropRef = useRef(drop);
  useEffect(() => {
    dropRef.current = drop;
  }, [drop]);
  useEffect(() => {
    const timers = new Set<number>();
    const onReported = (e: Event) => {
      const id = reportedPostIdFrom(e);
      if (!id) return;
      idsRef.current.add(id);
      const t = window.setTimeout(() => {
        timers.delete(t);
        dropRef.current(id);
      }, REPORTED_POST_DROP_MS);
      timers.add(t);
    };
    window.addEventListener(CONTENT_REPORTED_EVENT, onReported);
    return () => {
      window.removeEventListener(CONTENT_REPORTED_EVENT, onReported);
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);
  return idsRef;
}

/** `rows` without the posts in `reported`. Hands back `rows` itself when
 *  nothing matched, so a state update that changes nothing re-renders
 *  nothing (and re-runs no effect that depends on the list). */
export function withoutReportedPosts<T>(
  rows: T[],
  reported: ReadonlySet<string>,
  postIdOf: (row: T) => string,
): T[] {
  if (reported.size === 0) return rows;
  const kept = rows.filter((row) => !reported.has(postIdOf(row)));
  return kept.length === rows.length ? rows : kept;
}

function relativeTime(iso: string): string {
  try {
    const ms = Date.now() - Date.parse(iso);
    if (!Number.isFinite(ms) || ms < 0) return "";
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d`;
    const wk = Math.floor(day / 7);
    if (wk < 5) return `${wk}w`;
    return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// The desktop post card: the phone's FeedCard surface (CampusMobile.tsx),
// spelled in the C0 tokens so night mode is one CSS block away. Shared by
// FeedRow, the composer (its `glass` prop) and the feed's loading / error /
// empty card. No `overflow: hidden` (the kebab menu is absolutely positioned
// inside the card and would clip on a one-line post) and no backdrop-filter
// (fifty blur layers on integrated GPUs, and a blurred element becomes the
// containing block for fixed-position descendants). Padding is per use.
const FEED_CARD_SURFACE: React.CSSProperties = {
  background: "var(--glass)",
  border: "1px solid var(--glass-border)",
  borderRadius: 18,
  boxShadow: "var(--card-shadow)",
};

function FeedTabBody({
  tagFilter,
  onClearTagFilter,
  onPickTag,
  onPickEvent,
}: {
  tagFilter: string | null;
  onClearTagFilter: () => void;
  onPickTag: (tag: string) => void;
  onPickEvent: (eventId: string) => void;
}) {
  const [entries, setEntries] = useState<FeedEntry[] | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  // First-load failure only; a failed refresh keeps the posts on screen.
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  const { label: campusLabel } = useViewerCampus();
  const view = useCampusView();

  // The rolling strip's data (RSVP'd events in the next 14 days, then this
  // week's trending tags). Owned here, not by the strip, so this tab knows
  // when the strip has nothing to show. Read on every mount of this tab;
  // the strip itself renders only when no tag filter is on. While visiting,
  // trending follows the campus on screen; the RSVP chips stay the
  // student's own (C1).
  const strip = useStripData({
    upcomingLimit: 3,
    trendingLimit: 8,
    days: 14,
    campusId: view.isVisiting ? view.viewingId : null,
  });

  const feedUrl = view.url(
    tagFilter ? `/api/feed?limit=50&tag=${encodeURIComponent(tagFilter)}` : "/api/feed?limit=50",
  );

  // A saved edit patches every row showing that post (the post itself and
  // any repost of it) in place, with no refetch.
  const applyPostEdit = useCallback(
    (p: EditedPost) =>
      setEntries((prev) =>
        prev
          ? prev.map((e) =>
              e.post.id === p.id
                ? { ...e, post: { ...e.post, content: p.content, tags: p.tags, edited_at: p.edited_at } }
                : e,
            )
          : prev,
      ),
    [],
  );

  // A post the viewer reported leaves the feed once the report sheet has
  // closed: every row showing it, the post itself and any repost of it.
  const dropReportedPost = useCallback(
    (postId: string) =>
      setEntries((prev) =>
        prev ? withoutReportedPosts(prev, new Set([postId]), (e) => e.post.id) : prev,
      ),
    [],
  );
  const reportedPostIdsRef = useReportedPostIds(dropReportedPost);

  // An officer deleted a club post: the same drop, at once (no sheet to wait
  // for; FeedRow's confirm is the browser's own).
  const dropDeletedPost = useCallback(
    (postId: string) =>
      setEntries((prev) => (prev ? prev.filter((e) => e.post.id !== postId) : prev)),
    [],
  );

  // After a post or a row change. The student started it, so a refusal
  // toasts (vibeRequest's, or ours for a bad body) and the feed stays put.
  const refresh = useCallback(async () => {
    // Taken before the request: a like tapped while it's out wins over it.
    const readToken = engagementReadToken();
    const r = await vibeRequest<{ feed?: FeedEntry[]; viewerId?: string }>(feedUrl, {
      cache: "no-store",
      failure: "Couldn't refresh the feed.",
    });
    if (r.ok && Array.isArray(r.data.feed)) {
      // The shared like / save / repost record (Oct 19, 2026, critique M1).
      seedEngagementFromFeed(r.data.feed.map((e) => e.post), readToken);
      setLoadErr(null);
      setEntries(
        withoutReportedPosts(r.data.feed, reportedPostIdsRef.current, (e) => e.post.id),
      );
      if (typeof r.data.viewerId === "string") setViewerId(r.data.viewerId);
    } else if (r.ok) {
      toast({ message: "Couldn't refresh the feed. Try again.", tone: "error" });
    }
  }, [feedUrl, reportedPostIdsRef]);
  // The Undo's refresh, current whichever feed URL is on screen by then.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // "Mute <club>'s posts" from a row's ⋯ (club model, Oct 16): one mute for
  // the whole feed. Its rows leave at once, reposts of its posts too (the
  // viewer's own stay), so the toast never says "gone" over a row still
  // there; an Undo refreshes, so they come back (wave-2 repair, finding 1).
  const onClubMuteChange = useCallback(
    (club: FeedClub, muted: boolean) => {
      if (!muted) {
        void refreshRef.current();
        return;
      }
      setEntries((prev) => {
        if (!prev) return prev;
        const kept = new Set(withoutClubPosts(prev.map((e) => e.post), club, viewerId));
        return prev.filter((e) => kept.has(e.post));
      });
    },
    [viewerId],
  );
  const clubMute = useClubMute(onClubMuteChange);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const readToken = engagementReadToken();
      const r = await vibeRequest<{ feed?: FeedEntry[]; viewerId?: string }>(feedUrl, {
        cache: "no-store",
        quiet: true,
        failure: "Couldn't load the feed.",
      });
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.feed)) {
        seedEngagementFromFeed(r.data.feed.map((e) => e.post), readToken);
        setLoadErr(null);
        setEntries(
          withoutReportedPosts(r.data.feed, reportedPostIdsRef.current, (e) => e.post.id),
        );
        if (typeof r.data.viewerId === "string") setViewerId(r.data.viewerId);
      } else {
        setLoadErr(campusLoadFailure(r, "Couldn't load the feed."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [feedUrl, loadKey, reportedPostIdsRef]);

  // /campus?post=<id> deep-link from Otto mention notifications.
  // After the feed has rendered we look up the FeedRow by id, scroll it
  // into view, and flash a coral highlight so the user can see exactly
  // which post they were mentioned on. Strips ?post from the URL once
  // we've handled it so a refresh doesn't keep re-scrolling.
  useEffect(() => {
    if (!entries || entries.length === 0) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get("post");
    if (!targetId) return;
    // requestAnimationFrame so layout has settled before we measure.
    const raf = window.requestAnimationFrame(() => {
      const el = document.getElementById(`post-${targetId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const prevBg = el.style.background;
      el.style.background = "var(--tag-bg)";
      window.setTimeout(() => {
        el.style.background = prevBg;
      }, 2200);
      // Strip the param so a manual refresh doesn't re-fire.
      try {
        params.delete("post");
        const next = params.toString();
        const url = next
          ? `${window.location.pathname}?${next}`
          : window.location.pathname;
        window.history.replaceState({}, "", url);
      } catch {
        /* unsupported / sandbox */
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [entries]);

  return (
    // One centered reading column, 720px like the phone held sideways
    // (Option A, Franky 2026-09-26): cream margins either side, one card
    // per post below. Events and Map keep their own wider caps.
    <section
      id="campus-feed"
      style={{
        flex: 1,
        padding: "28px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        width: "100%",
        maxWidth: 720,
        margin: "0 auto",
        boxSizing: "border-box",
      }}
    >
      {tagFilter ? (
        <SceneHeader
          eyebrow={`Feed · #${tagFilter}`}
          title={`Posts tagged #${tagFilter}`}
          subtitle="Tap any post to open it. Back to the main feed below."
          tone="dark"
        />
      ) : (
        <SceneHeader
          eyebrow={campusEyebrow("Feed", view.isVisiting ? view.label : campusLabel)}
          title="What’s on campus today"
          subtitle="Posts from clubs, orgs, and your network."
          tone="dark"
        />
      )}

      {/* The rolling strip: RSVP'd events, then trending tags, one 40px row
          the width of the column, directly above the composer. Feed tab
          only, and only on the main feed (a tag filter hides it: the
          "← Back" button below is the way out). Renders nothing while both
          lists are empty, so the composer simply moves up. Because the strip
          never shows under a filter here, no chip is ever "active" on the
          desktop; C1's tap-again-to-clear is the phone's affordance. */}
      {!tagFilter ? (
        <RollingStrip
          data={strip}
          roll
          onPickTag={onPickTag}
          onPickEvent={onPickEvent}
          activeTag={null}
          visiting={view.isVisiting}
        />
      ) : null}

      {tagFilter ? (
        <button
          type="button"
          onClick={onClearTagFilter}
          style={{
            alignSelf: "flex-start",
            padding: "9px 18px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(20,16,32,0.72)",
            color: "#fff",
            fontFamily: "DM Sans, sans-serif",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 6px 22px rgba(0,0,0,0.35)",
          }}
        >
          ← Back to main feed
        </button>
      ) : null}

      {/* Away from home the composer's slot says where a post would land
          (R5: the trigger files every post on the author's home campus, so
          a composer here would post somewhere other than the page shows). */}
      {!tagFilter && view.isVisiting ? (
        <VisitingComposerNote homeId={view.homeId} />
      ) : !tagFilter ? (
        <FeedComposer
          glass={FEED_CARD_SURFACE}
          onPosted={() => {
            void refresh();
          }}
        />
      ) : null}

      {/* Posts: one card per post, 12px apart, like the phone. The loading /
          error / empty states share a single card so the column never reads
          as a bare gap under the composer. */}
      {entries === null && loadErr ? (
        <div style={{ ...FEED_CARD_SURFACE, padding: 24 }}>
          <LoadFailed
            failure={loadErr}
            onRetry={() => {
              setLoadErr(null);
              setLoadKey((k) => k + 1);
            }}
          />
        </div>
      ) : entries === null ? (
        <div
          style={{
            ...FEED_CARD_SURFACE,
            padding: "24px",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 14,
            color: COLORS.faint,
            textAlign: "center",
          }}
        >
          Loading feed…
        </div>
      ) : entries.length === 0 ? (
        <div
          style={{
            ...FEED_CARD_SURFACE,
            padding: "32px 24px",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 14,
            color: COLORS.faint,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          {view.isVisiting ? (
            VISITING_COPY.emptyFeed
          ) : (
            <>
              No posts yet — orgs you follow and people from your school will
              show up here once they post.
            </>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Each card rises in once as it mounts, the first screenful a beat
              apart (motion pass, Oct 18). Keyed by the row, so a refresh that
              keeps a card doesn't replay it. The rise settles to
              `transform: none`, so the row's unportalled fixed layers (the
              share sheet, the comment menu's click-away) are only ever boxed
              in for the half second it moves. */}
          {entries.map((entry, i) => (
            <Reveal
              key={entry.kind === "repost" ? `r:${entry.reposter.id}:${entry.post.id}` : `p:${entry.post.id}`}
              delayIndex={i}
            >
              <FeedRow
                entry={entry}
                onMutate={refresh}
                onEdited={applyPostEdit}
                onDeleted={dropDeletedPost}
                onPickTag={onPickTag}
                onMuteClub={clubMute.mute}
                viewerId={viewerId}
              />
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The composer's slot while visiting another campus (C5, the "Viewing
 * Bloomington" board): one dashed line, "You're just looking. New posts go to
 * Indianapolis." Tokens only, so it reads on cream and on Night's near-black.
 */
function VisitingComposerNote({ homeId }: { homeId: string | null }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        borderRadius: 16,
        border: "1px dashed rgba(var(--scrim-rgb),0.14)",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 13,
        lineHeight: 1.4,
        color: "var(--ink-2)",
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ink-muted)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        style={{ flexShrink: 0 }}
      >
        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
      </svg>
      <span style={{ minWidth: 0 }}>{visitingComposerNote(homeId)}</span>
    </div>
  );
}

// CapturedFrame / capturePosterFrame / extractHashtags now live in
// @/lib/composer/helpers — shared with the mobile composer sheet.

function FeedComposer({
  glass,
  onPosted,
}: {
  glass: React.CSSProperties;
  onPosted: () => void;
}) {
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  // Staged video for a regular video post. Clips are backlogged, so every
  // video publishes through /api/me/publish-post — there's no mode choice
  // anymore. See DOCS/BACKLOG_CLIPS.md.
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoMeta, setVideoMeta] = useState<{
    width: number | null;
    height: number | null;
    duration: number | null;
    posterBlob: Blob | null;
  } | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Bind the existing _mentionPicker.js typeahead — same hook used by
  // the mobile composer (see @/lib/composer/helpers).
  useEffect(() => {
    if (textareaRef.current) bindMentionPicker(textareaRef.current);
  }, []);

  const hasContent = !!text.trim() || !!imageFile || !!videoFile;

  // Empties the file input. Without it the input kept the file after
  // "Remove photo" or a cancelled crop: picking the same file again did
  // nothing, and BuildRefresh read the tab as still holding a picked file.
  const clearPicked = () => {
    if (attachInputRef.current) attachInputRef.current.value = "";
  };

  const reset = () => {
    setText("");
    setImageFile(null);
    setVideoFile(null);
    setVideoMeta(null);
    setError(null);
    if (attachInputRef.current) attachInputRef.current.value = "";
  };

  // One paperclip → one file input → route by mimetype. Photo and video
  // are mutually exclusive at the row level. Picking a new file replaces
  // whatever was staged.
  const onPickAttachment = (file: File | null) => {
    setError(null);
    if (!file) return;
    if (file.type.startsWith("image/")) {
      if (file.size > 8 * 1024 * 1024) {
        setError("That image is too large. The limit is 8 MB.");
        return;
      }
      // Open the cropper before staging — confirmed crop becomes the
      // upload payload.
      setPendingImage(file);
      return;
    }
    if (file.type.startsWith("video/")) {
      if (file.size > 200 * 1024 * 1024) {
        setError("That video is too large. The limit is 200 MB.");
        return;
      }
      setVideoFile(file);
      setImageFile(null);
      // Grab a poster frame + dimensions. Best-effort — some formats
      // won't decode in the browser, in which case the post just ships
      // without a poster.
      setVideoMeta(null);
      void capturePosterFrame(file).then((meta) => {
        setVideoMeta({
          width: meta.width,
          height: meta.height,
          duration: meta.duration,
          posterBlob: meta.blob,
        });
      });
      return;
    }
    setError("Pick a photo or video file.");
  };

  const onCroppedImage = (blob: Blob) => {
    const cropped = new File([blob], "post-cropped.jpg", {
      type: blob.type || "image/jpeg",
    });
    setImageFile(cropped);
    setVideoFile(null);
    setPendingImage(null);
  };

  const submit = useCallback(async () => {
    if (!hasContent || busy) return;
    setBusy(true);
    setError(null);
    try {
      const trimmed = text.trim();
      const tags = extractHashtags(trimmed);

      if (videoFile) {
        // Video posts live in R2 under the legacy `clips/` key prefix —
        // the naming predates the clips backlog, the storage path is
        // shared. Probe the video here if we didn't already (covers the
        // publish-before-probe-finished race).
        let meta = videoMeta;
        if (!meta) {
          const captured = await capturePosterFrame(videoFile);
          meta = {
            width: captured.width,
            height: captured.height,
            duration: captured.duration,
            posterBlob: captured.blob,
          };
        }

        // 1. Get presigned R2 PUT URL.
        const sig = await fetch("/api/me/clip-upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType: videoFile.type,
            sizeBytes: videoFile.size,
          }),
        }).then((r) => r.json());
        if (!sig?.ok) throw new Error(sig?.error || "Could not start upload");

        // 2. Upload directly to R2. The link is signed for one exact
        //    Content-Type: the one the route answers with, else (an older
        //    server) the type declared in step 1.
        const putRes = await fetch(sig.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": sig.contentType ?? videoFile.type },
          body: videoFile,
        });
        if (!putRes.ok) throw new Error(`Upload failed (HTTP ${putRes.status})`);

        // 3. Upload the poster frame we captured during pick. Best-effort
        //    — if it fails the post still publishes with a gradient fallback.
        let posterUrl: string | undefined;
        const durationSec =
          meta.duration && Number.isFinite(meta.duration) ? meta.duration : undefined;
        if (meta.posterBlob) {
          try {
            const fd = new FormData();
            fd.append(
              "file",
              new File([meta.posterBlob], "poster.jpg", { type: "image/jpeg" }),
            );
            fd.append("kind", "poster");
            const up = await fetch("/api/me/profile-upload", {
              method: "POST",
              body: fd,
            }).then((r) => r.json());
            if (up?.ok && up.url) posterUrl = up.url as string;
          } catch {
            /* never block publishing on poster upload */
          }
        }

        // 4. Record the row as a regular video post.
        const pub = await fetch("/api/me/publish-post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmed,
            tags,
            video_object_key: sig.objectKey,
            media_thumbnail_url: posterUrl,
            duration_sec: durationSec,
          }),
        }).then((r) => r.json());
        if (!pub?.ok) throw new Error(pub?.error || "Publish failed");
      } else if (imageFile) {
        // Image path: multipart upload to the profiles bucket, then post.
        const fd = new FormData();
        fd.append("file", imageFile);
        fd.append("kind", "post");
        const up = await fetch("/api/me/profile-upload", {
          method: "POST",
          body: fd,
        }).then((r) => r.json());
        if (!up?.ok) throw new Error(up?.error || "Image upload failed");

        const pub = await fetch("/api/me/publish-post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmed,
            tags,
            media_url: up.url,
          }),
        }).then((r) => r.json());
        if (!pub?.ok) throw new Error(pub?.error || "Publish failed");
      } else {
        // Text-only post.
        const pub = await fetch("/api/me/publish-post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed, tags }),
        }).then((r) => r.json());
        if (!pub?.ok) throw new Error(pub?.error || "Publish failed");
      }

      reset();
      onPosted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish");
    } finally {
      setBusy(false);
    }
  }, [busy, videoFile, hasContent, imageFile, onPosted, text, videoMeta]);

  const previewUrl = imageFile ? URL.createObjectURL(imageFile) : null;
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    // A post in the making, or one being sent: BuildRefresh does not reload
    // the page under it (src/lib/build/page-snapshot.ts). A staged video
    // shows only its name, so nothing else on the page would say so.
    <div style={glass} data-holds-reload={hasContent || busy || undefined}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: "16px 20px",
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 2000))}
          placeholder="What's happening on campus?  Use #hashtags or @mention someone."
          rows={2}
          style={{
            border: "none",
            outline: "none",
            resize: "vertical",
            minHeight: 44,
            background: "transparent",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 15,
            color: COLORS.text,
            padding: 0,
            lineHeight: 1.45,
          }}
        />
        {previewUrl ? (
          <div
            style={{
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid rgba(var(--scrim-rgb),0.06)",
              paddingTop: "56%",
              background: `url(${previewUrl}) center/cover`,
              position: "relative",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setImageFile(null);
                clearPicked();
              }}
              style={composerRemoveButton}
              aria-label="Remove photo"
            >
              ×
            </button>
          </div>
        ) : null}
        {videoFile ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: "1px solid var(--hairline)",
              borderRadius: 12,
              padding: "10px 14px",
              background: "rgba(123,95,224,0.08)",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              color: COLORS.text,
              position: "relative",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 32 }}>
              🎬 {videoFile.name} · {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
            </span>
            {videoMeta?.duration ? (
              <span style={{ fontSize: 11, color: COLORS.faint, marginLeft: "auto", paddingRight: 24 }}>
                {Math.round(videoMeta.duration)}s
                {videoMeta.width && videoMeta.height
                  ? ` · ${videoMeta.width}×${videoMeta.height}`
                  : ""}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setVideoFile(null);
                setVideoMeta(null);
                clearPicked();
              }}
              style={composerRemoveButton}
              aria-label="Remove video"
            >
              ×
            </button>
          </div>
        ) : null}
        {videoFile ? (
          <div
            style={{
              marginTop: -4,
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              lineHeight: 1.4,
              color: "var(--ink-muted)",
            }}
          >
            {VIDEO_LOCATION_HINT}
          </div>
        ) : null}
        {error ? (
          <div
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              color: "#C42B1C",
              background: "rgba(196,43,28,0.08)",
              padding: "6px 10px",
              borderRadius: 8,
            }}
          >
            {error}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              ref={attachInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
              style={{ display: "none" }}
              onChange={(e) => onPickAttachment(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => attachInputRef.current?.click()}
              disabled={busy}
              title="Attach photo or video"
              aria-label="Attach photo or video"
              style={composerAttachButton}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M13 7.5L8 12.5C6.343 14.157 3.657 14.157 2 12.5S1 8.157 2.657 6.5L8 1l4 4L6.5 10.5C5.672 11.328 4.328 11.328 3.5 10.5s-.828-2.172 0-3L9 2"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </button>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !hasContent}
            style={{
              padding: "8px 20px",
              borderRadius: 999,
              border: "none",
              background: hasContent && !busy ? COLORS.accent : "rgba(var(--scrim-rgb),0.18)",
              color: hasContent && !busy ? COLORS.onAccent : "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 700,
              fontSize: 13,
              cursor: busy || !hasContent ? "default" : "pointer",
              boxShadow: hasContent && !busy ? "0 2px 8px rgba(255,92,53,0.3)" : "none",
            }}
          >
            {busy ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
      {pendingImage ? (
        <ImageCropperModal
          src={pendingImage}
          aspectChoices={[
            { label: "Square 1:1", value: 1 },
            { label: "Portrait 4:5", value: 4 / 5 },
            { label: "Landscape 16:9", value: 16 / 9 },
          ]}
          outputMaxSize={1600}
          title="Adjust photo"
          onCancel={() => {
            setPendingImage(null);
            clearPicked();
          }}
          onConfirm={onCroppedImage}
        />
      ) : null}
    </div>
  );
}

const composerAttachButton: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 999,
  border: "none",
  background: "transparent",
  color: COLORS.faint,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
  transition: "background 120ms ease, color 120ms ease",
};

const composerRemoveButton: React.CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  width: 24,
  height: 24,
  borderRadius: 999,
  border: "none",
  background: "rgba(0,0,0,0.55)",
  color: "#fff",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1,
  cursor: "pointer",
};


/**
 * Render a post body with `@handle` mentions and `#tags` linkified, with the
 * same cutter as the phone card and the open post (src/lib/feed/
 * caption-segments.ts, Oct 19, 2026). Plain runs stay as `<span>` so the
 * surrounding `white-space: pre-wrap` keeps newlines.
 *
 * - @mentions → /profile/<handle> via next/link (3 to 32 characters, as
 *   before).
 * - #tags → onPickTag(tag), the tag-filtered feed (the trending pills' path),
 *   and ONLY a tag the post saved (`savedTags`, its stored `tags`): "#café",
 *   a link's "#section" or a 6th tag used to light up and open a filter that
 *   didn't show this post (critique decisions 3-5).
 */
function renderPostContent(
  text: string,
  savedTags: string[] | null,
  onPickTag: (tag: string) => void,
): React.ReactNode {
  return captionSegments(text, savedTags).map((seg, i) => {
    if (seg.kind === "mention") {
      return (
        <Link
          key={i}
          href={`/profile/${encodeURIComponent(seg.handle)}`}
          style={{ color: COLORS.accentInk, fontWeight: 600, textDecoration: "none" }}
        >
          {seg.text}
        </Link>
      );
    }
    if (seg.kind === "tag") {
      return (
        <button
          key={i}
          type="button"
          onClick={() => onPickTag(seg.tag)}
          aria-label={`Show posts tagged #${seg.tag}`}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: COLORS.accentInk,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "inherit",
            lineHeight: "inherit",
          }}
        >
          {seg.text}
        </button>
      );
    }
    return <span key={i}>{seg.text}</span>;
  });
}

function FeedRow({
  entry,
  onMutate,
  onEdited,
  onDeleted,
  onPickTag,
  onMuteClub,
  viewerId,
}: {
  entry: FeedEntry;
  onMutate: () => void;
  /** A saved edit; the feed patches its own rows with it. */
  onEdited: (p: EditedPost) => void;
  /** An officer deleted this club post: the feed drops every row showing it. */
  onDeleted: (postId: string) => void;
  onPickTag: (tag: string) => void;
  /** "Mute <club>'s posts" from the ⋯: the feed's one mute and Undo toast. */
  onMuteClub: ClubMuteFn;
  viewerId: string | null;
}) {
  const post = entry.post;
  const fromOrg = !!post.org;
  // Owner check: the post's user_id is the author. Org posts attribute
  // back to the user too, so we treat author === viewer as ownership
  // regardless of whether the post is org- or person-attributed.
  const viewerOwnsPost = !!viewerId && post.user_id === viewerId;
  // Someone else's club post offers "Mute <club>'s posts" (`postSheetRows`'
  // rule on the phone): a mute never hides what you wrote yourself. Memoized
  // on the two strings: a bare call here reads to the React Compiler as a
  // value the menu might mutate, and it then skips this whole component.
  const muteHandle = post.org?.handle;
  const muteName = post.org?.name;
  const muteClub = useMemo(
    () => (viewerOwnsPost ? null : feedClubOf({ handle: muteHandle, name: muteName })),
    [viewerOwnsPost, muteHandle, muteName],
  );
  // A club post someone else wrote, and the viewer is a current owner /
  // admin of that club (S68 officer tools, C3/C5). The server decides
  // (`viewer_can_delete`); a removed post never qualifies.
  const officerCanDelete =
    !viewerOwnsPost && post.viewer_can_delete === true && !post.removed_at;
  const displayName =
    (fromOrg ? post.org?.name : post.author?.name) ||
    post.author?.handle ||
    "Member";
  const displayHandle = fromOrg
    ? `@${post.org?.handle}`
    : post.author?.handle
    ? `@${post.author.handle}`
    : "";
  const avatarUrl = fromOrg ? post.org?.logo_url : post.author?.avatar_url;
  // Where the avatar / name / handle should navigate. Person posts go
  // to /profile/<handle>; org posts go to /orgs/<handle>. Falls back to
  // null so we render plain (non-clickable) text when there's no handle
  // to route to (shouldn't happen in practice but keeps the row safe
  // against malformed feed rows).
  const authorHref =
    fromOrg && post.org?.handle
      ? `/orgs/${encodeURIComponent(post.org.handle)}`
      : post.author?.handle
        ? `/profile/${encodeURIComponent(post.author.handle)}`
        : null;
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

  // Like, save, repost and the comment count live in the shared engagement
  // record (Oct 19, 2026, critique M1; src/lib/posts/engagement-store.ts),
  // the one the phone card and the open post read, so every row showing this
  // post (and a feed refresh) agree. The feed seeds it; this row's own fields
  // show until then. Taps flip the record first and a refusal rolls it back.
  // `onMutate` still re-fetches the feed after a quote repost.
  const engFallback = useMemo(() => engagementFromFeedPost(post), [post]);
  const eng = usePostEngagement(post.id, engFallback);
  const { liked, likeCount, reposted, repostCount, commentCount, saved } = eng;
  // Bumped by the person's own like, not by `liked` coming back on after a
  // failed unlike: only a like pops the heart (CampusMobile's FeedCard).
  const [likeBurst, setLikeBurst] = useState(0);
  const [viewCount, setViewCount] = useState(post.view_count);
  const [showComments, setShowComments] = useState(false);
  const [showRepostMenu, setShowRepostMenu] = useState(false);
  // Owner-only "more" menu — Delete is the only entry for now. Anchored
  // on the row's top-right via a small kebab. Click-outside closes it.
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  // "Send to chats" picker (in-app share to DMs/groups/channels).
  const [shareOpen, setShareOpen] = useState(false);
  // The report dialog, opened from "Report post". Never offered on the
  // viewer's own post: the route answers that with a 400 the student would
  // only ever see as the caller's fallback line.
  const [reportOpen, setReportOpen] = useState(false);
  // Owner-only "Who saw this" modal, opened from the Views chip below.
  const [showViewers, setShowViewers] = useState(false);
  const closeViewers = useCallback(() => setShowViewers(false), []);
  const [deleting, setDeleting] = useState(false);
  // Owner-only inline editor ("Edit post" in the ⋯ menu). Only the words
  // change: the server keeps the photo or video and re-derives the #tags.
  // On a repost row this edits the ORIGINAL (and only when the viewer wrote
  // it); a repost's quote isn't editable.
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const postHasMedia = !!post.media_url;
  const editCheck = checkPostEdit(editDraft, postHasMedia);
  // Same dirty rule as the phone sheet (E2) and the desktop viewer (E6).
  const editDirty = editDraft.trim() !== (post.content ?? "").trim();
  const canSaveEdit = editing && editDirty && editCheck.ok && !savingEdit;

  const cancelEdit = useCallback(() => {
    if (savingEdit) return;
    if (
      editDirty &&
      typeof window !== "undefined" &&
      !window.confirm("Discard your changes?")
    ) {
      return;
    }
    setEditing(false);
    setEditDraft("");
  }, [editDirty, savingEdit]);

  const saveEdit = useCallback(async () => {
    if (!canSaveEdit) return;
    setSavingEdit(true);
    // Never `tags` or `status`: the route derives tags from the text.
    const r = await vibeRequest<{ post?: unknown }>(`/api/posts/${post.id}`, {
      method: "PATCH",
      json: { content: editDraft },
      failure: "Couldn't save your changes.",
    });
    setSavingEdit(false);
    // A refusal already toasted (with Review Terms / Sign in where it
    // applies); the editor stays open with the draft.
    if (!r.ok) return;
    const edited = editedPostFrom(r.data.post);
    if (!edited) {
      toast({ message: "Couldn't save your changes.", tone: "error" });
      return;
    }
    onEdited(edited);
    setEditing(false);
    setEditDraft("");
    toast({ message: "Post updated", tone: "info" });
  }, [canSaveEdit, editDraft, onEdited, post.id]);

  // The editor's textarea is new each time it opens: bind the @mention
  // picker to it, put the caret after the text, and grow it to fit.
  useEffect(() => {
    const ta = editTextareaRef.current;
    if (!editing || !ta) return;
    bindMentionPicker(ta);
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, [editing]);
  useEffect(() => {
    const ta = editTextareaRef.current;
    if (!editing || !ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [editing, editDraft]);

  const onDeletePost = useCallback(async () => {
    if (deleting) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete this post? This can't be undone.")
    ) {
      return;
    }
    setDeleting(true);
    const r = await vibeRequest(`/api/posts/${post.id}`, {
      method: "DELETE",
      failure: "Couldn't delete your post.",
    });
    if (!r.ok) {
      // Menu stays open with the button re-enabled, so they can retry.
      setDeleting(false);
      return;
    }
    setShowMoreMenu(false);
    // Refetch the feed so the deleted row falls out without us having
    // to plumb the deletion into parent state directly.
    onMutate();
  }, [deleting, post.id, onMutate]);

  // An officer deleting someone else's club post (C5). The row leaves the
  // feed at once rather than on a refetch, and the toast says it went.
  const onOfficerDeletePost = useCallback(async () => {
    if (deleting) return;
    const club = post.org?.name;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        club
          ? `Delete this post from ${club}? This can't be undone.`
          : "Delete this post? This can't be undone.",
      )
    ) {
      return;
    }
    setDeleting(true);
    const r = await vibeRequest(`/api/posts/${post.id}`, {
      method: "DELETE",
      failure: "Couldn't delete this post.",
    });
    if (!r.ok) {
      setDeleting(false);
      return;
    }
    setShowMoreMenu(false);
    toast({ message: "Post deleted", tone: "info" });
    onDeleted(post.id);
  }, [deleting, post.id, post.org?.name, onDeleted]);

  // Click-outside dismiss for the more menu — only attaches when open
  // so we don't burn document listeners on every row.
  useEffect(() => {
    if (!showMoreMenu) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || !target.closest?.("[data-feedrow-more]")) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showMoreMenu]);

  // Record a view once per session per post when the row scrolls into view.
  // The server-side dedupe (per-user-per-day) is the real source of truth;
  // this is just to avoid spamming the endpoint while the user scrolls.
  const articleRef = useRef<HTMLElement | null>(null);
  const viewedRef = useRef(false);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const el = articleRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            if (!viewedRef.current && timer === null) {
              timer = setTimeout(() => {
                viewedRef.current = true;
                fetch(`/api/posts/${post.id}/view`, {
                  method: "POST",
                  cache: "no-store",
                })
                  .then((r) => r.json().catch(() => null))
                  .then((j) => {
                    if (j?.ok && j.counted) {
                      setViewCount((c) => c + 1);
                    }
                  })
                  .catch(() => {});
              }, 1000);
            }
          } else if (timer !== null) {
            clearTimeout(timer);
            timer = null;
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer !== null) clearTimeout(timer);
    };
  }, [post.id]);

  // One like request at a time: a second tap while the first is out is
  // dropped (beginEngagementTap answers null), so a fast double tap can't
  // send two requests that each roll the count back by one. The heart flips
  // first; a refusal (Terms not accepted, liking too fast, a post that's
  // gone) puts it back on every screen and the toast says why, the same as
  // the phone feed card (CampusMobile).
  const toggleLike = useCallback(async () => {
    const tap = beginEngagementTap(post.id, "like", engFallback, (c) => ({
      liked: !c.liked,
      likeCount: c.likeCount + (c.liked ? -1 : 1),
    }));
    if (!tap) return;
    const nextLiked = readEngagement(post.id)?.liked === true;
    if (nextLiked) setLikeBurst((n) => n + 1);
    const r = await vibeRequest(`/api/posts/${post.id}/like`, {
      method: nextLiked ? "POST" : "DELETE",
      failure: nextLiked ? "Couldn't like this post." : "Couldn't unlike this post.",
    });
    if (r.ok) tap.commit();
    else tap.rollback();
  }, [engFallback, post.id]);

  // Save (bookmark): the same tap-then-confirm as like. The save route can
  // say no in ways worth a word (store wave S1): a 429 from its limiter, and
  // a 404 for a post gone or across a block, so the toast says why.
  const toggleSave = useCallback(async () => {
    const tap = beginEngagementTap(post.id, "save", engFallback, (c) => ({ saved: !c.saved }));
    if (!tap) return;
    const nextSaved = readEngagement(post.id)?.saved === true;
    const r = await vibeRequest(`/api/posts/${post.id}/save`, {
      method: nextSaved ? "POST" : "DELETE",
      failure: nextSaved
        ? "Couldn't save this post."
        : "Couldn't remove this from your saved posts.",
    });
    if (r.ok) tap.commit();
    else tap.rollback();
  }, [engFallback, post.id]);

  const handleShare = useCallback(async () => {
    try {
      const url = `${window.location.origin}/posts/${post.id}`;
      if (navigator.share) {
        await navigator.share({ url, title: post.content?.slice(0, 80) || "Vibe post" });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      /* user cancelled or unsupported */
    }
  }, [post.id, post.content]);

  // A moderator took this down. Nobody but the author is served the row at
  // all (`/api/feed` sends `removed_at` on their own removed post only), so
  // this card is theirs alone. It has no ⋯ menu: nobody edits or deletes a
  // removed post (the route answers 409 `post_removed`).
  if (viewerOwnsPost && post.removed_at) {
    return (
      <article
        id={`post-${post.id}`}
        data-post-id={post.id}
        style={{ ...FEED_CARD_SURFACE, padding: "16px 18px" }}
      >
        <RemovedContentCard
          kind="post"
          removedAt={post.removed_at}
          removedReason={post.removed_reason}
        />
      </article>
    );
  }

  return (
    <article
      ref={articleRef}
      id={`post-${post.id}`}
      data-post-id={post.id}
      style={{
        // Its own card (no overflow clip: the kebab menu below hangs out of
        // a short post). `background` is what the ?post= flash animates.
        ...FEED_CARD_SURFACE,
        display: "flex",
        flexDirection: "column",
        padding: "16px 18px",
        transition: "background 600ms ease",
        position: "relative",
      }}
    >
      <div
        data-feedrow-more
        style={{
          position: "absolute",
          top: 10,
          right: 12,
          // Every card is its own painted surface now, and a short post's
          // open menu hangs into the next card, whose own kebab wrapper
          // comes later in DOM order. Lift the wrapper only while open so
          // the menu's bottom items paint over the neighbour.
          zIndex: showMoreMenu ? 20 : 2,
        }}
      >
        <button
          type="button"
          aria-label="Post actions"
          onClick={() => setShowMoreMenu((v) => !v)}
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            background: "transparent",
            border: "none",
            color: COLORS.muted,
            fontSize: 18,
            lineHeight: 1,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(var(--scrim-rgb),0.06)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          ⋯
        </button>
        {showMoreMenu ? (
          <div
            role="menu"
            style={{
              position: "absolute",
              top: 32,
              right: 0,
              minWidth: 180,
              background: "var(--paper)",
              border: "1px solid var(--hairline)",
              borderRadius: 12,
              boxShadow: "0 12px 36px rgba(0,0,0,0.12)",
              padding: 4,
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setShowMoreMenu(false);
                setShareOpen(true);
              }}
              style={feedRowMenuItemStyle()}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--cream)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              Send to chats
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setShowMoreMenu(false);
                // Share-link target now points at /posts/[id] (OG meta
                // + 404-safe + works for older posts outside the
                // 50-row feed window). /campus?post= deep link still
                // works as a fallback for inbound links.
                const url = `${window.location.origin}/posts/${encodeURIComponent(post.id)}`;
                void copyText(url, { failure: "Couldn't copy the link." });
              }}
              style={feedRowMenuItemStyle()}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--cream)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              Copy link
            </button>
            {muteClub ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowMoreMenu(false);
                  // The feed's Undo toast says what happened; a refusal toasts why.
                  void onMuteClub(muteClub);
                }}
                style={feedRowMenuItemStyle()}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--cream)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {muteClubRowLabel(muteClub)}
              </button>
            ) : null}
            {!viewerOwnsPost ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowMoreMenu(false);
                  // Was a one-tap `reason_code: "other"` with no picker, which
                  // filed everything as "Something else". Now the sheet asks.
                  setReportOpen(true);
                }}
                style={feedRowMenuItemStyle("danger")}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--cream)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                Report post
              </button>
            ) : null}
            {officerCanDelete ? (
              <button
                type="button"
                role="menuitem"
                onClick={onOfficerDeletePost}
                disabled={deleting}
                style={{
                  ...feedRowMenuItemStyle("danger"),
                  opacity: deleting ? 0.6 : 1,
                  cursor: deleting ? "default" : "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!deleting) e.currentTarget.style.background = "var(--cream)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {deleting ? "Deleting…" : "Delete post"}
              </button>
            ) : null}
            {viewerOwnsPost ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowMoreMenu(false);
                    // Already open: keep the draft in progress.
                    if (editing) return;
                    setEditDraft(post.content ?? "");
                    setEditing(true);
                  }}
                  style={feedRowMenuItemStyle()}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--cream)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  Edit post
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={onDeletePost}
                  disabled={deleting}
                  style={{
                    ...feedRowMenuItemStyle("danger"),
                    opacity: deleting ? 0.6 : 1,
                    cursor: deleting ? "default" : "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (!deleting) e.currentTarget.style.background = "var(--cream)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {deleting ? "Deleting…" : "Delete post"}
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      {entry.kind === "repost" && entry.quote ? (
        <p
          style={{
            margin: "0 0 10px 0",
            color: COLORS.text,
            fontFamily: "DM Sans, sans-serif",
            fontSize: 15,
            lineHeight: 1.45,
            whiteSpace: "pre-wrap",
          }}
        >
          {entry.quote}
        </p>
      ) : null}
      {/* "Maya and 6 others reposted", above the author (Oct 19, 2026,
          critique M2): a quiet line, only as wide as its words and clear of
          the ⋯ above it; a click opens the "Reposted by" pop-up. It replaces
          the full-width green pill the ⋯ used to sit on. */}
      {entry.kind === "post" ? (
        <FriendRepostLine
          postId={post.id}
          reposters={post.friend_reposters}
          repostCount={repostCount}
          viewerReposted={reposted}
          variant="desktop"
        />
      ) : null}
      <div style={{ display: "flex", gap: 12 }}>
      {(() => {
        const avatarStyle: React.CSSProperties = {
          width: 40,
          height: 40,
          borderRadius: fromOrg ? 12 : 999,
          background: avatarUrl
            ? `url(${avatarUrl}) center/cover`
            : fromOrg
            ? `linear-gradient(135deg, ${hexToRgba(colorForOrg(post.org!.id), 0.95)} 0%, ${hexToRgba(colorForOrg(post.org!.id), 0.6)} 100%)`
            : "#1C1C1E",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: 13,
          flexShrink: 0,
          textDecoration: "none",
        };
        // Avatar links to the author's profile / org page. Plain div when
        // there's no handle to route to.
        return authorHref ? (
          <Link
            href={authorHref}
            aria-label={`Open ${displayName}'s profile`}
            style={avatarStyle}
          >
            {!avatarUrl ? initials : null}
          </Link>
        ) : (
          <div style={avatarStyle}>{!avatarUrl ? initials : null}</div>
        );
      })()}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 4,
            flexWrap: "wrap",
          }}
        >
          {authorHref ? (
            <Link
              href={authorHref}
              style={{
                fontFamily: "Fraunces, serif",
                fontWeight: 800,
                fontSize: 15,
                color: COLORS.text,
                textDecoration: "none",
              }}
            >
              {displayName}
            </Link>
          ) : (
            <span
              style={{
                fontFamily: "Fraunces, serif",
                fontWeight: 800,
                fontSize: 15,
                color: COLORS.text,
              }}
            >
              {displayName}
            </span>
          )}
          {fromOrg && post.org?.verified ? <VerifiedBadge size={13} /> : null}
          {displayHandle ? (
            authorHref ? (
              <Link
                href={authorHref}
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 13,
                  color: COLORS.faint,
                  textDecoration: "none",
                }}
              >
                {displayHandle}
              </Link>
            ) : (
              <span
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 13,
                  color: COLORS.faint,
                }}
              >
                {displayHandle}
              </span>
            )
          ) : null}
          <span
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              color: COLORS.faint,
            }}
          >
            {displayHandle ? "· " : ""}
            {relativeTime(post.created_at)}
            {post.edited_at ? (
              <span title={`Edited ${new Date(post.edited_at).toLocaleString()}`}>
                {` · ${EDITED_LABEL}`}
              </span>
            ) : null}
          </span>
          {fromOrg && post.author?.handle ? (
            <Link
              href={`/profile/${encodeURIComponent(post.author.handle)}`}
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontSize: 12,
                color: COLORS.faint,
                textDecoration: "none",
              }}
            >
              · posted by @{post.author.handle}
            </Link>
          ) : null}
        </div>
        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              ref={editTextareaRef}
              autoFocus
              aria-label="Edit post"
              value={editDraft}
              maxLength={POST_MAX_CHARS}
              // Frozen while the save is in flight: success closes the
              // editor with the saved text, so a keystroke now would vanish.
              readOnly={savingEdit}
              aria-busy={savingEdit || undefined}
              onChange={(e) => setEditDraft(e.target.value)}
              onKeyDown={(e) => {
                // The @mention picker handles its own Escape / Enter first.
                if (e.nativeEvent.defaultPrevented) return;
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEdit();
                } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void saveEdit();
                }
              }}
              rows={3}
              style={{
                width: "100%",
                boxSizing: "border-box",
                resize: "none",
                overflow: "hidden",
                margin: 0,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(var(--scrim-rgb),0.12)",
                background: "var(--paper)",
                color: COLORS.text,
                fontFamily: "DM Sans, sans-serif",
                fontSize: 15,
                lineHeight: 1.45,
                outline: "none",
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                <span style={{ color: COLORS.faint }}>
                  {editDraft.length}/{POST_MAX_CHARS}
                </span>
                {postHasMedia ? (
                  <span style={{ color: COLORS.muted }}>
                    You can change the words. The photo or video stays.
                  </span>
                ) : !editDraft.trim() ? (
                  <span style={{ color: "var(--error-ink)" }}>Your post can&apos;t be empty.</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={savingEdit}
                style={{
                  padding: "7px 14px",
                  borderRadius: 999,
                  border: "1px solid rgba(var(--scrim-rgb),0.12)",
                  background: "transparent",
                  color: COLORS.text,
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: savingEdit ? "default" : "pointer",
                  opacity: savingEdit ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={!canSaveEdit}
                aria-busy={savingEdit || undefined}
                style={{
                  padding: "7px 16px",
                  borderRadius: 999,
                  border: "none",
                  background: "#1C1C1E",
                  color: "#fff",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: canSaveEdit ? "pointer" : "default",
                  opacity: canSaveEdit || savingEdit ? 1 : 0.45,
                }}
              >
                {savingEdit ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : post.content ? (
          <p
            onClick={(e) => {
              // Tapping the post body opens its comments — analog to
              // the mobile "tap card to open" gesture. Skip when the
              // click landed on an inline link/button (mentions,
              // hashtags) so those routes still work.
              const target = e.target as HTMLElement;
              if (target.closest("a, button")) return;
              if (!showComments) setShowComments(true);
            }}
            style={{
              margin: 0,
              color: COLORS.text,
              fontFamily: "DM Sans, sans-serif",
              fontSize: 15,
              lineHeight: 1.45,
              whiteSpace: "pre-wrap",
              cursor: "pointer",
            }}
          >
            {renderPostContent(post.content, post.tags, onPickTag)}
          </p>
        ) : null}
        {post.media_url && post.type === "post" && post.media_kind === "image" ? (
          <div
            onClick={() => {
              if (!showComments) setShowComments(true);
            }}
            role="button"
            tabIndex={0}
            aria-label={`Photo posted by ${displayName}, open comments`}
            // Keeps the name in the label out of Sentry's speed reports: it
            // writes "PostPhoto" for this element and never reads the label.
            data-sentry-element="PostPhoto"
            style={{
              marginTop: 10,
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid rgba(var(--scrim-rgb),0.06)",
              paddingTop: "56%",
              background: `url(${post.media_url}) center/cover`,
              cursor: "pointer",
            }}
          />
        ) : null}
        {post.media_url && post.media_kind === "video" ? (
          <video
            src={post.media_url}
            controls
            preload="metadata"
            poster={post.media_thumbnail_url ?? undefined}
            style={{
              width: "100%",
              marginTop: 10,
              borderRadius: 12,
              border: "1px solid rgba(var(--scrim-rgb),0.06)",
              background: "#000",
              maxHeight: 540,
            }}
          />
        ) : null}
        <div
          style={{
            display: "flex",
            gap: 24,
            marginTop: 12,
            color: COLORS.faint,
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            position: "relative",
          }}
        >
          <EngagementAction
            // The heart pops and throws a few dots when a tap turns it on.
            icon={
              <LikeBurst liked={liked} burst={likeBurst} color="var(--coral)">
                <LikeIcon filled={liked} />
              </LikeBurst>
            }
            count={likeCount}
            label="Like"
            onClick={toggleLike}
            active={liked}
            activeColor="var(--coral)"
          />
          <EngagementAction
            icon={<CommentIcon />}
            count={commentCount}
            label="Comments"
            onClick={() => setShowComments((v) => !v)}
            active={showComments}
          />
          <EngagementAction
            icon={<RepostIcon />}
            count={repostCount}
            label="Repost"
            onClick={() => setShowRepostMenu((v) => !v)}
            active={reposted}
            activeColor="#1A8754"
          />
          <div style={{ flex: 1 }} />
          {/* Views is the one chip whose audience the author is allowed to
              ask about, so it is a button for them and stays the plain
              read-out it has always been for everyone else. The server is
              the gate either way (404 for a non-owner): this only decides
              whether there is anything to click. */}
          <EngagementAction
            icon={<EyeIcon />}
            count={viewCount}
            label={
              viewerOwnsPost
                ? viewsLabelForOwner(viewCount)
                : "Views"
            }
            onClick={viewerOwnsPost ? () => setShowViewers(true) : undefined}
            // Not a toggle: this opens a dialog. `expanded` emits
            // aria-haspopup="dialog" + aria-expanded instead of the
            // aria-pressed that Like/Repost use, where pressed means
            // "you did this to the post".
            expanded={viewerOwnsPost ? showViewers : undefined}
          />
          <EngagementAction
            icon={<BookmarkIcon filled={saved} />}
            label={saved ? "Saved" : "Save"}
            onClick={toggleSave}
            active={saved}
            activeColor="var(--charcoal)"
          />
          {showRepostMenu ? (
            <RepostMenu
              postId={post.id}
              alreadyReposted={reposted}
              onClose={() => setShowRepostMenu(false)}
              onDone={(action) => {
                setShowRepostMenu(false);
                // The menu already heard yes: the shared record follows.
                if (action === "added") {
                  patchEngagement(post.id, "repost", engFallback, (c) => ({
                    reposted: true,
                    repostCount: c.reposted ? c.repostCount : c.repostCount + 1,
                  }));
                } else if (action === "removed") {
                  patchEngagement(post.id, "repost", engFallback, (c) => ({
                    reposted: false,
                    repostCount: c.reposted ? c.repostCount - 1 : c.repostCount,
                  }));
                }
                // Quote reposts add a new feed row — refresh so it appears.
                onMutate();
              }}
            />
          ) : null}
        </div>
        {showComments ? (
          <CommentsDrawer
            postId={post.id}
            viewerId={viewerId}
            onCommentAdded={() =>
              patchEngagement(post.id, "comment", engFallback, (c) => ({ commentCount: c.commentCount + 1 }))
            }
          />
        ) : null}
      </div>
      </div>

      {shareOpen ? (
        <SharePostSheet
          postId={post.id}
          postTitle={post.content ?? ""}
          postPosterUrl={post.media_thumbnail_url ?? post.media_url ?? null}
          authorName={
            post.author?.name ||
            (post.author?.handle ? `@${post.author.handle}` : null)
          }
          onClose={() => setShareOpen(false)}
        />
      ) : null}

      {/* Mounted only while open, so the owner-only fetch never fires for a
          modal nobody asked for, and keyed by post id so two rows can never
          share one list. */}
      {showViewers ? (
        <PostViewersModal key={post.id} postId={post.id} onClose={closeViewers} />
      ) : null}

      {reportOpen ? (
        <ReportSheet
          target={{
            type: "post",
            id: post.id,
            // An org post still attributes to the person who wrote it, so
            // Block reaches the right account.
            authorId: post.author?.id ?? null,
            authorName:
              post.author?.name ||
              (post.author?.handle ? `@${post.author.handle}` : null),
          }}
          onClose={() => setReportOpen(false)}
          onBlocked={onMutate}
        />
      ) : null}
    </article>
  );
}

/**
 * "Who saw this" — the desktop feed's owner-only audience modal (Screen C of
 * the metrics wave, handoffs/2026-09-14-wave-plan-metrics-screens.md, batch
 * B9).
 *
 * The desktop row has always been the one surface showing a view count, and
 * that chip was a dead button: the author could see how many, never who. This
 * is the smallest honest answer to the second question.
 *
 * NOTHING ABOUT THE DATA LIVES HERE. The free/paid split, the paging, the day
 * grouping and the rule that a refused read never paints a 0 are all inside
 * <PostAudienceList> (src/components/posts/PostAudienceList.tsx), shared with
 * the phone's sheet (src/components/mobile/PostAudienceSheet.tsx), so the two
 * viewports cannot drift apart. This file owns the chrome and the people row
 * and nothing else — in particular it never decides who may see a name: the
 * route sends a free owner no `users` key at all
 * (src/app/api/me/posts/[id]/viewers/route.ts).
 *
 * Rows go through <UserCard compact>, the same card /otto?tab=stats uses for
 * "Who viewed you", so the meta line and the Follow / Following ✓ button behave
 * the way they do everywhere else. `compact` because the full card carries a
 * fixed 360px banner, wider than this column.
 *
 * Chrome follows AttendeesModal further down this file: a fixed backdrop that
 * closes on click, role="dialog" + aria-modal, zIndex 1000. Escape closes it
 * too. No body scroll lock — no other modal in this file takes one, and the
 * one that did would read as the page having frozen.
 *
 * PORTALLED TO <body>, and keep it that way. The per-post card
 * (`FEED_CARD_SURFACE`) has no `backdrop-filter` today, but the old frosted
 * feed column did, and a computed backdrop-filter other than `none` makes that
 * element the containing block for fixed-position descendants — an inline
 * `position: fixed; inset: 0` then resolves against the card, not the viewport.
 * Portalling means a future blur on the card can't put this surface thousands
 * of pixels off screen again. ImageCropperModal escapes the same way
 * (src/components/ImageCropperModal.tsx). AttendeesModal is NOT a safe template
 * for that part: it mounts from an event card outside this container.
 *
 * NIGHT (S67 wave 3): the surface is COLORS.bg and the list's light tone reads
 * the C0 inks, so both flip together.
 */
function PostViewersModal({
  postId,
  onClose,
}: {
  postId: string;
  onClose: () => void;
}) {
  // Follow taps land here, keyed by user id, and are laid over the fetched row
  // on the way into <UserCard>. Kept out of the list on purpose:
  // <PostAudienceList> owns the rows it fetched, so the way a caller reacts to
  // a tap is to re-render with a different `renderRow` (same shape as the
  // phone sheet's override map).
  const [followOverrides, setFollowOverrides] = useState<
    Record<string, UserCardProps["follow_state"]>
  >({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const renderRow = useCallback(
    (user: PostAudienceUser, key: string) => (
      // The list renders rows inside its own <ul>, so a row must be an <li>.
      // Spread rather than field-by-field so a column added to UserCardData
      // reaches the card instead of being quietly dropped here; the override
      // comes after it so a just-tapped Follow wins over the fetched state.
      <li key={key} style={{ minWidth: 0 }}>
        <UserCard
          {...user}
          compact
          follow_state={followOverrides[user.id] ?? user.follow_state}
          onStateChange={(next) =>
            setFollowOverrides((prev) => ({ ...prev, [user.id]: next }))
          }
        />
      </li>
    ),
    [followOverrides],
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Who saw this"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      {/* Motion pass (Oct 18): tint fades in, the panel settles from 0.97.
          Scale only: the viewer rows (UserCard) are frosted, and a fading
          panel would switch their frost off until it reached 1. */}
      <ModalScrim tint="rgba(8,6,12,0.55)" />
      <motion.div
        onClick={(e) => e.stopPropagation()}
        {...MODAL_PANEL_ENTER}
        style={{
          // Positioned so it paints over the scrim layers once it settles.
          position: "relative",
          width: "min(520px, 92vw)",
          maxHeight: "82vh",
          overflowY: "auto",
          background: COLORS.bg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 20,
          boxShadow: "0 24px 64px rgba(28,28,30,0.28)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontWeight: 800,
              fontSize: 18,
              color: COLORS.text,
            }}
          >
            Who saw this
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "none",
              background: "transparent",
              padding: 4,
              margin: 0,
              cursor: "pointer",
              color: COLORS.faint,
              fontFamily: "DM Sans, sans-serif",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>
        <PostAudienceList
          postId={postId}
          kind="viewers"
          renderRow={renderRow}
          tone="light"
        />
      </motion.div>
    </div>,
    document.body,
  );
}

/** Shared styles for items inside the FeedRow 3-dot menu so Copy link
 *  / Report / Delete all read uniformly. */
function feedRowMenuItemStyle(
  tone?: "danger",
): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "9px 12px",
    borderRadius: 8,
    background: "transparent",
    border: "none",
    color: tone === "danger" ? "var(--error-ink)" : "var(--charcoal)",
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: 600,
    cursor: "pointer",
  };
}

function RepostMenu({
  postId,
  alreadyReposted,
  onClose,
  onDone,
}: {
  postId: string;
  alreadyReposted: boolean;
  onClose: () => void;
  onDone: (action: "added" | "removed" | "edited" | "noop") => void;
}) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  // Confirm, then paint: on a refusal the menu stays open (the quote still
  // in the box, the buttons re-enabled) and vibeRequest's toast says why.
  const submit = async (mode: "repost" | "undo") => {
    setBusy(true);
    try {
      if (mode === "undo") {
        const r = await vibeRequest(`/api/posts/${postId}/repost`, {
          method: "DELETE",
          failure: "Couldn't undo your repost.",
        });
        if (r.ok) onDone("removed");
        return;
      }
      const trimmed = comment.trim();
      const r = await vibeRequest(`/api/posts/${postId}/repost`, {
        method: "POST",
        json: trimmed ? { comment: trimmed } : {},
        failure: "Couldn't repost this.",
      });
      if (r.ok) onDone(alreadyReposted ? "edited" : "added");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      style={{
        position: "absolute",
        top: 28,
        left: 0,
        zIndex: 20,
        width: 320,
        background: "var(--paper)",
        border: "1px solid var(--hairline)",
        borderRadius: 14,
        boxShadow: "0 12px 36px rgba(28,28,30,0.14)",
        padding: 14,
        fontFamily: "DM Sans, sans-serif",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: 14,
          color: COLORS.text,
          marginBottom: 8,
        }}
      >
        {alreadyReposted ? "You reposted this" : "Repost"}
      </div>
      {!alreadyReposted ? (
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 500))}
          placeholder="Add a comment (optional) — leave blank to just repost"
          rows={3}
          style={{
            width: "100%",
            border: "1px solid rgba(var(--scrim-rgb),0.12)",
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 13,
            fontFamily: "DM Sans, sans-serif",
            resize: "vertical",
            outline: "none",
            color: COLORS.text,
          }}
        />
      ) : null}
      <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid rgba(var(--scrim-rgb),0.12)",
            background: "transparent",
            fontSize: 12,
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
            color: COLORS.faint,
          }}
        >
          Cancel
        </button>
        {alreadyReposted ? (
          <button
            type="button"
            onClick={() => submit("undo")}
            disabled={busy}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              border: "none",
              background: "#E0245E",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              cursor: busy ? "default" : "pointer",
            }}
          >
            Undo repost
          </button>
        ) : (
          <button
            type="button"
            onClick={() => submit("repost")}
            disabled={busy}
            style={{
              padding: "6px 16px",
              borderRadius: 999,
              border: "none",
              background: "#1A8754",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              cursor: busy ? "default" : "pointer",
            }}
          >
            Repost
          </button>
        )}
      </div>
    </div>
  );
}

type FeedComment = {
  id: string;
  user_id: string;
  parent_comment_id: string | null;
  content: string;
  created_at: string;
  like_count: number;
  viewer_liked: boolean;
  replies?: FeedComment[];
  /** Same story as FeedPost above: `/api/posts/[id]/comments` sends these on
   *  the author's own removed comment (optional on a deploy without the
   *  moderation migration). */
  removed_at?: string | null;
  removed_reason?: string | null;
  author: {
    id: string;
    name: string | null;
    handle: string | null;
    avatar_url: string | null;
  } | null;
};

function CommentsDrawer({
  postId,
  viewerId,
  onCommentAdded,
}: {
  postId: string;
  /** Who is reading, so a comment's ⋯ menu never offers "Report" on their own
   *  words — the route answers that with a 400 the student never sees as a
   *  sentence. Null (the feed hasn't answered yet) hides the menu entirely. */
  viewerId: string | null;
  onCommentAdded: () => void;
}) {
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await vibeRequest<{ comments?: FeedComment[] }>(
        `/api/posts/${postId}/comments`,
        { cache: "no-store", quiet: true, failure: "Couldn't load comments." },
      );
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.comments)) {
        setLoadErr(null);
        setComments(r.data.comments);
      } else {
        setLoadErr(asLoadFailure(r, "Couldn't load comments."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postId, loadKey]);

  const handleNewComment = useCallback((c: FeedComment) => {
    setComments((prev) => {
      const next = prev ? [...prev] : [];
      if (c.parent_comment_id) {
        // Append to the matching root's replies. The API resolves
        // parent_comment_id to the top-level ancestor, so a flat lookup
        // by id matches.
        return next.map((root) =>
          root.id === c.parent_comment_id
            ? { ...root, replies: [...(root.replies ?? []), c] }
            : root,
        );
      }
      return [...next, { ...c, replies: c.replies ?? [] }];
    });
    onCommentAdded();
  }, [onCommentAdded]);

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const r = await vibeRequest<{ comment?: FeedComment }>(
        `/api/posts/${postId}/comments`,
        {
          method: "POST",
          json: { content: text },
          failure: "Couldn't post your comment.",
        },
      );
      // On a refusal the draft stays in the box for a retry.
      if (r.ok && r.data.comment) {
        handleNewComment(r.data.comment);
        setDraft("");
      }
    } finally {
      setSubmitting(false);
    }
  }, [draft, postId, submitting, handleNewComment]);

  return (
    <div
      style={{
        marginTop: 10,
        borderTop: "1px solid rgba(var(--scrim-rgb),0.06)",
        paddingTop: 10,
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      {comments === null && loadErr ? (
        // No composer while the thread failed: a lone new comment would
        // read as the only one.
        <LoadFailed
          compact
          failure={loadErr}
          onRetry={() => {
            setLoadErr(null);
            setLoadKey((k) => k + 1);
          }}
        />
      ) : comments === null ? (
        <div style={{ fontSize: 12, color: COLORS.faint }}>Loading comments…</div>
      ) : (
        // The thread crossfades in over "Loading comments…" (motion pass,
        // Oct 18). Opacity only: the comment menu's click-away is fixed.
        <Reveal rise={false} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {comments.length === 0 ? (
            <div style={{ fontSize: 12, color: COLORS.faint }}>
              No comments yet — be the first.
            </div>
          ) : (
            comments.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                postId={postId}
                viewerId={viewerId}
                onReplyAdded={handleNewComment}
              />
            ))
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Write a comment…"
              style={{
                flex: 1,
                border: "1px solid rgba(var(--scrim-rgb),0.12)",
                borderRadius: 999,
                padding: "8px 14px",
                fontSize: 13,
                fontFamily: "DM Sans, sans-serif",
                outline: "none",
                color: COLORS.text,
                background: "var(--paper-70)",
              }}
            />
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !draft.trim()}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: "none",
                background: draft.trim() ? COLORS.accent : "rgba(var(--scrim-rgb),0.18)",
                color: draft.trim() ? COLORS.onAccent : "#fff",
                fontSize: 12,
                fontWeight: 700,
                cursor: submitting || !draft.trim() ? "default" : "pointer",
              }}
            >
              Post
            </button>
          </div>
        </Reveal>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  postId,
  viewerId,
  onReplyAdded,
  isReply = false,
}: {
  comment: FeedComment;
  postId: string;
  viewerId: string | null;
  onReplyAdded: (c: FeedComment) => void;
  isReply?: boolean;
}) {
  const [liked, setLiked] = useState(comment.viewer_liked);
  const [likeCount, setLikeCount] = useState(comment.like_count);
  // Bumped by the person's own like only: a refused unlike that puts the
  // heart back never pops it.
  const [likeBurst, setLikeBurst] = useState(0);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  // Report lives behind a ⋯ that only appears on someone else's comment, and
  // only once the feed has told us who the viewer is.
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const canReport = !!viewerId && comment.user_id !== viewerId;

  const name = comment.author?.name || comment.author?.handle || "Member";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  // Avatar + name open the author's profile, like the FeedRow header.
  // Plain elements when there's no handle to route to.
  const profileHref = comment.author?.handle
    ? `/profile/${encodeURIComponent(comment.author.handle)}`
    : null;
  const avatarStyle: React.CSSProperties = {
    width: isReply ? 24 : 28,
    height: isReply ? 24 : 28,
    borderRadius: 999,
    background: comment.author?.avatar_url
      ? `url(${comment.author.avatar_url}) center/cover`
      : "#1C1C1E",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "Fraunces, serif",
    fontWeight: 800,
    fontSize: isReply ? 10 : 11,
    flexShrink: 0,
    textDecoration: "none",
  };
  const nameStyle: React.CSSProperties = {
    fontFamily: "Fraunces, serif",
    fontWeight: 800,
    fontSize: isReply ? 12 : 13,
    color: COLORS.text,
    textDecoration: "none",
  };

  // Same shape as the post like above: one request at a time, and a refusal
  // restores the captured heart and count and says why in a toast.
  const likingRef = useRef(false);
  const toggleLike = useCallback(async () => {
    if (likingRef.current) return;
    likingRef.current = true;
    const next = !liked;
    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(next);
    if (next) setLikeBurst((n) => n + 1);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    const r = await vibeRequest(`/api/comments/${comment.id}/like`, {
      method: next ? "POST" : "DELETE",
      failure: next ? "Couldn't like this comment." : "Couldn't unlike this comment.",
    });
    if (!r.ok) {
      setLiked(prevLiked);
      setLikeCount(prevCount);
    }
    likingRef.current = false;
  }, [comment.id, liked, likeCount]);

  const openReply = () => {
    setReplyOpen(true);
    if (comment.author?.handle && !replyDraft) {
      setReplyDraft(`@${comment.author.handle} `);
    }
  };

  const submitReply = useCallback(async () => {
    const text = replyDraft.trim();
    if (!text || replySubmitting) return;
    setReplySubmitting(true);
    try {
      const r = await vibeRequest<{ comment?: FeedComment }>(
        `/api/posts/${postId}/comments`,
        {
          method: "POST",
          json: { content: text, parent_comment_id: comment.id },
          failure: "Couldn't post your reply.",
        },
      );
      // On a refusal the reply box stays open with its text.
      if (r.ok && r.data.comment) {
        onReplyAdded(r.data.comment);
        setReplyDraft("");
        setReplyOpen(false);
      }
    } finally {
      setReplySubmitting(false);
    }
  }, [replyDraft, postId, comment.id, replySubmitting, onReplyAdded]);

  // The thread under this comment, rendered the same whether the comment
  // itself is still there or was taken down — losing the replies along with
  // the comment would make it look to its author as though the people who
  // answered them had vanished too.
  const repliesBlock =
    comment.replies && comment.replies.length > 0 ? (
      <div
        style={{
          marginTop: 10,
          paddingLeft: 10,
          borderLeft: "2px solid rgba(var(--scrim-rgb),0.06)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {comment.replies.map((r) => (
          <CommentRow
            key={r.id}
            comment={r}
            postId={postId}
            viewerId={viewerId}
            onReplyAdded={onReplyAdded}
            isReply
          />
        ))}
      </div>
    ) : null;

  // The author's own view of a comment a moderator took down. Unreachable
  // today — `/api/posts/[id]/comments` selects an explicit column list with
  // neither `removed_at` nor `removed_reason` in it.
  if (!!viewerId && comment.user_id === viewerId && comment.removed_at) {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <RemovedContentCard
            kind="comment"
            compact
            removedAt={comment.removed_at}
            removedReason={comment.removed_reason}
          />
          {repliesBlock}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {profileHref ? (
        <Link
          href={profileHref}
          aria-label={`Open ${name}'s profile`}
          style={avatarStyle}
        >
          {!comment.author?.avatar_url ? initials : null}
        </Link>
      ) : (
        <div style={avatarStyle}>
          {!comment.author?.avatar_url ? initials : null}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "baseline",
            flexWrap: "wrap",
          }}
        >
          {profileHref ? (
            <Link href={profileHref} style={nameStyle}>
              {name}
            </Link>
          ) : (
            <span style={nameStyle}>{name}</span>
          )}
          <span style={{ fontSize: 11, color: COLORS.faint }}>
            {comment.author?.handle ? `@${comment.author.handle} · ` : ""}
            {relativeTime(comment.created_at)}
          </span>
        </div>
        <p
          style={{
            margin: "2px 0 4px 0",
            fontSize: isReply ? 12.5 : 13,
            color: COLORS.text,
            whiteSpace: "pre-wrap",
            lineHeight: 1.4,
          }}
        >
          {comment.content}
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 11,
            color: COLORS.faint,
            fontFamily: "DM Sans, sans-serif",
          }}
        >
          <button
            type="button"
            onClick={toggleLike}
            aria-label={liked ? "Unlike comment" : "Like comment"}
            aria-pressed={liked}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: liked ? "var(--coral)" : "inherit",
              font: "inherit",
            }}
          >
            <LikeBurst liked={liked} burst={likeBurst} color="var(--coral)">
              <LikeIcon filled={liked} />
            </LikeBurst>
            {likeCount > 0 ? <span>{likeCount}</span> : null}
          </button>
          <button
            type="button"
            onClick={openReply}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "inherit",
              font: "inherit",
              fontWeight: 600,
            }}
          >
            Reply
          </button>
          {canReport ? (
            <span style={{ position: "relative", marginLeft: "auto" }}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={menuOpen ? "Close comment menu" : "Open comment menu"}
                aria-expanded={menuOpen}
                style={{
                  background: "transparent",
                  border: "none",
                  // A hairline glyph needs a target around it; the negative
                  // margin keeps the row's height where it was.
                  padding: "6px 8px",
                  margin: "-6px -8px",
                  cursor: "pointer",
                  color: "inherit",
                  font: "inherit",
                  fontSize: 13,
                  lineHeight: 1,
                }}
              >
                ⋯
              </button>
              {menuOpen ? (
                <>
                  {/* Click-away: any tap outside the menu closes it. */}
                  <button
                    type="button"
                    aria-label="Dismiss menu"
                    onClick={() => setMenuOpen(false)}
                    style={{
                      position: "fixed",
                      inset: 0,
                      background: "transparent",
                      border: "none",
                      cursor: "default",
                      zIndex: 1,
                    }}
                  />
                  <span
                    role="menu"
                    style={{
                      position: "absolute",
                      top: 18,
                      right: 0,
                      zIndex: 2,
                      minWidth: 150,
                      background: "var(--paper)",
                      border: "1px solid var(--hairline)",
                      borderRadius: 10,
                      boxShadow: "0 12px 36px rgba(0,0,0,0.12)",
                      padding: 4,
                      display: "block",
                      // `feedRowMenuItemStyle` is fontSize: "inherit", and
                      // this menu hangs off the comment's action row at 11px
                      // — the post menu it was copied from inherits the
                      // card's 13. Set it here so the item reads the same
                      // size as the ⋯ that opened it.
                      fontSize: 13,
                    }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setReportOpen(true);
                      }}
                      style={feedRowMenuItemStyle("danger")}
                    >
                      Report comment
                    </button>
                  </span>
                </>
              ) : null}
            </span>
          ) : null}
        </div>
        {reportOpen ? (
          <ReportSheet
            target={{
              type: "comment",
              id: comment.id,
              authorId: comment.author?.id ?? comment.user_id,
              authorName:
                comment.author?.name ||
                (comment.author?.handle ? `@${comment.author.handle}` : null),
            }}
            onClose={() => setReportOpen(false)}
          />
        ) : null}
        {replyOpen ? (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input
              autoFocus
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value.slice(0, 1000))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitReply();
                }
                if (e.key === "Escape") {
                  setReplyOpen(false);
                  setReplyDraft("");
                }
              }}
              placeholder="Write a reply…"
              style={{
                flex: 1,
                border: "1px solid rgba(var(--scrim-rgb),0.12)",
                borderRadius: 999,
                padding: "6px 12px",
                fontSize: 12.5,
                fontFamily: "DM Sans, sans-serif",
                outline: "none",
                color: COLORS.text,
                background: "var(--paper-70)",
              }}
            />
            <button
              type="button"
              onClick={submitReply}
              disabled={replySubmitting || !replyDraft.trim()}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "none",
                background: replyDraft.trim() ? COLORS.accent : "rgba(var(--scrim-rgb),0.18)",
                color: replyDraft.trim() ? COLORS.onAccent : "#fff",
                fontSize: 11,
                fontWeight: 700,
                cursor:
                  replySubmitting || !replyDraft.trim() ? "default" : "pointer",
              }}
            >
              Post
            </button>
          </div>
        ) : null}
        {repliesBlock}
      </div>
    </div>
  );
}

// Engagement icons mirror the live post viewer (public/html/_postViewer.js).
// Stroke-only, 16×16, currentColor — match the existing visual language.
function LockIcon({
  size = 13,
  style,
}: {
  size?: number;
  style?: React.CSSProperties;
}) {
  // Hand-drawn padlock — filled body, U-shaped shackle hole. Uses currentColor
  // so it inherits text color from its container (dark in cards, white in
  // rails, etc).
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
      style={{ display: "inline-block", verticalAlign: "-2px", flexShrink: 0, ...style }}
    >
      <path
        fill="currentColor"
        d="M8 1a3 3 0 0 0-3 3v2H4.25A1.25 1.25 0 0 0 3 7.25v6.5C3 14.44 3.56 15 4.25 15h7.5c.69 0 1.25-.56 1.25-1.25v-6.5C13 6.56 12.44 6 11.75 6H11V4a3 3 0 0 0-3-3zm0 1.5A1.5 1.5 0 0 1 9.5 4v2h-3V4A1.5 1.5 0 0 1 8 2.5z"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2 3.5A.5.5 0 0 1 2.5 3h11a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5H6L2.5 14V3.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LikeIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 13.5s-5-3.2-5-7a3 3 0 0 1 5-2.2A3 3 0 0 1 13 6.5c0 3.8-5 7-5 7z"
        stroke="currentColor"
        strokeWidth="1.4"
        fill={filled ? "currentColor" : "none"}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RepostIcon() {
  // Two arrows tracing a recycle loop — matches Twitter's repost glyph.
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 6.5V11a1.5 1.5 0 0 0 1.5 1.5H10M13 9.5V5A1.5 1.5 0 0 0 11.5 3.5H6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 1.5L3 3.5L5 5.5M11 14.5L13 12.5L11 10.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill={filled ? "currentColor" : "none"}>
      <path
        d="M3.5 2h9v12L8 11l-4.5 3z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EngagementAction({
  icon,
  count,
  label,
  onClick,
  active = false,
  activeColor,
  expanded,
}: {
  icon: React.ReactNode;
  count?: number;
  label?: string;
  onClick?: () => void;
  active?: boolean;
  activeColor?: string;
  /** Set only by chips that OPEN A DIALOG rather than toggle a state on the
   *  post. When present the button announces aria-haspopup="dialog" +
   *  aria-expanded and drops aria-pressed, so assistive tech does not read it
   *  as "you liked/reposted this". */
  expanded?: boolean;
}) {
  const interactive = typeof onClick === "function";
  const color = active && activeColor ? activeColor : undefined;
  const formatted = formatEngagementCount(count);
  return (
    <button
      type="button"
      // Press feedback only where there's something to press (the read-only
      // Views chip is a disabled button).
      className={interactive ? "vibe-press" : undefined}
      onClick={onClick}
      aria-label={label}
      aria-pressed={
        interactive && expanded === undefined ? active : undefined
      }
      aria-haspopup={expanded === undefined ? undefined : "dialog"}
      aria-expanded={expanded}
      disabled={!interactive}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "transparent",
        border: "none",
        padding: 0,
        margin: 0,
        cursor: interactive ? "pointer" : "default",
        color: color ?? "inherit",
        font: "inherit",
        transition: `color 120ms ease, ${PRESS_TRANSITION}`,
      }}
    >
      {icon}
      {formatted ? <span>{formatted}</span> : null}
    </button>
  );
}

/** The owner's Views chip is a button, and `label` becomes its aria-label,
 *  which overrides the rendered number. Fold the count back in so a screen
 *  reader hears it; a 0 stays "See who saw this" (view ROWS being 0 is not
 *  proof the audience is empty — the sheet states its own number). */
function viewsLabelForOwner(count: number | undefined): string {
  const formatted = formatEngagementCount(count);
  return formatted ? `See who saw this — ${formatted} views` : "See who saw this";
}

/** Nothing for 0; otherwise the feed's one count format (compactCount, Oct
 *  19, 2026), the same one the repost line above the buttons prints. */
function formatEngagementCount(n: number | undefined): string | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return compactCount(n);
}

function SceneHeader({
  eyebrow,
  title,
  subtitle,
  tone,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  tone: Tone;
}) {
  const dark = tone === "dark";
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: dark ? "var(--eyebrow-ink)" : "#FFB89C",
          marginBottom: 6,
        }}
      >
        {eyebrow}
      </div>
      <h2
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: "clamp(22px, 2.6vw, 28px)",
          fontWeight: 900,
          color: dark ? COLORS.text : "#fff",
          letterSpacing: "-0.02em",
          margin: 0,
          lineHeight: 1.1,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 14,
          color: dark ? COLORS.muted : "rgba(255,255,255,0.7)",
          margin: "4px 0 0",
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}

export type CampusEvent = {
  id: string;
  org_id: string | null;
  creator_id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  location: string;
  going_count: number;
  interested_count: number;
  viewer_status: "going" | "maybe" | null;
  is_creator: boolean;
  viewer_can_manage: boolean;
  // Event check-in (Oct 19 2026, EventCheckinListFields): GET /api/events and
  // PATCH send them; optional so older fixtures and lists still type.
  checkin_open?: boolean;
  checked_in_count?: number | null;
  viewer_checked_in?: boolean;
  org: {
    id: string;
    handle: string;
    name: string;
    logo_url: string | null;
    verified: boolean;
  } | null;
  creator: {
    id: string;
    name: string | null;
    handle: string | null;
    avatar_url: string | null;
  } | null;
};

/** Tonight's club list once /api/events has failed: no club rows, the school
 *  rows still show. One shared [] so Tonight's memo doesn't see a new list
 *  on every render (the phone's NO_CLUB_EVENTS twin). */
const NO_TONIGHT_CLUBS: CampusEvent[] = [];

function EventsTabBody({
  highlightEventId = null,
  onHighlightDone,
}: {
  /** An event the student just tapped on the feed's rolling strip (or a
   *  /campus?tab=events&event=<id> link): scrolled to and flashed once. */
  highlightEventId?: string | null;
  /** Fired once the highlight has been handled, found or not, so the
   *  parent forgets the id and a later visit doesn't replay it. */
  onHighlightDone?: () => void;
} = {}) {
  const { label: campusLabel } = useViewerCampus();
  const view = useCampusView();
  // Bare at home; `?campus=<id>` while visiting (C5).
  const eventsUrl = view.url("/api/events?limit=50");
  // School calendars (Oct 19 2026, CONTRACT §6.3): the same campus rule as
  // events. Off Indianapolis, or with the switch off, `school.on` is false
  // and every school part below (chips, rows, cards) stays hidden.
  const school = useSchoolEvents(view.url("/api/school-events"));
  const [filter, setFilter] = useState<TonightFilter>("all");
  // "Coming up" holds school events of the next 7 campus days. A 5-minute
  // tick is plenty for that window; Tonight keeps its own minute clock.
  const weekNow = useCampusNow(300_000);
  // With no school part there's nothing to filter: everything shows.
  const shownFilter: TonightFilter = school.on ? filter : "all";
  const [events, setEvents] = useState<CampusEvent[] | null>(null);
  // First-load failure only; a failed refresh keeps the events on screen.
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  // Club cards (every event /api/events sends, tonight's included: the card
  // stays the RSVP place) and the school events after tonight, one grid,
  // by start. weekNow is 0 until the page is live in the browser, so the
  // server's first paint and hydration hold club cards only.
  const entries = useMemo(
    () =>
      mergeComingUp({
        clubs: events ?? [],
        school: school.on && weekNow ? upcomingSchool(school.events, weekNow) : [],
        sources: school.sources,
        filter: shownFilter,
      }),
    [events, school.on, school.events, school.sources, weekNow, shownFilter],
  );
  const [loadKey, setLoadKey] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [eligibleOrgs, setEligibleOrgs] = useState<EligibleOrg[]>([]);
  // Only the newest refresh lands. An officer's cancel / delete / edit bumps
  // it too (the phone's eventsSeqRef): a read already out predates the
  // change and would put the old card back.
  const eventsSeqRef = useRef(0);
  const dropEvent = useCallback((id: string) => {
    eventsSeqRef.current += 1;
    setEvents((prev) => (prev ? prev.filter((e) => e.id !== id) : prev));
  }, []);
  const swapEvent = useCallback((next: CampusEvent) => {
    eventsSeqRef.current += 1;
    setEvents((prev) => (prev ? prev.map((e) => (e.id === next.id ? next : e)) : prev));
  }, []);

  // After an RSVP or a new event. The student started it, so a refusal
  // toasts (vibeRequest's, or ours for a bad body) and the list stays put.
  const refresh = useCallback(async () => {
    const seq = ++eventsSeqRef.current;
    const r = await vibeRequest<{ events?: CampusEvent[] }>(eventsUrl, {
      cache: "no-store",
      failure: "Couldn't refresh events.",
    });
    if (seq !== eventsSeqRef.current) return;
    if (r.ok && Array.isArray(r.data.events)) {
      setLoadErr(null);
      setEvents(r.data.events);
    } else if (r.ok) {
      toast({ message: "Couldn't refresh events. Try again.", tone: "error" });
    }
  }, [eventsUrl]);

  // Events and your orgs load separately, so a failed orgs call (it only
  // decides whether "+ Create event" shows) can't blank the events list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await vibeRequest<{ events?: CampusEvent[] }>(eventsUrl, {
        cache: "no-store",
        quiet: true,
        failure: "Couldn't load events.",
      });
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.events)) {
        setLoadErr(null);
        setEvents(r.data.events);
      } else {
        setLoadErr(campusLoadFailure(r, "Couldn't load events."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventsUrl, loadKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Quiet: on a failure the create button just stays hidden.
      const r = await vibeRequest<{ orgs?: EligibleOrg[] }>("/api/orgs?filter=mine", {
        cache: "no-store",
        quiet: true,
        failure: "Couldn't load your orgs.",
      });
      if (cancelled || !r.ok || !Array.isArray(r.data.orgs)) return;
      setEligibleOrgs(
        r.data.orgs.filter((o) => (o.role === "owner" || o.role === "admin") && !!o.verified),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Away from home an event would still be made for the student's own club,
  // on their home campus, not the one on screen: the composer trap again (R5).
  const canCreate = eligibleOrgs.length > 0 && !view.isVisiting;

  // The strip named one card: once the list is in, scroll to `#event-<id>`
  // and flash a coral ring, the way the feed handles ?post=. The card is
  // dark glass, so a ring reads where a background tint would not. Reports
  // back whether or not the event is in this list (it may have scrolled
  // past the 50-event window), so the id is never left to replay.
  // Tonight's club rows call the same flash directly (they sit right above
  // the grid). Only one ring at a time: a second pick inside the 2.2 s puts
  // the first card back first, so its own ring can never be left stuck on.
  const flashRef = useRef<{ el: HTMLElement; prev: string; timer: number } | null>(null);
  const flashEvent = useCallback((id: string) => {
    const el = document.getElementById(`event-${id}`);
    if (!el) return;
    const last = flashRef.current;
    if (last) {
      window.clearTimeout(last.timer);
      last.el.style.boxShadow = last.prev;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const prev = el.style.boxShadow;
    el.style.boxShadow = "0 0 0 3px rgba(255,92,53,0.6)";
    const timer = window.setTimeout(() => {
      el.style.boxShadow = prev;
      flashRef.current = null;
    }, 2200);
    flashRef.current = { el, prev, timer };
  }, []);
  useEffect(() => {
    // Wait for everything that lands above or around the card, not just the
    // club list: the school read brings the chips, Tonight's real height (in
    // place of its skeleton) and school cards sorted in ahead of this one, and
    // weekNow is 0 until the page is live (no school cards yet). Flashing
    // earlier would centre the card and then push it off screen. A failed
    // school read still lands as "ready", so this can't wait forever.
    if (!highlightEventId || events === null || school.status === "loading" || weekNow === 0) return;
    // requestAnimationFrame so layout has settled before we measure.
    const raf = window.requestAnimationFrame(() => {
      flashEvent(highlightEventId);
      onHighlightDone?.();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [events, school.status, weekNow, highlightEventId, onHighlightDone, flashEvent]);

  return (
    <section
      style={{
        flex: 1,
        padding: "28px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        maxWidth: 1100,
        width: "100%",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <SceneHeader
          eyebrow={campusEyebrow("Events", view.isVisiting ? view.label : campusLabel)}
          title="What's coming up"
          subtitle="RSVP early — events on campus, in space, and online."
          tone="dark"
        />
        {canCreate ? (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              border: "1px solid rgba(255,92,53,0.45)",
              background:
                "linear-gradient(180deg, #FF5C35 0%, #E04918 100%)",
              color: COLORS.onAccent,
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              whiteSpace: "nowrap",
              boxShadow:
                "0 6px 18px rgba(255,92,53,0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
              letterSpacing: "0.02em",
              transition: "transform 150ms ease, box-shadow 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow =
                "0 10px 24px rgba(255,92,53,0.45), inset 0 1px 0 rgba(255,255,255,0.25)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 6px 18px rgba(255,92,53,0.35), inset 0 1px 0 rgba(255,255,255,0.18)";
            }}
          >
            + Create event
          </button>
        ) : null}
      </div>

      {/* One filter for Tonight and "Coming up" (D2). Only with the school
          part on: without it a "School" chip could only ever come up empty. */}
      {school.on ? <EventFilterChips value={filter} onChange={setFilter} /> : null}
      <QuietBoundary name="tonight-section"><TonightSection
        layout="desktop"
        school={school}
        // A failed club read leaves `events` null for good (the error card
        // below says so); Tonight takes that as "no club events" so its
        // school rows still show instead of a skeleton that never resolves.
        clubs={events ?? (loadErr ? NO_TONIGHT_CLUBS : null)}
        filter={shownFilter}
        onPickClubEvent={flashEvent}
      /></QuietBoundary>

      {events === null && loadErr ? (
        <DarkGlassCard>
          <LoadFailed
            tone="dark"
            failure={loadErr}
            onRetry={() => {
              setLoadErr(null);
              setLoadKey((k) => k + 1);
            }}
          />
        </DarkGlassCard>
      ) : events === null ? (
        <div style={{ color: COLORS.glassMuted, fontFamily: "DM Sans, sans-serif", fontSize: 14, padding: "20px 0" }}>
          Loading events…
        </div>
      ) : entries.length === 0 && shownFilter === "school" ? (
        // The chip's own card comes first, also while visiting: "No events
        // here yet." would be false when the campus has events of the other
        // kind (the phone's EventsPane checks in the same order).
        <DarkGlassCard>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 14, color: COLORS.glassMuted, lineHeight: 1.6, textAlign: "center", padding: "12px 8px" }}>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 800, fontSize: 16, color: "#fff", marginBottom: 6 }}>
              {TONIGHT_COPY.noSchoolWeek}
            </div>
            {TONIGHT_COPY.noSchoolWeekBody}
          </div>
        </DarkGlassCard>
      ) : entries.length === 0 && shownFilter === "clubs" ? (
        <DarkGlassCard>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 14, color: COLORS.glassMuted, lineHeight: 1.6, textAlign: "center", padding: "12px 8px" }}>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 800, fontSize: 16, color: "#fff", marginBottom: view.isVisiting ? 0 : 6 }}>
              {TONIGHT_COPY.noClubsComing}
            </div>
            {/* No "+ Create event" while visiting (canCreate), so no hint to it. */}
            {view.isVisiting ? null : <>Be the first to post one — hit &ldquo;+ Create event&rdquo; above.</>}
          </div>
        </DarkGlassCard>
      ) : entries.length === 0 && view.isVisiting ? (
        <DarkGlassCard>
          <div style={{ fontFamily: "Fraunces, serif", fontWeight: 800, fontSize: 16, color: "#fff", textAlign: "center", padding: "12px 8px" }}>
            {VISITING_COPY.emptyEvents}
          </div>
        </DarkGlassCard>
      ) : entries.length === 0 ? (
        <DarkGlassCard>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 14, color: COLORS.glassMuted, lineHeight: 1.6, textAlign: "center", padding: "12px 8px" }}>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 800, fontSize: 16, color: "#fff", marginBottom: 6 }}>
              No upcoming events on campus
            </div>
            Be the first to post one — hit &ldquo;+ Create event&rdquo; above.
          </div>
        </DarkGlassCard>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 14,
          }}
        >
          {/* Each card rises in once as it mounts (motion pass, Oct 18). The
              card's dialogs are portalled, so the brief rise can't box them in.
              While it fades, the card's frost can't read the page behind it
              (a fading parent cuts that off); the scene there is soft washes,
              so the frost settling in at the end doesn't read as a jump. */}
          {/* School cards (Oct 19) share the grid in start order; they carry
              no RSVP, no Report and no `event-<id>` anchor (SchoolEventCard). */}
          {entries.map((entry, i) =>
            entry.kind === "club" ? (
              <Reveal key={entry.key} delayIndex={i}>
                <EventCard
                  ev={entry.ev}
                  onMutate={refresh}
                  onRemoved={dropEvent}
                  onUpdated={swapEvent}
                />
              </Reveal>
            ) : (
              <Reveal key={entry.key} delayIndex={i}>
                <SchoolEventCard ev={entry.ev} source={entry.source} />
              </Reveal>
            ),
          )}
        </div>
      )}

      {showCreate && canCreate ? (
        <CreateEventModal
          eligibleOrgs={eligibleOrgs}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void refresh();
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * Club chat v1: the ids of the viewer's clubs, for the Going line. One read
 * of `/api/orgs?filter=mine` per page, shared by every event card (the
 * phone's Events tab and the club page render EventCard too, and neither
 * can hand it a list). A failed read is forgotten, so a later card asks
 * again; a club joined or left on this page shows after a reload.
 */
let myClubIdsRead: Promise<ReadonlySet<string> | null> | null = null;
function readMyClubIds(): Promise<ReadonlySet<string> | null> {
  if (!myClubIdsRead) {
    const read: Promise<ReadonlySet<string> | null> = vibeRequest<{
      orgs?: Array<{ id?: unknown }>;
    }>("/api/orgs?filter=mine", {
      cache: "no-store",
      quiet: true,
      failure: "Couldn't load your orgs.",
    }).then((r) => {
      if (r.ok && Array.isArray(r.data.orgs)) {
        return new Set(r.data.orgs.flatMap((o) => (typeof o?.id === "string" ? [o.id] : [])));
      }
      if (myClubIdsRead === read) myClubIdsRead = null;
      return null;
    });
    myClubIdsRead = read;
  }
  return myClubIdsRead;
}

/** Club chat v1: whether the viewer is a member of the club `orgId`; null while unknown. */
function useIsMyClub(orgId: string | null): boolean | null {
  const [clubIds, setClubIds] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (!orgId) return;
    let live = true;
    void readMyClubIds().then((ids) => {
      if (live) setClubIds(ids);
    });
    return () => {
      live = false;
    };
  }, [orgId]);
  return orgId && clubIds ? clubIds.has(orgId) : null;
}

export function EventCard({
  ev,
  onMutate,
  onRemoved,
  onUpdated,
  visiting,
}: {
  ev: CampusEvent;
  onMutate: () => void;
  /** An officer cancelled or deleted this event (S68 officer tools): the
   *  list drops it at once. Required, so every list that renders a card
   *  says how it leaves. */
  onRemoved: (id: string) => void;
  /** An officer saved an edit: the list swaps in the event PATCH answered
   *  with. Omitted (or an edit that saved but couldn't be read back) →
   *  `onMutate`, which refetches. */
  onUpdated?: (next: CampusEvent) => void;
  /** The event is on a campus that isn't the viewer's home (C5): the RSVP
   *  buttons are off, titled "RSVP works on your home campus", with "RSVP
   *  works at home" beside them, except the one holding the student's own
   *  RSVP, which stays live to take it off. Omitted → the campus page's own view decides
   *  (never visiting on the phone or the org page unless they pass it). */
  visiting?: boolean;
}) {
  const accent = colorForOrg(ev.org?.id ?? ev.creator_id);
  const [status, setStatus] = useState<"going" | "maybe" | null>(ev.viewer_status);
  const [going, setGoing] = useState(ev.going_count);
  const [interested, setInterested] = useState(ev.interested_count);
  const [busy, setBusy] = useState(false);
  // The route answered 403 `campus_visiting` (the page guessed "home"
  // wrong): the card switches to its RSVP-at-home state for good.
  const [refusedAway, setRefusedAway] = useState(false);
  const view = useCampusView();
  const rsvpAtHomeOnly = (visiting ?? view.isVisiting) || refusedAway;
  // Club chat v1: only the club's members join its event chat, so only
  // they get the Going line. Null (hidden) until the answer is known.
  const inEventClub = useIsMyClub(ev.org_id);

  const setRsvp = async (next: "going" | "maybe" | null) => {
    // Away from home only a NEW status is refused. Taking your name off
    // stays open (the route keeps DELETE ungated, S67 E3), so a student who
    // RSVP'd at home and later moved can still cancel.
    if (busy || (rsvpAtHomeOnly && next !== null)) return;
    const prev = status;
    setBusy(true);
    // Optimistic counter math
    if (prev === "going" && next !== "going") setGoing((c) => Math.max(0, c - 1));
    if (prev === "maybe" && next !== "maybe") setInterested((c) => Math.max(0, c - 1));
    if (next === "going" && prev !== "going") setGoing((c) => c + 1);
    if (next === "maybe" && prev !== "maybe") setInterested((c) => c + 1);
    setStatus(next);
    try {
      // Quiet, so the one refusal with its own words (away from home) is
      // said the card's way; every other refusal (signed out, Terms, a
      // limit, a server error) is said too, with the helper's line: a button
      // that quietly flips back told the student nothing (feature report 3,
      // #11). vibeRequest never throws.
      const r = next
        ? await vibeRequest(`/api/events/${ev.id}/rsvp`, { method: "PUT", json: { status: next }, quiet: true, failure: "Couldn't save your RSVP." })
        : await vibeRequest(`/api/events/${ev.id}/rsvp`, { method: "DELETE", quiet: true, failure: "Couldn't change your RSVP." });
      if (!r.ok) {
        if (r.status === 403 && r.code === "campus_visiting") {
          setRefusedAway(true);
          toast({ message: `${VISITING_COPY.rsvpTitle}.`, tone: "error" });
        } else {
          toast({ message: r.message, tone: "error", action: r.action });
        }
        throw new Error(`rsvp ${r.status}`);
      }
      onMutate();
      emitCalendarChanged();
    } catch (e) {
      console.error("[events] rsvp", e);
      // Roll back
      setStatus(prev);
      if (prev === "going" && next !== "going") setGoing((c) => c + 1);
      if (prev === "maybe" && next !== "maybe") setInterested((c) => c + 1);
      if (next === "going" && prev !== "going") setGoing((c) => Math.max(0, c - 1));
      if (next === "maybe" && prev !== "maybe") setInterested((c) => Math.max(0, c - 1));
    } finally {
      setBusy(false);
    }
  };

  // Spotlight tint follows the org accent (the same value driving the
  // left-stripe color), with higher alpha so the per-event tint reads
  // clearly against the dark glass surface.
  const spotlightColor = hexToRgba(accent, 0.34);

  return (
    // The anchor the rolling strip and the phone scroll to (contract C2).
    // MouseSpotlight takes no id, so the card wraps itself; the wrapper
    // carries the flash ring and clears the sticky campus header.
    <div
      id={`event-${ev.id}`}
      style={{
        // Desktop /campus (the only place that provides the view): the top
        // bar scrolls away with the page, so 32px of air is enough. Phone
        // and org page: 140 clears the phone's sticky banner + tab strip;
        // env() adds the notch on an installed phone.
        scrollMarginTop: view.provided
          ? 32
          : "calc(env(safe-area-inset-top, 0px) + 140px)",
        borderRadius: 18,
        transition: "box-shadow 600ms ease",
      }}
    >
    <MouseSpotlight
      size={240}
      color={spotlightColor}
      style={{
        ...DARK_GLASS_SURFACE,
        borderRadius: 18,
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <div style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontWeight: 800,
              fontSize: 17,
              color: "#fff",
              lineHeight: 1.25,
            }}
          >
            {ev.title}
          </div>
          {ev.org ? (
            <Link
              href={`/orgs/${ev.org.handle}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                marginTop: 4,
                fontFamily: "DM Sans, sans-serif",
                fontSize: 11,
                fontWeight: 600,
                color: COLORS.glassMuted,
                textDecoration: "none",
              }}
            >
              by {ev.org.name}
              {ev.org.verified ? <VerifiedBadge size={11} /> : null}
            </Link>
          ) : ev.creator?.handle ? (
            <div
              style={{
                marginTop: 4,
                fontFamily: "DM Sans, sans-serif",
                fontSize: 11,
                color: COLORS.glassMuted,
              }}
            >
              by @{ev.creator.handle}
            </div>
          ) : null}
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.10)",
            color: "#fff",
            fontFamily: "DM Sans, sans-serif",
            whiteSpace: "nowrap",
          }}
        >
          {going} going
        </span>
      </div>
      <div
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 13,
          color: COLORS.glassMuted,
          lineHeight: 1.7,
          marginBottom: 12,
        }}
      >
        {/* Line icons, not emoji (Oct 19, 2026): the same calendar and pin as
            the school cards beside these in "Coming up", in the card's grey. */}
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <IconCalendar size={13} />
          {formatEventTime(ev.starts_at, ev.ends_at)}
        </span>
        {ev.location ? (
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <IconPin size={13} />
            {ev.location}
          </span>
        ) : null}
      </div>
      {ev.description ? (
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12.5,
            color: "rgba(255,255,255,0.78)",
            lineHeight: 1.55,
            marginBottom: 12,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
          }}
        >
          {ev.description}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <RsvpButton
          label="Going"
          active={status === "going"}
          accent={accent}
          onClick={() => setRsvp(status === "going" ? null : "going")}
          disabled={busy}
          blockedTitle={rsvpAtHomeOnly && status !== "going" ? VISITING_COPY.rsvpTitle : undefined}
          removeHint={rsvpAtHomeOnly && status === "going" ? RSVP_REMOVE_HINT : undefined}
        />
        <RsvpButton
          label={`Interested${interested > 0 ? ` · ${interested}` : ""}`}
          active={status === "maybe"}
          accent={accent}
          onClick={() => setRsvp(status === "maybe" ? null : "maybe")}
          disabled={busy}
          blockedTitle={rsvpAtHomeOnly && status !== "maybe" ? VISITING_COPY.rsvpTitle : undefined}
          removeHint={rsvpAtHomeOnly && status === "maybe" ? RSVP_REMOVE_HINT : undefined}
        />
        {rsvpAtHomeOnly ? (
          <span
            style={{
              flexShrink: 0,
              fontFamily: "Fraunces, serif",
              fontStyle: "italic",
              fontSize: 12.5,
              color: COLORS.glassMuted,
              whiteSpace: "nowrap",
            }}
          >
            {VISITING_COPY.rsvpNote}
          </span>
        ) : null}
      </div>
      {/* A club's event, for its members only, and not where the buttons
          are off (away from home with no RSVP to take back). */}
      {ev.org_id && inEventClub === true && (!rsvpAtHomeOnly || status) ? (
        <div
          style={{
            marginTop: 8,
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            lineHeight: 1.4,
            color: COLORS.glassMuted,
          }}
        >
          {EVENT_CHAT_LINE}
        </div>
      ) : null}
      {/* Event check-in for the student (contract 4.1): its own slot, never
          the action row below, which hides from a creator who neither
          RSVP'd nor manages. Draws nothing outside the check-in window.
          BELOW the chat line, not between it and Going / Interested: that
          line is about an RSVP, and right under "You're checked in" it read
          as if checking in put the student in the event chat, which it
          doesn't (contract D12). */}
      <CheckinSlot ev={ev} />
      {(status || ev.viewer_can_manage || !ev.is_creator) ? (
        <div
          style={{
            display: "flex",
            gap: 6,
            marginTop: 8,
            flexWrap: "wrap",
          }}
        >
          {status ? (
            <a
              href={`/api/events/${ev.id}/ics`}
              download
              style={eventCardSubtleLink}
              onClick={(e) => e.stopPropagation()}
            >
              <CalendarIcon /> Add to calendar
            </a>
          ) : null}
          {ev.viewer_can_manage ? (
            <ManageAttendeesAction
              eventId={ev.id}
              eventTitle={ev.title}
            />
          ) : null}
          {/* Start / Show check-in (contract 4.1). On `viewer_can_manage`
              alone, so an org-less event's creator runs check-in too. */}
          {ev.viewer_can_manage ? <StartCheckinAction ev={ev} /> : null}
          {/* Edit / Cancel (or Delete, once it has ended) for a CURRENT
              owner / admin of the club (S68 officer tools, C5). Club events
              only: DELETE and PATCH /api/events/[id] answer 404 for a legacy
              event with no club, whose creator `viewer_can_manage` still
              names. */}
          {ev.viewer_can_manage && ev.org_id ? (
            <EventOfficerActions
              ev={ev}
              rsvpCount={rsvpNoticeCount(going, interested, status)}
              onRemoved={onRemoved}
              onUpdated={(next) => {
                if (next && onUpdated) onUpdated(next);
                else onMutate();
              }}
            />
          ) : null}
          {/* Never on an event you made: the route refuses its creator
              ("You can't report something of your own"), and every other
              surface keeps Report off your own things rather than letting
              the route say no. A club officer who didn't create it still
              gets it: they can take the event down themselves now (Cancel
              beside it), but Report is how a bad one reaches Vibe's
              moderators, whoever else runs the club. */}
          {!ev.is_creator ? <EventReportAction eventId={ev.id} /> : null}
        </div>
      ) : null}
      </div>
    </MouseSpotlight>
    </div>
  );
}

/** The live RSVP button's hint away from home (see RsvpButton `removeHint`). */
const RSVP_REMOVE_HINT = "Tap to take your name off";

/** Under Going / Interested on a club's event (club chat v1): an RSVP puts
 *  the student in the event's chat, where the people in it see their name. */
const EVENT_CHAT_LINE = "You'll appear in the event chat.";

const eventCardSubtleLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "5px 10px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.85)",
  fontFamily: "DM Sans, sans-serif",
  fontWeight: 600,
  fontSize: 11,
  textDecoration: "none",
  cursor: "pointer",
};

function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 6h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * "Report event" on an event card. ReportSheet already takes `event`; before
 * this no button sent one, and App Review / Play review look for Report on
 * every piece of content other students make. An event has no person behind it
 * to block, so the sheet offers none (`NO_BLOCK` in ReportSheet).
 *
 * EventCard renders on the desktop Events tab, the phone Events pane and club
 * pages, and doesn't know which one it's in. This asks the viewport itself —
 * the same `useIsMobile` split CampusSwitch makes — so a phone gets the bottom
 * sheet and a desktop the centered dialog. It lives in its own component so
 * only a card that shows the button subscribes to the viewport.
 */
function EventReportAction({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          ...eventCardSubtleLink,
          marginLeft: "auto",
          border: "1px solid rgba(255,255,255,0.10)",
          background: "transparent",
          color: "rgba(255,255,255,0.6)",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        Report event
      </button>
      {open ? (
        <ReportSheet
          variant={isMobile ? "sheet" : "modal"}
          target={{ type: "event", id: eventId, noun: "event" }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ManageAttendeesAction({
  eventId,
  eventTitle,
}: {
  eventId: string;
  eventTitle: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ ...eventCardSubtleLink, border: "1px solid rgba(255,180,150,0.38)", color: "#FFB89C", background: "rgba(255,140,90,0.10)" }}
      >
        Manage attendees
      </button>
      {open ? (
        <AttendeesModal
          eventId={eventId}
          eventTitle={eventTitle}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * How many people a cancel would notify, from the card's own live counts:
 * everyone RSVP'd going or maybe, minus the viewer (the route never notifies
 * the officer who cancels). Null when the counts aren't numbers.
 */
function rsvpNoticeCount(
  going: number,
  interested: number,
  viewerStatus: "going" | "maybe" | null,
): number | null {
  if (!Number.isFinite(going) || !Number.isFinite(interested)) return null;
  return Math.max(0, Math.trunc(going) + Math.trunc(interested) - (viewerStatus ? 1 : 0));
}

/** The event's end has passed (an unparseable time counts as not ended). */
function eventHasEnded(endsAt: string): boolean {
  const end = Date.parse(endsAt);
  return Number.isFinite(end) && end <= Date.now();
}

/**
 * Whether the event has ended, flipping on its own when the end passes while
 * the card is on screen (GET /api/events lists only events that haven't
 * ended, so a card can only cross over while it's open).
 */
function useEventEnded(endsAt: string): boolean {
  const [endedFor, setEndedFor] = useState<string | null>(() =>
    eventHasEnded(endsAt) ? endsAt : null,
  );
  useEffect(() => {
    const ms = Date.parse(endsAt) - Date.now();
    // setTimeout's ceiling is ~24.8 days and GET lists events up to 60 days
    // out: past the ceiling a clamped timer would flip the card to "ended"
    // early, so no timer at all (nobody keeps a card open that long).
    if (!Number.isFinite(ms) || ms > 2_000_000_000) return;
    const t = window.setTimeout(() => setEndedFor(endsAt), Math.max(0, ms));
    return () => window.clearTimeout(t);
  }, [endsAt]);
  return endedFor === endsAt;
}

/** The C5 confirm line for Cancel (upcoming) or Delete (ended). */
function eventRemoveConfirmText(title: string, ended: boolean, rsvpCount: number | null): string {
  if (ended) return `Delete ${title}? This can't be undone.`;
  const lead = `Cancel ${title}? It's removed for everyone`;
  if (rsvpCount === null) return `${lead}, and everyone who RSVP'd gets a notice.`;
  if (rsvpCount === 0) return `${lead}.`;
  if (rsvpCount === 1) return `${lead}, and the 1 person who RSVP'd gets a notice.`;
  return `${lead}, and the ${rsvpCount} people who RSVP'd get a notice.`;
}

/**
 * The toast after DELETE /api/events/[id] answered ok. The server's answer
 * decides "cancelled" over the card's clock: any notice sent (or tried) means
 * it hadn't ended.
 */
function eventRemovedToast(
  ended: boolean,
  data: { notified?: unknown; notify_failed?: unknown },
): ToastInput {
  if (data.notify_failed === true) {
    return { message: "Event cancelled, but the notices didn't send", tone: "error" };
  }
  const n =
    typeof data.notified === "number" && data.notified > 0 ? Math.trunc(data.notified) : 0;
  if (n > 0) return { message: `Event cancelled · ${n} notified`, tone: "info" };
  return { message: ended ? "Event deleted" : "Event cancelled", tone: "info" };
}

const eventCardDangerLink: React.CSSProperties = {
  ...eventCardSubtleLink,
  border: "1px solid rgba(255,138,122,0.38)",
  color: "#FFB1A8",
  background: "rgba(196,43,28,0.14)",
};

/**
 * "Edit event" and "Cancel event" on an upcoming club event, "Delete event"
 * once it has ended (S68 officer tools, C5). Rendered by EventCard for a
 * CURRENT owner / admin (`viewer_can_manage`) of the event's club, on the
 * desktop Events tab, the phone Events pane and the club page alike.
 *
 * Real buttons in the card's action row, beside "Manage attendees", rather
 * than a ⋯ menu: the card's surface clips anything that hangs out of it, and
 * two buttons need no arrow-key menu to reach. The confirm and the edit
 * dialog are portalled to <body> for the same reason (the card's tilt layer
 * would otherwise trap a fixed overlay inside it). Escape closes either one
 * and focus goes back to the button that opened it.
 *
 * Cancel and Delete are one call, DELETE /api/events/[id]: "Cancel = gone",
 * and the route itself decides whether notices go out (only before the end).
 */
function EventOfficerActions({
  ev,
  rsvpCount,
  onRemoved,
  onUpdated,
}: {
  ev: CampusEvent;
  /** People a cancel would notify (rsvpNoticeCount); null when unknown. */
  rsvpCount: number | null;
  onRemoved: (id: string) => void;
  /** The event PATCH answered with, or null to refetch. */
  onUpdated: (next: CampusEvent | null) => void;
}) {
  const ended = useEventEnded(ev.ends_at);
  // `ended` is read again at the click, so the confirm matches the moment.
  const [confirm, setConfirm] = useState<{ ended: boolean } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const editRef = useRef<HTMLButtonElement | null>(null);
  const removeRef = useRef<HTMLButtonElement | null>(null);

  const closeConfirm = useCallback(() => {
    setConfirm(null);
    removeRef.current?.focus();
  }, []);

  // Synchronous twin of `removing`: a second click before the re-render
  // would otherwise send a second DELETE (whose 404 toasts "no longer
  // available" over the success).
  const removingRef = useRef(false);

  const remove = useCallback(async () => {
    if (!confirm || removingRef.current) return;
    removingRef.current = true;
    setRemoving(true);
    const r = await vibeRequest<{ notified?: unknown; notify_failed?: unknown }>(
      `/api/events/${encodeURIComponent(ev.id)}`,
      {
        method: "DELETE",
        failure: confirm.ended ? "Couldn't delete this event." : "Couldn't cancel this event.",
      },
    );
    removingRef.current = false;
    setRemoving(false);
    setConfirm(null);
    if (!r.ok) {
      // vibeRequest has toasted why (the route's own sentence where it has
      // one, e.g. 403 `org_hidden`: "You can't change this club's events
      // right now."). Only 404 `not_found` means the event is already gone
      // (another officer got there first), so only then does it leave this
      // list; every other refusal keeps the card.
      if (r.status === 404 && r.code === "not_found") onRemoved(ev.id);
      else removeRef.current?.focus();
      return;
    }
    toast(eventRemovedToast(confirm.ended, r.data));
    onRemoved(ev.id);
    // The officer's own RSVP'd event may be on the sidebar calendar.
    emitCalendarChanged();
  }, [confirm, ev.id, onRemoved]);

  return (
    <>
      {!ended ? (
        <button
          ref={editRef}
          type="button"
          onClick={() => setEditOpen(true)}
          aria-haspopup="dialog"
          style={eventCardSubtleLink}
        >
          Edit event
        </button>
      ) : null}
      <button
        ref={removeRef}
        type="button"
        onClick={() => setConfirm({ ended: eventHasEnded(ev.ends_at) })}
        aria-haspopup="dialog"
        style={eventCardDangerLink}
      >
        {ended ? "Delete event" : "Cancel event"}
      </button>
      {confirm ? (
        <ConfirmDialog
          message={eventRemoveConfirmText(ev.title, confirm.ended, rsvpCount)}
          confirmLabel={confirm.ended ? "Delete event" : "Cancel event"}
          busyLabel={confirm.ended ? "Deleting…" : "Cancelling…"}
          cancelLabel="Keep it"
          busy={removing}
          onConfirm={() => void remove()}
          onCancel={closeConfirm}
        />
      ) : null}
      {editOpen ? (
        <CreateEventModal
          editing={ev}
          eligibleOrgs={[]}
          onClose={() => {
            setEditOpen(false);
            editRef.current?.focus();
          }}
          onSaved={(next) => {
            setEditOpen(false);
            toast({ message: "Event updated", tone: "info" });
            onUpdated(next);
            // A moved time moves the sidebar calendar's copy too.
            emitCalendarChanged();
            editRef.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

/**
 * A small "are you sure?" for the officer tools (S68, C5): the event card's
 * Cancel / Delete and the club page's Delete post. One sentence, a safe
 * button (focused first) and a destructive one.
 *
 * Portalled to <body> so no card's transform or overflow can trap it, and
 * centered with a 16px gutter so it fits a 375px phone. Escape or a tap on
 * the backdrop is "Keep it" (not while the request is out); Tab stays on the
 * two buttons. The caller puts focus back on whatever opened it.
 * Pointer moves stop here: React bubbles them through the portal to the
 * card's MouseSpotlight, which would tilt the card behind the dialog.
 * `zIndex` (default 1100) lets a dialog that sits above the phone tab bar
 * keep its confirm above itself (the attendee list, event check-in).
 */
export function ConfirmDialog({
  message,
  confirmLabel,
  busyLabel,
  cancelLabel,
  busy,
  onConfirm,
  onCancel,
  zIndex = 1100,
}: {
  message: string;
  confirmLabel: string;
  busyLabel: string;
  cancelLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  zIndex?: number;
}) {
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy) return;
      e.preventDefault();
      onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  if (typeof document === "undefined") return null;

  const buttonBase: React.CSSProperties = {
    padding: "9px 16px",
    borderRadius: 999,
    fontFamily: "DM Sans, sans-serif",
    fontWeight: 700,
    fontSize: 13,
    cursor: busy ? "default" : "pointer",
    WebkitTapHighlightColor: "transparent",
  };

  return createPortal(
    <div
      role="presentation"
      onClick={busy ? undefined : onCancel}
      onPointerMove={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      {/* Motion pass (Oct 18): the scrim's tint fades in (ModalScrim; its
          blur doesn't animate) and the dialog fades and settles from 0.97 on
          SPRING_SOFT. The fade sits on the frosted surface itself, never on a
          parent of it, so the frost reads the page from the first frame.
          Enter only. */}
      <ModalScrim tint="rgba(8,6,12,0.55)" />
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={messageId}
        {...MODAL_PANEL_ENTER_FADE}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          // Two buttons: Tab and Shift+Tab swap between them.
          const next =
            document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current;
          if (next && !next.disabled) {
            e.preventDefault();
            next.focus();
          }
        }}
        // Positioned so it paints over the scrim layers once it settles.
        style={{ ...eventModalSurface, position: "relative", maxWidth: 400, gap: 16 }}
      >
        <p
          id={messageId}
          style={{
            margin: 0,
            fontFamily: "Fraunces, serif",
            fontWeight: 700,
            fontSize: 17,
            lineHeight: 1.4,
            color: "#fff",
            overflowWrap: "anywhere",
          }}
        >
          {message}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              ...buttonBase,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "transparent",
              color: "rgba(255,255,255,0.85)",
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              ...buttonBase,
              border: "none",
              background: busy ? "rgba(255,255,255,0.18)" : "#D93A24",
              color: "#fff",
            }}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

/** One row of the officers' list (a walk-in, checked in with no RSVP, has
 *  `status: null`). The shared type, kept under its old name here. */
type Attendee = EventAttendee;

/** What the attendee list holds once a read lands. `checkin` is null when the
 *  answer carried none (then the list is the plain Going / Interested one). */
type AttendeeLists = {
  going: Attendee[];
  interested: Attendee[];
  walkIns: Attendee[];
  checkin: AttendeesCheckin | null;
};

function attendeeRows(raw: unknown): Attendee[] {
  return Array.isArray(raw) ? (raw as Attendee[]) : [];
}

function attendeesCheckinOf(raw: unknown): AttendeesCheckin | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.starts_at !== "string" || typeof c.ends_at !== "string") return null;
  const n = typeof c.count === "number" && Number.isFinite(c.count) ? Math.max(0, Math.trunc(c.count)) : 0;
  return { open: c.open === true, count: n, starts_at: c.starts_at, ends_at: c.ends_at };
}

/** No re-read of the attendee list this soon after a change made in it. */
const RECENT_CHANGE_MS = 5_000;

/**
 * The list's layer: above the phone tab bar (globals.css, z 9988) and under
 * the toasts (12000), the tier of the sheets that must cover the bar
 * (CampusBrowsePicker). It is portalled to <body>, so the club page's
 * `.vibe-tabbar-page:has([aria-modal])` rule, which sees only dialogs inside
 * its <main>, never hid the bar, and the footer (Clear check-ins, Close) sat
 * under it at phone width. Its confirms go one step above it.
 */
const ATTENDEES_Z = 10000;
const ATTENDEES_CONFIRM_Z = 10100;

/** The officers' attendee list (S68; event check-in, contract 4.2). Exported
 *  for the club page's Past events ("Who came", once the card has gone). */
export function AttendeesModal({
  eventId,
  eventTitle,
  onClose,
}: {
  eventId: string;
  eventTitle: string;
  onClose: () => void;
}) {
  const [lists, setLists] = useState<AttendeeLists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const clearingRef = useRef(false);
  const clearRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const titleId = useId();
  const subId = useId();
  // "Here" tapped where the removal can't be put back: whose, the toggle to
  // hand focus back to, and the toggle's own send.
  const [askOff, setAskOff] = useState<{ name: string; opener: HTMLButtonElement; go: () => void } | null>(null);
  const now = useCampusNow(60_000);
  // Bumped by every change made here (a mark, a removal, a clear): a read
  // that started before it would put the old rows back, so it is dropped.
  const changeSeqRef = useRef(0);
  // When the last change was made. A re-read sent in the next few seconds
  // could still beat that change's request to the database, so none is sent.
  const changedAtRef = useRef(0);
  const aliveRef = useRef(true);

  // `first`: the opening read, whose failure is said in the modal. A
  // re-read that fails keeps the rows on screen and says nothing.
  // The state is set in the answer's callback, never in the effect's own
  // turn (the opening read runs from an effect).
  const load = useCallback(
    (first: boolean) => {
      if (!first && Date.now() - changedAtRef.current < RECENT_CHANGE_MS) return;
      // A mark still on its way: this read could reach the database first
      // and bring the old row back over it (slow Wi-Fi at the door).
      if (!first && hereRequestsOut(eventId)) return;
      const seq = changeSeqRef.current;
      void vibeRequest<AttendeesResponse>(
        `/api/events/${encodeURIComponent(eventId)}/attendees`,
        { cache: "no-store", quiet: true, failure: "Could not load attendees" },
      ).then((r) => {
        if (!aliveRef.current || seq !== changeSeqRef.current) return;
        if (!r.ok) {
          if (first) {
            setError(r.message);
            setLists({ going: [], interested: [], walkIns: [], checkin: null });
          }
          return;
        }
        setLists({
          going: attendeeRows(r.data.going),
          interested: attendeeRows(r.data.interested),
          walkIns: attendeeRows(r.data.walk_ins),
          checkin: attendeesCheckinOf(r.data.checkin),
        });
      });
    },
    [eventId],
  );

  useEffect(() => {
    aliveRef.current = true;
    load(true);
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  // Focus moves into the list on open (its title, so a screen reader starts
  // at "Attendees") and back to the opener on close, when nothing else has
  // taken it by then (the club page's Past events hands it back itself).
  // The opener is kept in a ref, never re-read once inside: in dev React
  // runs this effect twice, and the second run would find the title.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && !panelRef.current?.contains(active)) {
      returnFocusRef.current = active;
    }
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      const back = returnFocusRef.current;
      const lost = document.activeElement === null || document.activeElement === document.body;
      if (lost && back?.isConnected) back.focus({ preventScroll: true });
    };
  }, []);

  // Escape closes the list, unless one of its confirms is open: Escape there
  // is that confirm's "Keep" (ConfirmDialog handles it and marks it handled).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || confirmClear || askOff) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmClear, askOff, onClose]);

  const checkin = lists?.checkin ?? null;
  // "Mark as here" runs from an hour before the start to a day after the end.
  const markNow = checkin !== null ? markPhase(checkin.starts_at, checkin.ends_at, now) : null;
  const canMark = markNow === "open";
  // Taking a check-in off works any time (D8), but sometimes nobody can put
  // it back from here: once the mark window is over (the code closed even
  // earlier), or a walk-in's (they can't be marked) while the code isn't
  // open. Then "Here" asks first (review, Oct 19; the contract had no
  // confirm), in the card's words for a closed check-in.
  const offConfirm = (name: string, a: Attendee): ConfirmOff | undefined =>
    markNow === "after" || (a.status === null && checkin?.open !== true)
      ? (opener, go) => setAskOff({ name, opener, go })
      : undefined;

  // While people can still be marked, re-read every 20 s with the tab in
  // view (a walk-in's code check-in shows up), and at once on coming back.
  useEffect(() => {
    if (!canMark) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") load(false);
    };
    const t = window.setInterval(onVisible, ATTENDEES_POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [canMark, load]);

  // A HereToggle's flip (optimistic; it flips back on a refusal). The row
  // moves between sections and the count follows it, with no re-read.
  const setHere = useCallback((userId: string, next: boolean) => {
    changeSeqRef.current += 1;
    changedAtRef.current = Date.now();
    setLists((prev) => {
      if (!prev) return prev;
      let moved = false;
      const flip = (rows: Attendee[]) =>
        rows.map((a) => {
          if (a.user.id !== userId || a.checked_in === next) return a;
          moved = true;
          return { ...a, checked_in: next };
        });
      const going = flip(prev.going);
      const interested = flip(prev.interested);
      const walkIns = flip(prev.walkIns);
      if (!moved) return prev;
      const c = prev.checkin;
      return {
        going,
        interested,
        walkIns,
        checkin: c ? { ...c, count: Math.max(0, c.count + (next ? 1 : -1)) } : c,
      };
    });
  }, []);

  const clearAll = async () => {
    if (clearingRef.current) return;
    clearingRef.current = true;
    setClearing(true);
    // Not quiet: a refusal toasts the server's own sentence.
    const r = await vibeRequest<ClearResponse>(
      `/api/events/${encodeURIComponent(eventId)}/checkin/marks`,
      { method: "DELETE", failure: CHECKIN_ERRORS.request_failed },
    );
    clearingRef.current = false;
    setClearing(false);
    setConfirmClear(false);
    if (!r.ok) {
      clearRef.current?.focus();
      return;
    }
    changeSeqRef.current += 1;
    changedAtRef.current = Date.now();
    const off = (a: Attendee): Attendee => (a.checked_in ? { ...a, checked_in: false } : a);
    // Walk-ins leave the list: with no RSVP they were only here as check-ins.
    setLists((prev) =>
      prev
        ? {
            going: prev.going.map(off),
            interested: prev.interested.map(off),
            walkIns: [],
            checkin: prev.checkin ? { ...prev.checkin, count: 0 } : null,
          }
        : prev,
    );
    // "Clear check-ins" goes with the count; Close is the next control.
    closeRef.current?.focus();
  };

  const messageOne = async (handle: string | null) => {
    if (!handle) return;
    try {
      const res = await fetch("/api/me/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      window.location.href = `/messages?channel=${data.channel_id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start chat");
    }
  };

  const messageAll = async () => {
    if (busy) return;
    // The whole Going list, checked in or not (contract 4.2).
    const recipients = (lists?.going ?? []).map((a) => a.user.id);
    if (recipients.length < 2) {
      setError("Need at least 2 attendees marked Going to start a group chat.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "group",
          name: eventTitle.slice(0, 80),
          members: recipients,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      window.location.href = `/messages?channel=${data.channel_id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create group chat");
    } finally {
      setBusy(false);
    }
  };

  const going = lists?.going ?? null;
  const interested = lists?.interested ?? null;
  const goingCount = going?.length ?? 0;
  const interestedCount = interested?.length ?? 0;
  // The check-in split once the window has opened or anyone is checked in;
  // before that, the plain Going / Interested lists of today.
  const split =
    lists !== null &&
    checkin !== null &&
    showCheckinSplit(checkinPhase(checkin.starts_at, checkin.ends_at, now), checkin.count);
  // Walk-ins taken off (or cleared) have no other section to sit in.
  const parts = lists
    ? splitAttendees({
        going: lists.going,
        interested: lists.interested,
        walk_ins: lists.walkIns.filter((a) => a.checked_in),
      })
    : null;
  const here = { eventId, canMark, onChange: setHere, offConfirm };

  // Portalled: the card that opens this (EventCard) paints on MouseSpotlight's
  // tilt layer, whose transform, backdrop filter and overflow would otherwise
  // trap this fixed overlay inside the card on a desktop pointer.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      onPointerMove={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: ATTENDEES_Z,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      {/* Motion pass (Oct 18): tint fades in, the panel (the frosted surface
          itself) fades and settles from 0.97. Enter only. */}
      <ModalScrim tint="rgba(8,6,12,0.55)" />
      {/* The dialog is the panel, not the backdrop, so its name is the
          title. Tab stays inside it; the confirms are their own dialogs
          (portalled, so their keys never count here). */}
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== "Tab" || e.defaultPrevented) return;
          const panel = panelRef.current;
          if (!panel || !(e.target instanceof Node) || !panel.contains(e.target)) return;
          const stops = Array.from(
            panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
          ).filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0);
          const first = stops[0];
          const last = stops[stops.length - 1];
          if (!first || !last) return;
          const active = document.activeElement;
          const atStart = active === first || active === panel || active === titleRef.current;
          if (e.shiftKey ? atStart : active === last) {
            e.preventDefault();
            (e.shiftKey ? last : first).focus();
          }
        }}
        {...MODAL_PANEL_ENTER_FADE}
        // Positioned so it paints over the scrim layers once it settles.
        style={{
          ...eventModalSurface,
          position: "relative",
          maxWidth: 520,
          maxHeight: "82vh",
          overflow: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            {/* Focused on open (tabIndex -1: never a Tab stop). */}
            <h2
              ref={titleRef}
              id={titleId}
              tabIndex={-1}
              style={{ margin: 0, outline: "none", fontFamily: "Fraunces, serif", fontWeight: 800, fontSize: 18, color: "#fff" }}
            >
              Attendees
            </h2>
            <div id={subId} style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
              {eventTitle}
            </div>
          </div>
          {goingCount >= 2 ? (
            <button
              type="button"
              onClick={messageAll}
              disabled={busy}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: "none",
                background: COLORS.accent,
                color: COLORS.onAccent,
                fontFamily: "DM Sans, sans-serif",
                fontWeight: 700,
                fontSize: 12,
                cursor: busy ? "default" : "pointer",
                whiteSpace: "nowrap",
                boxShadow: "0 4px 16px rgba(255,92,53,0.32)",
              }}
            >
              {busy ? "Creating…" : `Message all (${goingCount})`}
            </button>
          ) : null}
        </div>

        {error ? (
          <div
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              color: "#FFB1A8",
              background: "rgba(196,43,28,0.18)",
              padding: "6px 10px",
              borderRadius: 8,
            }}
          >
            {error}
          </div>
        ) : null}

        {split && parts ? (
          <>
            {/* Headings count the rows shown, never checkin.count: a
                restricted student's check-in is counted but not listed. */}
            <AttendeeList
              heading={`${CHECKIN_COPY.checkedInHeading} · ${parts.checkedIn.length}`}
              rows={parts.checkedIn}
              onMessage={messageOne}
              accent="#5BD18C"
              here={here}
            />
            <AttendeeList
              heading={`${CHECKIN_COPY.goingNotInHeading} · ${parts.goingNotIn.length}`}
              rows={parts.goingNotIn}
              onMessage={messageOne}
              accent="#FFB85A"
              here={here}
            />
            <AttendeeList
              heading={`${CHECKIN_COPY.interestedHeading} · ${parts.interestedNotIn.length}`}
              rows={parts.interestedNotIn}
              onMessage={messageOne}
              accent="rgba(255,255,255,0.55)"
              here={here}
            />
          </>
        ) : (
          <>
            <AttendeeList
              heading={`Going · ${goingCount}`}
              rows={going}
              onMessage={messageOne}
              accent="#5BD18C"
            />
            <AttendeeList
              heading={`Interested · ${interestedCount}`}
              rows={interested}
              onMessage={messageOne}
              accent="#FFB85A"
            />
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          {checkin && checkin.count > 0 ? (
            <button
              ref={clearRef}
              type="button"
              className="vibe-press"
              aria-haspopup="dialog"
              onClick={() => setConfirmClear(true)}
              // eventCardDangerLink at the size of Close beside it.
              style={{ ...eventCardDangerLink, minHeight: 32, boxSizing: "border-box", padding: "8px 14px", fontSize: 12 }}
            >
              {CHECKIN_COPY.clearAll}
            </button>
          ) : null}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "transparent",
              color: "rgba(255,255,255,0.78)",
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
        {/* Inside the panel, so a tap in the confirm never reaches this
            modal's backdrop (the panel stops the click). */}
        {confirmClear ? (
          <ConfirmDialog
            message={clearConfirmLine(eventTitle)}
            confirmLabel={CHECKIN_COPY.clearAll}
            busyLabel={CHECKIN_COPY.clearing}
            cancelLabel={CHECKIN_COPY.keepThem}
            busy={clearing}
            onConfirm={() => void clearAll()}
            onCancel={() => {
              setConfirmClear(false);
              clearRef.current?.focus();
            }}
            zIndex={ATTENDEES_CONFIRM_Z}
          />
        ) : null}
        {/* "Here" where the removal can't be put back. The card's words for
            a closed check-in (CHECKIN_COPY.removeConfirm), after the
            person's name. The send is the toggle's own optimistic one, so
            this closes at once and is never busy. Focus goes back to the
            toggle first, so it can pass to the next person as a mark does. */}
        {askOff ? (
          <ConfirmDialog
            message={`${askOff.name}: ${CHECKIN_COPY.removeConfirm}`}
            confirmLabel={CHECKIN_COPY.removeYes}
            busyLabel={CHECKIN_COPY.removeYes}
            cancelLabel={CHECKIN_COPY.removeKeep}
            busy={false}
            onConfirm={() => {
              const { opener, go } = askOff;
              setAskOff(null);
              opener.focus({ preventScroll: true });
              go();
            }}
            onCancel={() => {
              const { opener } = askOff;
              setAskOff(null);
              opener.focus({ preventScroll: true });
            }}
            zIndex={ATTENDEES_CONFIRM_Z}
          />
        ) : null}
      </motion.div>
    </div>,
    document.body,
  );
}

function AttendeeList({
  heading,
  rows,
  onMessage,
  accent,
  here,
}: {
  heading: string;
  rows: Attendee[] | null;
  onMessage: (handle: string | null) => void;
  accent: string;
  /** Event check-in (contract 4.2): each row gets "Mark as here" / "Here".
   *  `canMark` is the mark window; walk-ins (no RSVP) can only be taken off.
   *  `offConfirm` says, per row, when taking it off must ask first. */
  here?: {
    eventId: string;
    canMark: boolean;
    onChange: (userId: string, next: boolean) => void;
    offConfirm?: (name: string, a: Attendee) => ConfirmOff | undefined;
  };
}) {
  return (
    // `data-here-list`: one section, so a HereToggle can hand focus to the
    // next person's toggle in it when its own row moves away.
    <div data-here-list={here ? "" : undefined} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: accent,
        }}
      >
        {heading}
      </div>
      {rows === null ? (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Nobody yet.</div>
      ) : (
        rows.map((a) => {
          const name = a.user.name || a.user.handle || "Member";
          const initials = name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((s) => s[0])
            .join("")
            .toUpperCase();
          const sub = [a.user.major, a.user.year ? String(a.user.year) : null]
            .filter(Boolean)
            .join(" · ");
          return (
            <div
              key={a.user.id}
              style={{
                display: "flex",
                alignItems: "center",
                // With "Mark as here" the buttons move under the name when
                // the row is narrow (a 375 px phone): the name is how an
                // officer finds someone at the door, so it never gets
                // under 120 px (it had about 60).
                flexWrap: here ? "wrap" : undefined,
                columnGap: 10,
                rowGap: 6,
                padding: "6px 0",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  background: a.user.avatar_url
                    ? `url(${a.user.avatar_url}) center/cover`
                    : "rgba(255,255,255,0.10)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Fraunces, serif",
                  fontWeight: 800,
                  fontSize: 11,
                  flexShrink: 0,
                }}
              >
                {!a.user.avatar_url ? initials : null}
              </div>
              <div style={{ flex: "1 1 120px", minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "DM Sans, sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#fff",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {name}
                </div>
                {sub ? (
                  <div
                    style={{
                      fontFamily: "DM Sans, sans-serif",
                      fontSize: 11,
                      color: "rgba(255,255,255,0.55)",
                    }}
                  >
                    {sub}
                  </div>
                ) : null}
              </div>
              {/* One group, so on a narrow row both buttons wrap together
                  and sit at the right, where they are on a wide one. */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto", flexShrink: 0 }}>
                {here ? (
                  <HereToggle
                    eventId={here.eventId}
                    userId={a.user.id}
                    name={name}
                    checkedIn={a.checked_in}
                    canMark={here.canMark && a.status !== null}
                    onChange={(next) => here.onChange(a.user.id, next)}
                    confirmOff={here.offConfirm?.(name, a)}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => onMessage(a.user.handle)}
                  disabled={!a.user.handle}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.85)",
                    fontFamily: "DM Sans, sans-serif",
                    fontWeight: 600,
                    fontSize: 11,
                    cursor: a.user.handle ? "pointer" : "default",
                  }}
                >
                  Message
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function RsvpButton({
  label,
  active,
  accent,
  onClick,
  disabled,
  blockedTitle,
  removeHint,
}: {
  label: string;
  active: boolean;
  accent: string;
  onClick: () => void;
  disabled?: boolean;
  /** Set while RSVP can't happen here (visiting, C5): the button is off,
   *  dimmed, and says why on hover. Omitted → the button as it always was. */
  blockedTitle?: string;
  /** Away from home, on the button holding the student's own RSVP: it stays
   *  live, and a tap only takes their name off. Says so on hover and to a
   *  screen reader so it never reads as a new RSVP. */
  removeHint?: string;
}) {
  const blocked = blockedTitle !== undefined;
  const away = blocked || removeHint !== undefined;
  return (
    <button
      type="button"
      className={blocked ? undefined : "vibe-press"}
      onClick={onClick}
      disabled={disabled || blocked}
      title={blockedTitle ?? removeHint}
      aria-label={
        blocked ? `${label}. ${blockedTitle}` : removeHint ? `${label}. ${removeHint}` : undefined
      }
      style={{
        ...(blocked ? { opacity: 0.45 } : null),
        // Away, the two buttons size to their words so the italic note fits
        // beside them on a wide card and wraps under them on a narrow one.
        flex: away ? "1 1 auto" : 1,
        padding: "8px 12px",
        borderRadius: 10,
        border: active
          ? `1px solid ${accent}`
          : "1px solid rgba(255,255,255,0.20)",
        background: active
          ? `${hexToRgba(accent, 0.28)}`
          : "rgba(255,255,255,0.08)",
        color: "#fff",
        fontFamily: "DM Sans, sans-serif",
        fontWeight: 700,
        fontSize: 13,
        cursor: blocked ? "not-allowed" : disabled ? "default" : "pointer",
        boxShadow: active
          ? `inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 14px ${hexToRgba(accent, 0.28)}`
          : "inset 0 1px 0 rgba(255,255,255,0.18)",
        transition: `background 120ms ease, border-color 120ms ease, ${PRESS_TRANSITION}`,
      }}
    >
      {label}
    </button>
  );
}

function formatEventTime(startIso: string, endIso: string): string {
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const sameDay = start.toDateString() === end.toDateString();
    const dateStr = start.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const startTime = start.toLocaleTimeString([], {
      hour: "numeric",
      minute: start.getMinutes() ? "2-digit" : undefined,
    });
    const endTime = end.toLocaleTimeString([], {
      hour: "numeric",
      minute: end.getMinutes() ? "2-digit" : undefined,
    });
    if (sameDay) return `${dateStr} · ${startTime} – ${endTime}`;
    const endDate = end.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return `${dateStr} ${startTime} → ${endDate} ${endTime}`;
  } catch {
    return startIso;
  }
}

export type EligibleOrg = { id: string; name: string; handle: string; verified: boolean; role: string };

type CreateEventModalProps = {
  eligibleOrgs: EligibleOrg[];
  onClose: () => void;
} & (
  | { editing?: undefined; onCreated: () => void; onSaved?: undefined }
  | {
      /** EDIT MODE (S68 officer tools, C2/C5): prefilled from this event and
       *  saved with PATCH /api/events/[id], sending only what changed. The
       *  club can't change, so `eligibleOrgs` is unused. */
      editing: CampusEvent;
      /** The saved event as one GET /api/events item, or null when it saved
       *  but couldn't be read back (the caller refetches). */
      onSaved: (next: CampusEvent | null) => void;
      onCreated?: undefined;
    }
);

/** The inputs a refusal can point at; "times" is both date pickers. */
type EventFormField = "title" | "description" | "location" | "times";

/**
 * The line and the input for a refused create or edit. The events routes'
 * 400s carry their own sentence ("End time must be after start"), which
 * describeFailure only keeps for a few routes, so it is read here; anything
 * else is describeFailure's line. `field` comes from the word filter's
 * `field` and from the code for the length and time checks.
 */
function eventFormFailure(r: VibeFailure): { message: string; field: EventFormField | null } {
  const field: EventFormField | null =
    r.code === "content_blocked"
      ? r.field === "title" || r.field === "description" || r.field === "location"
        ? r.field
        : null
      : r.code === "invalid_times"
        ? "times"
        : r.code === "title_required" || r.code === "title_too_long"
          ? "title"
          : r.code === "description_too_long"
            ? "description"
            : r.code === "location_too_long"
              ? "location"
              : null;
  const serverLine = r.status === 400 && r.code !== "invalid_json" ? r.error?.trim() : "";
  const message = serverLine
    ? /[.!?]$/.test(serverLine)
      ? serverLine
      : `${serverLine}.`
    : r.message;
  return { message, field };
}

export function CreateEventModal(props: CreateEventModalProps) {
  const { eligibleOrgs, onClose, editing } = props;
  // Edit mode starts from the event; the pickers show it in local time.
  const [initial] = useState(() => ({
    title: editing?.title ?? "",
    description: editing?.description ?? "",
    location: editing?.location ?? "",
    startsAt: editing ? toLocalDateTimeInputValue(new Date(editing.starts_at)) : defaultStartIsoLocal(),
    endsAt: editing ? toLocalDateTimeInputValue(new Date(editing.ends_at)) : defaultEndIsoLocal(),
  }));
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [location, setLocation] = useState(initial.location);
  const [startsAt, setStartsAt] = useState(initial.startsAt);
  const [endsAt, setEndsAt] = useState(initial.endsAt);
  const [orgId, setOrgId] = useState<string>(editing?.org_id ?? eligibleOrgs[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badField, setBadField] = useState<EventFormField | null>(null);
  const errorId = useId();

  // What an edit would send: only the fields that changed. A picker compares
  // as the string it shows, so an untouched start (which may be in the past
  // for an event under way) is never re-sent and re-checked.
  const changes: Record<string, string> = {};
  if (title.trim() !== initial.title.trim()) changes.title = title.trim();
  if (description.trim() !== initial.description.trim()) changes.description = description.trim();
  if (location.trim() !== initial.location.trim()) changes.location = location.trim();
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  if (startsAt !== initial.startsAt && Number.isFinite(startMs)) {
    changes.starts_at = new Date(startMs).toISOString();
  }
  if (endsAt !== initial.endsAt && Number.isFinite(endMs)) {
    changes.ends_at = new Date(endMs).toISOString();
  }
  const dirty = !editing || Object.keys(changes).length > 0;
  const canSubmit = !busy && !!title.trim() && !!startsAt && !!endsAt && !!orgId && dirty;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setBadField(null);
    if (!orgId) {
      setError("Pick which verified org this event is for.");
      return;
    }
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      setError("Pick valid start and end times.");
      setBadField("times");
      return;
    }
    setBusy(true);
    const r = editing
      ? await vibeRequest<{ event?: CampusEvent | null }>(
          `/api/events/${encodeURIComponent(editing.id)}`,
          { method: "PATCH", json: changes, quiet: true, failure: "Couldn't save your changes." },
        )
      : await vibeRequest<{ event?: unknown }>("/api/events", {
          method: "POST",
          json: {
            title: title.trim(),
            description: description.trim(),
            location: location.trim(),
            starts_at: new Date(startMs).toISOString(),
            ends_at: new Date(endMs).toISOString(),
            org_id: orgId,
          },
          quiet: true,
          failure: "Couldn't create the event.",
        });
    setBusy(false);
    if (!r.ok) {
      const { message, field } = eventFormFailure(r);
      setError(message);
      setBadField(field);
      // Signed out, Terms, a restriction: the fix is a page, so the toast
      // carries the button the inline line can't.
      if (r.action) toast({ message: r.message, tone: "error", action: r.action });
      return;
    }
    if (props.editing) {
      const next = r.data.event;
      props.onSaved(next && typeof next === "object" ? (next as CampusEvent) : null);
    } else {
      props.onCreated();
    }
  };

  // The browser has no document on the server; the modal only ever opens
  // after a click, so this never hides a first render.
  if (typeof document === "undefined") return null;

  const fieldStyle = (f: EventFormField): React.CSSProperties =>
    badField === f ? { ...eventModalInput, border: "1px solid #FF8A7A" } : eventModalInput;
  const fieldA11y = (f: EventFormField) =>
    badField === f ? { "aria-invalid": true as const, "aria-describedby": errorId } : {};

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "Edit event" : "Create event"}
      onClick={busy ? undefined : onClose}
      // A portal still bubbles React events to the card that opened it; its
      // MouseSpotlight would tilt under the dialog.
      onPointerMove={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      {/* Motion pass (Oct 18): tint fades in, the panel (the frosted surface
          itself) fades and settles from 0.97. Enter only. */}
      <ModalScrim tint="rgba(8,6,12,0.55)" />
      <motion.div
        onClick={(e) => e.stopPropagation()}
        {...MODAL_PANEL_ENTER_FADE}
        style={{
          ...eventModalSurface,
          // Positioned so it paints over the scrim layers once it settles.
          position: "relative",
          // A phone with the keyboard up is shorter than the form: scroll
          // inside the panel rather than off the screen.
          maxHeight: "calc(100dvh - 40px)",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 20,
            color: "#fff",
          }}
        >
          {editing ? "Edit event" : "Create event"}
        </div>
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            color: "rgba(255,255,255,0.55)",
            marginTop: -6,
            marginBottom: 4,
          }}
        >
          {editing
            ? `For ${editing.org?.name ?? "your club"}. Changes show for everyone right away.`
            : "Posted on behalf of a verified org. Attendees will see your org name."}
        </div>
        <input
          autoFocus
          value={title}
          onChange={(e) => {
            setTitle(e.target.value.slice(0, 120));
            if (badField === "title") setBadField(null);
          }}
          placeholder="Event title"
          aria-label="Event title"
          style={fieldStyle("title")}
          {...fieldA11y("title")}
        />
        <textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value.slice(0, 2000));
            if (badField === "description") setBadField(null);
          }}
          placeholder="What's this about? (optional)"
          aria-label="Description"
          rows={3}
          style={{ ...fieldStyle("description"), resize: "vertical", minHeight: 70 }}
          {...fieldA11y("description")}
        />
        <input
          value={location}
          onChange={(e) => {
            setLocation(e.target.value.slice(0, 200));
            if (badField === "location") setBadField(null);
          }}
          placeholder="Location (e.g. Memorial Stadium, Zoom)"
          aria-label="Location"
          style={fieldStyle("location")}
          {...fieldA11y("location")}
        />
        {/* `auto-fit, minmax(220px, 1fr)` lets the two date pickers sit
            side-by-side when the modal is wide enough, and collapse to
            a single column at narrow viewports so the calendar icons
            never get squeezed past the field edge. `min-width: 0` on
            each input lets the grid track actually shrink — without it
            the native datetime-local refuses to go below its
            content-width and overflows. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          <label style={eventModalLabel}>
            Starts
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => {
                setStartsAt(e.target.value);
                if (badField === "times") setBadField(null);
              }}
              style={{ ...fieldStyle("times"), minWidth: 0 }}
              {...fieldA11y("times")}
            />
          </label>
          <label style={eventModalLabel}>
            Ends
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => {
                setEndsAt(e.target.value);
                if (badField === "times") setBadField(null);
              }}
              style={{ ...fieldStyle("times"), minWidth: 0 }}
              {...fieldA11y("times")}
            />
          </label>
        </div>
        {/* The club can't change on an edit (the route answers 400
            `org_cannot_change`), so edit mode names it in the line above
            instead of offering a picker. */}
        {!editing ? (
          <label style={eventModalLabel}>
            Posting on behalf of
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              style={eventModalInput}
            >
              {eligibleOrgs.map((o) => (
                <option key={o.id} value={o.id} style={{ color: "var(--charcoal)" }}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {error ? (
          <div
            id={errorId}
            role="alert"
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              color: "#FFB1A8",
              background: "rgba(196,43,28,0.18)",
              padding: "6px 10px",
              borderRadius: 8,
            }}
          >
            {error}
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "transparent",
              color: "rgba(255,255,255,0.78)",
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 600,
              fontSize: 12,
              cursor: busy ? "default" : "pointer",
            }}
          >
            {/* Not "Cancel" on an edit: beside an event that has a "Cancel
                event" button, it would read as that. */}
            {editing ? "Close" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            style={{
              padding: "8px 18px",
              borderRadius: 999,
              border: "none",
              background: canSubmit ? COLORS.accent : "rgba(255,255,255,0.18)",
              color: canSubmit ? COLORS.onAccent : "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 700,
              fontSize: 12,
              cursor: canSubmit ? "pointer" : "default",
              boxShadow: canSubmit ? "0 4px 16px rgba(255,92,53,0.32)" : "none",
            }}
          >
            {editing
              ? busy
                ? "Saving…"
                : "Save changes"
              : busy
                ? "Creating…"
                : "Create event"}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

// Dark-glass surface that matches the Events scene (midnight backdrop) so
// the modal feels like a panel inside the scene rather than a popup from
// nowhere. Mirrors the OttoPanel + GlassCard treatment used elsewhere.
const eventModalSurface: React.CSSProperties = {
  width: "100%",
  // Bumped from 480 → 560 because the two datetime-local inputs need
  // ~220px each (date + time + calendar icon) and were getting visually
  // cramped against the 480 cap. Keeps the panel comfortable but still
  // modal-sized on desktop; flex/grid below handles narrower viewports.
  maxWidth: 560,
  background:
    "linear-gradient(180deg, rgba(46,42,90,0.72) 0%, rgba(20,18,42,0.78) 100%)",
  backdropFilter: "blur(32px) saturate(180%)",
  WebkitBackdropFilter: "blur(32px) saturate(180%)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 20,
  padding: 22,
  boxShadow: [
    "inset 0 1px 0 rgba(255,255,255,0.18)",
    "inset 0 -1px 0 rgba(0,0,0,0.18)",
    "0 24px 80px rgba(0,0,0,0.5)",
  ].join(", "),
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const eventModalInput: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 10,
  padding: "9px 12px",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14,
  outline: "none",
  color: "#fff",
  background: "rgba(255,255,255,0.06)",
  width: "100%",
  boxSizing: "border-box",
  colorScheme: "dark",
};

const eventModalLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontFamily: "DM Sans, sans-serif",
  fontSize: 11,
  fontWeight: 600,
  color: "rgba(255,255,255,0.55)",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

function defaultStartIsoLocal(): string {
  // Default: tomorrow at 6pm local. Returns a value the
  // <input type="datetime-local"> control accepts.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(18, 0, 0, 0);
  return toLocalDateTimeInputValue(d);
}

function defaultEndIsoLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return toLocalDateTimeInputValue(d);
}

function toLocalDateTimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

type DiscoverOrg = {
  id: string;
  handle: string;
  name: string;
  description: string;
  logo_url: string | null;
  banner_url?: string | null;
  backdrop_preset: BackdropKey;
  verified: boolean;
  dormant: boolean;
  /** Null when the count couldn't be read: never shown as "0 members" (C27). */
  member_count: number | null;
  role?: Role | null;
  /** Null only on a row built from `/api/me/org-invites`, which doesn't carry it. */
  join_policy: JoinPolicy | null;
  audience: OrgAudience;
  join_state: JoinState;
  join_reason?: "policy" | "visiting" | null;
  pending_invite?: { id: string; expires_at: string; invited_by_name: string | null } | null;
  org_follow_state?: "following" | "not_following";
  /** Typed only. Never rendered on a student surface (C13, no vanity metrics). */
  follower_count?: number | null;
  links?: Array<{ label: string; url: string }>;
  philanthropy?: string;
};

type DiscoverFilter = "all" | "following" | "open" | "request" | "invite";

/** One row of `/api/me/org-invites`. `logo_url` is the RAW stored key. */
type MeInvite = {
  id: string;
  created_at: string;
  expires_at: string;
  org: {
    id: string;
    handle: string;
    name: string | null;
    logo_url: string | null;
    verified: boolean;
    audience: OrgAudience;
  };
  invited_by: { name: string } | null;
};

/**
 * The latest standing the server confirmed for one club, from a tap on its
 * control. It wins over row data for the life of the tab. `approx` marks a
 * declined invite: the control can only guess what the club offers next.
 * `at` is the tab's request count at the decline; the guess stands until the
 * lists answer requests sent after it (`settledGuesses`).
 */
type OrgOverride = {
  state: JoinState;
  following: boolean;
  role: Role | null;
  approx?: true;
  at?: number;
};

/** The request count each list's rows answer (0 before its first answer). */
type AnsweredAt = { discover: number; following: number; invites: number };

/** How many followed clubs "Yours" shows before "See all clubs you follow →". */
const YOURS_PREVIEW = 6;

/**
 * The declined clubs whose guess is done, so their rows speak for the join
 * state again. Every loaded list that carries the club must answer a request
 * sent after the decline: a stale row would say "Invited you" again. And one
 * list must carry it: a club only the old inbox knew keeps its guess, unless a
 * fresh inbox lists it again (a new invite).
 */
function settledGuesses(
  overrides: Record<string, OrgOverride>,
  discover: ReadonlyArray<{ id: string }> | null,
  following: ReadonlyArray<{ id: string }> | null,
  invites: ReadonlyArray<{ org: { id: string } }> | null,
  answeredAt: AnsweredAt,
): Set<string> {
  const settled = new Set<string>();
  for (const [id, ov] of Object.entries(overrides)) {
    if (!ov.approx) continue;
    const at = ov.at ?? 0;
    const inDiscover = discover?.some((o) => o.id === id) ?? false;
    const inFollowing = following?.some((o) => o.id === id) ?? false;
    if (inDiscover && answeredAt.discover <= at) continue;
    if (inFollowing && answeredAt.following <= at) continue;
    const reinvited = answeredAt.invites > at && (invites?.some((i) => i.org.id === id) ?? false);
    if (inDiscover || inFollowing || reinvited) settled.add(id);
  }
  return settled;
}

/**
 * Clubs a tap here just joined that the following list doesn't carry yet.
 * They sit at the top of "Yours" (newest first) instead of under Verified
 * until that reload lands, or for the tab's life if it fails.
 */
function joinedRowsFrom(
  overrides: Record<string, OrgOverride>,
  invites: MeInvite[] | null,
  results: DiscoverOrg[] | null,
  followingRows: DiscoverOrg[] | null,
): DiscoverOrg[] {
  const rows: DiscoverOrg[] = [];
  for (const [id, ov] of Object.entries(overrides).reverse()) {
    if (ov.approx || ov.state !== "member") continue;
    if (followingRows?.some((o) => o.id === id)) continue;
    const inv = invites?.find((i) => i.org.id === id);
    const row = results?.find((o) => o.id === id) ?? (inv ? orgFromInvite(inv) : null);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * A card for an invite whose club no loaded list carries. The logo goes
 * through the asset proxy HERE only: the proxy isn't idempotent, and list
 * rows arrive already proxied.
 */
function orgFromInvite(inv: MeInvite): DiscoverOrg {
  return {
    id: inv.org.id,
    handle: inv.org.handle,
    name: inv.org.name ?? inv.org.handle,
    description: "",
    logo_url: orgAssetProxyUrl(inv.org.handle, inv.org.logo_url, "logo"),
    banner_url: null,
    backdrop_preset: DEFAULT_BACKDROP,
    verified: inv.org.verified,
    dormant: false,
    member_count: null,
    role: null,
    join_policy: null,
    audience: inv.org.audience,
    join_state: "invited",
    join_reason: null,
    pending_invite: {
      id: inv.id,
      expires_at: inv.expires_at,
      invited_by_name: inv.invited_by?.name ?? null,
    },
    // A club they already follow self-corrects: the follow POST answers `already`.
    org_follow_state: "not_following",
  };
}

function OrgsTabBody({ onCreateOrg }: { onCreateOrg: () => void }) {
  const { label: campusLabel } = useViewerCampus();
  // Discover follows the campus on screen (C5); the following list and the
  // invite inbox are the student's own and stay put.
  const view = useCampusView();
  const shownLabel = view.isVisiting ? view.label : campusLabel;
  const [results, setResults] = useState<DiscoverOrg[] | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filter, setFilter] = useState<DiscoverFilter>("all");
  const [showDormant, setShowDormant] = useState(false);
  // The club as tapped. Each render re-reads it from the lists by id, so the
  // quick view repaints when a refetch answers after a tap inside it.
  const [previewOrg, setPreviewOrg] = useState<DiscoverOrg | null>(null);
  // First-load failure only; once orgs are shown a failed refetch keeps them.
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const loadedRef = useRef(false);
  // What a tap on a club's control confirmed, by org id.
  const [overrides, setOverrides] = useState<Record<string, OrgOverride>>({});
  // "Yours" and the Following chip: every club they follow, joined ones included.
  const [followingOrgs, setFollowingOrgs] = useState<DiscoverOrg[] | null>(null);
  const [followingHasMore, setFollowingHasMore] = useState(false);
  // A first-load failure, with the query it was for and the `sideKey` of its
  // request. A later key means a reload is on its way, so it shows as loading.
  const [followingErr, setFollowingErr] = useState<{
    failure: LoadFailure;
    q: string;
    key: number;
  } | null>(null);
  // The query `followingOrgs` answers. Rows for another query aren't shown.
  const [followingListQ, setFollowingListQ] = useState<string | null>(null);
  // The same query, for the effect: null until the first list lands.
  const followingLoadedRef = useRef<string | null>(null);
  const [invites, setInvites] = useState<MeInvite[] | null>(null);
  const [invitesErr, setInvitesErr] = useState<{ failure: LoadFailure; key: number } | null>(null);
  const invitesLoadedRef = useRef(false);
  // Bumped to reload the following list and the invite inbox.
  const [sideKey, setSideKey] = useState(0);
  // Counts requests and declines, so a decline's guess knows which answers
  // came after it. Each list records the count its rows answer.
  const seqRef = useRef(0);
  const [answeredAt, setAnsweredAt] = useState<AnsweredAt>({ discover: 0, following: 0, invites: 0 });

  // Debounce the search input → debouncedQ. The fetch effect below depends
  // on debouncedQ, so it only refires after the user pauses typing.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput.trim()), 220);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Built outside the effect so the effect keys on the finished string: it
  // re-reads when the query, the dormant toggle or the campus on screen
  // changes, and never when home's own id arrives (the string stays bare).
  const discoverUrl = (() => {
    const params = new URLSearchParams({ filter: "discover" });
    if (debouncedQ) params.set("q", debouncedQ);
    if (showDormant) params.set("include_dormant", "true");
    return view.url(`/api/orgs?${params.toString()}`);
  })();

  useEffect(() => {
    let cancelled = false;
    const seq = ++seqRef.current;
    (async () => {
      // Quiet even for a refetch: a query typed since owns the list, so any
      // toast waits for the cancelled check below.
      const r = await vibeRequest<{ orgs?: DiscoverOrg[] }>(discoverUrl, {
        cache: "no-store",
        quiet: true,
        failure: "Couldn't load orgs.",
      });
      if (cancelled) return;
      if (!r.ok || !Array.isArray(r.data.orgs)) {
        const failure = campusLoadFailure(r, "Couldn't load orgs.");
        // Nothing shown yet: the failure takes the list's place. After a
        // new query or the dormant toggle, the results stay and it toasts.
        if (!loadedRef.current) setLoadErr(failure);
        else toast({ message: failure.message, tone: "error", action: failure.action });
        return;
      }
      const orgs = r.data.orgs;
      loadedRef.current = true;
      setLoadErr(null);
      setResults(orgs);
      setAnsweredAt((a) => ({ ...a, discover: seq }));
    })();
    return () => {
      cancelled = true;
    };
  }, [discoverUrl, loadKey]);

  // The following list takes the query only under the Following chip. "Yours"
  // shows only with no query, so typing under All doesn't refetch it.
  const followingQ = filter === "following" ? debouncedQ : "";

  useEffect(() => {
    let cancelled = false;
    const seq = ++seqRef.current;
    const key = sideKey;
    (async () => {
      const q = followingQ;
      const r = await vibeRequest<{ orgs?: DiscoverOrg[]; has_more?: boolean }>(
        `/api/orgs?${new URLSearchParams(q ? { filter: "following", q } : { filter: "following" })}`,
        { cache: "no-store", quiet: true, failure: "Couldn't load the clubs you follow." },
      );
      if (cancelled) return;
      if (!r.ok || !Array.isArray(r.data.orgs)) {
        const failure = asLoadFailure(r, "Couldn't load the clubs you follow.");
        // No list for this query yet: the failure takes its place. Otherwise
        // the rows stay and it toasts. A ref, not state, so the deps stay put.
        if (followingLoadedRef.current !== q) setFollowingErr({ failure, q, key });
        else toast({ message: failure.message, tone: "error", action: failure.action });
        return;
      }
      followingLoadedRef.current = q;
      setFollowingErr(null);
      // Newest follow first, member clubs included. Never re-sorted.
      setFollowingOrgs(r.data.orgs);
      setFollowingHasMore(r.data.has_more === true);
      setFollowingListQ(q);
      setAnsweredAt((a) => ({ ...a, following: seq }));
    })();
    return () => {
      cancelled = true;
    };
  }, [followingQ, sideKey]);

  useEffect(() => {
    let cancelled = false;
    const seq = ++seqRef.current;
    const key = sideKey;
    (async () => {
      const r = await vibeRequest<{ invites?: MeInvite[] }>("/api/me/org-invites", {
        cache: "no-store",
        quiet: true,
        failure: "Couldn't load your invites.",
      });
      if (cancelled) return;
      if (!r.ok || !Array.isArray(r.data.invites)) {
        const failure = asLoadFailure(r, "Couldn't load your invites.");
        if (!invitesLoadedRef.current) setInvitesErr({ failure, key });
        else toast({ message: failure.message, tone: "error", action: failure.action });
        return;
      }
      invitesLoadedRef.current = true;
      setInvitesErr(null);
      setInvites(r.data.invites);
      setAnsweredAt((a) => ({ ...a, invites: seq }));
    })();
    return () => {
      cancelled = true;
    };
  }, [sideKey]);

  const settled = useMemo(
    () => settledGuesses(overrides, results, followingOrgs, invites, answeredAt),
    [overrides, results, followingOrgs, invites, answeredAt],
  );

  // One relation per club, for its card and its quick view alike. An override
  // is the latest answer the server confirmed, so it wins over row data. A
  // decline's settled guess hands the join state back to the row; the tab's
  // own follow answer still stands.
  const relationOf = useCallback(
    (o: DiscoverOrg): OrgRelation => {
      const ov = overrides[o.id];
      const standing = ov && !(ov.approx && settled.has(o.id)) ? ov : null;
      const state = standing?.state ?? o.join_state;
      const role = standing ? standing.role : (o.role ?? null);
      // Members follow automatically.
      const following =
        state === "member" || role != null || (ov ? ov.following : o.org_follow_state === "following");
      return {
        handle: o.handle,
        orgName: o.name,
        state,
        following,
        role,
        reason: o.join_reason ?? null,
        audience: o.audience,
        joinPolicy: o.join_policy,
      };
    },
    [overrides, settled],
  );

  // OrgJoinControl owns every toast; this only records what changed and
  // reloads the lists a membership change moves the club between.
  const handleChange = (org: DiscoverOrg, prev: OrgRelation, next: OrgControlChange) => {
    const state = next.state;
    if (state === "signed_out") return;
    if (next.declined) {
      // The control can't know what the club offers after a decline, so the
      // reloads below replace this guess once they all answer.
      const at = ++seqRef.current;
      setOverrides((p) => ({
        ...p,
        [org.id]: { state, following: next.following, role: next.role, approx: true, at },
      }));
      setLoadKey((k) => k + 1);
      setSideKey((k) => k + 1);
      return;
    }
    const guessStands = !settled.has(org.id);
    setOverrides((p) => {
      const old = p[org.id];
      // A follow tap on a declined club whose guess still stands keeps it a
      // guess, so the lists can still replace its join state.
      const guess =
        old?.approx && state === prev.state && guessStands ? { approx: true as const, at: old.at } : {};
      return { ...p, [org.id]: { state, following: next.following, role: next.role, ...guess } };
    });
    // Join, request or accept: the inbox drops the invite and "Yours" gains
    // the club. A follow or unfollow reloads nothing, so the card stays put.
    if (state !== prev.state) setSideKey((k) => k + 1);
  };

  // Choosing Following reloads that list, so it's fresh. Tapping it again doesn't.
  const selectFilter = (f: DiscoverFilter) => {
    if (f === "following" && filter !== "following") setSideKey((k) => k + 1);
    setFilter(f);
  };

  // A retry keeps the failure until its answer: the group shows loading in
  // the meantime, and the rest of the tab stays on screen.
  const retryFollowing = () => setSideKey((k) => k + 1);
  const retryInvites = () => setSideKey((k) => k + 1);

  // "You're invited" and "Yours" are home things: away from home they'd sit
  // above the visited campus's clubs and hide its "No clubs here yet."
  const showSide = filter === "all" && !debouncedQ && !view.isVisiting;
  const followingRows = followingOrgs !== null && followingListQ === followingQ ? followingOrgs : null;
  // A failure only speaks while there is no list for its query on screen.
  const followingFailed =
    followingRows === null && followingErr !== null && followingErr.q === followingQ
      ? followingErr.failure
      : null;
  // A newer request for the failed list is on its way.
  const followingRetrying = followingFailed !== null && followingErr?.key !== sideKey;
  const invitesRetrying = invitesErr !== null && invitesErr.key !== sideKey;
  // Where both lists carry a club, the one that answered later speaks for it.
  const loadedRows =
    answeredAt.following > answeredAt.discover
      ? [...(followingRows ?? []), ...(results ?? [])]
      : [...(results ?? []), ...(followingRows ?? [])];
  const invitedRows = invitedRowsFrom(invites, loadedRows, relationOf);
  const invitedIds = new Set(invitedRows.map((o) => o.id));
  const yoursRows = [
    ...joinedRowsFrom(overrides, invites, results, followingRows),
    ...(followingRows ?? []),
  ].filter((o) => !invitedIds.has(o.id));
  const shownIds = new Set([...invitedIds, ...yoursRows.map((o) => o.id)]);
  // The policy chips narrow by `join_policy`, never by the legacy public flag.
  const splitRows = (results ?? []).filter((o) => {
    if (filter === "open" || filter === "request" || filter === "invite") {
      return o.join_policy === filter;
    }
    return !(showSide && shownIds.has(o.id));
  });
  const previewLive = previewOrg
    ? (invitedRows.find((o) => o.id === previewOrg.id) ??
      followingRows?.find((o) => o.id === previewOrg.id) ??
      results?.find((o) => o.id === previewOrg.id) ??
      previewOrg)
    : null;

  const loadingLine = (
    <div
      style={{
        color: COLORS.glassMuted,
        fontFamily: "DM Sans, sans-serif",
        fontSize: 14,
      }}
    >
      Loading orgs…
    </div>
  );
  const emptyCard = (text: string) => (
    <DarkGlassCard>
      <div style={{ color: "#fff", fontFamily: "DM Sans, sans-serif", fontSize: 14 }}>{text}</div>
    </DarkGlassCard>
  );
  const groupProps = { relationOf, onChange: handleChange, onPreview: setPreviewOrg };

  return (
    <section
      style={{
        flex: 1,
        padding: "28px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        maxWidth: 1100,
        width: "100%",
      }}
    >
      <SceneHeader
        eyebrow={campusEyebrow("Organizations", shownLabel)}
        title="Find your communities"
        subtitle="Follow any club to get its posts. Join to get its chats."
        tone="dark"
      />

      {/* A club is made on the student's home campus, not the one on
          screen, so the banner waits for home (the composer trap, R5). */}
      {view.isVisiting ? null : <CreateOrgBanner onClick={onCreateOrg} />}

      <DiscoverSearchBar value={searchInput} onChange={setSearchInput} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <DiscoverFilterChips value={filter} onChange={selectFilter} />
        <button
          type="button"
          onClick={() => setShowDormant((v) => !v)}
          aria-pressed={showDormant}
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px 6px 6px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.14)",
            background: showDormant
              ? "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 100%), rgba(20,16,28,0.78)"
              : "rgba(20,16,28,0.78)",
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
            color: "#fff",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            fontWeight: showDormant ? 700 : 500,
            cursor: "pointer",
            boxShadow: showDormant
              ? "inset 0 1px 0 rgba(255,255,255,0.22)"
              : "inset 0 1px 0 rgba(255,255,255,0.06)",
            transition: "all 160ms ease",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 22,
              height: 14,
              borderRadius: 999,
              padding: 1,
              background: showDormant
                ? "rgba(255,255,255,0.45)"
                : "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.16)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: showDormant ? "flex-end" : "flex-start",
              transition: "background 160ms ease, justify-content 160ms ease",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "#fff",
                boxShadow: "0 1px 2px rgba(0,0,0,0.35)",
                transition: "transform 160ms ease",
              }}
            />
          </span>
          Show dormant
        </button>
      </div>

      {filter === "following" ? (
        followingFailed && !followingRetrying ? (
          <DarkGlassCard>
            <LoadFailed tone="dark" failure={followingFailed} onRetry={retryFollowing} />
          </DarkGlassCard>
        ) : followingRows === null ? (
          loadingLine
        ) : followingRows.length === 0 ? (
          emptyCard(
            debouncedQ ? `No clubs you follow match “${debouncedQ}”.` : "You don't follow any clubs yet.",
          )
        ) : (
          <DiscoverGroup
            title="Following"
            hint="Every club you follow, including the ones you joined."
            orgs={followingRows}
            {...groupProps}
            footer={
              followingHasMore ? (
                <div
                  style={{
                    marginTop: 10,
                    fontFamily: "DM Sans, sans-serif",
                    fontSize: 12,
                    color: "rgba(var(--scrim-rgb),0.55)",
                  }}
                >
                  Showing the 100 clubs you followed most recently.
                </div>
              ) : null
            }
          />
        )
      ) : results === null && loadErr ? (
        <DarkGlassCard>
          <LoadFailed
            tone="dark"
            failure={loadErr}
            onRetry={() => {
              setLoadErr(null);
              setLoadKey((k) => k + 1);
            }}
          />
        </DarkGlassCard>
      ) : results === null ||
        // With the side groups on, wait for both side lists' first answer too:
        // a followed club must not paint under Verified and then jump to "Yours".
        (showSide &&
          ((followingRows === null && !followingFailed) || (invites === null && !invitesErr))) ? (
        loadingLine
      ) : (
        (() => {
          const verifiedOrgs = splitRows.filter((o) => o.verified);
          const communityOrgs = splitRows.filter((o) => !o.verified && !o.dormant);
          const dormantOrgs = splitRows.filter((o) => o.dormant);
          const showInvited = showSide && (invitedRows.length > 0 || !!invitesErr);
          const showYours = showSide && (yoursRows.length > 0 || !!followingFailed);
          if (
            !showInvited &&
            !showYours &&
            verifiedOrgs.length === 0 &&
            communityOrgs.length === 0 &&
            dormantOrgs.length === 0
          ) {
            return emptyCard(
              debouncedQ
                ? `No clubs match “${debouncedQ}”.`
                : filter === "open"
                  ? "No open clubs here yet."
                  : filter === "request"
                    ? "No clubs here take requests yet."
                    : filter === "invite"
                      ? "No invite-only clubs here yet."
                      : view.isVisiting
                        ? VISITING_COPY.emptyClubs
                        : "No orgs to discover yet — be the first to create one.",
            );
          }
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {showInvited ? (
                <DiscoverGroup
                  title="You're invited"
                  hint="Accept to become a member and get the chats."
                  orgs={invitedRows}
                  {...groupProps}
                  error={
                    invitesErr && !invitesRetrying ? { failure: invitesErr.failure, onRetry: retryInvites } : null
                  }
                  loading={invitesRetrying}
                  titleStyle={{ color: COLORS.accentInk }}
                />
              ) : null}
              {showYours ? (
                <DiscoverGroup
                  title="Yours"
                  hint="Clubs you follow or belong to."
                  orgs={yoursRows.slice(0, YOURS_PREVIEW)}
                  count={yoursRows.length}
                  {...groupProps}
                  error={
                    followingFailed && !followingRetrying
                      ? { failure: followingFailed, onRetry: retryFollowing }
                      : null
                  }
                  loading={followingRetrying}
                  footer={
                    followingRows !== null && (yoursRows.length > YOURS_PREVIEW || followingHasMore) ? (
                      <button
                        type="button"
                        onClick={() => selectFilter("following")}
                        style={{
                          marginTop: 10,
                          padding: "6px 0",
                          border: "none",
                          background: "none",
                          color: "var(--eyebrow-ink)",
                          fontFamily: "DM Sans, sans-serif",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        See all clubs you follow →
                      </button>
                    ) : null
                  }
                />
              ) : null}
              {verifiedOrgs.length > 0 ? (
                <DiscoverGroup
                  title="Verified"
                  hint={
                    shownLabel
                      ? `Clubs verified by Vibe at ${shownLabel}.`
                      : "Clubs verified by Vibe."
                  }
                  orgs={verifiedOrgs}
                  {...groupProps}
                  // Gold gradient — matches the verified ✓ badge palette.
                  titleStyle={{
                    background:
                      "linear-gradient(180deg, #F5C24A 0%, #C99526 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                />
              ) : null}
              {communityOrgs.length > 0 ? (
                <DiscoverGroup
                  title="Student communities"
                  hint="Groups created by people on Vibe. Anyone can follow them."
                  orgs={communityOrgs}
                  {...groupProps}
                  titleStyle={{ color: COLORS.accentInk }}
                />
              ) : null}
              {dormantOrgs.length > 0 ? (
                <DiscoverGroup
                  title="Dormant"
                  hint="No activity in the last 60 days. Verified orgs are never listed here."
                  orgs={dormantOrgs}
                  {...groupProps}
                />
              ) : null}
            </div>
          );
        })()
      )}

      {previewLive ? (
        <OrgQuickViewModal
          org={previewLive}
          relation={relationOf(previewLive)}
          onClose={() => setPreviewOrg(null)}
          // The modal stays open after a change and repaints from the override.
          onChange={(prev, next) => handleChange(previewLive, prev, next)}
        />
      ) : null}
    </section>
  );
}

/**
 * The "You're invited" rows: the inbox's invites in its order, each on the
 * loaded row for its club when a list carries one (else a row built from the
 * invite), then any other loaded row that says invited. Only rows whose
 * relation still says invited stay, so an accepted card leaves at once.
 * `loaded` is the discover and following rows, the fresher list first.
 */
function invitedRowsFrom(
  invites: MeInvite[] | null,
  loaded: DiscoverOrg[],
  relationOf: (o: DiscoverOrg) => OrgRelation,
): DiscoverOrg[] {
  const rows: DiscoverOrg[] = [];
  const seen = new Set<string>();
  for (const inv of invites ?? []) {
    if (seen.has(inv.org.id)) continue;
    seen.add(inv.org.id);
    const row = loaded.find((o) => o.id === inv.org.id);
    rows.push(
      row
        ? {
            ...row,
            pending_invite: row.pending_invite ?? {
              id: inv.id,
              expires_at: inv.expires_at,
              invited_by_name: inv.invited_by?.name ?? null,
            },
          }
        : orgFromInvite(inv),
    );
  }
  // The first loaded row for a club decides, so a second, older copy of it
  // can't put it back in the group.
  for (const o of loaded) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    if (relationOf(o).state === "invited") rows.push(o);
  }
  return rows.filter((o) => relationOf(o).state === "invited");
}

function OrgQuickViewModal({
  org,
  relation,
  onClose,
  onChange,
}: {
  org: DiscoverOrg;
  /** The same relation the club's card renders, so both show one state. */
  relation: OrgRelation;
  onClose: () => void;
  onChange: (prev: OrgRelation, next: OrgControlChange) => void;
}) {
  const orgColor = colorForOrg(org.id);
  const view = orgRowView(relation, "card");
  const inviteLine = discoverInviteLine(org, relation);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      {/* Motion pass (Oct 18): tint fades in, the panel settles from 0.97.
          Scale only: the banner's close button is frosted, and a fading
          panel would switch that frost off until it reached 1. */}
      <ModalScrim tint="rgba(8,4,16,0.62)" />
      <motion.div
        onClick={(e) => e.stopPropagation()}
        {...MODAL_PANEL_ENTER}
        style={{
          ...GLASS_SURFACE,
          // Positioned so it paints over the scrim layers once it settles.
          position: "relative",
          width: "min(560px, 100%)",
          maxHeight: "min(86vh, 720px)",
          borderRadius: 20,
          overflow: "hidden",
          color: "#fff",
          fontFamily: "DM Sans, sans-serif",
          background:
            "linear-gradient(180deg, rgba(40,20,50,0.92) 0%, rgba(20,10,30,0.92) 100%)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Banner */}
        <div
          style={{
            height: 140,
            position: "relative",
            background: org.banner_url
              ? `url(${org.banner_url}) center/cover`
              : `linear-gradient(135deg, ${hexToRgba(orgColor, 0.85)} 0%, ${hexToRgba(orgColor, 0.45)} 100%)`,
            flexShrink: 0,
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.6) 100%)",
            }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              width: 28,
              height: 28,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(0,0,0,0.45)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            padding: "0 20px 20px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Logo sits below the banner, with a small gap. */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 12,
              marginTop: 14,
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 18,
                background: org.logo_url
                  ? `url(${org.logo_url}) center/cover`
                  : `radial-gradient(120% 120% at 30% 20%, ${hexToRgba(orgColor, 0.95)} 0%, ${hexToRgba(orgColor, 0.6)} 100%)`,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "Fraunces, serif",
                fontWeight: 900,
                fontSize: 24,
                border: "1px solid rgba(255,255,255,0.18)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.32), 0 8px 24px rgba(0,0,0,0.45)",
                flexShrink: 0,
              }}
            >
              {!org.logo_url ? initialsForOrg(org.name) : null}
            </div>
            <div style={{ paddingBottom: 6, flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontFamily: "Fraunces, serif",
                    fontWeight: 900,
                    fontSize: 22,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {org.name}
                </span>
                {org.verified ? <VerifiedBadge size={14} /> : null}
                {view.chip ? <DiscoverChip label={view.chip} /> : null}
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  color: COLORS.glassMuted,
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                {discoverMetaLine(org, relation, view.meta)}
              </div>
            </div>
          </div>

          {/* Description */}
          {org.description ? (
            <p
              style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.55,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              {org.description}
            </p>
          ) : (
            <p
              style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.55,
                color: "rgba(255,255,255,0.45)",
                fontStyle: "italic",
              }}
            >
              No description yet.
            </p>
          )}

          {/* Philanthropy snippet */}
          {org.philanthropy ? (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: COLORS.glassMuted,
                  marginBottom: 4,
                }}
              >
                Philanthropy
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "rgba(255,255,255,0.85)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {org.philanthropy}
              </p>
            </div>
          ) : null}

          {/* Links */}
          {org.links && org.links.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {org.links.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    color: "#fff",
                    textDecoration: "none",
                    fontSize: 12,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {l.label}
                  <span style={{ opacity: 0.5 }}>↗</span>
                </a>
              ))}
            </div>
          ) : null}

          {inviteLine ? (
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                lineHeight: 1.4,
                color: COLORS.glassMuted,
              }}
            >
              {inviteLine}
            </div>
          ) : null}

          {/* CTAs */}
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginTop: inviteLine ? 0 : 6,
            }}
          >
            {/* The modal content already stops click propagation. */}
            <div
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              style={{ flex: "1 1 auto", minWidth: 0 }}
            >
              <OrgJoinControl
                relation={relation}
                variant="card"
                source="discover"
                pendingInviteId={org.pending_invite?.id ?? null}
                onChange={(next) => onChange(relation, next)}
              />
            </div>
            <Link
              href={`/orgs/${org.handle}`}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                fontFamily: "DM Sans, sans-serif",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Open profile →
            </Link>
          </div>
          {view.disclosure ? (
            <div style={{ fontSize: 12, lineHeight: 1.4, color: COLORS.glassMuted }}>
              {view.disclosure}
            </div>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}

function CreateOrgBanner({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...DARK_GLASS_SURFACE,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 18px",
        borderRadius: 14,
        textAlign: "left",
        cursor: "pointer",
        color: "#fff",
        fontFamily: "DM Sans, sans-serif",
        // Orange wash on top of the dark base — the gradient is the
        // signal, the dark glass keeps it readable on cream.
        background:
          "linear-gradient(180deg, rgba(255,92,53,0.55) 0%, rgba(255,92,53,0.18) 100%), " +
          "linear-gradient(180deg, rgba(20,16,28,0.78) 0%, rgba(14,11,22,0.82) 100%)",
        border: "1px solid rgba(255,180,150,0.55)",
        width: "100%",
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          background:
            "linear-gradient(135deg, rgba(255,92,53,0.95) 0%, rgba(255,140,90,0.85) 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          fontWeight: 300,
          color: COLORS.onAccent,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.32)",
          flexShrink: 0,
        }}
      >
        +
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 15,
            color: "#fff",
            letterSpacing: "-0.01em",
          }}
        >
          Start your own org
        </div>
        <div
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.78)",
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          CS Majors, intramural team, study group — anything goes. Default
          channels and admin tools come baked in.
        </div>
      </div>
      <span
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.85)",
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        Create →
      </span>
    </button>
  );
}

function DiscoverGroup({
  title,
  hint,
  orgs,
  count,
  relationOf,
  onChange,
  onPreview,
  error,
  loading = false,
  footer,
  titleStyle,
}: {
  title: string;
  hint: string;
  orgs: DiscoverOrg[];
  /** The badge number when the grid shows only some of the group. */
  count?: number;
  relationOf: (o: DiscoverOrg) => OrgRelation;
  onChange: (o: DiscoverOrg, prev: OrgRelation, next: OrgControlChange) => void;
  onPreview: (o: DiscoverOrg) => void;
  /** The group's own list failed: shown between the header and any cards. */
  error?: { failure: LoadFailure; onRetry: () => void } | null;
  /** A retry of the group's failed list is on its way: shown in the error's place. */
  loading?: boolean;
  footer?: React.ReactNode;
  titleStyle?: React.CSSProperties;
}) {
  // A failed or reloading list with nothing to show has no honest number.
  const badge = (error || loading) && orgs.length === 0 ? null : (count ?? orgs.length);
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 18,
            color: "var(--charcoal)",
            letterSpacing: "-0.01em",
            ...titleStyle,
          }}
        >
          {title}
          {badge !== null ? (
            <span
              style={{
                marginLeft: 8,
                fontSize: 13,
                fontWeight: 500,
                color: "rgba(var(--scrim-rgb),0.55)",
                // Reset any inherited gradient from the title.
                background: "none",
                WebkitBackgroundClip: "border-box",
                WebkitTextFillColor: "rgba(var(--scrim-rgb),0.55)",
              }}
            >
              {badge}
            </span>
          ) : null}
        </div>
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            color: "rgba(var(--scrim-rgb),0.55)",
          }}
        >
          {hint}
        </div>
      </div>
      {error ? (
        // Dark glass under the dark-tone box, so it reads on the cream page.
        <div
          style={{
            ...DARK_GLASS_SURFACE,
            borderRadius: 12,
            marginBottom: orgs.length > 0 ? 10 : 0,
          }}
        >
          <LoadFailed tone="dark" compact failure={error.failure} onRetry={error.onRetry} />
        </div>
      ) : loading ? (
        <div
          role="status"
          style={{
            marginBottom: orgs.length > 0 ? 10 : 0,
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            color: "rgba(var(--scrim-rgb),0.55)",
          }}
        >
          Loading…
        </div>
      ) : null}
      {orgs.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 14,
          }}
        >
          {orgs.map((o) => (
            <DiscoverCard
              key={o.id}
              org={o}
              relation={relationOf(o)}
              onChange={(prev, next) => onChange(o, prev, next)}
              onPreview={() => onPreview(o)}
            />
          ))}
        </div>
      ) : null}
      {footer}
    </div>
  );
}

function DiscoverSearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        ...DARK_GLASS_SURFACE,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 14,
      }}
    >
      <SearchIcon />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by name or handle…"
        aria-label="Search organizations"
        style={{
          flex: 1,
          border: "none",
          background: "transparent",
          color: "#fff",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 14,
          outline: "none",
        }}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          style={{
            border: "none",
            background: "rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.7)",
            width: 22,
            height: 22,
            borderRadius: 999,
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function DiscoverFilterChips({
  value,
  onChange,
}: {
  value: DiscoverFilter;
  onChange: (f: DiscoverFilter) => void;
}) {
  const opts: { key: DiscoverFilter; label: React.ReactNode }[] = [
    { key: "all", label: "All" },
    { key: "following", label: "Following" },
    { key: "open", label: policyChip("open") },
    {
      key: "request",
      label: (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <LockIcon size={11} /> {policyChip("request")}
        </span>
      ),
    },
    {
      key: "invite",
      label: (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <LockIcon size={11} /> {policyChip("invite")}
        </span>
      ),
    },
  ];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {opts.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.key)}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              border: on
                ? "1px solid rgba(255,180,150,0.55)"
                : "1px solid rgba(255,255,255,0.14)",
              background: on
                ? "linear-gradient(180deg, rgba(255,92,53,0.55) 0%, rgba(255,92,53,0.22) 100%), rgba(20,16,28,0.78)"
                : "rgba(20,16,28,0.78)",
              backdropFilter: "blur(20px) saturate(160%)",
              WebkitBackdropFilter: "blur(20px) saturate(160%)",
              color: "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              fontWeight: on ? 700 : 500,
              cursor: "pointer",
              boxShadow: on
                ? "inset 0 1px 0 rgba(255,255,255,0.22)"
                : "inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function DiscoverCard({
  org,
  relation,
  onChange,
  onPreview,
}: {
  org: DiscoverOrg;
  relation: OrgRelation;
  onChange: (prev: OrgRelation, next: OrgControlChange) => void;
  onPreview: () => void;
}) {
  const [hover, setHover] = useState(false);
  const orgColor = colorForOrg(org.id);
  const view = orgRowView(relation, "card");
  const inviteLine = discoverInviteLine(org, relation);
  // Visiting puts the other university's clubs on screen (R2). The card's
  // control already drops Join for them (Follow only); say why in Join's
  // place, "Purdue students only", instead of leaving a gap.
  const { isVisiting } = useCampusView();
  const audienceNote =
    isVisiting && relation.state === "audience_blocked"
      ? relation.audience === "purdue"
        ? ORG_COPY.buttons.purdueStudentsOnly
        : ORG_COPY.buttons.iuStudentsOnly
      : null;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onPreview}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        // The card's own keys only. Enter or Space on an inner control must
        // stay that control's tap, not open the preview.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPreview();
        }
      }}
      style={{
        ...DARK_GLASS_SURFACE,
        padding: 16,
        borderRadius: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hover
          ? [
              "inset 0 1px 0 rgba(255,255,255,0.10)",
              `0 12px 32px ${hexToRgba(orgColor, 0.35)}`,
            ].join(", ")
          : "inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 32px rgba(20,8,40,0.20)",
        transition: "transform 180ms ease, box-shadow 180ms ease",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: org.logo_url
              ? `url(${org.logo_url}) center/cover`
              : `radial-gradient(120% 120% at 30% 20%, ${hexToRgba(orgColor, 0.95)} 0%, ${hexToRgba(orgColor, 0.65)} 100%)`,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 15,
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.32)",
            flexShrink: 0,
          }}
        >
          {!org.logo_url ? initialsForOrg(org.name) : null}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontFamily: "Fraunces, serif",
                fontWeight: 800,
                fontSize: 16,
                color: "#fff",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
            >
              {org.name}
            </span>
            {org.verified ? <VerifiedBadge size={13} /> : null}
            {org.dormant ? (
              <span
                style={{
                  display: "inline-flex",
                  padding: "1px 6px",
                  borderRadius: 999,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#FFD0CC",
                  background: "rgba(232,77,77,0.18)",
                  border: "1px solid rgba(232,77,77,0.35)",
                  flexShrink: 0,
                }}
              >
                dormant
              </span>
            ) : null}
            {view.chip ? <DiscoverChip label={view.chip} /> : null}
          </div>
          <div
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              color: COLORS.glassMuted,
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            {discoverMetaLine(org, relation, view.meta, { opacity: 0.75 })}
          </div>
          {inviteLine ? (
            <div
              style={{
                marginTop: 2,
                fontFamily: "DM Sans, sans-serif",
                fontSize: 12,
                lineHeight: 1.4,
                color: COLORS.glassMuted,
              }}
            >
              {inviteLine}
            </div>
          ) : null}
        </div>
      </div>

      {org.description ? (
        <p
          style={{
            margin: 0,
            color: "rgba(255,255,255,0.78)",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            lineHeight: 1.5,
            // Clamp to two lines so cards stay even-height in the grid.
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {org.description}
        </p>
      ) : (
        <p
          style={{
            margin: 0,
            color: "rgba(255,255,255,0.4)",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            fontStyle: "italic",
          }}
        >
          No description yet.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          style={{ flex: "1 1 auto", minWidth: 0 }}
        >
          <OrgJoinControl
            relation={relation}
            variant="card"
            source="discover"
            pendingInviteId={org.pending_invite?.id ?? null}
            onChange={(next) => onChange(relation, next)}
          />
        </div>
        {audienceNote ? (
          <span
            title={fillCopy(
              relation.audience === "purdue"
                ? ORG_COPY.notices.audiencePurdue
                : ORG_COPY.notices.audienceIu,
              { org: org.name },
            )}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "9px 12px",
              borderRadius: 10,
              border: "1px dashed rgba(255,255,255,0.2)",
              color: "rgba(255,255,255,0.62)",
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 600,
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
          >
            {audienceNote}
          </span>
        ) : null}
        <Link
          href={`/orgs/${org.handle}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: "9px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.85)",
            fontFamily: "DM Sans, sans-serif",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          Profile
        </Link>
      </div>
      {view.disclosure ? (
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            lineHeight: 1.4,
            color: COLORS.glassMuted,
          }}
        >
          {view.disclosure}
        </div>
      ) : null}
    </div>
  );
}

/** The name-line pill for `orgRowView`'s chip ("Invited you" on cards), styled like the dormant pill. */
function DiscoverChip({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "1px 6px",
        borderRadius: 999,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "#FFD9CC",
        background: "rgba(255,92,53,0.18)",
        border: "1px solid rgba(255,92,53,0.4)",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

/**
 * A discover card's meta line, shared with the quick view: @handle, then the
 * policy / requested / audience / hidden labels, the member count when it
 * could be read, and the viewer's role, with a dot only between parts that
 * are there. No follower count on a student surface (C13).
 */
function discoverMetaLine(
  org: DiscoverOrg,
  relation: OrgRelation,
  meta: readonly string[],
  handleStyle?: React.CSSProperties,
): React.ReactNode[] {
  const parts: Array<{ key: string; node: React.ReactNode }> = [
    { key: "handle", node: <span style={handleStyle}>@{org.handle}</span> },
  ];
  for (const label of meta) {
    const locked = label === policyChip("request") || label === policyChip("invite");
    parts.push({
      key: `meta-${label}`,
      node: locked ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <LockIcon size={10} /> {label}
        </span>
      ) : (
        <span>{label}</span>
      ),
    });
  }
  const members = memberCountText(org.member_count);
  if (members) parts.push({ key: "members", node: <span>{members}</span> });
  if (relation.role) parts.push({ key: "role", node: <RoleChip role={relation.role} /> });
  return parts.map((part, i) => (
    <Fragment key={part.key}>
      {i > 0 ? <span style={{ opacity: 0.4 }}>·</span> : null}
      {part.node}
    </Fragment>
  ));
}

/** "Invited by Franky · Expires Oct 16", while the invite is still open. */
function discoverInviteLine(org: DiscoverOrg, relation: OrgRelation): string | null {
  if (relation.state !== "invited" || !org.pending_invite) return null;
  return inviteSubText(org.pending_invite.invited_by_name, org.pending_invite.expires_at);
}

function SearchIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      aria-hidden
      style={{ flexShrink: 0, color: "rgba(255,255,255,0.55)" }}
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        d="M7 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zm4-1.5 3 3"
      />
    </svg>
  );
}

type MapMajor = { name: string; total: number; connected: number; mutuals: number };
type MapOrg = {
  id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
  is_public: boolean;
  /** Null when hidden (below 5 for someone outside the club) or unread. */
  member_count: number | null;
};
type MapSummary = {
  ok: boolean;
  // Set by the server when users.school is empty; majors/orgs are [] in that case.
  reason?: "no_school";
  // The campus the map is for; schoolForMajorIn groups majors only on a
  // campus with a school taxonomy (Indianapolis), everything else is "Other".
  campus_id?: string | null;
  you: { id: string; name: string | null; handle: string | null; major: string | null; avatar_url: string | null };
  majors: MapMajor[];
  orgs: MapOrg[];
};
type ZoneSelection =
  | { kind: "major"; key: string; label: string }
  | { kind: "org"; key: string; label: string };

// IU schools the campus map groups majors into. Each school becomes its
// own "neighborhood" on the map: a soft colored halo at a fixed angle
// around "you are here", with that school's majors clustered inside.
// `angle` is in degrees (0 = right, 90 = down per screen coords) and
// `r` is the distance from center for the region anchor — chosen so
// the six anchors spread evenly without colliding.
//
// Taxonomy + lookup live in src/lib/iu/majors.ts so the profile editor
// uses the same source of truth (a user picking "Computer Science"
// there will always land in the Luddy halo here).
//
// Indianapolis is one campus for IU and Purdue students, so the map draws
// both universities' schools: every halo, label and legend reads this list.
const HALO_SCHOOLS = [...IU_SCHOOLS, ...PURDUE_INDIANAPOLIS_SCHOOLS];

// Bubble size scaling — clear min/max, modest range so a tiny major
// doesn't disappear and a huge one doesn't dwarf the rest.
const BUBBLE_MIN_RADIUS = 36;
const BUBBLE_MAX_RADIUS = 66;
function bubbleRadiusFor(total: number): number {
  return BUBBLE_MIN_RADIUS + Math.min(BUBBLE_MAX_RADIUS - BUBBLE_MIN_RADIUS, total * 0.4);
}

// (MAJOR_TO_SCHOOL + schoolForMajor moved to src/lib/iu/majors.ts —
// imported below.)

export function MapTabBody() {
  // A map open for the use totals (src/lib/usage/touch.ts): this body is
  // drawn only while the Map tab is the one on screen.
  useEffect(() => {
    countOpen("map");
  }, []);
  // The viewer's university decides which taxonomy wins for a major both
  // Indianapolis universities teach (schoolForMajorIn).
  const { label: homeLabel, system: viewerSystem } = useViewerCampus();
  // The map follows the campus on screen (C5). CampusHome hides this tab
  // while visiting a campus that isn't open (R3), so away from home this is
  // only ever an open campus's map.
  const view = useCampusView();
  const campusLabel = view.isVisiting ? view.label : homeLabel;
  const mapUrl = view.url("/api/campus-map");
  const [data, setData] = useState<MapSummary | null>(null);
  // Set when the map fails to load; data stays null, never a fake summary.
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [selected, setSelected] = useState<ZoneSelection | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  // No demo fallback: an empty campus renders the honest empty states below.
  const [orgCollapsed, setOrgCollapsed] = useState(false);
  // Search-to-jump state. `searchQuery` drives a small filtered
  // dropdown over the map; clicking a result smoothly pans + zooms to
  // that bubble.
  const [searchQuery, setSearchQuery] = useState("");
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);

  // Picking a zone auto-collapses the org rail since its panel sits
  // on top of the canvas. User can re-expand from the collapsed pill.
  const pickZone = useCallback((sel: ZoneSelection) => {
    setSelected(sel);
    setOrgCollapsed(true);
  }, []);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await vibeRequest<MapSummary>(mapUrl, {
        cache: "no-store",
        quiet: true,
        failure: "Couldn't load the map.",
      });
      if (cancelled) return;
      // Every 2xx carries `majors` (empty for no_school), so a body without
      // it is a failure, not an empty campus.
      if (r.ok && Array.isArray(r.data.majors)) {
        setLoadErr(null);
        setData(r.data);
      } else {
        setLoadErr(campusLoadFailure(r, "Couldn't load the map."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapUrl, loadKey]);

  // School-grouped, ADAPTIVELY SPACED layout.
  //
  // Every major buckets into its IU school. Active schools (those with
  // at least one bubble) are distributed evenly around the center. The
  // anchor distance is *computed per layout pass* from how big each
  // school's cluster actually is — never hard-coded — so when more
  // majors show up the regions automatically fan out without colliding,
  // and when few are present they stay tight.
  //
  // Algorithm:
  //   1. Bucket majors by school.
  //   2. Estimate each school's cluster radius from the actual bubble
  //      sizes it contains.
  //   3. Distribute active schools evenly around 360° (in HALO_SCHOOLS
  //      order so thematic neighbors stay near each other).
  //   4. For each consecutive school pair, the anchor distance r must
  //      satisfy `2 r sin(wedge/2) ≥ clusterA + clusterB + padding`.
  //      Take the worst-case across all neighbor pairs → one shared
  //      anchor r that keeps every region clear of every other.
  //   5. Place each major in a fan inside its school's wedge.
  //   6. Standard collision relaxation + per-node tether to its school
  //      anchor so regions don't dissolve.
  const layout = useMemo(() => {
    if (!data || !data.majors) return null;
    type Pos = { x: number; y: number; r: number; schoolId: string };
    type SchoolPlacement = {
      id: string;
      angleDeg: number; // anchor angle in degrees
      anchorR: number;  // anchor distance from origin
      ax: number;       // anchor x
      ay: number;       // anchor y (with the 0.7 elliptical squash applied)
      clusterR: number; // approximate cluster radius for this school
    };
    const positions = new Map<string, Pos>();
    const placements = new Map<string, SchoolPlacement>();

    const grouped = new Map<string, MapMajor[]>();
    for (const m of data.majors) {
      const school = schoolForMajorIn(data.campus_id ?? null, viewerSystem, m.name);
      const list = grouped.get(school.id) ?? [];
      list.push(m);
      grouped.set(school.id, list);
    }

    // Active schools, preserving HALO_SCHOOLS order.
    const active = HALO_SCHOOLS.filter((s) => grouped.has(s.id));
    if (active.length === 0) {
      return { majors: positions, schools: placements };
    }

    // Cluster radius estimate: area sum of bubbles, take the radius of a
    // circle of the same area, then multiply by a packing factor so the
    // cluster has some breathing room within itself. Capped at a sane
    // max so a runaway-popular school doesn't push everyone to the edge.
    const clusterRadiusOf = (majors: MapMajor[]): number => {
      let area = 0;
      for (const m of majors) {
        const br = bubbleRadiusFor(m.total);
        area += Math.PI * br * br;
      }
      const packed = Math.sqrt(area / Math.PI) * 1.55 + 30;
      return Math.min(packed, 260);
    };

    // Step 3: even angle wedges, one per active school.
    const wedgeDeg = 360 / active.length;
    const wedgeRad = (wedgeDeg * Math.PI) / 180;

    // Step 4: solve for the shared anchor distance.
    const PAD_BETWEEN_REGIONS = 28;
    const YOU_KEEPOUT = 110;
    const clusterRadii: number[] = active.map((s) =>
      clusterRadiusOf(grouped.get(s.id)!),
    );
    const maxClusterR = clusterRadii.reduce((a, b) => Math.max(a, b), 0);
    // Floor: cluster shouldn't overlap "you are here" in the middle.
    let anchorR = YOU_KEEPOUT + maxClusterR;
    // Ceiling-from-below: every neighbor pair must fit.
    const sinHalf = Math.sin(wedgeRad / 2);
    if (sinHalf > 0.0001) {
      for (let i = 0; i < active.length; i++) {
        const next = (i + 1) % active.length;
        const needed =
          (clusterRadii[i]! + clusterRadii[next]! + PAD_BETWEEN_REGIONS) /
          (2 * sinHalf);
        if (needed > anchorR) anchorR = needed;
      }
    }

    // Step 5: place each school + its majors.
    active.forEach((school, i) => {
      const angleDeg = i * wedgeDeg + wedgeDeg / 2 - 90; // start at top
      const angleRad = (angleDeg * Math.PI) / 180;
      const ax = Math.cos(angleRad) * anchorR;
      // Squash y by 0.7 so the map reads as a wider-than-tall stage,
      // matches the existing ContourBackdrop aspect.
      const ay = Math.sin(angleRad) * anchorR * 0.7;
      const clusterR = clusterRadii[i]!;
      placements.set(school.id, {
        id: school.id,
        angleDeg,
        anchorR,
        ax,
        ay,
        clusterR,
      });

      const majors = grouped.get(school.id)!;
      const fanRange = Math.min(90, 18 + majors.length * 12);
      majors.forEach((m, j) => {
        const seed = hashString(m.name);
        const t =
          majors.length === 1 ? 0 : j / (majors.length - 1) - 0.5;
        const localAngle =
          angleRad +
          ((t * fanRange) * Math.PI) / 180 +
          (((seed % 11) - 5) * Math.PI) / 220;
        const localDist = 50 + ((seed >> 4) % 28);
        const cx = ax + Math.cos(localAngle) * localDist;
        const cy = ay + Math.sin(localAngle) * localDist * 0.7;
        const radius = bubbleRadiusFor(m.total);
        positions.set(m.name, { x: cx, y: cy, r: radius, schoolId: school.id });
      });
    });

    // Step 6: relaxation — same collision avoidance + tether back to
    // each node's school anchor so regions hold their shape.
    const NODE_PADDING = 14;
    const TETHER = 0.05;
    const entries = Array.from(positions.entries());
    for (let iter = 0; iter < 80; iter++) {
      let moved = false;
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i]![1];
          const b = entries[j]![1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const minDist = a.r + b.r + NODE_PADDING;
          if (dist < minDist) {
            const push = (minDist - dist) / 2;
            const ux = dx / dist;
            const uy = dy / dist;
            a.x -= ux * push;
            a.y -= uy * push;
            b.x += ux * push;
            b.y += uy * push;
            moved = true;
          }
        }
      }
      // Tether each node back toward its school anchor.
      for (const [, node] of entries) {
        const p = placements.get(node.schoolId);
        if (!p) continue;
        node.x += (p.ax - node.x) * TETHER;
        node.y += (p.ay - node.y) * TETHER;
      }
      // Center keep-out so zones don't smother "you are here".
      for (const [, node] of entries) {
        const d = Math.sqrt(node.x * node.x + node.y * node.y) || 0.01;
        const minD = node.r + YOU_KEEPOUT;
        if (d < minD) {
          const push = minD - d;
          const ux = node.x / d;
          const uy = node.y / d;
          node.x += ux * push;
          node.y += uy * push;
          moved = true;
        }
      }
      if (!moved) break;
    }

    return { majors: positions, schools: placements };
  }, [data, viewerSystem]);

  // Jump to a major bubble: pan so the bubble's cluster coordinate
  // lands at the viewport center, zoom in for emphasis, and open the
  // zone panel. Used by the search dropdown.
  const jumpToMajor = useCallback(
    (majorName: string) => {
      const pos = layout?.majors.get(majorName);
      if (!pos) return;
      const targetZoom = 1.6;
      setZoom(targetZoom);
      setPan({
        x: -pos.x * targetZoom,
        y: -pos.y * targetZoom,
      });
      setSelected({ kind: "major", key: majorName, label: majorName });
      setOrgCollapsed(true);
      setSearchQuery("");
    },
    [layout],
  );

  // Filtered search results — top 6 majors whose name contains the
  // query (case-insensitive). Dropdown only renders when the query
  // is non-empty.
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !data?.majors) return [];
    return data.majors
      .filter((m) => m.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [searchQuery, data]);

  const beginDrag = (e: React.PointerEvent) => {
    dragOriginRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDrag = (e: React.PointerEvent) => {
    if (!dragOriginRef.current) return;
    setPan({
      x: e.clientX - dragOriginRef.current.x,
      y: e.clientY - dragOriginRef.current.y,
    });
  };
  const endDrag = (e: React.PointerEvent) => {
    dragOriginRef.current = null;
    setDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore — element may have been unmounted */
    }
  };

  // Zoom around the cursor. Capture where the cursor was sitting in
  // CLUSTER coordinates (relative to the map's center, before scale
  // and pan), then adjust pan so that same cluster point stays under
  // the cursor at the new scale. Standard "pinch-to-zoom" anchoring.
  // Range 0.5×–2.5× keeps the layout readable at both ends.
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2.5;
  const zoomAround = useCallback(
    (delta: number, anchor: { clientX: number; clientY: number } | null) => {
      const el = mapContainerRef.current;
      if (!el) {
        setZoom((z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z * delta)));
        return;
      }
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const ax = anchor ? anchor.clientX : cx;
      const ay = anchor ? anchor.clientY : cy;
      setZoom((prevZoom) => {
        const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prevZoom * delta));
        if (next === prevZoom) return prevZoom;
        // Convert cursor → cluster coords (before transform). The cluster
        // is rendered at the rect's CENTER, then translated by pan, then
        // scaled by zoom. Reverse:
        //   cluster = (cursor - center - pan) / prevZoom
        // After zoom change, we want:
        //   cursor = center + newPan + cluster * next
        // → newPan = cursor - center - cluster * next
        const clusterX = (ax - cx - pan.x) / prevZoom;
        const clusterY = (ay - cy - pan.y) / prevZoom;
        setPan({
          x: ax - cx - clusterX * next,
          y: ay - cy - clusterY * next,
        });
        return next;
      });
    },
    [pan.x, pan.y],
  );
  // Native wheel listener with passive:false so the wheel event can
  // call preventDefault() without React's synthetic wrapper swallowing
  // it. Without this the page scroll would steal the gesture.
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = Math.exp(-e.deltaY * 0.0015);
      zoomAround(delta, { clientX: e.clientX, clientY: e.clientY });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [zoomAround]);

  const isLoading = data === null && loadErr === null;
  const hasData = !!data && Array.isArray(data.majors) && data.majors.length > 0;
  const noSchool = !!data && data.ok && data.reason === "no_school";

  return (
    <section
      style={{
        flex: 1,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        maxWidth: 1300,
        width: "100%",
        minHeight: 0,
      }}
    >
      <SceneHeader
        eyebrow={campusEyebrow("Campus", campusLabel)}
        title="Find your people"
        subtitle="Majors grouped by school, plus an org center — laid out by how close you already are. Search to jump, or wheel to zoom."
        tone="dark"
      />

      <div
        ref={mapContainerRef}
        style={{
          flex: 1,
          minHeight: 560,
          position: "relative",
          borderRadius: 22,
          overflow: "hidden",
          background:
            "radial-gradient(120% 80% at 50% 35%, rgba(70,140,255,0.18) 0%, rgba(70,140,255,0) 55%)," +
            "radial-gradient(80% 60% at 80% 80%, rgba(255,92,53,0.10) 0%, rgba(255,92,53,0) 60%)," +
            "linear-gradient(180deg, #07091A 0%, #03050C 100%)",
          border: "1px solid rgba(120,200,255,0.12)",
          boxShadow:
            "inset 0 1px 0 rgba(120,200,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.4), 0 12px 48px rgba(0,0,0,0.5)",
          touchAction: "none",
          cursor: dragging ? "grabbing" : "grab",
        }}
        onPointerDown={beginDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <ContourBackdrop />
        <Starfield />


        {isLoading ? (
          <div style={mapEmptyOverlayStyle}>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, color: "#fff" }}>
              Scanning campus…
            </div>
          </div>
        ) : loadErr ? (
          <div style={mapEmptyOverlayStyle}>
            {/* stopPropagation keeps a Retry press from starting a canvas
                drag, the same as the Settings link below. */}
            <div
              onPointerDown={(e) => e.stopPropagation()}
              style={{ maxWidth: 360, padding: "0 16px" }}
            >
              <LoadFailed
                tone="dark"
                failure={loadErr}
                onRetry={() => {
                  setLoadErr(null);
                  setLoadKey((k) => k + 1);
                }}
              />
            </div>
          </div>
        ) : noSchool ? (
          <div style={mapEmptyOverlayStyle}>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, color: "#fff", marginBottom: 6, textAlign: "center" }}>
              Pick your campus in Settings to see your map
            </div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, maxWidth: 320, textAlign: "center", lineHeight: 1.5 }}>
              The map groups people by major at your campus. Pick yours in Settings.
            </div>
            <Link
              href="/settings#campus"
              onPointerDown={(e) => e.stopPropagation()}
              style={{ marginTop: 10, fontFamily: "DM Sans, sans-serif", fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(120,200,255,0.95)", background: "rgba(8,12,28,0.78)", border: "1px solid rgba(120,200,255,0.45)", padding: "8px 14px", borderRadius: 999, textDecoration: "none", pointerEvents: "auto" }}
            >
              Go to Settings →
            </Link>
          </div>
        ) : !hasData ? (
          <div style={mapEmptyOverlayStyle}>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, color: "#fff", marginBottom: 6 }}>
              No zones yet
            </div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, maxWidth: 320, textAlign: "center" }}>
              You&apos;re the first here. Once other students pick this campus, their majors light up as zones.
            </div>
          </div>
        ) : (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              // Pan first, then scale around the cluster origin. The
              // wheel handler computes new pan values so the point
              // under the cursor stays anchored across zoom changes.
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              transition: dragging ? "none" : "transform 200ms ease",
              width: 0,
              height: 0,
              pointerEvents: "none",
            }}
          >
            {/* School halos — soft tint per IU school's region.
                Painted first so the rest of the cluster (lines, nodes,
                labels) sits on top. Sized to each school's actual
                cluster radius so a packed Kelley region gets a bigger
                halo than a single-major Other region. */}
            <SchoolHalos placements={layout?.schools ?? new Map()} />

            {/* Connection lines — drawn under the nodes so the bubbles
                sit on top. One <line> per major where the viewer has
                at least one mutual or connection, anchored at the
                cluster origin (0,0 = "you are here"). SVG uses
                overflow:visible + a 0×0 box so we can draw with raw
                coordinate values without computing a viewBox. */}
            <svg
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                overflow: "visible",
                width: 0,
                height: 0,
                pointerEvents: "none",
              }}
            >
              <defs>
                <linearGradient id="map-line-warm" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(255,184,90,0.45)" />
                  <stop offset="100%" stopColor="rgba(255,184,90,0.05)" />
                </linearGradient>
                <linearGradient id="map-line-green" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(91,209,140,0.5)" />
                  <stop offset="100%" stopColor="rgba(91,209,140,0.05)" />
                </linearGradient>
              </defs>
              {data!.majors.map((m, i) => {
                const pos = layout?.majors.get(m.name);
                if (!pos) return null;
                const showLine = m.mutuals > 0 || m.connected > 0;
                if (!showLine) return null;
                const stroke =
                  m.connected > 0 ? "url(#map-line-green)" : "url(#map-line-warm)";
                return (
                  <motion.line
                    key={`line-${m.name}`}
                    x1={0}
                    y1={0}
                    x2={pos.x}
                    y2={pos.y}
                    stroke={stroke}
                    strokeWidth={1}
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{
                      pathLength: 1,
                      opacity: [0, 0.9, 0.55, 0.9, 0.55],
                    }}
                    transition={{
                      pathLength: { duration: 0.9, delay: 0.4 + i * 0.04 },
                      opacity: {
                        duration: 4.5,
                        delay: 0.4 + i * 0.04,
                        repeat: Infinity,
                        ease: "easeInOut",
                      },
                    }}
                  />
                );
              })}
            </svg>

            <YouHereNode you={data!.you} />
            {data!.majors.map((m) => {
              const pos = layout?.majors.get(m.name);
              if (!pos) return null;
              return (
                <MajorNode
                  key={m.name}
                  major={m}
                  campusId={data?.campus_id ?? null}
                  system={viewerSystem}
                  x={pos.x}
                  y={pos.y}
                  radius={pos.r}
                  active={selected?.kind === "major" && selected.key === m.name}
                  onClick={() =>
                    pickZone({ kind: "major", key: m.name, label: m.name })
                  }
                />
              );
            })}
            {/* School labels — rendered last (after bubbles) so a node
                landing near the outer edge of its fan can't camp the
                pill. Position is computed per-school: pushed outward
                past the school's actual cluster radius so the pill
                always lands beyond the bubbles regardless of how
                packed the region is. */}
            <SchoolLabels placements={layout?.schools ?? new Map()} />
          </div>
        )}

        {/* Org Center — single cluster on the right side. Athletics
            was pulled because nobody (coach / RecSports) will keep
            roster + verification fresh, and a stale athletics surface
            is worse than no athletics surface. */}
        {hasData && data!.orgs.length > 0 ? (
          <OrgCenterCluster
            orgs={data!.orgs}
            collapsed={orgCollapsed}
            onToggleCollapse={() => setOrgCollapsed((v) => !v)}
            onPick={(org) =>
              pickZone({ kind: "org", key: org.handle, label: org.name })
            }
            activeHandle={selected?.kind === "org" ? selected.key : null}
            title="Org Center"
            side="right"
            accent="#78C8FF"
          />
        ) : null}

        {/* Search-to-jump — typing filters the major list, click a
            result and the map smoothly pans + zooms to that bubble.
            stopPropagation on the wrapper so the drag handler
            doesn't grab the gesture. */}
        {hasData ? (
        <div
          style={{
            position: "absolute",
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            width: "min(360px, calc(100% - 36px))",
            zIndex: 6,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchResults.length > 0) {
                jumpToMajor(searchResults[0]!.name);
              }
              if (e.key === "Escape") setSearchQuery("");
            }}
            placeholder="Jump to a major…"
            style={{
              width: "100%",
              padding: "9px 14px",
              borderRadius: 999,
              border: "1px solid rgba(120,200,255,0.32)",
              background: "rgba(8,12,28,0.78)",
              color: "rgba(245,247,252,0.95)",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              outline: "none",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
            }}
          />
          {searchResults.length > 0 ? (
            <div
              style={{
                marginTop: 6,
                background: "rgba(8,12,28,0.92)",
                border: "1px solid rgba(120,200,255,0.22)",
                borderRadius: 12,
                backdropFilter: "blur(18px)",
                WebkitBackdropFilter: "blur(18px)",
                overflow: "hidden",
                boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
              }}
            >
              {searchResults.map((m, i) => {
                const school = schoolForMajorIn(data?.campus_id ?? null, viewerSystem, m.name);
                return (
                  <button
                    key={m.name}
                    type="button"
                    onClick={() => jumpToMajor(m.name)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "9px 12px",
                      background: i === 0 ? "rgba(120,200,255,0.08)" : "transparent",
                      border: "none",
                      borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      color: "#fff",
                      fontFamily: "DM Sans, sans-serif",
                      fontSize: 13,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: school.color,
                        flexShrink: 0,
                        boxShadow: `0 0 8px ${hexToRgba(school.color, 0.5)}`,
                      }}
                    />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.name}
                    </span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      {school.shortLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        ) : null}

        {/* Legend pill — purely decorative, won't intercept drag. */}
        <div
          style={{
            position: "absolute",
            top: 14,
            left: 18,
            display: "flex",
            gap: 12,
            alignItems: "center",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 11,
            color: "rgba(255,255,255,0.65)",
            background: "rgba(8,12,28,0.55)",
            border: "1px solid rgba(120,200,255,0.18)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            padding: "6px 12px",
            borderRadius: 999,
            pointerEvents: "none",
          }}
        >
          <LegendDot color="#5BD18C" /> Connected
          <LegendDot color="#FFB85A" /> Mutuals
          <LegendDot color="#5A9CFF" /> Discover
        </div>
        {/* Recenter — separate absolutely-positioned button so the
             canvas's pointer handlers can't swallow its click.
             Hidden until zones exist so it doesn't float over the
             empty-state overlays. */}
        {hasData ? (
          <div
            style={{
              position: "absolute",
              top: 14,
              right: 270,
              zIndex: 5,
              display: "flex",
              gap: 6,
            }}
          >
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onClick={(e) => {
                e.stopPropagation();
                setPan({ x: 0, y: 0 });
                setZoom(1);
              }}
              title="Recenter and reset zoom"
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(120,200,255,0.95)",
                background: "rgba(8,12,28,0.78)",
                border: "1px solid rgba(120,200,255,0.45)",
                padding: "7px 14px",
                borderRadius: 999,
                cursor: "pointer",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                pointerEvents: "auto",
              }}
            >
              Recenter
            </button>
          </div>
        ) : null}

      </div>

      {selected ? (
        <ZonePanel
          key={`${selected.kind}:${selected.key}`}
          selection={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </section>
  );
}

const mapEmptyOverlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  color: "rgba(255,255,255,0.7)",
  fontFamily: "DM Sans, sans-serif",
};


function LegendDot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 12px ${color}`,
        display: "inline-block",
        marginRight: 4,
      }}
    />
  );
}

// Starfield — a deterministic sprinkle of tiny twinkling dots sitting
// between the topo grid and the cluster. Each star's position +
// twinkle period seeds from its index so the field renders the same
// across reloads (no jittering re-randomization), but each star pulses
// on its own beat so the whole sky doesn't blink in unison. 60 stars
// is enough density without being noisy; CSS-only animation keeps it
// off the JS frame budget.
function Starfield() {
  // Deterministic per-star "random" — purely a function of the star's
  // index, so the PRNG runs as a pure mapping without mutating state.
  // Each call multiplies the index by a different odd prime so the six
  // values per star don't correlate visibly.
  const stars = useMemo(() => {
    const frac = (i: number, salt: number) => {
      const x = Math.sin(i * salt + salt * 13) * 10000;
      return x - Math.floor(x);
    };
    return Array.from({ length: 60 }, (_, i) => {
      const sizePick = frac(i, 17);
      return {
        left: `${(frac(i, 31) * 100).toFixed(2)}%`,
        top: `${(frac(i, 53) * 100).toFixed(2)}%`,
        size: sizePick < 0.85 ? 1 : 2,
        delay: frac(i, 71) * 4,
        duration: 3 + frac(i, 97) * 4,
        alpha: 0.3 + frac(i, 113) * 0.5,
      };
    });
  }, []);
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      <style>{`
        @keyframes campus-map-star-twinkle {
          0%, 100% { opacity: 0.15; transform: scale(0.85); }
          50%      { opacity: var(--star-alpha, 0.6); transform: scale(1); }
        }
      `}</style>
      {stars.map((s, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            borderRadius: "50%",
            background: "#FFE6C8",
            boxShadow: "0 0 4px rgba(255,230,200,0.6)",
            animation: `campus-map-star-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
            ["--star-alpha" as never]: s.alpha,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

type SchoolPlacementForRender = {
  ax: number;
  ay: number;
  angleDeg: number;
  anchorR: number;
  clusterR: number;
};

// Soft tinted halo per school (IU or Purdue). Painted BEFORE the bubbles so the
// region color reads as background territory. Halo size scales with
// the school's actual cluster radius — packed regions get bigger
// halos, sparse regions stay compact. Decorative; pointerEvents none.
function SchoolHalos({
  placements,
}: {
  placements: Map<string, SchoolPlacementForRender>;
}) {
  return (
    <>
      {HALO_SCHOOLS.map((s) => {
        const p = placements.get(s.id);
        if (!p) return null;
        // Halo extends a bit past the cluster so the tint fades out
        // beyond the bubbles instead of cutting on their edge.
        const haloR = p.clusterR + 80;
        const w = haloR * 2;
        const h = haloR * 1.5;
        return (
          <div
            key={s.id}
            aria-hidden
            style={{
              position: "absolute",
              left: p.ax,
              top: p.ay,
              width: w,
              height: h,
              marginLeft: -w / 2,
              marginTop: -h / 2,
              borderRadius: "50%",
              background: `radial-gradient(closest-side, ${hexToRgba(s.color, 0.28)} 0%, ${hexToRgba(s.color, 0.08)} 55%, ${hexToRgba(s.color, 0)} 100%)`,
              pointerEvents: "none",
              filter: "blur(2px)",
            }}
          />
        );
      })}
    </>
  );
}

// Region labels — pills on the OUTER edge of each region (away from
// "you are here"). Position computed from the school's actual cluster
// radius so the pill always sits past the bubbles, no matter how
// packed the cluster is. Rendered AFTER the bubbles so even if a node
// drifts close, the pill paints on top.
const SCHOOL_LABEL_OUT_PADDING = 60;
function SchoolLabels({
  placements,
}: {
  placements: Map<string, SchoolPlacementForRender>;
}) {
  return (
    <>
      {HALO_SCHOOLS.map((s) => {
        const p = placements.get(s.id);
        if (!p) return null;
        const angleRad = (p.angleDeg * Math.PI) / 180;
        // Push the label past the cluster's outer edge plus padding.
        const labelR = p.anchorR + p.clusterR + SCHOOL_LABEL_OUT_PADDING;
        const lx = Math.cos(angleRad) * labelR;
        const ly = Math.sin(angleRad) * labelR * 0.7;
        return (
          <div
            key={s.id}
            aria-hidden
            style={{
              position: "absolute",
              left: lx,
              top: ly,
              transform: "translate(-50%, -50%)",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: hexToRgba(s.color, 0.95),
              background: "rgba(8,12,28,0.65)",
              border: `1px solid ${hexToRgba(s.color, 0.55)}`,
              padding: "5px 10px",
              borderRadius: 999,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              textShadow: `0 0 8px ${hexToRgba(s.color, 0.6)}`,
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              boxShadow: `0 4px 14px rgba(0,0,0,0.35)`,
            }}
          >
            {s.label}
          </div>
        );
      })}
    </>
  );
}

// SVG topographic backdrop. Layered concentric blobs with subtle grid +
// scan lines — gives the canvas the Tron HUD feel without dragging in a
// 3D dependency.
function ContourBackdrop() {
  const rings = [60, 110, 170, 240, 320, 410];
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="-700 -400 1400 800"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      aria-hidden
    >
      <defs>
        <radialGradient id="hub" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="rgba(120,200,255,0.5)" />
          <stop offset="1" stopColor="rgba(120,200,255,0)" />
        </radialGradient>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke="rgba(120,200,255,0.06)"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect x="-700" y="-400" width="1400" height="800" fill="url(#grid)" />
      {rings.map((r) => (
        <ellipse
          key={r}
          cx={0}
          cy={0}
          rx={r}
          ry={r * 0.62}
          fill="none"
          stroke="rgba(120,200,255,0.10)"
          strokeWidth={1}
        />
      ))}
      {/* Subtle hub glow at center */}
      <circle cx={0} cy={0} r={120} fill="url(#hub)" />
    </svg>
  );
}

function YouHereNode({
  you,
}: {
  you: MapSummary["you"];
}) {
  const initials = (you.name ?? you.handle ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,92,53,0.95) 0%, rgba(255,92,53,0.3) 70%, rgba(255,92,53,0) 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Fraunces, serif",
          fontWeight: 900,
          color: "#fff",
          fontSize: 16,
          border: "2px solid rgba(255,160,120,0.7)",
          boxShadow:
            "0 0 24px rgba(255,92,53,0.7), inset 0 0 14px rgba(255,200,180,0.3)",
        }}
      >
        {you.avatar_url ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              background: `url(${you.avatar_url}) center/cover`,
            }}
          />
        ) : (
          initials
        )}
      </div>
      <div
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: "rgba(255,180,150,0.9)",
        }}
      >
        You are here
      </div>
    </div>
  );
}

function MajorNode({
  major,
  campusId,
  system,
  x,
  y,
  radius,
  active,
  onClick,
}: {
  major: MapMajor;
  /** The map's campus (`MapSummary.campus_id`) and the viewer's university,
   *  so a bubble's colour matches its halo. */
  campusId: string | null;
  system: SchoolSystem | null;
  x: number;
  y: number;
  radius: number;
  active: boolean;
  onClick: () => void;
}) {
  // Two-color system per bubble:
  //   `school` = which IU department this major belongs to (Kelley,
  //              Luddy, Jacobs…). Drives the bubble's inner gradient so
  //              the same color reads across the whole region halo.
  //   `accent` = relationship distance (green = connected, amber =
  //              mutuals, blue = strangers). Drives the outline ring +
  //              the side-tag so you can still tell at a glance "do I
  //              have a way in here?"
  const school = schoolForMajorIn(campusId, system, major.name);
  const accent =
    major.mutuals > 0
      ? "#FFB85A"
      : major.connected > 0
      ? "#5BD18C"
      : "#5A9CFF";
  const showGlow = major.mutuals > 0;
  // Deterministic per-node idle drift. Seed from the major name so the
  // floating motion is stable across renders + every reload of the same
  // dataset. Each node oscillates a few pixels off its anchor over 6-10s
  // — gives the cluster a "living" feel without breaking the layout math
  // or making nodes wander far enough to overlap.
  const driftSeed = hashString(major.name);
  const driftX = ((driftSeed % 7) - 3) * 1.8;
  const driftY = (((driftSeed >> 3) % 5) - 2) * 1.6;
  const driftDur = 6 + ((driftSeed >> 7) % 5);
  const stagger = ((driftSeed % 19) / 19) * 0.4;
  return (
    <motion.button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      // Soft spring entrance: pop from a small dim seed to full size +
      // opacity. Stagger by hash so nodes don't all hit at once.
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{
        scale: 1,
        opacity: 1,
        x: [0, driftX, -driftX, 0],
        y: [0, driftY, -driftY, 0],
      }}
      transition={{
        scale: { type: "spring", stiffness: 220, damping: 22, delay: stagger },
        opacity: { duration: 0.4, delay: stagger },
        x: {
          duration: driftDur,
          repeat: Infinity,
          ease: "easeInOut",
          delay: stagger + 0.5,
        },
        y: {
          duration: driftDur + 1.6,
          repeat: Infinity,
          ease: "easeInOut",
          delay: stagger + 0.7,
        },
      }}
      whileHover={{
        scale: 1.06,
        boxShadow: showGlow
          ? `0 0 36px ${hexToRgba(accent, 0.6)}, inset 0 0 22px ${hexToRgba(accent, 0.3)}`
          : `0 0 22px ${hexToRgba(accent, 0.45)}`,
      }}
      whileTap={{ scale: 0.96 }}
      style={{
        position: "absolute",
        // Anchor by offsetting `left`/`top` so the node is visually
        // centered on (x, y). Avoids putting `translate(-50%, -50%)`
        // on the transform property — framer-motion fully owns
        // `transform` for its scale + x/y drift animation, so we
        // can't share that slot.
        left: x - radius,
        top: y - radius,
        width: radius * 2,
        height: radius * 2,
        borderRadius: "50%",
        // Inner gradient = school color (so Kelley bubbles all read
        // crimson, Luddy all read blue, etc). Outer ring = accent
        // (connection-state) so the "do I have ties?" signal stays
        // legible against the new school tinting.
        background:
          `radial-gradient(circle, ${hexToRgba(school.color, active ? 0.42 : 0.26)} 0%, rgba(8,12,28,0.55) 70%, rgba(8,12,28,0.0) 100%)`,
        border: `1px solid ${hexToRgba(accent, active ? 0.85 : 0.5)}`,
        boxShadow: showGlow
          ? `0 0 28px ${hexToRgba(accent, 0.4)}, inset 0 0 18px ${hexToRgba(school.color, 0.28)}`
          : `0 0 12px ${hexToRgba(school.color, 0.28)}`,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        cursor: "pointer",
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        padding: 4,
        color: "#fff",
        fontFamily: "DM Sans, sans-serif",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: Math.max(11, Math.min(14, radius / 5)),
          color: "#fff",
          lineHeight: 1.1,
          maxWidth: radius * 1.6,
          textOverflow: "ellipsis",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
        title={major.name}
      >
        {major.name}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: hexToRgba(accent, 0.85),
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {major.total} ppl
      </div>
      {major.mutuals > 0 ? (
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.65)" }}>
          {major.mutuals} mutuals
        </div>
      ) : null}
    </motion.button>
  );
}

function OrgCenterCluster({
  orgs,
  collapsed,
  onToggleCollapse,
  onPick,
  activeHandle,
  // Identity props — drive label, side anchor, and accent color so the
  // same cluster component can render both an Org Center (right side,
  // cyan) and an Athletic Center (left side, amber).
  title = "Org Center",
  side = "right",
  accent = "#78C8FF",
}: {
  orgs: MapOrg[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onPick: (o: MapOrg) => void;
  activeHandle: string | null;
  title?: string;
  side?: "left" | "right";
  accent?: string;
}) {
  const sidePos = side === "left" ? { left: 14 } : { right: 14 };
  if (collapsed) {
    return (
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onToggleCollapse}
        title={`Open ${title} (${orgs.length})`}
        style={{
          position: "absolute",
          ...sidePos,
          top: 60,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          borderRadius: 999,
          border: `1px solid ${hexToRgba(accent, 0.45)}`,
          background: "rgba(8,12,28,0.78)",
          color: hexToRgba(accent, 0.95),
          fontFamily: "DM Sans, sans-serif",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          cursor: "pointer",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          pointerEvents: "auto",
          zIndex: 4,
        }}
      >
        {title} · {orgs.length}
        <span style={{ fontSize: 12, lineHeight: 1 }}>
          {side === "left" ? "›" : "‹"}
        </span>
      </button>
    );
  }
  return (
    <div
      style={{
        position: "absolute",
        ...sidePos,
        top: 60,
        bottom: 14,
        width: 240,
        background:
          "linear-gradient(180deg, rgba(8,12,28,0.78) 0%, rgba(8,12,28,0.62) 100%)",
        border: `1px solid ${hexToRgba(accent, 0.22)}`,
        borderRadius: 16,
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        boxShadow: `inset 0 1px 0 ${hexToRgba(accent, 0.22)}, 0 12px 32px rgba(0,0,0,0.4)`,
        padding: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        pointerEvents: "auto",
        zIndex: 4,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: hexToRgba(accent, 0.85),
          }}
        >
          {title}
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={`Collapse ${title}`}
          title="Collapse"
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            border: `1px solid ${hexToRgba(accent, 0.32)}`,
            background: hexToRgba(accent, 0.10),
            color: hexToRgba(accent, 0.95),
            fontSize: 12,
            cursor: "pointer",
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          –
        </button>
      </div>
      <div style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        {orgs.map((o) => {
          const isActive = activeHandle === o.handle;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onPick(o)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 10,
                background: isActive ? "rgba(120,200,255,0.14)" : "transparent",
                border: isActive
                  ? "1px solid rgba(120,200,255,0.45)"
                  : "1px solid rgba(120,200,255,0.10)",
                color: "#fff",
                cursor: "pointer",
                fontFamily: "DM Sans, sans-serif",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: o.logo_url
                    ? `url(${o.logo_url}) center/cover`
                    : `linear-gradient(135deg, ${hexToRgba(colorForOrg(o.id), 0.95)} 0%, ${hexToRgba(colorForOrg(o.id), 0.55)} 100%)`,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontFamily: "Fraunces, serif",
                  fontWeight: 800,
                  fontSize: 11,
                }}
              >
                {!o.logo_url
                  ? o.name
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((s) => s[0])
                      .join("")
                      .toUpperCase()
                  : null}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#fff",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {o.name}
                  {o.verified ? <VerifiedBadge size={10} /> : null}
                </div>
                {/* Counts are public from 5 up: below that the server sends
                    null to anyone outside the club, and the line goes. */}
                {memberCountText(o.member_count) ? (
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
                    {memberCountText(o.member_count)}
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type ZoneRow = {
  id: string;
  name: string | null;
  handle: string | null;
  major: string | null;
  year: number | null;
  avatar_url: string | null;
  mutual_count?: number;
};

function ZonePanel({
  selection,
  onClose,
}: {
  selection: ZoneSelection;
  onClose: () => void;
}) {
  const [data, setData] = useState<{
    connected: ZoneRow[];
    mutuals: ZoneRow[];
    discover: ZoneRow[];
  } | null>(null);
  const [tab, setTab] = useState<"discover" | "mutuals" | "connected">("discover");
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  // Same campus as the map behind it (C5): bare at home, `?campus=` away.
  const view = useCampusView();
  const base = view.url(
    selection.kind === "major"
      ? `/api/campus-map/zone?major=${encodeURIComponent(selection.key)}`
      : `/api/campus-map/zone?org=${encodeURIComponent(selection.key)}`,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await vibeRequest<{
        connected?: ZoneRow[];
        mutuals?: ZoneRow[];
        discover?: ZoneRow[];
      }>(base, { cache: "no-store", quiet: true, failure: "Couldn't load this zone." });
      if (cancelled) return;
      if (
        !r.ok ||
        !Array.isArray(r.data.connected) ||
        !Array.isArray(r.data.mutuals) ||
        !Array.isArray(r.data.discover)
      ) {
        // Never empty buckets: those read as "nobody here".
        setLoadErr(campusLoadFailure(r, "Couldn't load this zone."));
        return;
      }
      const connected = r.data.connected;
      const mutuals = r.data.mutuals;
      const discover = r.data.discover;
      setLoadErr(null);
      setData({ connected, mutuals, discover });
      // Bias the default tab toward the bucket with the highest signal.
      if (mutuals.length > 0) setTab("mutuals");
      else if (discover.length > 0) setTab("discover");
      else if (connected.length > 0) setTab("connected");
    })();
    return () => {
      cancelled = true;
    };
  }, [base, loadKey]);

  if (typeof document === "undefined") return null;

  const rows = data
    ? tab === "connected"
      ? data.connected
      : tab === "mutuals"
      ? data.mutuals
      : data.discover
    : null;
  const zoneEmpty =
    data !== null &&
    data.connected.length === 0 &&
    data.mutuals.length === 0 &&
    data.discover.length === 0;

  return (
    <div
      style={{
        position: "fixed",
        right: 24,
        top: 90,
        bottom: 24,
        width: 380,
        zIndex: 50,
        background:
          "linear-gradient(180deg, rgba(8,12,28,0.92) 0%, rgba(4,6,18,0.95) 100%)",
        border: "1px solid rgba(120,200,255,0.32)",
        borderRadius: 18,
        boxShadow:
          "inset 0 1px 0 rgba(120,200,255,0.32), 0 24px 60px rgba(0,0,0,0.5)",
        backdropFilter: "blur(28px) saturate(180%)",
        WebkitBackdropFilter: "blur(28px) saturate(180%)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 18px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          borderBottom: "1px solid rgba(120,200,255,0.14)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(120,200,255,0.78)",
              fontWeight: 800,
            }}
          >
            {selection.kind === "major" ? "Major zone" : "Org"}
          </div>
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 18,
              fontWeight: 800,
              color: "#fff",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={selection.label}
          >
            {selection.label}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close zone"
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            border: "1px solid rgba(120,200,255,0.32)",
            background: "rgba(120,200,255,0.10)",
            color: "#fff",
            fontSize: 14,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      <div
        style={{
          padding: "10px 14px",
          display: "flex",
          gap: 6,
          borderBottom: "1px solid rgba(120,200,255,0.10)",
        }}
      >
        {(
          [
            { key: "discover", label: "Discover", count: data?.discover.length ?? null, color: "#5A9CFF" },
            { key: "mutuals", label: "Mutuals", count: data?.mutuals.length ?? null, color: "#FFB85A" },
            { key: "connected", label: "Connected", count: data?.connected.length ?? null, color: "#5BD18C" },
          ] as const
        ).map((t) => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: 999,
                border: isActive
                  ? `1px solid ${t.color}`
                  : "1px solid rgba(120,200,255,0.16)",
                background: isActive ? hexToRgba(t.color, 0.18) : "transparent",
                color: isActive ? "#fff" : "rgba(255,255,255,0.7)",
                fontFamily: "DM Sans, sans-serif",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {t.label}
              {t.count !== null ? (
                <span style={{ marginLeft: 6, color: t.color, fontWeight: 800 }}>
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "10px 14px" }}>
        {rows === null && loadErr ? (
          <LoadFailed
            tone="dark"
            compact
            failure={loadErr}
            onRetry={() => {
              setLoadErr(null);
              setLoadKey((k) => k + 1);
            }}
          />
        ) : rows === null ? (
          <div style={{ color: "rgba(255,255,255,0.55)", fontFamily: "DM Sans, sans-serif", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
            Loading…
          </div>
        ) : zoneEmpty ? (
          <div style={{ color: "rgba(255,255,255,0.55)", fontFamily: "DM Sans, sans-serif", fontSize: 13, padding: "20px 0", textAlign: "center", lineHeight: 1.5 }}>
            {selection.kind === "major"
              ? "Nobody else at your campus has this major on their profile yet."
              : "No other members in this org yet."}
          </div>
        ) : rows.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.55)", fontFamily: "DM Sans, sans-serif", fontSize: 13, padding: "20px 0", textAlign: "center", lineHeight: 1.5 }}>
            {tab === "discover"
              ? "No new faces here yet."
              : tab === "mutuals"
              ? "No mutuals here yet."
              : "No connections here yet."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.map((u) => (
              <ZonePersonRow key={u.id} u={u} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ZonePersonRow({ u }: { u: ZoneRow }) {
  const name = u.name || u.handle || "Member";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  const sub = [u.major, u.year ? String(u.year) : null].filter(Boolean).join(" · ");
  return (
    <Link
      href={u.handle ? `/profile/${encodeURIComponent(u.handle)}` : "/network"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid rgba(120,200,255,0.12)",
        background: "rgba(120,200,255,0.04)",
        color: "#fff",
        textDecoration: "none",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: u.avatar_url
            ? `url(${u.avatar_url}) center/cover`
            : "rgba(120,200,255,0.18)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: 12,
          flexShrink: 0,
          border: "1px solid rgba(120,200,255,0.32)",
        }}
      >
        {!u.avatar_url ? initials : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#fff",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
          {u.handle ? `@${u.handle}` : ""}
          {sub ? `${u.handle ? " · " : ""}${sub}` : ""}
        </div>
        {typeof u.mutual_count === "number" && u.mutual_count > 0 ? (
          <div style={{ fontSize: 10, color: "#FFB85A", fontWeight: 700, marginTop: 2 }}>
            {u.mutual_count} mutual{u.mutual_count === 1 ? "" : "s"}
          </div>
        ) : null}
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "rgba(120,200,255,0.85)",
        }}
      >
        View →
      </span>
    </Link>
  );
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function ServerRail({
  orgs,
  activeOrgId,
  onSelectOrg,
  onCreateOrg,
}: {
  orgs: Org[];
  activeOrgId: string | null;
  onSelectOrg: (id: string) => void;
  onCreateOrg: () => void;
}) {
  return (
    <aside
      style={{
        // Liquid-glass dark rail: vertical luminance gradient (top lit) +
        // outer glassy rim, strong saturated blur over whatever's behind.
        background:
          "linear-gradient(180deg, rgba(40,32,55,0.42) 0%, rgba(14,10,22,0.78) 40%, rgba(10,8,18,0.82) 100%)",
        backdropFilter: "blur(48px) saturate(220%) brightness(1.05)",
        WebkitBackdropFilter: "blur(48px) saturate(220%) brightness(1.05)",
        borderRight: "1px solid rgba(255,255,255,0.12)",
        boxShadow: [
          "inset 0 1px 0 rgba(255,255,255,0.18)", // top specular rim
          "inset 1px 0 0 rgba(255,255,255,0.06)", // left inner rim
          "inset -1px 0 0 rgba(0,0,0,0.4)", // right depth shadow
          "0 8px 32px rgba(0,0,0,0.35)",
        ].join(", "),
        padding: "16px 0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        position: "relative",
        overflow: "hidden",
        // Fill the entire grid cell so the glass surface reaches the
        // bottom of the chat viewport — previously the aside was only
        // content-tall, leaving a dark gap beneath the last server pill.
        height: "100%",
      }}
    >
      {/* Diagonal sheen overlay — subtle moving highlight that reads as
          curvature on the glass surface. Pointer-events: none so it doesn't
          eat clicks. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(115deg, rgba(255,255,255,0) 35%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0) 65%)",
          pointerEvents: "none",
        }}
      />
      {orgs.map((org) => {
        const active = org.id === activeOrgId;
        const color = colorForOrg(org.id);
        return (
          <ServerPill
            key={org.id}
            org={org}
            active={active}
            color={color}
            onClick={() => onSelectOrg(org.id)}
          />
        );
      })}
      <div
        style={{
          width: 32,
          height: 1,
          background:
            "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0) 100%)",
          margin: "4px 0",
        }}
      />
      <button
        type="button"
        title="Create a new org"
        aria-label="Create a new org"
        onClick={onCreateOrg}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)",
          color: COLORS.accent,
          border: "1px dashed rgba(255,180,150,0.35)",
          cursor: "pointer",
          fontSize: 22,
          fontWeight: 300,
          lineHeight: 1,
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          boxShadow: [
            "inset 0 1px 0 rgba(255,255,255,0.18)",
            "inset 0 -1px 0 rgba(0,0,0,0.18)",
          ].join(", "),
          transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease",
          position: "relative",
          zIndex: 1,
        }}
      >
        +
      </button>
    </aside>
  );
}

function ServerPill({
  org,
  active,
  color,
  onClick,
}: {
  org: Org;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const tinted = hexToRgba(color, 0.22);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={org.name}
      style={{
        position: "relative",
        zIndex: 1,
        width: 44,
        height: 44,
        borderRadius: active || hover ? 14 : 22,
        background: org.logo_url
          ? `url(${org.logo_url}) center/cover`
          : `radial-gradient(120% 120% at 30% 20%, ${hexToRgba(color, 0.95)} 0%, ${hexToRgba(color, 0.7)} 60%, ${hexToRgba(color, 0.55)} 100%)`,
        color: "#fff",
        border: `1px solid ${active ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.16)"}`,
        cursor: "pointer",
        fontFamily: "Fraunces, serif",
        fontWeight: 800,
        fontSize: 15,
        letterSpacing: "0.02em",
        transition:
          "border-radius 180ms cubic-bezier(.2,.8,.2,1), transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
        transform: hover && !active ? "translateY(-1px)" : "translateY(0)",
        boxShadow: active
          ? [
              `inset 0 1px 0 rgba(255,255,255,0.4)`, // top specular rim
              `inset 0 -1px 0 rgba(0,0,0,0.25)`,
              `0 0 0 2px rgba(10,8,18,0.95)`, // gap to rail
              `0 0 0 4px ${color}`, // outer ring in org color
              `0 6px 18px ${tinted}`, // ambient color glow
            ].join(", ")
          : [
              `inset 0 1px 0 rgba(255,255,255,0.32)`,
              `inset 0 -1px 0 rgba(0,0,0,0.22)`,
              hover ? `0 6px 18px ${tinted}` : `0 2px 8px rgba(0,0,0,0.25)`,
            ].join(", "),
      }}
    >
      {/* Glassy specular highlight inside the pill */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 1,
          borderRadius: "inherit",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 45%)",
          pointerEvents: "none",
        }}
      />
      <span style={{ position: "relative", zIndex: 1 }}>
        {!org.logo_url ? initialsForOrg(org.name) : null}
      </span>
      {/* Active indicator: capsule on the left edge of the rail */}
      {active ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: -10,
            top: "50%",
            transform: "translateY(-50%)",
            width: 4,
            height: 28,
            borderRadius: 4,
            background: "linear-gradient(180deg, #fff 0%, rgba(255,255,255,0.65) 100%)",
            boxShadow: "0 0 8px rgba(255,255,255,0.45)",
          }}
        />
      ) : null}
    </button>
  );
}

function RailSectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "DM Sans, sans-serif",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: COLORS.railMuted,
        padding: "8px 8px 6px",
        marginTop: 4,
      }}
    >
      {children}
    </div>
  );
}

function ChannelRow({
  channel,
  active,
  canManage,
  onSelect,
  onSettings,
}: {
  channel: Channel;
  active: boolean;
  canManage: boolean;
  onSelect: () => void;
  onSettings: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={(e) => {
        // Right-click is the discoverable shortcut for managers; no-op for
        // members (they can't change anything).
        if (!canManage) return;
        e.preventDefault();
        onSettings();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: "100%",
        padding: "8px 10px",
        borderRadius: 8,
        background: active ? "rgba(255,255,255,0.12)" : hover ? "rgba(255,255,255,0.04)" : "transparent",
        color: active ? "#fff" : COLORS.railText,
        fontFamily: "DM Sans, sans-serif",
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        textAlign: "left",
        marginBottom: 2,
        cursor: "pointer",
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flex: 1,
          minWidth: 0,
          background: "transparent",
          border: "none",
          padding: 0,
          color: "inherit",
          fontFamily: "inherit",
          fontSize: "inherit",
          fontWeight: "inherit",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            color: active ? COLORS.accent : COLORS.railMuted,
            fontSize: 15,
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 14,
          }}
        >
          {channel.is_private ? <LockIcon size={12} /> : "#"}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {channel.name}
        </span>
      </button>
      {canManage && hover ? (
        <button
          type="button"
          title="Channel settings"
          aria-label="Channel settings"
          onClick={(e) => {
            e.stopPropagation();
            onSettings();
          }}
          style={{
            width: 22,
            height: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.85)",
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ⚙
        </button>
      ) : null}
    </div>
  );
}

function ChannelRail({
  org,
  channels,
  loadErr,
  onRetryLoad,
  activeChannelId,
  onSelectChannel,
  onOpenCreateChannel,
  onOpenSettings,
  onOpenChannelSettings,
}: {
  org: Org | null;
  channels: Channel[];
  // The org's channel list failed to load; shown in its place with Retry.
  loadErr: LoadFailure | null;
  onRetryLoad: () => void;
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
  onOpenCreateChannel: () => void;
  onOpenSettings: () => void;
  onOpenChannelSettings: (channelId: string) => void;
}) {
  const canManage = org?.role === "owner" || org?.role === "admin";
  const railGlass = {
    background:
      "linear-gradient(180deg, rgba(36,28,52,0.55) 0%, rgba(12,10,20,0.82) 60%, rgba(10,8,18,0.86) 100%)",
    backdropFilter: "blur(48px) saturate(220%) brightness(1.05)",
    WebkitBackdropFilter: "blur(48px) saturate(220%) brightness(1.05)",
    borderRight: "1px solid rgba(255,255,255,0.10)",
    boxShadow: [
      "inset 0 1px 0 rgba(255,255,255,0.16)",
      "inset 1px 0 0 rgba(255,255,255,0.04)",
      "inset -1px 0 0 rgba(0,0,0,0.35)",
    ].join(", "),
    position: "relative",
    overflow: "hidden",
  } as const;

  if (!org) {
    return (
      <aside
        style={{
          ...railGlass,
          padding: 20,
          color: COLORS.railMuted,
          fontFamily: "DM Sans, sans-serif",
          fontSize: 13,
        }}
      >
        Pick an org from the rail.
      </aside>
    );
  }

  return (
    <aside
      style={{
        ...railGlass,
        display: "flex",
        flexDirection: "column",
        // Same height fix as ServerRail — fill the grid cell so the
        // channel list's glass surface reaches the bottom of the
        // viewport instead of stopping at content height.
        height: "100%",
      }}
    >
      <header
        style={{
          padding: "16px 16px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <Link
            href={`/orgs/${encodeURIComponent(org.handle)}`}
            title={`Open ${org.name} profile`}
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 6,
              fontFamily: "Fraunces, serif",
              fontWeight: 800,
              fontSize: 17,
              color: COLORS.railText,
              lineHeight: 1.2,
              letterSpacing: "-0.01em",
              textDecoration: "none",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#FF8C5A";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = COLORS.railText;
            }}
          >
            <span
              style={{
                wordBreak: "break-word",
                overflowWrap: "anywhere",
                minWidth: 0,
              }}
            >
              {org.name}
            </span>
            {org.verified ? <VerifiedBadge size={14} /> : null}
          </Link>
          <RoleChip role={org.role} />
        </div>
        <div
          style={{
            marginTop: 6,
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            color: COLORS.railMuted,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {/* One inline run, so " · " reads the same between every pair of parts. */}
          <span style={{ minWidth: 0 }}>
            {[
              org.hidden ? "Hidden" : null,
              // An old cached row without `join_policy` simply leaves this out.
              org.join_policy ? (
                <>
                  {org.join_policy !== "open" ? <LockIcon size={11} style={{ marginRight: 4 }} /> : null}
                  {policyChip(org.join_policy)}
                </>
              ) : null,
              // No count while the list failed: "0 channels" would be a guess.
              loadErr ? null : `${channels.length} ${channels.length === 1 ? "channel" : "channels"}`,
            ]
              .filter((part) => part !== null)
              .map((part, i) => (
                <Fragment key={i}>
                  {i > 0 ? " · " : null}
                  {part}
                </Fragment>
              ))}
          </span>
        </div>
      </header>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 8px", position: "relative", zIndex: 1 }}>
        {loadErr ? (
          <LoadFailed tone="dark" compact failure={loadErr} onRetry={onRetryLoad} />
        ) : (() => {
          const pinned = channels.filter((c) => c.pinned);
          const regular = channels.filter((c) => !c.pinned);
          return (
            <>
              {pinned.length > 0 ? (
                <>
                  <RailSectionHeader>📌 Pinned</RailSectionHeader>
                  {pinned.map((ch) => (
                    <ChannelRow
                      key={ch.id}
                      channel={ch}
                      active={ch.id === activeChannelId}
                      canManage={canManage}
                      onSelect={() => onSelectChannel(ch.id)}
                      onSettings={() => onOpenChannelSettings(ch.id)}
                    />
                  ))}
                </>
              ) : null}
              <RailSectionHeader>Text channels</RailSectionHeader>
              {regular.map((ch) => (
                <ChannelRow
                  key={ch.id}
                  channel={ch}
                  active={ch.id === activeChannelId}
                  canManage={canManage}
                  onSelect={() => onSelectChannel(ch.id)}
                  onSettings={() => onOpenChannelSettings(ch.id)}
                />
              ))}
            </>
          );
        })()}
      </div>
      <footer
        style={{
          padding: 12,
          borderTop: `1px solid ${COLORS.railBorder}`,
          fontSize: 12,
          color: COLORS.railMuted,
          fontFamily: "DM Sans, sans-serif",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Backdrop picker now lives in org settings (Overview tab) so
            members can't change the org's vibe color from the channel
            rail by accident — only owners/admins can, via Settings. */}
        <div style={{ display: "flex", gap: 8 }}>
          {canManage ? (
            <button
              type="button"
              onClick={onOpenCreateChannel}
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: 6,
                border: `1px solid rgba(255,255,255,0.12)`,
                background: "rgba(255,255,255,0.04)",
                color: COLORS.railText,
                fontFamily: "inherit",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              + Channel
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpenSettings}
            style={{
              flex: canManage ? 1 : 1,
              padding: "6px 10px",
              borderRadius: 6,
              border: `1px solid rgba(255,255,255,0.12)`,
              background: "rgba(255,255,255,0.04)",
              color: COLORS.railText,
              fontFamily: "inherit",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Settings
          </button>
        </div>
      </footer>
    </aside>
  );
}

function ChannelMain({
  org,
  channel,
  backdropCss,
  showSchoolVerifiedBanner,
}: {
  org: Org | null;
  channel: Channel | null;
  backdropCss: string;
  showSchoolVerifiedBanner: boolean;
}) {
  if (!org || !channel) {
    return (
      <main
        style={{
          padding: 32,
          color: COLORS.glassMuted,
          background: backdropCss,
          minHeight: "100%",
        }}
      >
        Pick a channel to start chatting.
      </main>
    );
  }

  // Org-color tint that bleeds across the header strip
  const orgColor = colorForOrg(org.id);
  const headerTint = `linear-gradient(180deg, ${hexToRgba(orgColor, 0.32)} 0%, ${hexToRgba(orgColor, 0.12)} 100%)`;

  // Cream backdrop is light, so the chat chrome (header text, icons,
  // author labels, message text) flips to a dark palette. All other
  // backdrops are dark and keep the original white-on-dark treatment.
  const isCream = org.backdrop_preset === "cream";
  const headerStrong = isCream ? "#1C1C1E" : COLORS.glassText;
  const headerMuted = isCream ? "rgba(28,28,30,0.55)" : COLORS.glassMuted;

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        // Was minHeight: 100vh — that forced this column to grow past
        // the grid cell, pushing the message composer below the parent's
        // overflow: hidden. Now we fill the grid cell exactly and let
        // the messages list inside ChannelChat handle its own scroll.
        height: "100%",
        minHeight: 0,
        position: "relative",
        background: backdropCss,
        transition: "background 600ms ease",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          ...GLASS_SURFACE,
          background: `${headerTint}, ${COLORS.glassFill}`,
          borderRadius: 0,
          borderTop: "none",
          borderLeft: "none",
          borderRight: "none",
          padding: "16px 28px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: headerMuted,
            fontSize: 18,
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          {channel.is_private ? <LockIcon size={16} /> : "#"}
        </span>
        <span
          style={{
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 19,
            color: headerStrong,
            letterSpacing: "-0.01em",
          }}
        >
          {channel.name}
        </span>
        <span style={{ color: headerMuted, fontSize: 13 }}>·</span>
        <span
          style={{
            color: headerMuted,
            fontSize: 13,
            fontFamily: "DM Sans, sans-serif",
          }}
        >
          {org.name}
        </span>
      </header>

      {showSchoolVerifiedBanner ? (
        <div
          style={{
            ...GLASS_SURFACE,
            margin: "16px 24px 0",
            padding: "12px 14px",
            borderRadius: 12,
            background: `linear-gradient(180deg, rgba(120,220,150,0.18) 0%, rgba(120,220,150,0.06) 100%), ${COLORS.glassFill}`,
            color: "#D7F5DD",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: "#FFFFFF" }}>School email verified.</strong>{" "}
          You’re unlocked for campus.
        </div>
      ) : null}

      <ChannelChat
        key={channel.id}
        channelId={channel.id}
        channelName={channel.name}
        isCream={isCream}
        roomKind={channel.kind ?? null}
        seedCanPost={channel.kind !== "board" || BOARD_POSTER_ROLES.includes(org.role)}
      />
    </main>
  );
}

type ChatMessage = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  parent_message_id?: string | null;
  parent_preview?: {
    id: string;
    content: string | null;
    user_id: string;
    author: {
      id: string;
      handle: string | null;
      name: string | null;
      avatar_url: string | null;
    } | null;
  } | null;
  reactions?: Array<{ emoji: string; count: number; viewer_reacted: boolean }>;
  users?: { id: string; handle: string | null; name: string | null; avatar_url: string | null } | null;
};

const REACTION_EMOJIS = ["❤️", "👍", "👎", "😂", "🔥"] as const;

/** The two club chat fields of the thread read; both absent from a server
 *  without the chat schema. */
type RoomRules = Partial<Pick<ThreadMessagesResponse, "room" | "viewer">>;

function ChannelChat({
  channelId,
  channelName,
  isCream,
  roomKind,
  seedCanPost,
}: {
  channelId: string;
  channelName: string;
  isCream: boolean;
  /** Club chat v1: the room's kind from the list (null without the schema). */
  roomKind: RoomKind | null;
  /** Club chat v1: what the room's kind and the viewer's club role say,
   *  until the thread read answers (so no composer flashes in a Board). */
  seedCanPost: boolean;
}) {
  // Cream backdrop palette swap: dark text + dark glass message bubbles
  // so messages don't render as white-on-cream (invisible). Other backdrops
  // are dark — keep the original white treatment.
  const authorColor = isCream ? "#1C1C1E" : "#fff";
  const timeColor = isCream ? "rgba(28,28,30,0.55)" : COLORS.glassMuted;
  const muted = isCream ? "rgba(28,28,30,0.6)" : COLORS.glassMuted;
  // Dark glass bubble around every message regardless of backdrop. Legible
  // on cream + adds depth on the darker presets too.
  const bubbleStyle: React.CSSProperties = {
    background:
      "linear-gradient(180deg, rgba(20,16,28,0.82) 0%, rgba(14,11,22,0.86) 100%)",
    backdropFilter: "blur(24px) saturate(160%)",
    WebkitBackdropFilter: "blur(24px) saturate(160%)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: "10px 14px",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.10), 0 6px 18px rgba(20,8,40,0.18)",
    color: "rgba(255,255,255,0.96)",
    display: "inline-block",
    maxWidth: "100%",
  };
  // Composer surface uses the same dark-glass treatment so the input bar
  // is always visible across all backdrops.
  const composerStyle: React.CSSProperties = {
    background:
      "linear-gradient(180deg, rgba(20,16,28,0.82) 0%, rgba(14,11,22,0.86) 100%)",
    backdropFilter: "blur(24px) saturate(160%)",
    WebkitBackdropFilter: "blur(24px) saturate(160%)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 24px rgba(20,8,40,0.22)",
  };
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // Club chat v1: what the thread read says about this room, kept fresh by
  // the 2s poll. Until it has answered, and from a server that sends no
  // `viewer`, the seed decides (true there: the composer, as before).
  const [roomRules, setRoomRules] = useState<RoomRules | null>(null);
  const canPost = roomRules?.viewer ? roomRules.viewer.can_post !== false : seedCanPost;
  // True after the first successful fetch. Until then a failure shows in
  // place of the list; after it, a failed poll just keeps the messages.
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  // Quote-reply target. When set, the next send embeds parent_message_id.
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  // Which message row is being hovered — drives the inline reaction
  // picker + reply button. One-at-a-time so we don't paint multiple sets.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  // Tracks how many reaction toggles are in flight. While > 0 we skip the
  // 2s poll so it can't clobber an optimistic chip that hasn't been
  // server-confirmed yet (the user sees the chip pop in, vanish for ~half
  // a second when a stale poll lands, then come back — feels broken).
  const pendingReactionsRef = useRef(0);
  // iMessage-style drag-to-reveal timestamps. While dragging, all message
  // rows translate left and timestamp chips slide in from the right edge.
  const [dragX, setDragX] = useState(0);
  // Mirrors dragStartRef.current?.engaged but in state form so we can read
  // it at render time (e.g. to switch off CSS transition during active
  // drag and back on for the release-snap-back).
  const [dragging, setDragging] = useState(false);
  // Hover hide is delayed by 250ms so the picker stays open while the
  // cursor crosses the small gap from bubble to pill. mouseEnter (on
  // either the row or the pill itself) cancels the pending hide.
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showHover = useCallback((id: string) => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
    setHoveredId(id);
  }, []);
  const queueHideHover = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setHoveredId(null), 250);
  }, []);
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // Channel switches remount this component (parent passes key={channelId}),
  // so initial state above is the reset — no effect needed.

  // On-demand fetch: after a reaction toggle (so the new chip stays put
  // instead of getting clobbered by the next poll cycle racing with our
  // POST), and for Retry after a failed first load. Quiet like the poll:
  // with messages on screen, a failure keeps them.
  const refetchMessages = useCallback(async () => {
    const r = await vibeRequest<{ messages?: ChatMessage[] } & RoomRules>(
      `/api/me/threads/${channelId}/messages?limit=80`,
      { cache: "no-store", quiet: true, failure: "Couldn't load messages." },
    );
    if (r.ok && Array.isArray(r.data.messages)) {
      loadedRef.current = true;
      setMessages(r.data.messages);
      setRoomRules({ room: r.data.room, viewer: r.data.viewer });
      setLoadErr(null);
      setLoaded(true);
    } else if (!loadedRef.current) {
      setLoadErr(asLoadFailure(r, "Couldn't load messages."));
    }
  }, [channelId]);

  // Poll messages every 2s while this channel is open. Skips while a
  // reaction toggle is in flight — otherwise a poll that started just
  // before the click lands a stale messages array and clobbers the
  // freshly-flipped chip. Never toasts: a failed poll keeps the messages,
  // and before the first success it only sets the inline failure.
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      if (pendingReactionsRef.current > 0) return;
      const r = await vibeRequest<{ messages?: ChatMessage[] } & RoomRules>(
        `/api/me/threads/${channelId}/messages?limit=80`,
        { cache: "no-store", quiet: true, failure: "Couldn't load messages." },
      );
      if (cancelled) return;
      if (pendingReactionsRef.current > 0) return; // late return — drop it
      if (r.ok && Array.isArray(r.data.messages)) {
        loadedRef.current = true;
        setMessages(r.data.messages);
        setRoomRules({ room: r.data.room, viewer: r.data.viewer });
        setLoadErr(null);
        setLoaded(true);
      } else if (!loadedRef.current) {
        setLoadErr(asLoadFailure(r, "Couldn't load messages."));
      }
    };
    fetchOnce();
    const t = setInterval(fetchOnce, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [channelId]);

  // Pin-to-bottom semantics:
  //   - First mount in a channel → always pin to newest (bottom).
  //   - New message arrives → only pin if the user was already near the
  //     bottom; otherwise don't yank them away from older messages
  //     they're scrolled up to read.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const wasAtBottomRef = useRef(true);
  const seenInitialRef = useRef(false);
  // Track scroll position so we know whether to pin on next message.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      wasAtBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || messages.length === 0) return;
    const isFirst = !seenInitialRef.current;
    if (isFirst) {
      seenInitialRef.current = true;
      // Defer past layout so scrollHeight reflects the rendered DOM.
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
        wasAtBottomRef.current = true;
      });
      return;
    }
    if (wasAtBottomRef.current) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages.length]);

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft("");
    const parent = replyTo;
    setReplyTo(null);
    try {
      const r = await vibeRequest<{ message?: ChatMessage }>(
        `/api/me/threads/${channelId}/messages`,
        {
          method: "POST",
          json: { content, parent_message_id: parent?.id },
          failure: "Couldn't send your message.",
          quiet: true,
        },
      );
      if (!r.ok) {
        // Quiet above, so a club chat refusal shows its own sentence.
        const line = chatRefusalLine(r.code, r.error);
        toast({ message: line ?? r.message, tone: "error", action: line ? undefined : r.action });
      }
      const sent = r.ok ? r.data.message : undefined;
      if (sent) {
        // Optimistic — append immediately so it doesn't take 2s to show.
        setMessages((prev) => [...prev, sent]);
      } else {
        setDraft(content); // restore so user can retry
        if (parent) setReplyTo(parent);
      }
    } finally {
      setSending(false);
    }
  };

  // Toggle a reaction on a message. Optimistic — adjust counts locally
  // so the UI feels instant, then sync on the next poll. Roll back on
  // failure so the user sees the truth.
  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      pendingReactionsRef.current += 1;
      let nextActive = false;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const existing = m.reactions ?? [];
          const found = existing.find((r) => r.emoji === emoji);
          if (found) {
            if (found.viewer_reacted) {
              // Removing my reaction.
              const newCount = Math.max(0, found.count - 1);
              const filtered =
                newCount === 0
                  ? existing.filter((r) => r.emoji !== emoji)
                  : existing.map((r) =>
                      r.emoji === emoji
                        ? { ...r, count: newCount, viewer_reacted: false }
                        : r,
                    );
              nextActive = false;
              return { ...m, reactions: filtered };
            }
            // Adding my reaction (someone else already had it).
            nextActive = true;
            return {
              ...m,
              reactions: existing.map((r) =>
                r.emoji === emoji
                  ? { ...r, count: r.count + 1, viewer_reacted: true }
                  : r,
              ),
            };
          }
          // Brand-new emoji on this message.
          nextActive = true;
          return {
            ...m,
            reactions: [
              ...existing,
              { emoji, count: 1, viewer_reacted: true },
            ],
          };
        }),
      );
      try {
        // vibeRequest shows the refusal (a 429 says when to try again), so
        // the rollback below never makes a reaction just vanish.
        const r = await vibeRequest(
          `/api/me/threads/${channelId}/messages/${messageId}/react`,
          {
            method: nextActive ? "POST" : "DELETE",
            json: { emoji },
            failure: nextActive ? "Couldn't add your reaction." : "Couldn't remove your reaction.",
          },
        );
        if (!r.ok) throw new Error(`react ${r.status}`);
        // Refetch immediately so the next state replace already includes
        // (or excludes) this reaction. The pending guard above prevents
        // the 2s poll from racing with us in the meantime.
        await refetchMessages();
      } catch (e) {
        console.error("[campus] react", e);
        // Roll back the optimistic flip so the UI matches the server.
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            const existing = m.reactions ?? [];
            const found = existing.find((r) => r.emoji === emoji);
            if (!found) return m;
            if (nextActive) {
              // We had optimistically added — undo.
              const newCount = Math.max(0, found.count - 1);
              const filtered =
                newCount === 0
                  ? existing.filter((r) => r.emoji !== emoji)
                  : existing.map((r) =>
                      r.emoji === emoji
                        ? { ...r, count: newCount, viewer_reacted: false }
                        : r,
                    );
              return { ...m, reactions: filtered };
            }
            // We had optimistically removed — restore.
            return {
              ...m,
              reactions: existing.map((r) =>
                r.emoji === emoji
                  ? { ...r, count: r.count + 1, viewer_reacted: true }
                  : r,
              ),
            };
          }),
        );
      } finally {
        pendingReactionsRef.current = Math.max(0, pendingReactionsRef.current - 1);
      }
    },
    [channelId, refetchMessages],
  );

  const startReply = (msg: ChatMessage) => {
    setReplyTo(msg);
    requestAnimationFrame(() => composerInputRef.current?.focus());
  };
  const cancelReply = () => setReplyTo(null);

  // iMessage drag: pull the message column left to reveal absolutely-
  // positioned timestamp chips on the right edge of each row. We engage
  // the gesture only when the user's motion is more horizontal than
  // vertical so it doesn't fight the normal scroll gesture.
  const DRAG_REVEAL = 76;
  const dragStartRef = useRef<{ x: number; y: number; engaged: boolean } | null>(null);
  const onScrollerPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    // Ignore touches that start on a button — those are real clicks.
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea, a")) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY, engaged: false };
  };
  const onScrollerPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const s = dragStartRef.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.engaged) {
      // Need clear horizontal intent before we hijack the gesture.
      if (Math.abs(dy) > 8) {
        dragStartRef.current = null; // user is scrolling vertically
        return;
      }
      if (Math.abs(dx) < 8) return;
      if (Math.abs(dx) <= Math.abs(dy) * 1.4) return;
      s.engaged = true;
      setDragging(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    }
    const clamped = Math.max(-DRAG_REVEAL, Math.min(0, dx));
    setDragX(clamped);
  };
  const endDrag = (e?: React.PointerEvent<HTMLElement>) => {
    const s = dragStartRef.current;
    dragStartRef.current = null;
    setDragging(false);
    setDragX(0);
    if (s?.engaged && e) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  return (
    <>
      <section
        ref={scrollerRef}
        onPointerDown={onScrollerPointerDown}
        onPointerMove={onScrollerPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          flex: 1,
          padding: "20px 28px 16px",
          overflowY: "auto",
          // Hide horizontal overflow so the timestamp chips parked at
          // right:-DRAG_REVEAL stay invisible until a drag pulls them in.
          overflowX: "hidden",
          touchAction: "pan-y", // let vertical scroll through, drag-x is ours
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minHeight: 0,
        }}
      >
        {!loaded && loadErr ? (
          <LoadFailed
            tone={isCream ? "light" : "dark"}
            failure={loadErr}
            onRetry={() => {
              setLoadErr(null);
              void refetchMessages();
            }}
          />
        ) : !loaded ? (
          <div style={{ color: muted, fontFamily: "DM Sans, sans-serif", fontSize: 13 }}>
            Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div
            style={{
              color: muted,
              fontFamily: "DM Sans, sans-serif",
              fontSize: 14,
              padding: "24px 0",
            }}
          >
            No messages yet — be the first to say hi in #{channelName}.
          </div>
        ) : (
          messages.filter((m: ChatMessage & { hidden?: boolean }) => !m.hidden).map((m, idx, shown) => {
            const prev = idx > 0 ? shown[idx - 1] : null;
            const sameAuthor = prev?.user_id === m.user_id;
            // iMessage-style separator — emit on the first message, on
            // day change, or after a >1h gap.
            const showDateSep = shouldShowChatSep(prev?.created_at, m.created_at);
            const author = m.users;
            const isHovered = hoveredId === m.id;
            const reactions = m.reactions ?? [];
            const parent = m.parent_preview ?? null;
            return (
              <Fragment key={m.id}>
                {showDateSep ? (
                  <div
                    aria-hidden="true"
                    style={{
                      textAlign: "center",
                      fontFamily: "DM Sans, sans-serif",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      color: muted,
                      margin: "14px 0 6px",
                    }}
                  >
                    {formatChatDateLabel(m.created_at)}
                  </div>
                ) : null}
              <article
                onMouseEnter={() => showHover(m.id)}
                onMouseLeave={queueHideHover}
                style={{
                  display: "flex",
                  gap: 10,
                  paddingTop: sameAuthor ? 5 : 14,
                  position: "relative",
                  transform: `translateX(${dragX}px)`,
                  transition: dragging
                    ? "none"
                    : "transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
                  willChange: "transform",
                }}
              >
                {!sameAuthor ? (
                  <Avatar
                    name={author?.name ?? author?.handle ?? "?"}
                    avatarUrl={author?.avatar_url ?? null}
                  />
                ) : (
                  <div style={{ width: 36, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {!sameAuthor ? (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: "Fraunces, serif", fontWeight: 800, fontSize: 14, color: authorColor }}>
                        {author?.name ?? author?.handle ?? "Unknown"}
                      </span>
                      <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: timeColor }}>
                        {formatChatTime(m.created_at)}
                      </span>
                    </div>
                  ) : null}
                  {parent ? (
                    <div
                      style={{
                        marginBottom: 6,
                        padding: "6px 10px",
                        borderLeft: "3px solid rgba(255,140,90,0.55)",
                        background: "rgba(20,16,28,0.45)",
                        borderRadius: 8,
                        fontFamily: "DM Sans, sans-serif",
                        fontSize: 12,
                        color: "rgba(255,255,255,0.78)",
                        maxWidth: "fit-content",
                      }}
                      title="Replying to"
                    >
                      <div style={{ fontWeight: 700, fontSize: 11, color: "rgba(255,180,150,0.95)", marginBottom: 1 }}>
                        ↩ {parent.author?.name ?? parent.author?.handle ?? "message"}
                      </div>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}>
                        {(parent.content ?? "").slice(0, 140) || "(media)"}
                      </div>
                    </div>
                  ) : null}
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, position: "relative" }}>
                    <div
                      style={{
                        ...bubbleStyle,
                        fontFamily: "DM Sans, sans-serif",
                        fontSize: 14,
                        lineHeight: 1.45,
                        whiteSpace: "pre-wrap",
                        wordWrap: "break-word",
                      }}
                    >
                      {m.content}
                    </div>
                    {isHovered ? (
                      <div
                        onMouseEnter={() => showHover(m.id)}
                        onMouseLeave={queueHideHover}
                        style={{
                          // Long messages (>60 chars or multi-line) get
                          // the picker stacked ABOVE the bubble — beside
                          // would push past the chat's right edge.
                          // Short messages keep the side placement so
                          // the picker doesn't bump into the row above.
                          position: "absolute",
                          ...((m.content?.length ?? 0) > 60 || /\n/.test(m.content ?? "")
                            ? { bottom: "calc(100% + 6px)", left: 0 }
                            : { left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" }),
                          zIndex: 5,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "4px 8px",
                          borderRadius: 999,
                          background: "rgba(20,16,28,0.92)",
                          border: "1px solid rgba(255,255,255,0.14)",
                          boxShadow:
                            "inset 0 1px 0 rgba(255,255,255,0.10), 0 6px 18px rgba(0,0,0,0.32)",
                          backdropFilter: "blur(20px)",
                          WebkitBackdropFilter: "blur(20px)",
                          flexShrink: 0,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {REACTION_EMOJIS.map((emo) => {
                          // Mark with an orange ring if the viewer has
                          // already reacted with this emoji — clear cue
                          // for "I picked this one." Click again to remove.
                          const mine = reactions.some(
                            (r) => r.emoji === emo && r.viewer_reacted,
                          );
                          return (
                            <button
                              key={emo}
                              type="button"
                              onClick={() => toggleReaction(m.id, emo)}
                              aria-label={`React with ${emo}`}
                              aria-pressed={mine}
                              style={{
                                background: mine
                                  ? "rgba(255,140,90,0.22)"
                                  : "transparent",
                                border: "none",
                                padding: 0,
                                width: 26,
                                height: 26,
                                fontSize: 14,
                                lineHeight: 1,
                                cursor: "pointer",
                                borderRadius: 999,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                boxShadow: mine
                                  ? "0 0 0 1.5px rgba(255,180,150,0.7), inset 0 1px 0 rgba(255,255,255,0.10)"
                                  : "none",
                                transition:
                                  "background-color 0.14s ease, box-shadow 0.14s ease",
                              }}
                            >
                              {emo}
                            </button>
                          );
                        })}
                        {/* No Reply where the viewer can't post: there is
                            no composer to reply in (club chat v1). */}
                        {canPost ? (
                        <>
                        <div
                          style={{
                            width: 1,
                            height: 16,
                            background: "rgba(255,255,255,0.16)",
                            margin: "0 2px",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => startReply(m)}
                          aria-label="Reply"
                          title="Reply"
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: "2px 6px",
                            color: "rgba(255,255,255,0.88)",
                            fontSize: 12,
                            fontWeight: 700,
                            fontFamily: "DM Sans, sans-serif",
                            cursor: "pointer",
                            borderRadius: 6,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          ↩ Reply
                        </button>
                        </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {reactions.length > 0 ? (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 4,
                        marginTop: 6,
                      }}
                    >
                      {reactions.map((r) => (
                        <button
                          key={r.emoji}
                          type="button"
                          onClick={() => toggleReaction(m.id, r.emoji)}
                          aria-pressed={r.viewer_reacted}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: r.viewer_reacted
                              ? "rgba(255,140,90,0.22)"
                              : "rgba(20,16,28,0.55)",
                            border: r.viewer_reacted
                              ? "1px solid rgba(255,180,150,0.55)"
                              : "1px solid rgba(255,255,255,0.10)",
                            color: r.viewer_reacted ? "#FFD0BF" : "rgba(255,255,255,0.85)",
                            fontFamily: "DM Sans, sans-serif",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          <span style={{ fontSize: 13 }}>{r.emoji}</span>
                          <span>{r.count}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {/*
                 * iMessage drag chip — parked just past the right edge of
                 * the row, slides into view when the row is translated
                 * left. opacity follows the drag amount so it fades in
                 * gracefully instead of popping.
                 */}
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    right: -DRAG_REVEAL,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: DRAG_REVEAL,
                    paddingLeft: 8,
                    fontFamily: "DM Sans, sans-serif",
                    fontSize: 11,
                    color: timeColor,
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    opacity: dragX === 0 ? 0 : Math.min(1, Math.abs(dragX) / 32),
                    transition: dragging ? "none" : "opacity 0.2s ease-out",
                  }}
                >
                  {formatChatTimeFull(m.created_at)}
                </span>
              </article>
              </Fragment>
            );
          })
        )}
      </section>

      <div style={{ padding: "0 24px 20px" }}>
        {replyTo && canPost ? (
          <div
            style={{
              ...composerStyle,
              marginBottom: 6,
              padding: "8px 12px",
              borderRadius: 12,
              borderLeft: "3px solid rgba(255,140,90,0.85)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "rgba(255,180,150,0.95)",
                  marginBottom: 1,
                }}
              >
                ↩ Replying to {replyTo.users?.name ?? replyTo.users?.handle ?? "message"}
              </div>
              <div
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 12,
                  color: "rgba(255,255,255,0.78)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {(replyTo.content ?? "").slice(0, 200) || "(media)"}
              </div>
            </div>
            <button
              type="button"
              onClick={cancelReply}
              aria-label="Cancel reply"
              title="Cancel reply"
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.85)",
                fontSize: 12,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        ) : null}
        {/* Club chat v1: in a room the viewer can't post in (a Board for
            anyone but its officers, an event chat that has closed) a quiet
            line takes the composer's place, on the same glass. An extra room
            with a who-can-post rule sends its own sentence, `post_line`. */}
        {!canPost ? (
          <div
            role="note"
            style={{
              ...composerStyle,
              borderRadius: 16,
              padding: "12px 14px",
              minHeight: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              color: COLORS.glassMuted,
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {(roomRules?.room?.kind ?? roomKind) === "board"
              ? REFUSAL_SENTENCES.board_officers_only
              : roomRules?.viewer?.post_line || REFUSAL_SENTENCES.room_closed}
          </div>
        ) : (
        <div
          style={{
            ...composerStyle,
            borderRadius: 16,
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <input
            ref={composerInputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
              if (e.key === "Escape" && replyTo) {
                e.preventDefault();
                cancelReply();
              }
            }}
            placeholder={replyTo ? "Reply…" : `Message #${channelName}`}
            disabled={sending}
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              color: "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 14,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!draft.trim() || sending}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              border: "1px solid rgba(255,180,150,0.4)",
              background: draft.trim()
                ? "linear-gradient(180deg, rgba(255,92,53,0.5) 0%, rgba(255,92,53,0.22) 100%)"
                : "rgba(255,255,255,0.06)",
              color: "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 700,
              fontSize: 12,
              cursor: draft.trim() ? "pointer" : "default",
              opacity: sending ? 0.6 : 1,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)",
            }}
          >
            Send
          </button>
        </div>
        )}
      </div>
    </>
  );
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        background: avatarUrl ? `url(${avatarUrl}) center/cover` : "rgba(255,255,255,0.1)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Fraunces, serif",
        fontWeight: 700,
        fontSize: 12,
        flexShrink: 0,
      }}
    >
      {!avatarUrl ? initials : null}
    </div>
  );
}

// Role color + label palette. Used by RoleChip + PermissionsCard + the
// Members-tab legend so the hierarchy reads at a glance.
const ROLE_META: Record<
  Role,
  { label: string; color: string; tint: string }
> = {
  owner: { label: "Owner", color: "#F0C84A", tint: "rgba(240,200,74,0.18)" },
  // One word for an admin everywhere (club model, Oct 16): Messages already
  // says Officer (`roleWord` in club/helpers.ts). The stored role stays `admin`.
  admin: { label: "Officer", color: "#FF7355", tint: "rgba(255,115,85,0.18)" },
  mod: { label: "Mod", color: "#9B7BFF", tint: "rgba(155,123,255,0.18)" },
  member: { label: "Member", color: "#9DD8FF", tint: "rgba(157,216,255,0.18)" },
};

const ROLE_PERMS: Record<Role, string[]> = {
  owner: [
    "Edit name, description, who can join, backdrop",
    "Create / rename / delete channels",
    "Promote, demote, and remove anyone",
    "Give members titles, like President",
    "See followers, remove them, and invite people",
    "Choose whether followers can read the Board",
    "Approve or deny join requests",
    "Delete the org",
  ],
  admin: [
    "Edit org overview + backdrop",
    "Create / rename / delete channels",
    "Promote/demote mods + members; remove mods and members",
    "Give mods, members and yourself titles",
    "See followers, remove them, and invite people",
    "Choose whether followers can read the Board",
    "Approve or deny join requests",
  ],
  mod: [
    "Chat in every public channel",
    "Private channels only when an officer adds you",
    "Approve or deny join requests",
    "Can't change channels or roles",
  ],
  member: [
    "Chat in every public channel",
    "View the member roster",
    "Leave the org any time",
  ],
};

function VerifiedBadge({ size = 14 }: { size?: number }) {
  return (
    <span
      title="Verified by Vibe"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#F0C84A",
        flexShrink: 0,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <path
          fill="currentColor"
          d="M8 .5l1.7 1.7L12 1.5l.5 2.3 2.3.5-.7 2.3 1.7 1.7-1.7 1.7.7 2.3-2.3.5-.5 2.3-2.3-.7L8 15.5l-1.7-1.7-2.3.7-.5-2.3-2.3-.5.7-2.3L.2 8l1.7-1.7-.7-2.3 2.3-.5.5-2.3L6.3 2.2 8 .5zm-.6 9.7 4-4-1-1L7.5 8 6 6.5l-1 1L7.5 10z"
        />
      </svg>
    </span>
  );
}

function RoleChip({ role }: { role: Role }) {
  const meta = ROLE_META[role];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 999,
        fontFamily: "DM Sans, sans-serif",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: meta.color,
        background: meta.tint,
        border: `1px solid ${hexToRgba(meta.color, 0.4)}`,
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: meta.color,
          boxShadow: `0 0 6px ${meta.color}`,
        }}
      />
      {meta.label}
    </span>
  );
}

function PermissionsCard({ role }: { role: Role }) {
  const meta = ROLE_META[role];
  const perms = ROLE_PERMS[role];
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background: `linear-gradient(180deg, ${meta.tint} 0%, rgba(255,255,255,0.02) 100%)`,
        border: `1px solid ${hexToRgba(meta.color, 0.35)}`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <RoleChip role={role} />
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            color: COLORS.glassMuted,
          }}
        >
          What you can do here
        </div>
      </div>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {perms.map((p) => (
          <li
            key={p}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1.5,
            }}
          >
            <span aria-hidden style={{ color: meta.color, fontSize: 12, lineHeight: "20px" }}>
              ✓
            </span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoleLegend() {
  return (
    <details
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: "8px 12px",
        color: COLORS.glassMuted,
        fontFamily: "DM Sans, sans-serif",
        fontSize: 13,
      }}
    >
      <summary style={{ cursor: "pointer", fontWeight: 600, color: "#fff" }}>
        Role hierarchy
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {(Object.keys(ROLE_META) as Role[]).map((r) => (
          <div key={r} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <RoleChip role={r} />
            <div style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,0.78)", lineHeight: 1.5 }}>
              {ROLE_PERMS[r][0]}
              {ROLE_PERMS[r].length > 1 ? ` · ${ROLE_PERMS[r].length - 1} more` : null}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

// iMessage-style: per-message timestamps are always just hour:minute.
// The date is carried by the centered date separator between groups,
// so the per-message line stays clean and the user's eye reads time
// the same way it does on a phone clock.
function formatChatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

const formatChatTimeFull = formatChatTime;

// Date+time separator label, iMessage-style. Always ends in the
// time-of-day so the user gets both the relative day cue and the
// exact moment the conversation picked back up — "Yesterday 7:05 PM",
// "Today 3:42 PM", "Wednesday 4:15 PM", "May 7, 3:42 PM".
function formatChatDateLabel(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const startOfDay = (x: Date) =>
      new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    let day: string;
    if (dayDiff === 0) day = "Today";
    else if (dayDiff === 1) day = "Yesterday";
    else if (dayDiff > 1 && dayDiff < 7) {
      day = d.toLocaleDateString([], { weekday: "long" });
    } else {
      const sameYear = d.getFullYear() === now.getFullYear();
      day = d.toLocaleDateString(
        [],
        sameYear
          ? { month: "long", day: "numeric" }
          : { month: "long", day: "numeric", year: "numeric" },
      );
    }
    return `${day} ${time}`;
  } catch {
    return "";
  }
}

// Decide whether to insert a separator before this message. Emits when
// the day rolls over OR there's a > 1h gap from the previous message —
// matches iMessage so back-and-forth strings stay clean and a fresh
// conversation block gets a fresh marker.
const CHAT_GAP_MS = 60 * 60 * 1000;
function shouldShowChatSep(prevIso: string | null | undefined, currIso: string): boolean {
  if (!currIso) return false;
  if (!prevIso) return true;
  try {
    const pa = new Date(prevIso);
    const pb = new Date(currIso);
    if (Number.isNaN(pa.getTime()) || Number.isNaN(pb.getTime())) return false;
    const sameDay =
      pa.getFullYear() === pb.getFullYear() &&
      pa.getMonth() === pb.getMonth() &&
      pa.getDate() === pb.getDate();
    if (!sameDay) return true;
    return pb.getTime() - pa.getTime() > CHAT_GAP_MS;
  } catch {
    return false;
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function EmptyState({
  showSchoolVerifiedBanner,
  onCreateOrg,
  onBrowseOrgs,
}: {
  showSchoolVerifiedBanner: boolean;
  onCreateOrg: () => void;
  // `tab` is seeded from ?tab= once at mount, so a <Link> to /campus?tab=orgs
  // changes the URL without changing the view. Switch the tab in state.
  onBrowseOrgs: () => void;
}) {
  const { label: campusLabel } = useViewerCampus();
  return (
    <main style={{ padding: "48px 32px" }}>
      {showSchoolVerifiedBanner ? (
        <p
          style={{
            ...GLASS_SURFACE,
            fontSize: 14,
            lineHeight: 1.5,
            color: "#D7F5DD",
            background: `linear-gradient(180deg, rgba(120,220,150,0.18) 0%, rgba(120,220,150,0.06) 100%), ${COLORS.glassFill}`,
            borderRadius: 12,
            padding: "14px 16px",
            marginBottom: 28,
            fontFamily: "DM Sans, sans-serif",
          }}
        >
          <strong style={{ color: "#fff" }}>School email verified.</strong>{" "}
          You’re unlocked for campus.
        </p>
      ) : null}
      <p
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#FFB89C",
          marginBottom: 12,
        }}
      >
        {campusEyebrow("Campus", campusLabel)}
      </p>
      <h1
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: "clamp(32px, 4.5vw, 48px)",
          fontWeight: 900,
          color: COLORS.glassText,
          letterSpacing: "-1.5px",
          marginBottom: 12,
          lineHeight: 1.05,
        }}
      >
        Find your people.
      </h1>
      <p
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 17,
          lineHeight: 1.55,
          color: COLORS.glassMuted,
          maxWidth: 560,
          marginBottom: 32,
        }}
      >
        Campus is where clubs and orgs live — Discord-style channels, real
        admin controls, no algorithm. Join an existing community or start your
        own.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          maxWidth: 760,
        }}
      >
        <button
          type="button"
          onClick={onBrowseOrgs}
          style={{
            ...GLASS_SURFACE,
            display: "block",
            width: "100%",
            font: "inherit",
            cursor: "pointer",
            padding: 24,
            borderRadius: 20,
            textDecoration: "none",
            textAlign: "left",
            color: COLORS.glassText,
          }}
        >
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 22,
              fontWeight: 800,
              marginBottom: 6,
              letterSpacing: "-0.01em",
            }}
          >
            Discover orgs
          </div>
          <p
            style={{
              margin: 0,
              fontFamily: "DM Sans, sans-serif",
              fontSize: 14,
              color: COLORS.glassMuted,
              lineHeight: 1.5,
            }}
          >
            {campusLabel ? `Browse clubs and orgs at ${campusLabel}.` : "Browse clubs and orgs."}
          </p>
        </button>
        <button
          type="button"
          onClick={onCreateOrg}
          style={{
            ...GLASS_SURFACE,
            display: "block",
            padding: 24,
            borderRadius: 20,
            background: `linear-gradient(180deg, rgba(255,92,53,0.55) 0%, rgba(255,92,53,0.28) 100%), ${COLORS.glassFill}`,
            border: `1px solid rgba(255,180,150,0.45)`,
            textAlign: "left",
            cursor: "pointer",
            color: "#fff",
            fontFamily: "inherit",
          }}
        >
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 20,
              fontWeight: 800,
              marginBottom: 6,
              letterSpacing: "-0.01em",
            }}
          >
            Create an org
          </div>
          <p
            style={{
              margin: 0,
              fontFamily: "DM Sans, sans-serif",
              fontSize: 14,
              color: "rgba(255,255,255,0.92)",
              lineHeight: 1.5,
            }}
          >
            Spin up a server for your club, group project, or DAO of friends.
            Default channels and admin controls included.
          </p>
        </button>
      </div>
    </main>
  );
}
