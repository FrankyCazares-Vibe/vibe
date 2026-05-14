"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CampusAppShell } from "@/components/campus-app-shell";
import { ImageCropperModal } from "@/components/ImageCropperModal";
import { emitCalendarChanged } from "@/components/LeftNav";
import { MouseSpotlight } from "@/components/ui/mouse-spotlight";
import { FILTER_CSS } from "@/lib/clip/edit-metadata";
import {
  bindMentionPicker,
  capturePosterFrame,
  classifyVideo,
  extractHashtags,
  type VideoMode,
} from "@/lib/composer/helpers";
import { IU_SCHOOLS, schoolForMajor } from "@/lib/iu/majors";

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
  is_public: boolean;
  backdrop_preset: BackdropKey;
  role: Role;
  verified?: boolean;
  last_activity_at?: string | null;
  links?: Array<{ label: string; url: string }>;
  philanthropy?: string;
};

type BackdropKey = "cream" | "sand-purple" | "ember" | "deep-violet" | "forest" | "midnight";

type Channel = {
  id: string;
  name: string;
  topic: string | null;
  is_private: boolean;
  pinned: boolean;
  position: number;
  created_at: string;
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
  bg: "#FAF7F2",
  border: "rgba(28,28,30,0.08)",
  borderStrong: "rgba(28,28,30,0.12)",
  text: "#1C1C1E",
  muted: "#5C5853",
  faint: "#8A8580",
  accent: "#FF5C35",
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
const BACKDROP_PRESETS: Record<BackdropKey, { label: string; css: string }> = {
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

// Cream paper backdrop for the Feed tab — warm, cozy, "community noticeboard"
const FEED_BACKDROP =
  "radial-gradient(120% 80% at 0% 0%, rgba(255,222,180,0.45) 0%, rgba(255,222,180,0) 60%), " +
  "radial-gradient(110% 80% at 100% 100%, rgba(255,200,170,0.35) 0%, rgba(255,200,170,0) 60%), " +
  "linear-gradient(180deg, #FAF7F2 0%, #F4EDE2 100%)";

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

const TABS: { key: CampusTab; label: string }[] = [
  { key: "feed", label: "Feed" },
  { key: "events", label: "Events" },
  { key: "orgs", label: "Organizations" },
  { key: "chat", label: "Chat" },
  { key: "map", label: "Campus Map" },
];

// Static identity for the campus banner header. The "on Vibe" + "active
// now" stats line is now derived live from /api/stats/campus — no
// hardcoded student count or fake on-Vibe count anymore.
const SCHOOL = {
  initials: "IU",
  name: "Indiana University",
  city: "Indianapolis, IN",
};

export function CampusHome({
  showSchoolVerifiedBanner,
}: {
  showSchoolVerifiedBanner: boolean;
}) {
  const [orgs, setOrgs] = useState<Org[] | null>(null); // null = loading
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [channelsByOrg, setChannelsByOrg] = useState<Record<string, Channel[]>>({});
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
    if (typeof window !== "undefined") {
      try {
        if (localStorage.getItem("vibe_tour_pending") === "campus") return "feed";
      } catch {
        /* localStorage may be unavailable */
      }
    }
    return parseInitialTab(searchParams.get("tab"));
  });
  const [feedTagFilter, setFeedTagFilter] = useState<string | null>(null);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [channelSettingsId, setChannelSettingsId] = useState<string | null>(null);

  // Trending click-through: switches to Feed tab and applies a tag filter.
  const onPickTag = useCallback((tag: string) => {
    setTab("feed");
    setFeedTagFilter(tag);
  }, []);

  // Campus tour: triggered by `?welcome=1` (post-onboarding) or by a
  // `vibe_tour_pending=campus` localStorage flag (handed off from the
  // profile leg; survives redirects that strip the URL param). Walks the
  // user through feed, tabs, and search, then hands off to /network.
  useEffect(() => {
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
    loadOttoTourScript().then(() => {
      if (cancelled) return;
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
            body: "Live posts from your school. Otto surfaces what's loud and what's just dropped.",
          },
          {
            selector: "#campus-tabs",
            title: "Switch lanes anytime.",
            body: "Feed, Events, Orgs, Map — same Otto, different angle on what's happening.",
          },
          {
            selector: "#campus-search",
            title: "Find your <span class=\"accent\">people</span>.",
            body: "Search students, clubs, or events. Otto threads the right matches in.",
            endLabel: "Take me to network →",
          },
        ],
        {
          onDone: () => {
            try {
              localStorage.setItem(seenKey, "1");
              localStorage.setItem("vibe_tour_pending", "network");
            } catch {}
            stripWelcomeParam();
            window.location.href = "/network?welcome=1";
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
    });
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  // Load joined orgs on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/orgs?filter=mine", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data?.ok && Array.isArray(data.orgs)) {
          setOrgs(data.orgs);
          if (data.orgs.length > 0) setActiveOrgId(data.orgs[0].id);
        } else {
          setOrgs([]);
        }
      } catch (e) {
        console.error("[campus] load orgs", e);
        if (!cancelled) setOrgs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeOrg = (orgs ?? []).find((o) => o.id === activeOrgId) ?? null;
  const activeChannels: Channel[] = activeOrg ? channelsByOrg[activeOrg.id] ?? [] : [];
  const activeChannelId = activeOrg
    ? selectedChannelByOrg[activeOrg.id] ?? activeChannels[0]?.id ?? null
    : null;
  const activeChannel = activeChannels.find((c) => c.id === activeChannelId) ?? null;

  // When the active org changes and we don't yet have its channels cached,
  // fetch them. Selecting the active channel is derived above, so this
  // effect only writes to channelsByOrg.
  useEffect(() => {
    if (!activeOrg) return;
    if (channelsByOrg[activeOrg.id]) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/orgs/${activeOrg.handle}/channels`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        const list: Channel[] = data?.ok && Array.isArray(data.channels) ? data.channels : [];
        setChannelsByOrg((prev) => ({ ...prev, [activeOrg.id]: list }));
      } catch (e) {
        console.error("[campus] load channels", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOrg, channelsByOrg]);

  const handleSelectChannel = useCallback(
    (channelId: string) => {
      if (!activeOrg) return;
      setSelectedChannelByOrg((prev) => ({ ...prev, [activeOrg.id]: channelId }));
    },
    [activeOrg]
  );

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

  const showThreeColumn = tab === "chat" && !isEmpty && !isLoading;
  const scene = getTabScene(tab);

  return (
    <CampusAppShell>
      <style>{SHEEN_KEYFRAMES}</style>
      <div
        style={{
          minHeight: "100vh",
          background: scene.css,
          backgroundAttachment: "fixed",
          color: scene.tone === "light" ? COLORS.glassText : COLORS.text,
          transition: "background 600ms ease",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <CampusBanner />
        <CampusTabs active={tab} onChange={setTab} />

        {isLoading && tab === "chat" ? (
          <LoadingPane />
        ) : showThreeColumn ? (
          <div
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
          </div>
        ) : isEmpty && tab === "chat" ? (
          <EmptyState
            showSchoolVerifiedBanner={showSchoolVerifiedBanner}
            onCreateOrg={() => setShowCreateOrg(true)}
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
              tab={tab}
              onCreateOrg={() => setShowCreateOrg(true)}
              feedTagFilter={feedTagFilter}
              onClearTagFilter={() => setFeedTagFilter(null)}
              onPickTag={onPickTag}
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
            channels={activeChannels}
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
      </div>
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
  const [isPublic, setIsPublic] = useState(true);
  const [backdrop, setBackdrop] = useState<BackdropKey>("sand-purple");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
          is_public: isPublic,
          backdrop_preset: backdrop,
        }),
      });
      const data = await res.json();
      if (!data?.ok) {
        setError(data?.error || "Failed to create org");
        return;
      }
      onCreated({ ...data.org, role: "owner" } as Org);
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
        background: "rgba(8,4,16,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          ...GLASS_SURFACE,
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

        <Field label="Visibility">
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { v: true, label: "Public", sub: "Anyone can join" },
              { v: false, label: "Private", sub: "Request to join" },
            ].map((opt) => {
              const on = isPublic === opt.v;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setIsPublic(opt.v)}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: on
                      ? "1px solid rgba(255,180,150,0.55)"
                      : "1px solid rgba(255,255,255,0.12)",
                    background: on
                      ? "linear-gradient(180deg, rgba(255,92,53,0.32) 0%, rgba(255,92,53,0.14) 100%)"
                      : "rgba(255,255,255,0.04)",
                    color: "#fff",
                    fontFamily: "inherit",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: COLORS.glassMuted }}>{opt.sub}</div>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Backdrop" hint="Admins can change later.">
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
      </form>
    </div>
  );
}

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
        setError(data?.error || "Failed to create channel");
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
              { v: true, label: "Private", sub: "Owner / admin only" },
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

type SettingsTab = "overview" | "channels" | "members" | "requests" | "danger";

function OrgSettingsModal({
  org,
  channels,
  onClose,
  onOrgUpdated,
  onOrgRemoved,
  onChannelUpdated,
  onChannelRemoved,
}: {
  org: Org;
  channels: Channel[];
  onClose: () => void;
  onOrgUpdated: (org: Org) => void;
  onOrgRemoved: (orgId: string) => void;
  onChannelUpdated: (channel: Channel) => void;
  onChannelRemoved: (channelId: string) => void;
}) {
  const canManage = org.role === "owner" || org.role === "admin";
  const isStaff = canManage || org.role === "mod";
  const isOwner = org.role === "owner";

  const tabs: { key: SettingsTab; label: string; show: boolean }[] = [
    { key: "overview", label: "Overview", show: true },
    { key: "channels", label: "Channels", show: canManage },
    { key: "members", label: "Members", show: true },
    { key: "requests", label: "Requests", show: isStaff && !org.is_public },
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
              onChannelUpdated={onChannelUpdated}
              onChannelRemoved={onChannelRemoved}
            />
          ) : null}
          {tab === "members" ? (
            <SettingsMembers org={org} canManage={canManage} isOwner={isOwner} />
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
  const [name, setName] = useState(org.name);
  const [description, setDescription] = useState(org.description ?? "");
  const [isPublic, setIsPublic] = useState(org.is_public);
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
    isPublic !== org.is_public ||
    backdrop !== org.backdrop_preset ||
    philanthropy.trim() !== (org.philanthropy ?? "") ||
    initialLinksKey !== currentLinksKey;

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/orgs/${org.handle}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          is_public: isPublic,
          backdrop_preset: backdrop,
          philanthropy: philanthropy.trim(),
          links: links
            .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
            .filter((l) => l.label && l.url),
        }),
      });
      const data = await res.json();
      if (!data?.ok) {
        setMsg({ tone: "err", text: data?.error || "Failed to save" });
        return;
      }
      onOrgUpdated({ ...org, ...data.org });
      setMsg({ tone: "ok", text: "Saved." });
    } catch (e) {
      console.error("[campus] save org", e);
      setMsg({ tone: "err", text: "Network error" });
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    // Members get a read-only view.
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14, color: "#fff" }}>
        <PermissionsCard role={org.role} />
        <ReadOnlyRow label="Name" value={org.name} />
        <ReadOnlyRow label="Handle" value={`@${org.handle}`} />
        <ReadOnlyRow label="Description" value={org.description || "—"} />
        <ReadOnlyRow label="Visibility" value={org.is_public ? "Public" : "Private"} />
        <ReadOnlyRow label="Backdrop" value={BACKDROP_PRESETS[org.backdrop_preset].label} />
      </div>
    );
  }

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
      <Field label="Visibility">
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { v: true, label: "Public", sub: "Anyone can join" },
            { v: false, label: "Private", sub: "Request to join" },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setIsPublic(opt.v)}
              style={modalSegmentStyle(isPublic === opt.v)}
            >
              <div style={{ fontWeight: 700 }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: COLORS.glassMuted, marginTop: 2 }}>
                {opt.sub}
              </div>
            </button>
          ))}
        </div>
      </Field>
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
  onChannelUpdated,
  onChannelRemoved,
}: {
  org: Org;
  channels: Channel[];
  onChannelUpdated: (channel: Channel) => void;
  onChannelRemoved: (channelId: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ ...modalSubtitleStyle, margin: "0 0 4px" }}>
        Rename, change topic, toggle privacy, or delete a channel. Deleting is
        permanent — messages are removed too.
      </p>
      {channels.length === 0 ? (
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
        setErr(data?.error || "Failed to save");
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
        setErr(data?.error || "Failed to delete");
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

      {open ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          <Field label="Name">
            <input
              type="text"
              value={name}
              maxLength={31}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              style={inputStyle}
            />
          </Field>
          <Field label="Topic">
            <input
              type="text"
              value={topic}
              maxLength={200}
              onChange={(e) => setTopic(e.target.value)}
              style={inputStyle}
            />
          </Field>
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
          {err ? <div style={modalErrorStyle}>{err}</div> : null}
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
            <button type="button" onClick={remove} disabled={busy} style={modalDangerStyle}>
              Delete channel
            </button>
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/orgs/${org.handle}/members`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data?.ok && Array.isArray(data.members)) {
          setMembers(data.members as MemberRow[]);
        } else {
          setErr(data?.error || "Failed to load members");
          setMembers([]);
        }
      } catch (e) {
        if (cancelled) return;
        console.error("[campus] load members", e);
        setErr("Network error");
        setMembers([]);
      }
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
        return (
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
                  <option value={m.role}>{m.role}</option>
                ) : null}
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            ) : (
              <RoleChip role={m.role as Role} />
            )}
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
        );
      })}
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
};

function SettingsRequests({ org }: { org: Org }) {
  const [requests, setRequests] = useState<RequestRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/orgs/${org.handle}/requests`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data?.ok && Array.isArray(data.requests)) {
          setRequests(data.requests as RequestRow[]);
        } else {
          setErr(data?.error || "Failed to load requests");
          setRequests([]);
        }
      } catch (e) {
        if (cancelled) return;
        console.error("[campus] load requests", e);
        setErr("Network error");
        setRequests([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org.handle, reloadKey]);

  const refresh = () => setReloadKey((k) => k + 1);

  const act = async (r: RequestRow, action: "approve" | "deny") => {
    setBusyId(r.id);
    try {
      const res = await fetch(`/api/orgs/${org.handle}/requests/${r.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!data?.ok) {
        setErr(data?.error || `Failed to ${action}`);
        return;
      }
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  if (requests === null) {
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
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => act(r, "approve")}
              style={modalSubmitStyle(busyId !== r.id)}
            >
              Approve
            </button>
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

  const leave = async () => {
    if (!confirm(`Leave ${org.name}? You'll lose access to its channels.`)) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/orgs/${org.handle}/join`, { method: "DELETE" });
      const data = await res.json();
      if (!data?.ok) {
        setErr(data?.error || "Failed to leave");
        return;
      }
      onOrgRemoved(org.id);
    } catch (e) {
      console.error("[campus] leave org", e);
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  };

  const destroy = async () => {
    const confirmed = prompt(
      `Type the handle "${org.handle}" to delete this org. This cannot be undone.`
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

      {!isOwner ? (
        <DangerCard
          title="Leave this org"
          desc="You'll lose access to its channels and chat history. You can rejoin later if it's public."
          actionLabel={busy ? "Leaving…" : "Leave org"}
          onClick={leave}
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
          desc="Removes the org, all its channels, all messages, and all members. This cannot be undone."
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
}: {
  title: string;
  desc: string;
  actionLabel: string;
  onClick: () => void;
  disabled?: boolean;
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
    </div>
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

  const tabs: { key: ChannelSettingsTab; label: string; show: boolean }[] = [
    { key: "overview", label: "Overview", show: true },
    { key: "access", label: "Access", show: channel.is_private && canManage },
    { key: "danger", label: "Danger", show: canManage },
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
          {tab === "access" && channel.is_private && canManage ? (
            <ChannelAccess org={org} channel={channel} />
          ) : null}
          {tab === "danger" && canManage ? (
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
        setMsg({ tone: "err", text: data?.error || "Failed to save" });
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
    if (!canReorder) return;
    const next = idx + delta;
    if (next < 0 || next >= regular.length) return;
    const nextOrder = regular.slice();
    [nextOrder[idx], nextOrder[next]] = [nextOrder[next], nextOrder[idx]];
    const orderedIds = nextOrder.map((c) => c.id);
    onChannelsReordered(orderedIds);
    try {
      await fetch(`/api/orgs/${org.handle}/channels/reorder`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel_ids: orderedIds }),
      });
    } catch (e) {
      console.error("[campus] reorder", e);
    }
  };

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
      <Field label="Name" hint="Lowercase, 2–31 chars.">
        <input
          type="text"
          value={name}
          maxLength={31}
          onChange={(e) => setName(e.target.value.toLowerCase())}
          style={inputStyle}
        />
      </Field>
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
      <Field label="Visibility">
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { v: false, label: "Public", sub: "All members can view" },
            { v: true, label: "Private", sub: "Owner / admin + invited members" },
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
            disabled={!canReorder || idx <= 0}
            style={modalCancelStyle}
          >
            ↑ Up
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={!canReorder || idx >= regular.length - 1}
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
        setErr(data?.error || "Failed to delete");
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

function ModalShell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(8,4,16,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
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

export function CampusBanner({
  compactSearch = false,
  onSearchTap,
}: {
  /** Mobile collapses the search bar into a single icon so the banner
   *  doesn't get bunched up. Tap fires `onSearchTap`. */
  compactSearch?: boolean;
  onSearchTap?: () => void;
} = {}) {
  // Live stats for the campus header line. The heartbeat updates the
  // viewer's `users.last_active_at` so the active-now count includes
  // them; the stats endpoint counts everyone with a fresh timestamp
  // (5-minute window). Both refresh every 30s while the tab is visible.
  const [stats, setStats] = useState<{ totalUsers: number; activeNow: number } | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    const beat = async () => {
      try {
        await fetch("/api/me/heartbeat", { method: "POST", cache: "no-store" });
      } catch {
        /* silent — missing a beat just drops the user out of the window */
      }
    };
    const refresh = async () => {
      try {
        const r = await fetch("/api/stats/campus", { cache: "no-store" });
        const j = await r.json();
        if (cancelled) return;
        if (j?.ok) {
          setStats({
            totalUsers: typeof j.totalUsers === "number" ? j.totalUsers : 0,
            activeNow: typeof j.activeNow === "number" ? j.activeNow : 0,
          });
        }
      } catch {
        /* keep prior value on error */
      }
    };
    void (async () => {
      await beat();
      await refresh();
    })();
    const tick = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      await beat();
      await refresh();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(tick);
    };
  }, []);
  const onVibeLabel = stats
    ? `${stats.totalUsers.toLocaleString()} on Vibe`
    : "loading…";
  const activeLabel = stats
    ? `${stats.activeNow.toLocaleString()} active now`
    : "";

  return (
    <header
      className="vibe-campus-banner"
      style={{
        position: "relative",
        height: 64,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "0 24px",
        // Solid IU crimson — reads identical on every tab regardless of backdrop
        background:
          "linear-gradient(135deg, #8B0E18 0%, #6A0A12 50%, #3F050B 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.12)",
        boxShadow: [
          "inset 0 1px 0 rgba(255,255,255,0.16)",
          "0 8px 24px rgba(80,5,15,0.25)",
        ].join(", "),
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: "rgba(255,255,255,0.95)",
          color: "#7A0E0E",
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
        {SCHOOL.initials}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 18,
            color: "#fff",
            letterSpacing: "-0.01em",
            lineHeight: 1.1,
          }}
        >
          {SCHOOL.name}
        </div>
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            color: "rgba(255,255,255,0.7)",
            lineHeight: 1.2,
          }}
        >
          {SCHOOL.city} · {onVibeLabel}
          {activeLabel ? ` · ${activeLabel}` : ""}
        </div>
      </div>
      <div style={{ flex: 1 }} />
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
        className="vibe-campus-messages-btn"
        style={{
          alignItems: "center",
          justifyContent: "center",
          width: 38,
          height: 38,
          borderRadius: 12,
          background: "rgba(255,255,255,0.14)",
          border: "1px solid rgba(255,255,255,0.18)",
          color: "#fff",
          textDecoration: "none",
          flexShrink: 0,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
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
            background: "rgba(255,255,255,0.14)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "#fff",
            cursor: "pointer",
            flexShrink: 0,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
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
      ) : (
        <CampusSearchBar />
      )}
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
  is_public: boolean;
  verified: boolean;
  member_count: number;
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

function CampusSearchBar() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [orgs, setOrgs] = useState<SearchOrg[]>([]);
  const [events, setEvents] = useState<SearchEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const [coords, setCoords] = useState<{ right: number; top: number; width: number } | null>(null);
  const seqRef = useRef(0);

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
    if (!debounced) {
      // Render layer reads `showResults = !!debounced` and ignores the
      // results lists, so we don't need to clear them here. Stale
      // in-flight fetches are guarded by the seq counter below.
      return;
    }
    const seq = ++seqRef.current;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(
          `/api/search?q=${encodeURIComponent(debounced)}&limit=6`,
          { credentials: "include" },
        );
        const j = r.ok ? await r.json() : { ok: false };
        if (seq !== seqRef.current) return;
        if (j && j.ok) {
          setUsers(Array.isArray(j.users) ? j.users : []);
          setOrgs(Array.isArray(j.orgs) ? j.orgs : []);
          setEvents(Array.isArray(j.events) ? j.events : []);
        } else {
          setUsers([]);
          setOrgs([]);
          setEvents([]);
        }
      } catch {
        if (seq !== seqRef.current) return;
        setUsers([]);
        setOrgs([]);
        setEvents([]);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    })();
  }, [debounced]);

  const updateCoords = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
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
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

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
  const goEvent = (id: string) => {
    if (id) window.location.assign(`/campus?tab=events&event=${encodeURIComponent(id)}`);
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

  const showResults = !!debounced;
  const empty =
    showResults && !loading && users.length === 0 && orgs.length === 0 && events.length === 0;

  return (
    <>
      <div
        ref={wrapRef}
        id="campus-search"
        style={{
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
        }}
      >
        <span style={{ opacity: 0.7 }}>⌕</span>
        <input
          ref={inputRef}
          type="text"
          name="vibe_search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Search students, orgs, events…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setOpen(true)}
          aria-label="Search Vibe"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#fff",
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
                    action={
                      r.rel === "connected"
                        ? "Message"
                        : r.rel === "following"
                          ? "Pending"
                          : r.rel === "followed_by"
                            ? "Connect back"
                            : "Connect"
                    }
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
                    const action =
                      u.rel === "connected"
                        ? "Message"
                        : u.rel === "following"
                          ? "Pending"
                          : u.rel === "followed_by"
                            ? "Connect back"
                            : "Connect";
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
                      role={`${o.member_count} members${o.verified ? " · Verified" : ""}`}
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
      onMouseEnter={(e) => (e.currentTarget.style.background = "#F2EFE9")}
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
      <button
        onClick={(e) => e.stopPropagation()}
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: COLORS.accent,
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
      {props.isRecent && props.onRemove ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.onRemove?.();
          }}
          title="Remove from recent"
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
      onMouseEnter={(e) => (e.currentTarget.style.background = "#F2EFE9")}
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
        onClick={(e) => e.stopPropagation()}
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: COLORS.accent,
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
}: {
  active: CampusTab;
  onChange: (tab: CampusTab) => void;
}) {
  return (
    <nav
      id="campus-tabs"
      style={{
        padding: "10px 24px",
        display: "flex",
        gap: 6,
        borderBottom: `1px solid ${COLORS.glassBorder}`,
        background: "rgba(15,10,28,0.32)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
      }}
    >
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            style={{
              position: "relative",
              padding: "8px 16px",
              borderRadius: 999,
              border: isActive
                ? "1px solid rgba(255,180,150,0.55)"
                : "1px solid rgba(255,255,255,0.1)",
              background: isActive
                ? "linear-gradient(180deg, rgba(255,92,53,0.45) 0%, rgba(255,92,53,0.18) 100%)"
                : "rgba(255,255,255,0.04)",
              color: isActive ? "#fff" : "rgba(255,255,255,0.7)",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              fontWeight: isActive ? 700 : 500,
              cursor: "pointer",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              boxShadow: isActive
                ? "inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 16px rgba(255,92,53,0.18)"
                : "inset 0 1px 0 rgba(255,255,255,0.08)",
              transition: "all 200ms ease",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

function TabBody({
  tab,
  onCreateOrg,
  feedTagFilter,
  onClearTagFilter,
  onPickTag,
}: {
  tab: CampusTab;
  onCreateOrg: () => void;
  feedTagFilter: string | null;
  onClearTagFilter: () => void;
  onPickTag: (tag: string) => void;
}) {
  if (tab === "feed")
    return (
      <FeedTabBody
        key={feedTagFilter ?? "all"}
        tagFilter={feedTagFilter}
        onClearTagFilter={onClearTagFilter}
        onPickTag={onPickTag}
      />
    );
  if (tab === "events") return <EventsTabBody />;
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
  type: "post" | "clip";
  content: string;
  tags: string[] | null;
  media_url: string | null;
  media_thumbnail_url: string | null;
  edit_metadata: import("@/lib/clip/edit-metadata").ClipEditMetadata | null;
  // Client picks the right player from this. "video" for clips and for
  // X-style video posts. "image" for image posts. null for text-only.
  media_kind: "video" | "image" | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  repost_count: number;
  viewer_liked: boolean;
  viewer_reposted: boolean;
  created_at: string;
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

type FeedMode = "posts" | "clips";

function FeedTabBody({
  tagFilter,
  onClearTagFilter,
  onPickTag,
}: {
  tagFilter: string | null;
  onClearTagFilter: () => void;
  onPickTag: (tag: string) => void;
}) {
  const [entries, setEntries] = useState<FeedEntry[] | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  // Posts vs Clips toggle. When `clips`, the feed becomes a vertical
  // Reels-style player that auto-plays the visible clip. Tag-filter mode
  // forces back to Posts since hashtag drilldowns mix both kinds.
  const [mode, setMode] = useState<FeedMode>("posts");

  const feedUrl = tagFilter
    ? `/api/feed?limit=50&tag=${encodeURIComponent(tagFilter)}`
    : "/api/feed?limit=50";

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(feedUrl, { cache: "no-store" });
      const data = await res.json();
      setEntries(
        data?.ok && Array.isArray(data.feed) ? (data.feed as FeedEntry[]) : [],
      );
      if (data?.ok && typeof data.viewerId === "string") {
        setViewerId(data.viewerId);
      }
    } catch (e) {
      console.error("[campus] feed", e);
      setEntries([]);
    }
  }, [feedUrl]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(feedUrl, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        setEntries(
          data?.ok && Array.isArray(data.feed) ? (data.feed as FeedEntry[]) : [],
        );
        if (data?.ok && typeof data.viewerId === "string") {
          setViewerId(data.viewerId);
        }
      } catch (e) {
        console.error("[campus] feed", e);
        if (!cancelled) setEntries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [feedUrl]);

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
      el.style.background = "rgba(255,92,53,0.10)";
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

  // Cream-tinted Liquid Glass — the whole feed is one frosted column with
  // X-style hairline-separated rows.
  const feedGlass: React.CSSProperties = {
    background:
      "linear-gradient(180deg, rgba(255,253,248,0.65) 0%, rgba(255,250,240,0.55) 100%)",
    backdropFilter: "blur(28px) saturate(180%)",
    WebkitBackdropFilter: "blur(28px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.7)",
    boxShadow: [
      "inset 0 1px 0 rgba(255,255,255,0.85)",
      "inset 0 -1px 0 rgba(28,28,30,0.04)",
      "0 8px 32px rgba(180,120,60,0.08)",
    ].join(", "),
    borderRadius: 22,
    overflow: "hidden",
  };

  const hairline = "1px solid rgba(28,28,30,0.06)";

  return (
    <section
      id="campus-feed"
      style={{
        flex: 1,
        padding: "28px 24px 28px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        width: "100%",
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
        /* Header + Otto strip in a row: header on the left, Heads-up /
           Trending cards filling the dead space to its right. Flex-wraps
           on narrower widths so the strip drops below the header instead
           of squishing both. */
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "0 1 360px", minWidth: 240, maxWidth: 480 }}>
            <SceneHeader
              eyebrow="Feed · IU"
              title="What’s on campus today"
              subtitle="Posts from clubs, orgs, and your network."
              tone="dark"
            />
          </div>
          <div style={{ flex: "1 1 460px", minWidth: 280 }}>
            <OttoFeedStrip onPickTag={onPickTag} />
          </div>
        </div>
      )}

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
      ) : (
        <FeedModeToggle mode={mode} onChange={setMode} />
      )}

      {!tagFilter && mode === "posts" ? (
        <FeedComposer
          glass={feedGlass}
          onPosted={() => {
            void refresh();
          }}
        />
      ) : null}

      {mode === "clips" && !tagFilter ? (
        <ClipsReel entries={entries} />
      ) : (
        // Posts column — second glass surface stacked under the composer
        <div style={feedGlass}>
          {entries === null ? (
            <div
              style={{
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
                padding: "32px 24px",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 14,
                color: COLORS.faint,
                textAlign: "center",
                lineHeight: 1.5,
              }}
            >
              No posts yet — orgs you follow and people from your school will
              show up here once they post.
            </div>
          ) : (
            entries.map((entry, idx) => (
              <FeedRow
                key={entry.kind === "repost" ? `r:${entry.reposter.id}:${entry.post.id}` : `p:${entry.post.id}`}
                entry={entry}
                hairline={idx < entries.length - 1 ? hairline : "none"}
                onMutate={refresh}
                onPickTag={onPickTag}
                viewerId={viewerId}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}

function feedModePillStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 18px",
    borderRadius: 999,
    border: active
      ? "1px solid rgba(255,255,255,0.32)"
      : "1px solid rgba(255,255,255,0.12)",
    background: active ? "rgba(255,255,255,0.16)" : "rgba(15,10,28,0.32)",
    color: "#fff",
    fontFamily: "DM Sans, sans-serif",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    backdropFilter: "blur(20px) saturate(160%)",
    WebkitBackdropFilter: "blur(20px) saturate(160%)",
    boxShadow: active
      ? "inset 0 1px 0 rgba(255,255,255,0.22), 0 6px 22px rgba(0,0,0,0.25)"
      : "inset 0 1px 0 rgba(255,255,255,0.1)",
  };
}

// Posts vs Clips pill toggle, sitting where the composer used to anchor
// the top of the feed. Same pill aesthetic as the campus tabs.
function FeedModeToggle({
  mode,
  onChange,
}: {
  mode: FeedMode;
  onChange: (m: FeedMode) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignSelf: "flex-start" }}>
      <button
        type="button"
        onClick={() => onChange("posts")}
        style={feedModePillStyle(mode === "posts")}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect
            x="1.5"
            y="2"
            width="11"
            height="10"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M3.5 5.5h7M3.5 8h5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        Posts
      </button>
      <button
        type="button"
        onClick={() => onChange("clips")}
        style={feedModePillStyle(mode === "clips")}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect
            x="2"
            y="1.5"
            width="10"
            height="11"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path d="M5.5 4.5L9.5 7L5.5 9.5V4.5Z" fill="currentColor" />
        </svg>
        Clips
      </button>
    </div>
  );
}

// Reels-style vertical player. Takes the same `entries` the post column
// reads, filters to clips, and stacks them as full-width 9:16 cards. The
// clip closest to the viewport center auto-plays (muted by default);
// others pause to keep CPU + bandwidth bounded. Tap a card to toggle
// mute. The action rail (like / comment / share / open) sits along the
// right edge of each card, IG-style.
function ClipsReel({ entries }: { entries: FeedEntry[] | null }) {
  const clips = useMemo(() => {
    if (!entries) return null;
    const seen = new Set<string>();
    const out: FeedPost[] = [];
    for (const e of entries) {
      if (e.kind !== "post") continue;
      if (e.post.type !== "clip") continue;
      if (seen.has(e.post.id)) continue;
      seen.add(e.post.id);
      out.push(e.post);
    }
    return out;
  }, [entries]);

  if (clips === null) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: "center",
          fontFamily: "DM Sans, sans-serif",
          color: COLORS.glassMuted,
        }}
      >
        Loading clips…
      </div>
    );
  }
  if (clips.length === 0) {
    return (
      <div
        style={{
          padding: "44px 24px",
          textAlign: "center",
          fontFamily: "DM Sans, sans-serif",
          color: COLORS.glassMuted,
          lineHeight: 1.5,
          background: "rgba(15,10,28,0.32)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          borderRadius: 22,
          border: `1px solid ${COLORS.glassBorder}`,
        }}
      >
        No clips yet — flip back to Posts, or upload one from the composer.
      </div>
    );
  }
  return <ClipsReelInner clips={clips} />;
}

export function ClipsReelInner({ clips }: { clips: FeedPost[] }) {
  // Scroll-snap container: clips snap one-per-viewport like desktop
  // TikTok. The container is the IntersectionObserver root for each
  // card so auto-play only fires for the clip that snaps into view,
  // not every clip that happens to be in the document viewport.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={scrollRef}
      style={{
        height: "min(calc(100vh - 200px), 860px)",
        overflowY: "auto",
        scrollSnapType: "y mandatory",
        scrollbarWidth: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        padding: "0 4px",
      }}
    >
      {clips.map((c, i) => (
        <div
          key={c.id}
          style={{
            scrollSnapAlign: "center",
            scrollSnapStop: "always",
            width: "100%",
            display: "flex",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <ClipReelCard clip={c} index={i} containerRef={scrollRef} />
        </div>
      ))}
    </div>
  );
}

function ClipReelCard({
  clip,
  index,
  containerRef,
}: {
  clip: FeedPost;
  index: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(true);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  // Engagement state — seeded from the feed payload, mutated optimistically
  // on click, rolled back on API failure. Same pattern as FeedRow.
  const [liked, setLiked] = useState(clip.viewer_liked);
  const [likeCount, setLikeCount] = useState(clip.like_count);
  const [reposted, setReposted] = useState(clip.viewer_reposted);
  const [repostCount, setRepostCount] = useState(clip.repost_count);
  const [commentCount, setCommentCount] = useState(clip.comment_count);
  const [showComments, setShowComments] = useState(false);

  // Lazy-fetch the signed playback URL once this card scrolls anywhere
  // near the snap container's viewport. Stored URLs are R2 object keys,
  // not direct URLs — the `/clips/:id/view-url` route signs a fresh GET.
  const [shouldLoad, setShouldLoad] = useState(index < 2);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || shouldLoad) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldLoad(true);
            io.disconnect();
            break;
          }
        }
      },
      { root: containerRef.current ?? null, rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shouldLoad, containerRef]);

  useEffect(() => {
    if (!shouldLoad || signedUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/clips/${encodeURIComponent(clip.id)}/view-url`, {
          cache: "no-store",
        });
        const j = await r.json();
        if (cancelled) return;
        if (j?.ok && typeof j.url === "string") setSignedUrl(j.url);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [clip.id, shouldLoad, signedUrl]);

  // Auto-play when at least 60% of the card is in view; pause otherwise.
  // Skipped while the comments sheet is open — the user is reading, not
  // watching, so suppress audio + decode work until they close it.
  useEffect(() => {
    const el = wrapRef.current;
    const v = videoRef.current;
    if (!el || !v) return;
    if (showComments) {
      // Indicator is hidden while the sheet is open (`!showComments`
      // guard on the play overlay) so we don't need to mirror to React
      // state — just stop the playback.
      v.pause();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            v.play()
              .then(() => setPaused(false))
              .catch(() => {});
          } else {
            v.pause();
            setPaused(true);
          }
        }
      },
      { root: containerRef.current ?? null, threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [signedUrl, showComments, containerRef]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setPaused(false)).catch(() => {});
    } else {
      v.pause();
      setPaused(true);
    }
  };

  // Apply lossless edit_metadata effects (speed, filter, trim, overlays).
  // Mirrors ClipViewerMobile so clips look the same wherever they play.
  const editMeta = clip.edit_metadata ?? null;
  const filterCss = editMeta?.filter ? FILTER_CSS[editMeta.filter] : undefined;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = editMeta?.speed ?? 1;
  }, [editMeta?.speed, signedUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const trim = editMeta?.trim ?? null;
    if (!trim) return;
    const startSec = trim.start_ms / 1000;
    const endSec = trim.end_ms / 1000;
    const onLoaded = () => {
      if (v.currentTime < startSec || v.currentTime > endSec) {
        try {
          v.currentTime = startSec;
        } catch {
          /* not yet seekable */
        }
      }
    };
    const onTimeUpdate = () => {
      if (v.currentTime >= endSec) {
        try {
          v.currentTime = startSec;
        } catch {
          /* ignore */
        }
      }
    };
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("timeupdate", onTimeUpdate);
    onLoaded();
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [editMeta?.trim, signedUrl]);

  // Playback progress for the bottom scrubber. We poll via the standard
  // `timeupdate` event (~4-15Hz, browser-dependent) which is plenty smooth
  // for a 1-2px-tall bar.
  const [progress, setProgress] = useState({ current: 0, duration: 0 });
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      setProgress({
        current: v.currentTime || 0,
        duration: Number.isFinite(v.duration) ? v.duration : 0,
      });
    };
    const onMeta = () => onTime();
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
    };
  }, [signedUrl]);

  const seekTo = (clientX: number, target: HTMLDivElement) => {
    const v = videoRef.current;
    if (!v || !progress.duration) return;
    const rect = target.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    v.currentTime = ratio * progress.duration;
    setProgress((p) => ({ ...p, current: v.currentTime }));
  };

  // "Tap to unmute" hint: shows on the first card while it's auto-playing
  // muted. Auto-dismisses after 3.5s, and stops showing the moment the
  // user unmutes (they don't need a hint anymore once they've touched
  // audio). Visibility is derived from state — no synchronous setState
  // in the effect body, just an async timer that flips `dismissed`.
  const [hintDismissed, setHintDismissed] = useState(false);
  useEffect(() => {
    if (index !== 0 || hintDismissed) return;
    if (paused || !muted) return;
    const t = setTimeout(() => setHintDismissed(true), 3500);
    return () => clearTimeout(t);
  }, [index, paused, muted, hintDismissed]);
  const showUnmuteHint = index === 0 && muted && !paused && !hintDismissed;

  // Double-tap to like (TikTok / IG behavior). The first tap is held in
  // `lastTapRef` for ~300ms; a second tap inside that window calls like
  // (only if not already liked — double-tap doesn't unlike). The side
  // heart filling coral is the "you liked it" indicator; no overlay.
  const lastTapRef = useRef<number>(0);
  const handleCardTap = () => {
    // eslint-disable-next-line react-hooks/purity -- click handler, runs at event time, not during render
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      if (!liked) void toggleLike();
      return;
    }
    lastTapRef.current = now;
    togglePlay();
  };

  const copyLink = useCallback(async () => {
    try {
      const url = `${window.location.origin}/posts/${clip.id}`;
      if (navigator.share) {
        await navigator.share({
          url,
          title: clip.content?.slice(0, 80) || "Clip on Vibe",
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      /* user dismissed share sheet, or clipboard blocked — silent */
    }
  }, [clip.id, clip.content]);

  const toggleLike = useCallback(async () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    try {
      const res = await fetch(`/api/posts/${clip.id}/like`, {
        method: next ? "POST" : "DELETE",
      });
      if (!res.ok) throw new Error(`like ${res.status}`);
    } catch (e) {
      console.error("[clips] like", e);
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
    }
  }, [clip.id, liked]);

  const toggleRepost = useCallback(async () => {
    const next = !reposted;
    setReposted(next);
    setRepostCount((c) => c + (next ? 1 : -1));
    try {
      const res = next
        ? await fetch(`/api/posts/${clip.id}/repost`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          })
        : await fetch(`/api/posts/${clip.id}/repost`, { method: "DELETE" });
      if (!res.ok) throw new Error(`repost ${res.status}`);
    } catch (e) {
      console.error("[clips] repost", e);
      setReposted(!next);
      setRepostCount((c) => c + (next ? -1 : 1));
    }
  }, [clip.id, reposted]);

  const author = clip.author?.name || (clip.author?.handle ? `@${clip.author.handle}` : "");
  const handle = clip.author?.handle ? `@${clip.author.handle}` : "";
  const poster = clip.media_thumbnail_url;
  const fallbackBg = clipFallbackGradient(clip.id);

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        // Desktop-TikTok sizing: drive height from the viewport so the
        // card fills as much vertical space as is comfortably available
        // (capped to 860px for very tall screens). Width is computed
        // from the 9:16 aspect ratio. On narrow screens, maxWidth: 100%
        // pulls width back and shrinks height proportionally so the
        // card never overflows.
        height: "min(calc(100vh - 200px), 860px)",
        aspectRatio: "9 / 16",
        width: "auto",
        maxWidth: "100%",
        borderRadius: 22,
        overflow: "hidden",
        background: poster ? `url(${poster}) center/cover, #000` : fallbackBg,
        boxShadow: "0 10px 40px rgba(0,0,0,0.32)",
        alignSelf: "center",
        cursor: "pointer",
      }}
      onClick={handleCardTap}
    >
      {signedUrl ? (
        <video
          ref={videoRef}
          src={signedUrl}
          poster={poster ?? undefined}
          muted={muted}
          loop
          playsInline
          preload="metadata"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: filterCss,
          }}
        />
      ) : null}

      {/* Text overlays — only render once we have the signed URL so they
          appear in sync with the playback frame. */}
      {signedUrl && editMeta?.text_overlays?.length
        ? editMeta.text_overlays.map((o) => (
            <div
              key={o.id}
              aria-hidden
              style={{
                position: "absolute",
                left: `${o.x}%`,
                top: `${o.y}%`,
                transform: "translate(-50%, -50%)",
                color: o.color,
                fontFamily: "DM Sans, sans-serif",
                fontWeight: 800,
                fontSize: 22,
                lineHeight: 1.2,
                textAlign: "center",
                textShadow: "0 1px 3px rgba(0,0,0,0.55), 0 0 1px rgba(0,0,0,0.35)",
                pointerEvents: "none",
                maxWidth: "82%",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {o.text}
            </div>
          ))
        : null}
      {paused && signedUrl && !showComments ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 64,
            height: 64,
            borderRadius: 999,
            background: "rgba(0,0,0,0.45)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            fontWeight: 700,
            backdropFilter: "blur(8px)",
            pointerEvents: "none",
          }}
        >
          ▶
        </span>
      ) : null}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMuted((m) => {
            const next = !m;
            if (videoRef.current) videoRef.current.muted = next;
            return next;
          });
        }}
        title={muted ? "Unmute" : "Mute"}
        aria-label={muted ? "Unmute" : "Mute"}
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          width: 36,
          height: 36,
          borderRadius: 999,
          border: "none",
          background: "rgba(0,0,0,0.5)",
          color: "#fff",
          cursor: "pointer",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {muted ? <SoundOffIcon /> : <SoundOnIcon />}
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          right: 14,
          bottom: 96,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          alignItems: "center",
          fontFamily: "DM Sans, sans-serif",
        }}
      >
        <ReelAction
          icon={<LikeIcon filled={liked} />}
          count={likeCount}
          active={liked}
          label={liked ? "Unlike" : "Like"}
          onClick={toggleLike}
        />
        <ReelAction
          icon={<CommentIcon />}
          count={commentCount}
          label="Comments"
          onClick={() => setShowComments(true)}
        />
        <ReelAction
          icon={<RepostIcon />}
          count={repostCount}
          active={reposted}
          label={reposted ? "Undo repost" : "Repost"}
          onClick={toggleRepost}
        />
        <ReelAction
          icon={<ShareIcon />}
          count={0}
          label="Share"
          onClick={copyLink}
        />
      </div>


      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "60px 18px 28px",
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.85) 100%)",
          color: "#fff",
          fontFamily: "DM Sans, sans-serif",
          pointerEvents: "none",
        }}
      >
        {author ? (
          <a
            href={handle ? `/profile/${encodeURIComponent(handle.slice(1))}` : "#"}
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: "#fff",
              textDecoration: "none",
              pointerEvents: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {author}
          </a>
        ) : null}
        {clip.content ? (
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.4,
              marginTop: 4,
              maxWidth: 280,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {clip.content}
          </div>
        ) : null}
      </div>

      {showComments ? (
        <ClipCommentsSheet
          postId={clip.id}
          onClose={() => setShowComments(false)}
          onCommentAdded={() => setCommentCount((c) => c + 1)}
        />
      ) : null}

      {/* "Tap to unmute" hint — only on the first clip while muted */}
      {showUnmuteHint ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 22,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "6px 12px",
            borderRadius: 999,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "DM Sans, sans-serif",
            backdropFilter: "blur(8px)",
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <SoundOffIcon /> Tap volume to unmute
        </div>
      ) : null}

      {/* Progress bar — sits flush against the bottom of the card so it
          doesn't compete with the caption gradient. Click to scrub. */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          seekTo(e.clientX, e.currentTarget);
        }}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 18,
          padding: "8px 14px 4px",
          cursor: "pointer",
          zIndex: 3,
        }}
      >
        <div
          style={{
            height: 3,
            width: "100%",
            borderRadius: 2,
            background: "rgba(255,255,255,0.22)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: progress.duration
                ? `${Math.min(100, (progress.current / progress.duration) * 100)}%`
                : "0%",
              background: "#FF5C35",
              transition: "width 80ms linear",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ReelAction({
  icon,
  count,
  active,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  count: number;
  active?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        background: "rgba(0,0,0,0.42)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        border: "none",
        borderRadius: 14,
        padding: "8px 8px 6px",
        minWidth: 44,
        cursor: "pointer",
        color: active ? "#FF5C35" : "#fff",
        textShadow: "0 2px 6px rgba(0,0,0,0.4)",
        fontFamily: "DM Sans, sans-serif",
        transition: "transform 120ms ease",
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: active ? "scale(1.08)" : "scale(1)",
        }}
      >
        {icon}
      </span>
      {count > 0 ? (
        <span style={{ fontSize: 11, fontWeight: 700 }}>{count}</span>
      ) : null}
    </button>
  );
}

// Bottom-sheet overlay that slides up over a clip card. Reuses the
// existing CommentsDrawer for the actual list + composer — same data
// model the post column uses, just a different chrome.
function ClipCommentsSheet({
  postId,
  onClose,
  onCommentAdded,
}: {
  postId: string;
  onClose: () => void;
  onCommentAdded: () => void;
}) {
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 5,
        display: "flex",
        alignItems: "flex-end",
        cursor: "default",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxHeight: "72%",
          background: "#FAF7F2",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          boxShadow: "0 -10px 30px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          fontFamily: "DM Sans, sans-serif",
          color: COLORS.text,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px 8px",
            borderBottom: "1px solid rgba(28,28,30,0.06)",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.4px" }}>
            Comments
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comments"
            style={{
              width: 28,
              height: 28,
              border: "none",
              background: "transparent",
              color: COLORS.muted,
              fontSize: 18,
              cursor: "pointer",
              borderRadius: 999,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ overflowY: "auto", padding: "0 18px 14px" }}>
          <CommentsDrawer postId={postId} onCommentAdded={onCommentAdded} />
        </div>
      </div>
    </div>
  );
}

// Deterministic warm gradient for clips that don't have a poster yet
// (the older publish path didn't capture one). Hashed from the clip id
// so the same clip always paints the same gradient.
function clipFallbackGradient(id: string): string {
  const presets = [
    ["#3F1A78", "#7B5FE0"],
    ["#3A0F1F", "#C8455B"],
    ["#1F2D5C", "#4F7BD8"],
    ["#5C2A0F", "#E08C5A"],
    ["#1F4D3A", "#5FB37E"],
    ["#4A1F4D", "#A65FB8"],
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  const [a, b] = presets[Math.abs(h) % presets.length]!;
  return `linear-gradient(135deg, ${a}, ${b})`;
}

// CapturedFrame / capturePosterFrame / classifyVideo / VideoMode /
// extractHashtags now live in @/lib/composer/helpers — shared with the
// mobile composer sheet.

function FeedComposer({
  glass,
  onPosted,
}: {
  glass: React.CSSProperties;
  onPosted: () => void;
}) {
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [clipFile, setClipFile] = useState<File | null>(null);
  // Auto-classified at file-pick time, user can override before publish.
  // - "clip"       → vertical short-form (≤120s, h>w*1.05). Reels feed.
  // - "post-video" → horizontal/square or longer. Renders inline in posts.
  const [videoMode, setVideoMode] = useState<VideoMode>("clip");
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

  const hasContent = !!text.trim() || !!imageFile || !!clipFile;

  const reset = () => {
    setText("");
    setImageFile(null);
    setClipFile(null);
    setVideoMeta(null);
    setVideoMode("clip");
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
        setError("Image too large — max 8MB.");
        return;
      }
      // Open the cropper before staging — confirmed crop becomes the
      // upload payload.
      setPendingImage(file);
      return;
    }
    if (file.type.startsWith("video/")) {
      if (file.size > 200 * 1024 * 1024) {
        setError("Video too large — max 200MB.");
        return;
      }
      setClipFile(file);
      setImageFile(null);
      // Probe for aspect ratio + duration so we can suggest the right
      // mode. Capture is best-effort (some formats won't decode in the
      // browser); we default to "clip" if probing fails since the size
      // cap is already lower for video posts.
      setVideoMeta(null);
      setVideoMode("clip");
      void capturePosterFrame(file).then((meta) => {
        setVideoMode(classifyVideo(meta.width, meta.height, meta.duration));
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
    setClipFile(null);
    setPendingImage(null);
  };

  const submit = useCallback(async () => {
    if (!hasContent || busy) return;
    setBusy(true);
    setError(null);
    try {
      const trimmed = text.trim();
      const tags = extractHashtags(trimmed);

      if (clipFile) {
        // Clips and X-style video posts share the same R2 storage path —
        // only the publish endpoint differs. Probe the video here if we
        // didn't already (covers the publish-before-probe-finished race).
        let meta = videoMeta;
        if (!meta) {
          const captured = await capturePosterFrame(clipFile);
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
            contentType: clipFile.type,
            sizeBytes: clipFile.size,
          }),
        }).then((r) => r.json());
        if (!sig?.ok) throw new Error(sig?.error || "Could not start upload");

        // 2. Upload directly to R2.
        const putRes = await fetch(sig.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": clipFile.type },
          body: clipFile,
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

        // 4. Record the row — endpoint depends on the user-chosen mode.
        if (videoMode === "clip") {
          const pub = await fetch("/api/me/publish-clip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              object_key: sig.objectKey,
              content: trimmed,
              tags,
              poster_url: posterUrl,
              duration_sec: durationSec,
            }),
          }).then((r) => r.json());
          if (!pub?.ok) throw new Error(pub?.error || "Publish failed");
        } else {
          // X-style video post: same storage, different table type.
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
        }
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
  }, [busy, clipFile, hasContent, imageFile, onPosted, text, videoMeta, videoMode]);

  const previewUrl = imageFile ? URL.createObjectURL(imageFile) : null;
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div style={glass}>
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
              border: "1px solid rgba(28,28,30,0.06)",
              paddingTop: "56%",
              background: `url(${previewUrl}) center/cover`,
              position: "relative",
            }}
          >
            <button
              type="button"
              onClick={() => setImageFile(null)}
              style={composerRemoveButton}
              aria-label="Remove photo"
            >
              ×
            </button>
          </div>
        ) : null}
        {clipFile ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              border: "1px solid rgba(28,28,30,0.08)",
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
              🎬 {clipFile.name} · {(clipFile.size / (1024 * 1024)).toFixed(1)} MB
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: COLORS.faint, fontWeight: 600 }}>
                Post as:
              </span>
              <button
                type="button"
                onClick={() => setVideoMode("clip")}
                style={composerVideoModePill(videoMode === "clip")}
                title="Vertical short-form, lands in the Clips reel"
              >
                Clip
              </button>
              <button
                type="button"
                onClick={() => setVideoMode("post-video")}
                style={composerVideoModePill(videoMode === "post-video")}
                title="X-style horizontal video, lands in the Posts feed"
              >
                Video post
              </button>
              {videoMeta?.duration ? (
                <span style={{ fontSize: 11, color: COLORS.faint, marginLeft: "auto" }}>
                  {Math.round(videoMeta.duration)}s
                  {videoMeta.width && videoMeta.height
                    ? ` · ${videoMeta.width}×${videoMeta.height}`
                    : ""}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setClipFile(null);
                setVideoMeta(null);
                setVideoMode("clip");
              }}
              style={composerRemoveButton}
              aria-label="Remove video"
            >
              ×
            </button>
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
              background: hasContent && !busy ? COLORS.accent : "rgba(28,28,30,0.18)",
              color: "#fff",
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
          onCancel={() => setPendingImage(null)}
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

function composerVideoModePill(active: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    padding: "4px 10px",
    borderRadius: 999,
    border: active ? "1px solid #5B41B8" : "1px solid rgba(28,28,30,0.12)",
    background: active ? "#5B41B8" : "transparent",
    color: active ? "#fff" : COLORS.text,
    cursor: "pointer",
    fontFamily: "DM Sans, sans-serif",
    letterSpacing: "0.2px",
  };
}

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
 * Render a post body with `@handle` mentions and `#tags` linkified.
 *
 * Splits the raw text on a single regex that matches either an @mention
 * or a #hashtag (each preceded by start-of-string or a non-word char so
 * we don't grab the @ in an email or a # inside a URL fragment). Each
 * matched token becomes a clickable element; plain runs stay as
 * `<span>` so the surrounding `white-space: pre-wrap` keeps newlines.
 *
 * - @mentions → /profile/<handle> via next/link
 * - #hashtags → onPickTag(tag) — switches the feed to the tag-filtered
 *   view (same path the trending pills use)
 *
 * Handles match the users.handle CHECK (lowercase a-z, 0-9, underscore,
 * 3–20 chars). Tags allow letters / digits / underscores up to 32 chars,
 * which matches the publish-post tag sanitizer.
 */
function renderPostContent(
  text: string,
  onPickTag: (tag: string) => void,
): React.ReactNode {
  if (!text) return null;
  const re = /(^|[^A-Za-z0-9_@#])([@#][A-Za-z0-9_]{1,32})/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    const leading = match[1] ?? "";
    const token = match[2] ?? "";
    // Position of the @ or # within the original string.
    const tokenStart = match.index + leading.length;
    if (tokenStart > lastIndex) {
      nodes.push(
        <span key={`t${key++}`}>{text.slice(lastIndex, tokenStart)}</span>,
      );
    }
    const sigil = token[0];
    const body = token.slice(1).toLowerCase();
    if (sigil === "@" && body.length >= 3) {
      nodes.push(
        <Link
          key={`m${key++}`}
          href={`/profile/${encodeURIComponent(body)}`}
          style={{ color: "#FF5C35", fontWeight: 600, textDecoration: "none" }}
        >
          {token}
        </Link>,
      );
    } else if (sigil === "#") {
      nodes.push(
        <button
          key={`h${key++}`}
          type="button"
          onClick={() => onPickTag(body)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "#FF5C35",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "inherit",
            lineHeight: "inherit",
          }}
        >
          {token}
        </button>,
      );
    } else {
      // Bare @ with no handle (1-2 chars) — keep as plain text.
      nodes.push(<span key={`p${key++}`}>{token}</span>);
    }
    lastIndex = tokenStart + token.length;
  }
  if (lastIndex < text.length) {
    nodes.push(<span key={`t${key++}`}>{text.slice(lastIndex)}</span>);
  }
  return nodes;
}

function FeedRow({
  entry,
  hairline,
  onMutate,
  onPickTag,
  viewerId,
}: {
  entry: FeedEntry;
  hairline: string;
  onMutate: () => void;
  onPickTag: (tag: string) => void;
  viewerId: string | null;
}) {
  const post = entry.post;
  const fromOrg = !!post.org;
  // Owner check: the post's user_id is the author. Org posts attribute
  // back to the user too, so we treat author === viewer as ownership
  // regardless of whether the post is org- or person-attributed.
  const viewerOwnsPost = !!viewerId && post.user_id === viewerId;
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

  // Local engagement state — seeded from the feed payload, mutated optimistically
  // on click. `onMutate` re-fetches the feed so other rows (and the repost UNION)
  // stay in sync after a quote-repost.
  const [liked, setLiked] = useState(post.viewer_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [reposted, setReposted] = useState(post.viewer_reposted);
  const [repostCount, setRepostCount] = useState(post.repost_count);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [viewCount, setViewCount] = useState(post.view_count);
  const [showComments, setShowComments] = useState(false);
  const [showRepostMenu, setShowRepostMenu] = useState(false);
  // Owner-only "more" menu — Delete is the only entry for now. Anchored
  // on the row's top-right via a small kebab. Click-outside closes it.
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onDeletePost = useCallback(async () => {
    if (deleting) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete this post? This can't be undone.")
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`delete ${res.status}`);
      setShowMoreMenu(false);
      // Refetch the feed so the deleted row falls out without us having
      // to plumb the deletion into parent state directly.
      onMutate();
    } catch (e) {
      console.error("[feed] delete post", e);
      setDeleting(false);
    }
  }, [deleting, post.id, onMutate]);

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

  const toggleLike = useCallback(async () => {
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((c) => c + (nextLiked ? 1 : -1));
    try {
      const res = await fetch(`/api/posts/${post.id}/like`, {
        method: nextLiked ? "POST" : "DELETE",
      });
      if (!res.ok) throw new Error(`like ${res.status}`);
    } catch (e) {
      console.error("[feed] like", e);
      // Roll back.
      setLiked(!nextLiked);
      setLikeCount((c) => c + (nextLiked ? -1 : 1));
    }
  }, [liked, post.id]);

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

  return (
    <article
      ref={articleRef}
      id={`post-${post.id}`}
      data-post-id={post.id}
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "16px 20px",
        borderBottom: hairline,
        transition: "background 600ms ease",
        position: "relative",
      }}
    >
      {viewerOwnsPost ? (
        <div
          data-feedrow-more
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            zIndex: 2,
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
              e.currentTarget.style.background = "rgba(28,28,30,0.06)";
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
                minWidth: 160,
                background: "white",
                border: "1px solid rgba(28,28,30,0.08)",
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
                onClick={onDeletePost}
                disabled={deleting}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 12px",
                  borderRadius: 8,
                  background: "transparent",
                  border: "none",
                  color: "#C0392B",
                  fontFamily: "inherit",
                  fontSize: "inherit",
                  fontWeight: 600,
                  cursor: deleting ? "default" : "pointer",
                  opacity: deleting ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!deleting) e.currentTarget.style.background = "#FAF7F2";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {deleting ? "Deleting…" : "Delete post"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {entry.kind === "repost" ? (
        <RepostBanner reposter={entry.reposter} />
      ) : null}
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
          {post.type === "clip" ? (
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 999,
                background: "rgba(123,95,224,0.14)",
                color: "#5B41B8",
                fontFamily: "DM Sans, sans-serif",
              }}
            >
              Clip
            </span>
          ) : null}
        </div>
        {post.content ? (
          <p
            style={{
              margin: 0,
              color: COLORS.text,
              fontFamily: "DM Sans, sans-serif",
              fontSize: 15,
              lineHeight: 1.45,
              whiteSpace: "pre-wrap",
            }}
          >
            {renderPostContent(post.content, onPickTag)}
          </p>
        ) : null}
        {post.media_url && post.type === "post" && post.media_kind === "image" ? (
          <div
            style={{
              marginTop: 10,
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid rgba(28,28,30,0.06)",
              paddingTop: "56%",
              background: `url(${post.media_url}) center/cover`,
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
              border: "1px solid rgba(28,28,30,0.06)",
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
          <EngagementAction
            icon={<LikeIcon filled={liked} />}
            count={likeCount}
            label="Like"
            onClick={toggleLike}
            active={liked}
            activeColor="#E0245E"
          />
          <EngagementAction
            icon={<EyeIcon />}
            count={viewCount}
            label="Views"
          />
          <EngagementAction
            icon={<ShareIcon />}
            label="Share"
            onClick={handleShare}
          />
          {showRepostMenu ? (
            <RepostMenu
              postId={post.id}
              alreadyReposted={reposted}
              onClose={() => setShowRepostMenu(false)}
              onDone={(action) => {
                setShowRepostMenu(false);
                if (action === "added") {
                  setReposted(true);
                  setRepostCount((c) => c + 1);
                } else if (action === "removed") {
                  setReposted(false);
                  setRepostCount((c) => Math.max(0, c - 1));
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
            onCommentAdded={() => setCommentCount((c) => c + 1)}
          />
        ) : null}
      </div>
      </div>
    </article>
  );
}

function RepostBanner({ reposter }: { reposter: FeedAuthor }) {
  const label = reposter.handle
    ? `@${reposter.handle}`
    : reposter.name || "Someone";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 8,
        marginLeft: 28,
        color: COLORS.faint,
        fontFamily: "DM Sans, sans-serif",
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <RepostIcon />
      <span>
        {reposter.handle ? (
          <Link
            href={`/profile/${encodeURIComponent(reposter.handle)}`}
            style={{ color: COLORS.faint, textDecoration: "none" }}
          >
            {label}
          </Link>
        ) : (
          label
        )}{" "}
        reposted
      </span>
    </div>
  );
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

  const submit = async (mode: "repost" | "undo") => {
    setBusy(true);
    try {
      if (mode === "undo") {
        const res = await fetch(`/api/posts/${postId}/repost`, { method: "DELETE" });
        if (!res.ok) throw new Error(`undo ${res.status}`);
        onDone("removed");
        return;
      }
      const trimmed = comment.trim();
      const body = trimmed ? { comment: trimmed } : {};
      const res = await fetch(`/api/posts/${postId}/repost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`repost ${res.status}`);
      onDone(alreadyReposted ? "edited" : "added");
    } catch (e) {
      console.error("[feed] repost", e);
      onDone("noop");
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
        background: "#FFFFFF",
        border: "1px solid rgba(28,28,30,0.08)",
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
            border: "1px solid rgba(28,28,30,0.12)",
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
            border: "1px solid rgba(28,28,30,0.12)",
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
  author: {
    id: string;
    name: string | null;
    handle: string | null;
    avatar_url: string | null;
  } | null;
};

function CommentsDrawer({
  postId,
  onCommentAdded,
}: {
  postId: string;
  onCommentAdded: () => void;
}) {
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/comments`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        setComments(
          data?.ok && Array.isArray(data.comments) ? (data.comments as FeedComment[]) : [],
        );
      } catch (e) {
        console.error("[feed] comments", e);
        if (!cancelled) setComments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postId]);

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
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();
      if (data?.ok && data.comment) {
        handleNewComment(data.comment as FeedComment);
        setDraft("");
      }
    } catch (e) {
      console.error("[feed] add comment", e);
    } finally {
      setSubmitting(false);
    }
  }, [draft, postId, submitting, handleNewComment]);

  return (
    <div
      style={{
        marginTop: 10,
        borderTop: "1px solid rgba(28,28,30,0.06)",
        paddingTop: 10,
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      {comments === null ? (
        <div style={{ fontSize: 12, color: COLORS.faint }}>Loading comments…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                border: "1px solid rgba(28,28,30,0.12)",
                borderRadius: 999,
                padding: "8px 14px",
                fontSize: 13,
                fontFamily: "DM Sans, sans-serif",
                outline: "none",
                color: COLORS.text,
                background: "rgba(255,255,255,0.7)",
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
                background: draft.trim() ? COLORS.accent : "rgba(28,28,30,0.18)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                cursor: submitting || !draft.trim() ? "default" : "pointer",
              }}
            >
              Post
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  postId,
  onReplyAdded,
  isReply = false,
}: {
  comment: FeedComment;
  postId: string;
  onReplyAdded: (c: FeedComment) => void;
  isReply?: boolean;
}) {
  const [liked, setLiked] = useState(comment.viewer_liked);
  const [likeCount, setLikeCount] = useState(comment.like_count);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);

  const name = comment.author?.name || comment.author?.handle || "Member";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

  const toggleLike = useCallback(async () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    try {
      const res = await fetch(`/api/comments/${comment.id}/like`, {
        method: next ? "POST" : "DELETE",
      });
      if (!res.ok) throw new Error(`like ${res.status}`);
    } catch (e) {
      console.error("[feed] comment like", e);
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
    }
  }, [comment.id, liked]);

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
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, parent_comment_id: comment.id }),
      });
      const data = await res.json();
      if (data?.ok && data.comment) {
        onReplyAdded(data.comment as FeedComment);
        setReplyDraft("");
        setReplyOpen(false);
      }
    } catch (e) {
      console.error("[feed] reply", e);
    } finally {
      setReplySubmitting(false);
    }
  }, [replyDraft, postId, comment.id, replySubmitting, onReplyAdded]);

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div
        style={{
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
        }}
      >
        {!comment.author?.avatar_url ? initials : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "baseline",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: "Fraunces, serif",
              fontWeight: 800,
              fontSize: isReply ? 12 : 13,
              color: COLORS.text,
            }}
          >
            {name}
          </span>
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
              color: liked ? "#E0245E" : "inherit",
              font: "inherit",
            }}
          >
            <LikeIcon filled={liked} />
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
        </div>
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
                border: "1px solid rgba(28,28,30,0.12)",
                borderRadius: 999,
                padding: "6px 12px",
                fontSize: 12.5,
                fontFamily: "DM Sans, sans-serif",
                outline: "none",
                color: COLORS.text,
                background: "rgba(255,255,255,0.7)",
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
                background: replyDraft.trim() ? COLORS.accent : "rgba(28,28,30,0.18)",
                color: "#fff",
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
        {comment.replies && comment.replies.length > 0 ? (
          <div
            style={{
              marginTop: 10,
              paddingLeft: 10,
              borderLeft: "2px solid rgba(28,28,30,0.06)",
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
                onReplyAdded={onReplyAdded}
                isReply
              />
            ))}
          </div>
        ) : null}
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

function SoundOnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M3.5 6.75h2L9 4v10L5.5 11.25h-2v-4.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill="currentColor"
      />
      <path
        d="M11.6 6.6c1 1 1 3.8 0 4.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M13.6 4.8c1.7 1.6 1.7 6.8 0 8.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function SoundOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M3.5 6.75h2L9 4v10L5.5 11.25h-2v-4.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill="currentColor"
      />
      <path
        d="M11.5 6.5l4 5M15.5 6.5l-4 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
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

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M14 2L7.5 8.5M14 2L9.5 14L7.5 8.5M14 2L2 6.5L7.5 8.5"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
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
}: {
  icon: React.ReactNode;
  count?: number;
  label?: string;
  onClick?: () => void;
  active?: boolean;
  activeColor?: string;
}) {
  const interactive = typeof onClick === "function";
  const color = active && activeColor ? activeColor : undefined;
  const formatted = formatEngagementCount(count);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={interactive ? active : undefined}
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
        transition: "color 120ms ease",
      }}
    >
      {icon}
      {formatted ? <span>{formatted}</span> : null}
    </button>
  );
}

function formatEngagementCount(n: number | undefined): string | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
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
          color: dark ? "#C84A20" : "#FFB89C",
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

function EventsTabBody() {
  const [events, setEvents] = useState<CampusEvent[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [eligibleOrgs, setEligibleOrgs] = useState<EligibleOrg[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/events?limit=50", { cache: "no-store" });
      const data = await res.json();
      setEvents(
        data?.ok && Array.isArray(data.events) ? (data.events as CampusEvent[]) : [],
      );
    } catch (e) {
      console.error("[campus] events", e);
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [evRes, orgRes] = await Promise.all([
          fetch("/api/events?limit=50", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/orgs?filter=mine", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setEvents(
          evRes?.ok && Array.isArray(evRes.events)
            ? (evRes.events as CampusEvent[])
            : [],
        );
        if (orgRes?.ok && Array.isArray(orgRes.orgs)) {
          const eligible = (orgRes.orgs as EligibleOrg[]).filter(
            (o) => (o.role === "owner" || o.role === "admin") && !!o.verified,
          );
          setEligibleOrgs(eligible);
        }
      } catch (e) {
        console.error("[campus] events", e);
        if (!cancelled) setEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canCreate = eligibleOrgs.length > 0;

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
          eyebrow="Events · IU"
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
              color: "#fff",
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

      {events === null ? (
        <div style={{ color: COLORS.glassMuted, fontFamily: "DM Sans, sans-serif", fontSize: 14, padding: "20px 0" }}>
          Loading events…
        </div>
      ) : events.length === 0 ? (
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
          {events.map((ev) => (
            <EventCard key={ev.id} ev={ev} onMutate={refresh} />
          ))}
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

export function EventCard({ ev, onMutate }: { ev: CampusEvent; onMutate: () => void }) {
  const accent = colorForOrg(ev.org?.id ?? ev.creator_id);
  const [status, setStatus] = useState<"going" | "maybe" | null>(ev.viewer_status);
  const [going, setGoing] = useState(ev.going_count);
  const [interested, setInterested] = useState(ev.interested_count);
  const [busy, setBusy] = useState(false);

  const setRsvp = async (next: "going" | "maybe" | null) => {
    if (busy) return;
    const prev = status;
    setBusy(true);
    // Optimistic counter math
    if (prev === "going" && next !== "going") setGoing((c) => Math.max(0, c - 1));
    if (prev === "maybe" && next !== "maybe") setInterested((c) => Math.max(0, c - 1));
    if (next === "going" && prev !== "going") setGoing((c) => c + 1);
    if (next === "maybe" && prev !== "maybe") setInterested((c) => c + 1);
    setStatus(next);
    try {
      const res = next
        ? await fetch(`/api/events/${ev.id}/rsvp`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: next }),
          })
        : await fetch(`/api/events/${ev.id}/rsvp`, { method: "DELETE" });
      if (!res.ok) throw new Error(`rsvp ${res.status}`);
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
        🗓 {formatEventTime(ev.starts_at, ev.ends_at)}
        {ev.location ? (
          <>
            <br />📍 {ev.location}
          </>
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
      <div style={{ display: "flex", gap: 8 }}>
        <RsvpButton
          label="Going"
          active={status === "going"}
          accent={accent}
          onClick={() => setRsvp(status === "going" ? null : "going")}
          disabled={busy}
        />
        <RsvpButton
          label={`Interested${interested > 0 ? ` · ${interested}` : ""}`}
          active={status === "maybe"}
          accent={accent}
          onClick={() => setRsvp(status === "maybe" ? null : "maybe")}
          disabled={busy}
        />
      </div>
      {(status || ev.viewer_can_manage) ? (
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
        </div>
      ) : null}
      </div>
    </MouseSpotlight>
  );
}

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

type Attendee = {
  status: "going" | "maybe";
  user: {
    id: string;
    name: string | null;
    handle: string | null;
    avatar_url: string | null;
    major: string | null;
    year: number | null;
  };
};

function AttendeesModal({
  eventId,
  eventTitle,
  onClose,
}: {
  eventId: string;
  eventTitle: string;
  onClose: () => void;
}) {
  const [going, setGoing] = useState<Attendee[] | null>(null);
  const [interested, setInterested] = useState<Attendee[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/attendees`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        setGoing(data.going ?? []);
        setInterested(data.interested ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load attendees");
          setGoing([]);
          setInterested([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

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
    const recipients = (going ?? []).map((a) => a.user.id);
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

  const goingCount = going?.length ?? 0;
  const interestedCount = interested?.length ?? 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(8,6,12,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...eventModalSurface, maxWidth: 520, maxHeight: "82vh", overflow: "auto" }}
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
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 800, fontSize: 18, color: "#fff" }}>
              Attendees
            </div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
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
                color: "#fff",
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

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <button
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
      </div>
    </div>
  );
}

function AttendeeList({
  heading,
  rows,
  onMessage,
  accent,
}: {
  heading: string;
  rows: Attendee[] | null;
  onMessage: (handle: string | null) => void;
  accent: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
                gap: 10,
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
              <div style={{ flex: 1, minWidth: 0 }}>
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
}: {
  label: string;
  active: boolean;
  accent: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
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
        cursor: disabled ? "default" : "pointer",
        boxShadow: active
          ? `inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 14px ${hexToRgba(accent, 0.28)}`
          : "inset 0 1px 0 rgba(255,255,255,0.18)",
        transition: "background 120ms ease, border-color 120ms ease",
      }}
    >
      {label}
    </button>
  );
}

function formatUpcomingChip(startIso: string): string {
  // Compact chip for the Otto rail. "Today" and "Tmrw" are common-case
  // shortcuts; everything else falls back to a short month/day.
  try {
    const start = new Date(startIso);
    const now = new Date();
    const startMid = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const nowMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round(
      (startMid.getTime() - nowMid.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tmrw";
    if (diffDays > 1 && diffDays < 7) {
      return start.toLocaleDateString([], { weekday: "short" });
    }
    return start.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
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

export function CreateEventModal({
  eligibleOrgs,
  onClose,
  onCreated,
}: {
  eligibleOrgs: EligibleOrg[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState(defaultStartIsoLocal());
  const [endsAt, setEndsAt] = useState(defaultEndIsoLocal());
  const [orgId, setOrgId] = useState<string>(eligibleOrgs[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!orgId) {
      setError("Pick which verified org this event is for.");
      return;
    }
    setBusy(true);
    try {
      const startMs = Date.parse(startsAt);
      const endMs = Date.parse(endsAt);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        throw new Error("Pick valid start and end times");
      }
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          location: location.trim(),
          starts_at: new Date(startMs).toISOString(),
          ends_at: new Date(endMs).toISOString(),
          org_id: orgId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create event");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(8,6,12,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={eventModalSurface}
      >
        <div
          style={{
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 20,
            color: "#fff",
          }}
        >
          Create event
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
          Posted on behalf of a verified org. Attendees will see your org name.
        </div>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 120))}
          placeholder="Event title"
          style={eventModalInput}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
          placeholder="What's this about? (optional)"
          rows={3}
          style={{ ...eventModalInput, resize: "vertical", minHeight: 70 }}
        />
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value.slice(0, 200))}
          placeholder="Location (e.g. Memorial Stadium, Zoom)"
          style={eventModalInput}
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
              onChange={(e) => setStartsAt(e.target.value)}
              style={{ ...eventModalInput, minWidth: 0 }}
            />
          </label>
          <label style={eventModalLabel}>
            Ends
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              style={{ ...eventModalInput, minWidth: 0 }}
            />
          </label>
        </div>
        <label style={eventModalLabel}>
          Posting on behalf of
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            style={eventModalInput}
          >
            {eligibleOrgs.map((o) => (
              <option key={o.id} value={o.id} style={{ color: "#1C1C1E" }}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
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
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !title.trim() || !startsAt || !endsAt || !orgId}
            style={{
              padding: "8px 18px",
              borderRadius: 999,
              border: "none",
              background:
                title.trim() && orgId && !busy
                  ? COLORS.accent
                  : "rgba(255,255,255,0.18)",
              color: "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 700,
              fontSize: 12,
              cursor: busy || !title.trim() || !orgId ? "default" : "pointer",
              boxShadow:
                title.trim() && orgId && !busy
                  ? "0 4px 16px rgba(255,92,53,0.32)"
                  : "none",
            }}
          >
            {busy ? "Creating…" : "Create event"}
          </button>
        </div>
      </div>
    </div>
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
  is_public: boolean;
  backdrop_preset: BackdropKey;
  verified: boolean;
  dormant: boolean;
  pending_request?: boolean;
  member_count?: number;
  role?: Role | null;
  links?: Array<{ label: string; url: string }>;
  philanthropy?: string;
};

type DiscoverFilter = "all" | "public" | "private";

function OrgsTabBody({ onCreateOrg }: { onCreateOrg: () => void }) {
  const [results, setResults] = useState<DiscoverOrg[] | null>(null);
  const [pending, setPending] = useState<Record<string, "joined" | "pending">>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filter, setFilter] = useState<DiscoverFilter>("all");
  const [showDormant, setShowDormant] = useState(false);
  const [previewOrg, setPreviewOrg] = useState<DiscoverOrg | null>(null);

  // Debounce the search input → debouncedQ. The fetch effect below depends
  // on debouncedQ, so it only refires after the user pauses typing.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput.trim()), 220);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ filter: "discover" });
        if (debouncedQ) params.set("q", debouncedQ);
        if (showDormant) params.set("include_dormant", "true");
        const res = await fetch(`/api/orgs?${params.toString()}`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        const orgs: DiscoverOrg[] =
          data?.ok && Array.isArray(data.orgs) ? data.orgs : [];
        setResults(orgs);
        const seeded: Record<string, "joined" | "pending"> = {};
        for (const o of orgs) {
          if (o.role) seeded[o.handle] = "joined";
          else if (o.pending_request) seeded[o.handle] = "pending";
        }
        // Merge with any in-session "joined" states so a successful join
        // earlier doesn't get reverted by the next fetch (this matters
        // less now that the API returns role, but kept defensively).
        setPending((prev) => {
          const next = { ...seeded };
          for (const [handle, status] of Object.entries(prev)) {
            if (status === "joined") next[handle] = "joined";
          }
          return next;
        });
      } catch (e) {
        console.error("[campus] discover", e);
        if (!cancelled) setResults([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, showDormant]);

  const handleJoin = async (org: DiscoverOrg) => {
    setBusy(org.handle);
    try {
      const res = await fetch(`/api/orgs/${org.handle}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data?.ok) {
        setPending((p) => ({
          ...p,
          [org.handle]: data.joined ? "joined" : "pending",
        }));
      }
    } catch (e) {
      console.error("[campus] join", e);
    } finally {
      setBusy(null);
    }
  };

  // Filter chips operate on the already-loaded result set — keeps
  // interaction snappy and avoids extra API churn while typing.
  const filtered = (results ?? []).filter((o) => {
    if (filter === "public") return o.is_public;
    if (filter === "private") return !o.is_public;
    return true;
  });

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
        eyebrow="Organizations · IU"
        title="Find your communities"
        subtitle="Browse clubs and orgs at IU. Public ones you can join instantly, private ones you can request."
        tone="dark"
      />

      <CreateOrgBanner onClick={onCreateOrg} />

      <DiscoverSearchBar value={searchInput} onChange={setSearchInput} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <DiscoverFilterChips value={filter} onChange={setFilter} />
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

      {results === null ? (
        <div
          style={{
            color: COLORS.glassMuted,
            fontFamily: "DM Sans, sans-serif",
            fontSize: 14,
          }}
        >
          Loading orgs…
        </div>
      ) : filtered.length === 0 ? (
        <DarkGlassCard>
          <div style={{ color: "#fff", fontFamily: "DM Sans, sans-serif", fontSize: 14 }}>
            {debouncedQ
              ? `No orgs match “${debouncedQ}”${filter !== "all" ? ` in ${filter}` : ""}.`
              : filter !== "all"
              ? `No ${filter} orgs to discover yet.`
              : "No orgs to discover yet — be the first to create one."}
          </div>
        </DarkGlassCard>
      ) : (
        (() => {
          const verifiedOrgs = filtered.filter((o) => o.verified);
          const communityOrgs = filtered.filter((o) => !o.verified && !o.dormant);
          const dormantOrgs = filtered.filter((o) => o.dormant);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {verifiedOrgs.length > 0 ? (
                <DiscoverGroup
                  title="Verified"
                  hint="Officially recognized orgs at IU."
                  orgs={verifiedOrgs}
                  pending={pending}
                  busy={busy}
                  onJoin={handleJoin}
                  onPreview={setPreviewOrg}
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
                  hint="Groups created by verified students. Anyone can join the public ones."
                  orgs={communityOrgs}
                  pending={pending}
                  busy={busy}
                  onJoin={handleJoin}
                  onPreview={setPreviewOrg}
                  titleStyle={{ color: "#FF5C35" }}
                />
              ) : null}
              {dormantOrgs.length > 0 ? (
                <DiscoverGroup
                  title="Dormant"
                  hint="No activity in the last 60 days. Verified orgs are never listed here."
                  orgs={dormantOrgs}
                  pending={pending}
                  busy={busy}
                  onJoin={handleJoin}
                  onPreview={setPreviewOrg}
                />
              ) : null}
            </div>
          );
        })()
      )}

      {previewOrg ? (
        <OrgQuickViewModal
          org={previewOrg}
          status={pending[previewOrg.handle]}
          busy={busy === previewOrg.handle}
          onClose={() => setPreviewOrg(null)}
          onJoin={() => handleJoin(previewOrg)}
        />
      ) : null}
    </section>
  );
}

function OrgQuickViewModal({
  org,
  status,
  busy,
  onClose,
  onJoin,
}: {
  org: DiscoverOrg;
  status: "joined" | "pending" | undefined;
  busy: boolean;
  onClose: () => void;
  onJoin: () => void;
}) {
  const orgColor = colorForOrg(org.id);
  const memberCount = org.member_count ?? 0;
  const ctaLabel = org.role
    ? "Joined"
    : status === "pending"
    ? "Requested"
    : org.is_public
    ? "Join"
    : "Request to join";
  const ctaDisabled = !!org.role || !!status || busy;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(8,4,16,0.62)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS_SURFACE,
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
                <span>@{org.handle}</span>
                <span style={{ opacity: 0.4 }}>·</span>
                {!org.is_public ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <LockIcon size={10} /> Private
                  </span>
                ) : (
                  <span>Public</span>
                )}
                <span style={{ opacity: 0.4 }}>·</span>
                <span>
                  {memberCount} {memberCount === 1 ? "member" : "members"}
                </span>
                {org.role ? (
                  <>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <RoleChip role={org.role} />
                  </>
                ) : null}
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

          {/* CTAs */}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {org.role ? (
              <div
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(120,220,150,0.35)",
                  background:
                    "linear-gradient(180deg, rgba(120,220,150,0.18) 0%, rgba(120,220,150,0.06) 100%)",
                  color: "#D7F5DD",
                  fontWeight: 700,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <CheckIcon />
                {ctaLabel}
              </div>
            ) : (
              <button
                type="button"
                disabled={ctaDisabled}
                onClick={onJoin}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: status
                    ? "1px solid rgba(255,255,255,0.14)"
                    : "1px solid rgba(255,180,150,0.45)",
                  background: status
                    ? "rgba(255,255,255,0.06)"
                    : "linear-gradient(180deg, rgba(255,92,53,0.55) 0%, rgba(255,92,53,0.22) 100%)",
                  color: status ? "rgba(255,255,255,0.7)" : "#fff",
                  fontFamily: "DM Sans, sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: ctaDisabled ? "default" : "pointer",
                  opacity: busy ? 0.6 : 1,
                  boxShadow: status ? "none" : "inset 0 1px 0 rgba(255,255,255,0.22)",
                }}
              >
                {ctaLabel}
              </button>
            )}
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
        </div>
      </div>
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
          color: "#fff",
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
  pending,
  busy,
  onJoin,
  onPreview,
  titleStyle,
}: {
  title: string;
  hint: string;
  orgs: DiscoverOrg[];
  pending: Record<string, "joined" | "pending">;
  busy: string | null;
  onJoin: (org: DiscoverOrg) => void;
  onPreview: (org: DiscoverOrg) => void;
  titleStyle?: React.CSSProperties;
}) {
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
            color: "#1C1C1E",
            letterSpacing: "-0.01em",
            ...titleStyle,
          }}
        >
          {title}
          <span
            style={{
              marginLeft: 8,
              fontSize: 13,
              fontWeight: 500,
              color: "rgba(28,28,30,0.55)",
              // Reset any inherited gradient from the title.
              background: "none",
              WebkitBackgroundClip: "border-box",
              WebkitTextFillColor: "rgba(28,28,30,0.55)",
            }}
          >
            {orgs.length}
          </span>
        </div>
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            color: "rgba(28,28,30,0.55)",
          }}
        >
          {hint}
        </div>
      </div>
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
            status={pending[o.handle]}
            busy={busy === o.handle}
            onJoin={() => onJoin(o)}
            onPreview={() => onPreview(o)}
          />
        ))}
      </div>
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
    { key: "public", label: "Public" },
    {
      key: "private",
      label: (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <LockIcon size={11} /> Private
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
  status,
  busy,
  onJoin,
  onPreview,
}: {
  org: DiscoverOrg;
  status: "joined" | "pending" | undefined;
  busy: boolean;
  onJoin: () => void;
  onPreview: () => void;
}) {
  const [hover, setHover] = useState(false);
  const orgColor = colorForOrg(org.id);
  const memberCount = org.member_count ?? 0;
  const label =
    status === "joined"
      ? "Joined"
      : status === "pending"
      ? "Requested"
      : org.is_public
      ? "Join"
      : "Request to join";
  const disabled = !!status || busy;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onPreview}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
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
            <span style={{ opacity: 0.75 }}>@{org.handle}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            {!org.is_public ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <LockIcon size={10} /> Private
              </span>
            ) : (
              <span>Public</span>
            )}
            <span style={{ opacity: 0.4 }}>·</span>
            <span>
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </span>
          </div>
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

      <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
        {org.role ? (
          // Already a member — show a static "Joined" affordance with a
          // role chip; no rejoin button needed.
          <div
            style={{
              flex: 1,
              padding: "9px 12px",
              borderRadius: 10,
              border: "1px solid rgba(120,220,150,0.35)",
              background:
                "linear-gradient(180deg, rgba(120,220,150,0.18) 0%, rgba(120,220,150,0.06) 100%)",
              color: "#D7F5DD",
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 700,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          >
            <CheckIcon />
            <span>Joined</span>
            <RoleChip role={org.role} />
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onJoin();
            }}
            style={{
              flex: 1,
              padding: "9px 12px",
              borderRadius: 10,
              border: status
                ? "1px solid rgba(255,255,255,0.14)"
                : "1px solid rgba(255,180,150,0.45)",
              background: status
                ? "rgba(255,255,255,0.06)"
                : "linear-gradient(180deg, rgba(255,92,53,0.45) 0%, rgba(255,92,53,0.2) 100%)",
              color: status ? "rgba(255,255,255,0.7)" : "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 700,
              fontSize: 13,
              cursor: disabled ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
              boxShadow: status ? "none" : "inset 0 1px 0 rgba(255,255,255,0.22)",
            }}
          >
            {label}
          </button>
        )}
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
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden style={{ flexShrink: 0 }}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8.5L6.5 12 13 4.5"
      />
    </svg>
  );
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
  member_count: number;
};
type MapSummary = {
  ok: boolean;
  demo?: boolean;
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
  const [data, setData] = useState<MapSummary | null>(null);
  const [selected, setSelected] = useState<ZoneSelection | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  // The map auto-falls back to demo zones server-side when the school
  // has no real major data yet — once real students fill in their majors
  // the actual zones replace the placeholders, no toggle needed.
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
      try {
        const res = await fetch("/api/campus-map", { cache: "no-store" });
        const j = await res.json();
        if (cancelled) return;
        if (j?.ok) {
          setData(j as MapSummary);
        } else {
          setData({ ok: false } as unknown as MapSummary);
        }
      } catch {
        if (!cancelled) setData({ ok: false } as unknown as MapSummary);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
  //   3. Distribute active schools evenly around 360° (in IU_SCHOOLS
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
      const school = schoolForMajor(m.name);
      const list = grouped.get(school.id) ?? [];
      list.push(m);
      grouped.set(school.id, list);
    }

    // Active schools, preserving IU_SCHOOLS order.
    const active = IU_SCHOOLS.filter((s) => grouped.has(s.id));
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
  }, [data]);

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

  const isLoading = data === null;
  const hasData = !!data && Array.isArray(data.majors) && data.majors.length > 0;

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
        eyebrow="Campus · IU"
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
        ) : !hasData ? (
          <div style={mapEmptyOverlayStyle}>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, color: "#fff", marginBottom: 6 }}>
              No zones yet
            </div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, maxWidth: 320, textAlign: "center" }}>
              We&apos;ll start lighting up zones once more students at your school have a major set on their profile.
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
                const school = schoolForMajor(m.name);
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
        {/* Demo toggle — separate absolutely-positioned button so the
             canvas's pointer handlers can't swallow its click. */}
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

      </div>

      {selected ? (
        <ZonePanel
          key={`${selected.kind}:${selected.key}:${data?.demo ? "demo" : "real"}`}
          selection={selected}
          demo={!!data?.demo}
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

// Soft tinted halo per IU school. Painted BEFORE the bubbles so the
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
      {IU_SCHOOLS.map((s) => {
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
      {IU_SCHOOLS.map((s) => {
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
  x,
  y,
  radius,
  active,
  onClick,
}: {
  major: MapMajor;
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
  const school = schoolForMajor(major.name);
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
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
                  {o.member_count} members
                </div>
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
  demo,
  onClose,
}: {
  selection: ZoneSelection;
  demo: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<{
    connected: ZoneRow[];
    mutuals: ZoneRow[];
    discover: ZoneRow[];
  } | null>(null);
  const [tab, setTab] = useState<"discover" | "mutuals" | "connected">("discover");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const base =
          selection.kind === "major"
            ? `/api/campus-map/zone?major=${encodeURIComponent(selection.key)}`
            : `/api/campus-map/zone?org=${encodeURIComponent(selection.key)}`;
        const url = demo ? `${base}&demo=1` : base;
        const res = await fetch(url, { cache: "no-store" });
        const j = await res.json();
        if (cancelled) return;
        if (j?.ok) {
          setData({
            connected: j.connected ?? [],
            mutuals: j.mutuals ?? [],
            discover: j.discover ?? [],
          });
          // Bias the default tab toward the bucket with the highest signal.
          if ((j.mutuals ?? []).length > 0) setTab("mutuals");
          else if ((j.discover ?? []).length > 0) setTab("discover");
          else if ((j.connected ?? []).length > 0) setTab("connected");
        }
      } catch {
        if (!cancelled) setData({ connected: [], mutuals: [], discover: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selection, demo]);

  if (typeof document === "undefined") return null;

  const rows = data
    ? tab === "connected"
      ? data.connected
      : tab === "mutuals"
      ? data.mutuals
      : data.discover
    : null;

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
        {rows === null ? (
          <div style={{ color: "rgba(255,255,255,0.55)", fontFamily: "DM Sans, sans-serif", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.55)", fontFamily: "DM Sans, sans-serif", fontSize: 13, padding: "20px 0", textAlign: "center", lineHeight: 1.5 }}>
            {tab === "discover"
              ? "No new faces here yet."
              : tab === "mutuals"
              ? "No mutuals here — try Discover."
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

/**
 * Horizontal Otto strip — sits above the feed, replaces the old right-
 * column OttoPanel for the Feed tab. Two cards side by side:
 *   - Heads up    → events the viewer has RSVP'd to (max 3 inline)
 *   - Trending    → most-posted hashtags this week (clickable pills)
 * People-to-Connect is intentionally NOT on this strip — that lives on
 * /network where the user is already in discovery mode.
 *
 * Mobile (<900px) stacks the two cards vertically via grid auto-fit.
 */
export function OttoFeedStrip({ onPickTag }: { onPickTag: (tag: string) => void }) {
  const [trending, setTrending] = useState<Array<{ tag: string; count: number }> | null>(null);
  const [upcoming, setUpcoming] = useState<
    Array<{
      id: string;
      title: string;
      starts_at: string;
      ends_at: string;
      location: string;
      viewer_status: "going" | "maybe";
      org: { handle: string; name: string; verified: boolean } | null;
    }> | null
  >(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tRes, uRes] = await Promise.all([
          fetch("/api/trending/hashtags?limit=8", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/me/upcoming-events?limit=3", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setTrending(tRes?.ok && Array.isArray(tRes.trending) ? tRes.trending : []);
        setUpcoming(uRes?.ok && Array.isArray(uRes.upcoming) ? uRes.upcoming : []);
      } catch {
        if (!cancelled) {
          setTrending([]);
          setUpcoming([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subtle = "rgba(255,255,255,0.55)";
  const divider = "rgba(255,255,255,0.06)";

  // Single unified bubble — outer surface wraps both sections; the
  // vertical separator in between is drawn by .otto-strip-divider so it
  // can flip to a horizontal rule on narrow widths via media query.
  // Outer halo + a tighter inner orange glow give the bubble a warm
  // signature so it reads as "Otto" without a leading orb / nameplate.
  const surface: React.CSSProperties = {
    background:
      "linear-gradient(180deg, rgba(255,140,90,0.10) 0%, rgba(255,92,53,0.04) 50%, rgba(20,8,16,0.0) 100%), rgba(12,8,14,0.78)",
    backdropFilter: "blur(28px) saturate(180%)",
    WebkitBackdropFilter: "blur(28px) saturate(180%)",
    border: "1px solid rgba(255,140,90,0.45)",
    boxShadow: [
      "inset 0 1px 0 rgba(255,180,150,0.28)",
      "inset 0 -1px 0 rgba(0,0,0,0.18)",
      "0 0 0 1px rgba(255,140,90,0.18)",
      "0 0 24px rgba(255,92,53,0.28)",
      "0 0 56px rgba(255,92,53,0.18)",
      "0 8px 28px rgba(80,12,8,0.32)",
    ].join(", "),
    color: "#fff",
    borderRadius: 18,
    overflow: "hidden",
  };

  const sectionPad: React.CSSProperties = {
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    flex: "1 1 0",
  };

  return (
    <div style={surface} className="otto-strip">
      <style>{`
        .otto-strip-inner {
          display: flex;
          flex-direction: row;
          align-items: stretch;
        }
        .otto-strip-divider {
          width: 1px;
          align-self: stretch;
          background: linear-gradient(
            180deg,
            rgba(255,180,150,0) 0%,
            rgba(255,180,150,0.28) 20%,
            rgba(255,180,150,0.28) 80%,
            rgba(255,180,150,0) 100%
          );
          flex-shrink: 0;
        }
        @media (max-width: 560px) {
          .otto-strip-inner { flex-direction: column; }
          .otto-strip-divider {
            width: auto;
            height: 1px;
            background: linear-gradient(
              90deg,
              rgba(255,180,150,0) 0%,
              rgba(255,180,150,0.28) 20%,
              rgba(255,180,150,0.28) 80%,
              rgba(255,180,150,0) 100%
            );
          }
        }
      `}</style>
      <div className="otto-strip-inner">
        {/* Heads up */}
        <div style={sectionPad}>
          <StripHeader
            icon={<TalkingHeadIcon />}
            title="Heads up"
            subtitle="Events you RSVP'd to"
            subtle={subtle}
          />
          <div style={{ marginTop: 4, flex: 1 }}>
            {upcoming === null ? (
              <div style={{ fontSize: 12, color: subtle, padding: "8px 0" }}>Loading…</div>
            ) : upcoming.length === 0 ? (
              <div style={{ fontSize: 12, color: subtle, padding: "8px 0", lineHeight: 1.5 }}>
                No upcoming events on your radar — RSVP from the Events tab.
              </div>
            ) : (
              upcoming.slice(0, 3).map((u, i) => {
                const accent = u.viewer_status === "going" ? "#5BD18C" : "#FFB85A";
                const chip = formatUpcomingChip(u.starts_at);
                const isLast = i >= Math.min(upcoming.length, 3) - 1;
                return (
                  <div
                    key={u.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 0",
                      borderBottom: isLast ? "none" : `1px solid ${divider}`,
                    }}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: 3, background: accent, flexShrink: 0 }} />
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontFamily: "DM Sans, sans-serif",
                        fontSize: 13,
                        color: "#fff",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {u.title}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: accent, whiteSpace: "nowrap" }}>
                      {chip}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Vertical divider (horizontal on phone via media query) */}
        <div className="otto-strip-divider" aria-hidden />

        {/* Trending */}
        <div style={sectionPad}>
          <StripHeader
            icon={<FireIcon />}
            title="Trending on campus"
            subtitle="Most-posted hashtags this week"
            subtle={subtle}
          />
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              alignContent: "flex-start",
            }}
          >
            {trending === null ? (
              <div style={{ fontSize: 12, color: subtle }}>Loading…</div>
            ) : trending.length === 0 ? (
              <div style={{ fontSize: 12, color: subtle, lineHeight: 1.5 }}>
                No trending tags yet — start one with a #hashtag in your post.
              </div>
            ) : (
              trending.map((t) => (
                <button
                  key={t.tag}
                  type="button"
                  onClick={() => onPickTag(t.tag)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "5px 10px",
                    borderRadius: 999,
                    background: "rgba(255,140,90,0.12)",
                    border: "1px solid rgba(255,140,90,0.28)",
                    color: "#FFB89C",
                    fontFamily: "DM Sans, sans-serif",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span>#{t.tag}</span>
                  <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>
                    {t.count}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Megaphone for the "Heads up" header. Orange horn with a coral handle
// and stacked sound arcs fanning out the wide end so it reads as an
// announcement at glyph size. 20×20 with a 28-wide viewBox to fit the
// horn + sound waves without clipping.
function TalkingHeadIcon() {
  return (
    <svg
      width="22"
      height="20"
      viewBox="0 0 28 24"
      fill="none"
      aria-hidden
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="mphHorn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF9A40" />
          <stop offset="100%" stopColor="#E04918" />
        </linearGradient>
        <linearGradient id="mphRim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFD37A" />
          <stop offset="100%" stopColor="#FF7A2A" />
        </linearGradient>
        <linearGradient id="mphHandle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3A2418" />
          <stop offset="100%" stopColor="#1F140C" />
        </linearGradient>
      </defs>
      {/* Handle/grip on the back end (left side). */}
      <rect x="2.2" y="10.2" width="3.8" height="3.6" rx="1.1" fill="url(#mphHandle)" />
      {/* Trigger button on the handle. */}
      <rect x="3.4" y="13.6" width="1.4" height="2.2" rx="0.5" fill="#1F140C" />
      {/* Horn body — narrow back tapering to a wide mouth on the right. */}
      <path
        d="M5.8 9.2h2.6l9.6-3.4c.7-.3 1.5.2 1.5 1v10.4c0 .8-.8 1.3-1.5 1l-9.6-3.4H5.8c-.6 0-1-.4-1-1V10.2c0-.6.4-1 1-1Z"
        fill="url(#mphHorn)"
      />
      {/* Brass rim at the bell — gives the megaphone its signature edge. */}
      <path
        d="M18.6 4.7c.7-.3 1.5.2 1.5 1v12.6c0 .8-.8 1.3-1.5 1l-1-.4V5.1l1-.4Z"
        fill="url(#mphRim)"
      />
      {/* Three sound arcs broadcasting out the bell, fading outward. */}
      <path d="M22 9.5c.7.6 1.1 1.6 1.1 2.7s-.4 2.1-1.1 2.7" stroke="#FFC04A" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M24.2 7.6c1.3.9 2.1 2.6 2.1 4.6s-.8 3.7-2.1 4.6" stroke="#FF8C42" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />
      <path d="M26.2 5.8c1.7 1.2 2.8 3.5 2.8 6.4s-1.1 5.2-2.8 6.4" stroke="#FF5C35" strokeWidth="1.3" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

// Layered flame for the "Trending" header. Hot yellow-white core nested
// inside an orange body inside a red outer flame, with a separate flicker
// detached above so the icon reads as live fire rather than a single drop.
function FireIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="fireOuter" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#FF8A2A" />
          <stop offset="55%" stopColor="#FF4D14" />
          <stop offset="100%" stopColor="#C42F0A" />
        </linearGradient>
        <linearGradient id="fireMid" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#FFE066" />
          <stop offset="60%" stopColor="#FF9A1F" />
          <stop offset="100%" stopColor="#FF5C20" />
        </linearGradient>
        <radialGradient id="fireCore" cx="0.5" cy="0.65" r="0.55">
          <stop offset="0%" stopColor="#FFF7C2" />
          <stop offset="45%" stopColor="#FFE25C" />
          <stop offset="100%" stopColor="#FFAE2E" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Outer flame — broad base with a hooked tip so it reads as fire,
          not a teardrop. */}
      <path
        d="M12 2c.2 2.5-.8 4-2 5.6C8 10 5.5 12.4 5.5 15.6 5.5 19.1 8.4 22 12 22s6.5-2.9 6.5-6.4c0-2-1-3.8-2.3-5.4-1.5-1.8-2.2-3.4-2.2-5C13.3 4 12.7 2.8 12 2Z"
        fill="url(#fireOuter)"
      />
      {/* Middle flame — narrower, slightly offset so the gradient stack
          gives the body depth instead of flat shading. */}
      <path
        d="M12.4 8.4c.1 1.9-1 3-2 4.4-1 1.4-2.1 2.7-2.1 4.5 0 2.3 1.7 4.1 4 4.1s4-1.9 4-4.2c0-1.5-.7-2.8-1.7-4-.9-1.2-1.6-2.5-1.6-3.8 0-.4-.2-.8-.6-1Z"
        fill="url(#fireMid)"
      />
      {/* Hot core ember — radial glow at the bottom. */}
      <ellipse cx="12.1" cy="17.4" rx="2.6" ry="3.4" fill="url(#fireCore)" />
      {/* Detached flicker above so the flame "leaves" the body. */}
      <path
        d="M14.3 4.5c.4.9.1 1.7-.5 2.4-.5.6-.7 1.2-.4 1.9-.9-.3-1.3-1-1.2-1.9.1-1 .8-1.8 2.1-2.4Z"
        fill="#FFE25C"
        opacity="0.95"
      />
    </svg>
  );
}

function StripHeader({
  icon,
  title,
  subtitle,
  subtle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  subtle: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
      <span
        style={{ fontSize: 14, lineHeight: 1, display: "inline-flex", alignItems: "center" }}
        aria-hidden
      >
        {icon}
      </span>
      <span
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#fff",
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 11,
          color: subtle,
          fontStyle: "italic",
        }}
      >
        {subtitle}
      </span>
    </div>
  );
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
  activeChannelId,
  onSelectChannel,
  onOpenCreateChannel,
  onOpenSettings,
  onOpenChannelSettings,
}: {
  org: Org | null;
  channels: Channel[];
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
          {!org.is_public ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <LockIcon size={11} /> Private
            </span>
          ) : (
            "Public"
          )}{" "}
          · {channels.length} channels
        </div>
      </header>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 8px", position: "relative", zIndex: 1 }}>
        {(() => {
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
        minHeight: "100vh",
        position: "relative",
        background: backdropCss,
        transition: "background 600ms ease",
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

function ChannelChat({
  channelId,
  channelName,
  isCream,
}: {
  channelId: string;
  channelName: string;
  isCream: boolean;
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
  const [loaded, setLoaded] = useState(false);
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

  // Single fetch helper. Used by the 2s poll AND on demand (e.g. after a
  // reaction toggle, so the new chip stays put instead of getting clobbered
  // by the next poll cycle racing with our POST).
  const refetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/me/threads/${channelId}/messages?limit=80`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data?.ok && Array.isArray(data.messages)) {
        setMessages(data.messages as ChatMessage[]);
      }
    } catch (e) {
      console.error("[campus] refetch messages", e);
    }
  }, [channelId]);

  // Poll messages every 2s while this channel is open. Skips while a
  // reaction toggle is in flight — otherwise a poll that started just
  // before the click lands a stale messages array and clobbers the
  // freshly-flipped chip.
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      if (pendingReactionsRef.current > 0) return;
      try {
        const res = await fetch(`/api/me/threads/${channelId}/messages?limit=80`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        if (pendingReactionsRef.current > 0) return; // late return — drop it
        if (data?.ok && Array.isArray(data.messages)) {
          setMessages(data.messages as ChatMessage[]);
        }
      } catch (e) {
        console.error("[campus] poll messages", e);
      } finally {
        if (!cancelled) setLoaded(true);
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
      const res = await fetch(`/api/me/threads/${channelId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content,
          parent_message_id: parent?.id,
        }),
      });
      const data = await res.json();
      if (data?.ok && data.message) {
        // Optimistic — append immediately so it doesn't take 2s to show.
        setMessages((prev) => [...prev, data.message as ChatMessage]);
      } else {
        setDraft(content); // restore so user can retry
        if (parent) setReplyTo(parent);
      }
    } catch (e) {
      console.error("[campus] send", e);
      setDraft(content);
      if (parent) setReplyTo(parent);
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
        const res = await fetch(
          `/api/me/threads/${channelId}/messages/${messageId}/react`,
          {
            method: nextActive ? "POST" : "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ emoji }),
          },
        );
        if (!res.ok) throw new Error(`react ${res.status}`);
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
        {!loaded ? (
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
          messages.map((m, idx) => {
            const prev = idx > 0 ? messages[idx - 1] : null;
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
        {replyTo ? (
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
  admin: { label: "Admin", color: "#FF7355", tint: "rgba(255,115,85,0.18)" },
  mod: { label: "Mod", color: "#9B7BFF", tint: "rgba(155,123,255,0.18)" },
  member: { label: "Member", color: "#9DD8FF", tint: "rgba(157,216,255,0.18)" },
};

const ROLE_PERMS: Record<Role, string[]> = {
  owner: [
    "Edit org name, description, visibility, backdrop",
    "Create / rename / delete channels",
    "Promote, demote, and remove anyone",
    "Approve or deny join requests",
    "Delete the org",
  ],
  admin: [
    "Edit org overview + backdrop",
    "Create / rename / delete channels",
    "Promote/demote mods + members; remove non-admins",
    "Approve or deny join requests",
  ],
  mod: [
    "Chat in every public channel",
    "Private channels only when explicitly invited by owner/admin",
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
}: {
  showSchoolVerifiedBanner: boolean;
  onCreateOrg: () => void;
}) {
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
        Campus · IU
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
        <Link
          href="/campus/discover"
          style={{
            ...GLASS_SURFACE,
            display: "block",
            padding: 24,
            borderRadius: 20,
            textDecoration: "none",
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
            Browse clubs and orgs at IU. Public ones you can join instantly,
            private ones you can request to join.
          </p>
        </Link>
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
