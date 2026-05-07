"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CampusAppShell } from "@/components/campus-app-shell";
import { ImageCropperModal } from "@/components/ImageCropperModal";
import { emitCalendarChanged } from "@/components/LeftNav";

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

const SCHOOL = {
  initials: "IU",
  name: "Indiana University",
  city: "Bloomington, IN",
  students: "45,000 students",
  onVibe: "2,847 on Vibe",
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
  const [tab, setTab] = useState<CampusTab>(() =>
    parseInitialTab(searchParams.get("tab")),
  );
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
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: "72px 240px 1fr",
              minHeight: 0,
            }}
          >
            <ServerRail
              orgs={orgs ?? []}
              activeOrgId={activeOrgId}
              onSelectOrg={(id) => setActiveOrgId(id)}
              onCreateOrg={() => setShowCreateOrg(true)}
            />
            <ChannelRail
              org={activeOrg}
              channels={activeChannels}
              activeChannelId={activeChannelId}
              onSelectChannel={handleSelectChannel}
              onOpenCreateChannel={() => setShowCreateChannel(true)}
              onOpenSettings={() => setShowSettings(true)}
              onOpenChannelSettings={(id) => setChannelSettingsId(id)}
            />
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
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: "1fr 340px",
              minHeight: 0,
            }}
          >
            <TabBody
              tab={tab}
              onCreateOrg={() => setShowCreateOrg(true)}
              feedTagFilter={feedTagFilter}
              onClearTagFilter={() => setFeedTagFilter(null)}
            />
            <OttoPanel onPickTag={onPickTag} />
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
            maxLength={80}
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
  @keyframes campus-banner-sheen {
    0% { transform: translateX(-120%); }
    60% { transform: translateX(220%); }
    100% { transform: translateX(220%); }
  }
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

function CampusBanner() {
  return (
    <header
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
      {/* animated specular sweep */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)",
          width: "40%",
          animation: "campus-banner-sheen 7s ease-in-out infinite",
        }}
      />

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
          {SCHOOL.city} · {SCHOOL.students} · {SCHOOL.onVibe}
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div
        style={{
          ...GLASS_SURFACE,
          background: "rgba(255,255,255,0.1)",
          borderRadius: 999,
          padding: "8px 16px",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 13,
          color: "rgba(255,255,255,0.7)",
          minWidth: 240,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ opacity: 0.7 }}>⌕</span>
        Search students, orgs…
      </div>
    </header>
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
}: {
  tab: CampusTab;
  onCreateOrg: () => void;
  feedTagFilter: string | null;
  onClearTagFilter: () => void;
}) {
  if (tab === "feed")
    return (
      <FeedTabBody
        key={feedTagFilter ?? "all"}
        tagFilter={feedTagFilter}
        onClearTagFilter={onClearTagFilter}
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

type FeedPost = {
  id: string;
  user_id: string;
  org_id: string | null;
  type: "post" | "clip";
  content: string;
  tags: string[] | null;
  media_url: string | null;
  media_thumbnail_url: string | null;
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

function FeedTabBody({
  tagFilter,
  onClearTagFilter,
}: {
  tagFilter: string | null;
  onClearTagFilter: () => void;
}) {
  const [entries, setEntries] = useState<FeedEntry[] | null>(null);

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
      } catch (e) {
        console.error("[campus] feed", e);
        if (!cancelled) setEntries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [feedUrl]);

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
        <SceneHeader
          eyebrow="Feed · IU"
          title="What’s on campus today"
          subtitle="Posts from clubs, orgs, and your network."
          tone="dark"
        />
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
        <FeedComposer
          glass={feedGlass}
          onPosted={() => {
            void refresh();
          }}
        />
      )}

      {/* Posts column — second glass surface stacked under the composer */}
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
            />
          ))
        )}
      </div>
    </section>
  );
}

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
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);

  const hasContent = !!text.trim() || !!imageFile || !!clipFile;

  const reset = () => {
    setText("");
    setImageFile(null);
    setClipFile(null);
    setError(null);
    if (attachInputRef.current) attachInputRef.current.value = "";
  };

  // One paperclip → one file input → route by mimetype. Photo and clip
  // are mutually exclusive at the row level (a post is either text+image
  // or a clip), so picking a new file replaces whatever was staged.
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
        setError("Clip too large — max 200MB.");
        return;
      }
      setClipFile(file);
      setImageFile(null);
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

        // 3. Record the row.
        const pub = await fetch("/api/me/publish-clip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            object_key: sig.objectKey,
            content: trimmed,
            tags,
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
  }, [busy, clipFile, hasContent, imageFile, onPosted, text]);

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
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 2000))}
          placeholder="What's happening on campus?  Use #hashtags to tag your post."
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
              alignItems: "center",
              justifyContent: "space-between",
              border: "1px solid rgba(28,28,30,0.08)",
              borderRadius: 12,
              padding: "10px 14px",
              background: "rgba(123,95,224,0.08)",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              color: COLORS.text,
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              🎬 {clipFile.name} · {(clipFile.size / (1024 * 1024)).toFixed(1)} MB
            </span>
            <button
              type="button"
              onClick={() => setClipFile(null)}
              style={composerRemoveButton}
              aria-label="Remove clip"
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

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[A-Za-z0-9_]{1,32}/g);
  if (!matches) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const t = m.replace(/^#+/, "").toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 10) break;
  }
  return out;
}

function FeedRow({
  entry,
  hairline,
  onMutate,
}: {
  entry: FeedEntry;
  hairline: string;
  onMutate: () => void;
}) {
  const post = entry.post;
  const fromOrg = !!post.org;
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
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "16px 20px",
        borderBottom: hairline,
        transition: "background 120ms ease",
      }}
    >
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
      <div
        style={{
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
        }}
      >
        {!avatarUrl ? initials : null}
      </div>
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
          {fromOrg && post.org?.handle ? (
            <Link
              href={`/orgs/${post.org.handle}`}
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
          <span
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              color: COLORS.faint,
            }}
          >
            {displayHandle ? `${displayHandle} · ` : ""}
            {relativeTime(post.created_at)}
          </span>
          {fromOrg && post.author?.handle ? (
            <span
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontSize: 12,
                color: COLORS.faint,
              }}
            >
              · posted by @{post.author.handle}
            </span>
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
            {post.content}
          </p>
        ) : null}
        {post.media_url && post.type === "post" ? (
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
        {post.media_url && post.type === "clip" ? (
          <video
            src={post.media_url}
            controls
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
        {reposter.handle ? `@${reposter.handle}` : reposter.name || "Someone"} reposted
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

type CampusEvent = {
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
              border: "1px solid rgba(255,255,255,0.22)",
              background: "rgba(255,255,255,0.10)",
              color: "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              whiteSpace: "nowrap",
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

function EventCard({ ev, onMutate }: { ev: CampusEvent; onMutate: () => void }) {
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

  return (
    <DarkGlassCard style={{ borderLeft: `3px solid ${accent}` }}>
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
    </DarkGlassCard>
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

type EligibleOrg = { id: string; name: string; handle: string; verified: boolean; role: string };

function CreateEventModal({
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={eventModalLabel}>
            Starts
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              style={eventModalInput}
            />
          </label>
          <label style={eventModalLabel}>
            Ends
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              style={eventModalInput}
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
  maxWidth: 480,
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

function MapTabBody() {
  const [data, setData] = useState<MapSummary | null>(null);
  const [selected, setSelected] = useState<ZoneSelection | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  // The map auto-falls back to demo zones server-side when the school
  // has no real major data yet — once real students fill in their majors
  // the actual zones replace the placeholders, no toggle needed.
  const [orgCollapsed, setOrgCollapsed] = useState(false);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);

  // Picking a zone auto-collapses the org rail since the panel sits on
  // top of it. User can re-expand manually from the collapsed pill.
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

  // Force-directed layout: place "you" at the center, then each major on
  // a deterministic spiral biased toward viewer (more mutuals = closer in).
  // After initial placement we run a small relaxation pass that pushes any
  // overlapping pair apart, plus a center-repulsion pass so nodes don't
  // sit on top of "you are here". Deterministic — same data → same layout.
  const layout = useMemo(() => {
    if (!data || !data.majors) return null;
    type Pos = { x: number; y: number; r: number };
    const positions = new Map<string, Pos>();
    const total = data.majors.length || 1;
    data.majors.forEach((m, i) => {
      const seed = hashString(m.name);
      const angle = (seed % 360) * (Math.PI / 180);
      const score = m.mutuals * 6 + Math.min(m.total, 60);
      const distance = 360 - Math.min(180, score);
      const ringOffset = (i / total) * 40;
      const r = distance + ringOffset;
      const cx = Math.cos(angle) * r;
      const cy = Math.sin(angle) * r * 0.7;
      const radius = 40 + Math.min(34, m.total * 0.5);
      positions.set(m.name, { x: cx, y: cy, r: radius });
    });

    // Anti-collision relaxation. 80 iterations is plenty; we usually settle
    // in 20–30. Padding adds breathing room so bubbles don't kiss.
    const PADDING = 14;
    const CENTER_KEEP_OUT = 90;
    const entries = Array.from(positions.values());
    for (let iter = 0; iter < 80; iter++) {
      let moved = false;
      // Pair-wise repulsion.
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i];
          const b = entries[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const minDist = a.r + b.r + PADDING;
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
      // Center keep-out so zones don't smother "you are here".
      for (const node of entries) {
        const d = Math.sqrt(node.x * node.x + node.y * node.y) || 0.01;
        const minD = node.r + CENTER_KEEP_OUT;
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
    return positions;
  }, [data]);

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
        eyebrow="Map · IU"
        title="The campus, mapped by who's where"
        subtitle="Each zone is a major. Click in to find people you&apos;d never bump into."
        tone="dark"
      />

      <div
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
              transform: `translate(${pan.x}px, ${pan.y}px)`,
              transition: dragging ? "none" : "transform 200ms ease",
              width: 0,
              height: 0,
              pointerEvents: "none",
            }}
          >
            <YouHereNode you={data!.you} />
            {data!.majors.map((m) => {
              const pos = layout?.get(m.name);
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
          </div>
        )}

        {/* Org Center — independent cluster, anchored to the right side. */}
        {hasData && data!.orgs.length > 0 ? (
          <OrgCenterCluster
            orgs={data!.orgs}
            collapsed={orgCollapsed}
            onToggleCollapse={() => setOrgCollapsed((v) => !v)}
            onPick={(org) =>
              pickZone({ kind: "org", key: org.handle, label: org.name })
            }
            activeHandle={selected?.kind === "org" ? selected.key : null}
          />
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
            }}
            title="Recenter the map"
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
  // Color heuristic: green if you're already connected to people there,
  // amber if you have mutuals (the discovery sweet spot), blue otherwise.
  const accent =
    major.mutuals > 0
      ? "#FFB85A"
      : major.connected > 0
      ? "#5BD18C"
      : "#5A9CFF";
  const showGlow = major.mutuals > 0;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: radius * 2,
        height: radius * 2,
        transform: "translate(-50%, -50%)",
        borderRadius: "50%",
        background:
          `radial-gradient(circle, ${hexToRgba(accent, active ? 0.32 : 0.18)} 0%, rgba(8,12,28,0.55) 70%, rgba(8,12,28,0.0) 100%)`,
        border: `1px solid ${hexToRgba(accent, active ? 0.85 : 0.45)}`,
        boxShadow: showGlow
          ? `0 0 28px ${hexToRgba(accent, 0.45)}, inset 0 0 18px ${hexToRgba(accent, 0.22)}`
          : `0 0 12px ${hexToRgba(accent, 0.22)}`,
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
        transition: "transform 160ms ease, box-shadow 160ms ease",
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
    </button>
  );
}

function OrgCenterCluster({
  orgs,
  collapsed,
  onToggleCollapse,
  onPick,
  activeHandle,
}: {
  orgs: MapOrg[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onPick: (o: MapOrg) => void;
  activeHandle: string | null;
}) {
  if (collapsed) {
    return (
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onToggleCollapse}
        title={`Open Org Center (${orgs.length})`}
        style={{
          position: "absolute",
          right: 14,
          top: 60,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          borderRadius: 999,
          border: "1px solid rgba(120,200,255,0.45)",
          background: "rgba(8,12,28,0.78)",
          color: "rgba(120,200,255,0.95)",
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
        Org Center · {orgs.length}
        <span style={{ fontSize: 12, lineHeight: 1 }}>‹</span>
      </button>
    );
  }
  return (
    <div
      style={{
        position: "absolute",
        right: 14,
        top: 60,
        bottom: 14,
        width: 240,
        background:
          "linear-gradient(180deg, rgba(8,12,28,0.78) 0%, rgba(8,12,28,0.62) 100%)",
        border: "1px solid rgba(120,200,255,0.22)",
        borderRadius: 16,
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        boxShadow:
          "inset 0 1px 0 rgba(120,200,255,0.22), 0 12px 32px rgba(0,0,0,0.4)",
        padding: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        pointerEvents: "auto",
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
            color: "rgba(120,200,255,0.85)",
          }}
        >
          Org Center
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Collapse Org Center"
          title="Collapse"
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            border: "1px solid rgba(120,200,255,0.32)",
            background: "rgba(120,200,255,0.10)",
            color: "rgba(120,200,255,0.95)",
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

function OttoPanel({ onPickTag }: { onPickTag: (tag: string) => void }) {
  // Otto stays dark + orange-hued regardless of scene — consistent identity
  const headingColor = "#fff";
  const subtleColor = "rgba(255,255,255,0.55)";
  const dividerColor = "rgba(255,255,255,0.06)";

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
  const [suggestions, setSuggestions] = useState<
    Array<{
      id: string;
      name: string | null;
      handle: string | null;
      avatar_url: string | null;
      major: string | null;
      year: number | null;
      mutual_count: number;
      reason: string;
    }> | null
  >(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tRes, uRes, sRes] = await Promise.all([
          fetch("/api/trending/hashtags?limit=6", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/me/upcoming-events?limit=4", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/me/suggested-connections?limit=5", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setTrending(
          tRes?.ok && Array.isArray(tRes.trending) ? tRes.trending : [],
        );
        setUpcoming(
          uRes?.ok && Array.isArray(uRes.upcoming) ? uRes.upcoming : [],
        );
        setSuggestions(
          sRes?.ok && Array.isArray(sRes.suggestions) ? sRes.suggestions : [],
        );
      } catch {
        if (!cancelled) {
          setTrending([]);
          setUpcoming([]);
          setSuggestions([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ottoSurface: React.CSSProperties = {
    background:
      "linear-gradient(180deg, rgba(255,140,90,0.10) 0%, rgba(255,92,53,0.04) 50%, rgba(20,8,16,0.0) 100%), rgba(12,8,14,0.78)",
    backdropFilter: "blur(32px) saturate(180%)",
    WebkitBackdropFilter: "blur(32px) saturate(180%)",
    border: "1px solid rgba(255,140,90,0.18)",
    boxShadow: [
      "inset 0 1px 0 rgba(255,180,150,0.22)",
      "inset 0 -1px 0 rgba(0,0,0,0.2)",
      "0 8px 32px rgba(80,12,8,0.35)",
    ].join(", "),
    color: "#fff",
    position: "relative",
    overflow: "hidden",
  };

  return (
    <aside
      style={{
        padding: "28px 24px 28px 0",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minHeight: 0,
        overflowY: "auto",
      }}
    >
      <div style={{ ...ottoSurface, borderRadius: 22, padding: 18 }}>
        {/* Constellation accent in the top-right */}
        <ConstellationAccent />

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, position: "relative" }}>
          <OttoOrb size={42} />
          <div>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 900, fontSize: 22, letterSpacing: "-0.01em", color: headingColor, lineHeight: 1 }}>
              otto
            </div>
            <div
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgba(255,180,150,0.75)",
                marginTop: 4,
              }}
            >
              Your agent · Online
            </div>
          </div>
        </div>

        <OttoSection title="Heads up" subtitle="Events you RSVP'd to." headingColor={headingColor} subtleColor={subtleColor}>
          {upcoming === null ? (
            <div style={{ fontSize: 12, color: subtleColor, padding: "6px 0" }}>Loading…</div>
          ) : upcoming.length === 0 ? (
            <div style={{ fontSize: 12, color: subtleColor, padding: "6px 0", lineHeight: 1.5 }}>
              No upcoming events on your radar — RSVP from the Events tab and they&apos;ll show up here.
            </div>
          ) : (
            upcoming.map((u) => {
              const accent = u.viewer_status === "going" ? "#5BD18C" : "#FFB85A";
              const chip = formatUpcomingChip(u.starts_at);
              return (
                <div
                  key={u.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom: `1px solid ${dividerColor}`,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: accent, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "DM Sans, sans-serif",
                        fontSize: 13,
                        color: headingColor,
                        lineHeight: 1.3,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {u.title}
                    </div>
                    {u.org ? (
                      <div
                        style={{
                          fontFamily: "DM Sans, sans-serif",
                          fontSize: 11,
                          color: subtleColor,
                          marginTop: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {u.org.name}
                      </div>
                    ) : null}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: accent, fontFamily: "DM Sans, sans-serif", whiteSpace: "nowrap" }}>
                    {chip}
                  </span>
                </div>
              );
            })
          )}
        </OttoSection>

        <OttoSection title="Trending on campus" subtitle="Most-posted hashtags this week." headingColor={headingColor} subtleColor={subtleColor}>
          {trending === null ? (
            <div style={{ fontSize: 12, color: subtleColor, padding: "6px 0" }}>Loading…</div>
          ) : trending.length === 0 ? (
            <div style={{ fontSize: 12, color: subtleColor, padding: "6px 0", lineHeight: 1.5 }}>
              No trending tags yet — start one with a #hashtag in your post.
            </div>
          ) : (
            trending.map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => onPickTag(t.tag)}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "inherit",
                  font: "inherit",
                  textAlign: "left",
                }}
              >
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 600, color: "#FFB89C" }}>
                  #{t.tag}
                </span>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: subtleColor }}>
                  {t.count}
                </span>
              </button>
            ))
          )}
        </OttoSection>

        <OttoSection title="People to connect" subtitle="Mutuals, same major, same school." headingColor={headingColor} subtleColor={subtleColor}>
          {suggestions === null ? (
            <div style={{ fontSize: 12, color: subtleColor, padding: "6px 0" }}>Loading…</div>
          ) : suggestions.length === 0 ? (
            <div style={{ fontSize: 12, color: subtleColor, padding: "6px 0", lineHeight: 1.5 }}>
              We&apos;ll suggest people once your school has more students on Vibe.
            </div>
          ) : (
            suggestions.map((p) => {
              const initials = (p.name ?? p.handle ?? "?")
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((s) => s[0])
                .join("")
                .toUpperCase();
              const profileHref = p.handle ? `/profile/${encodeURIComponent(p.handle)}` : "/network";
              return (
                <Link
                  key={p.id}
                  href={profileHref}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom: `1px solid ${dividerColor}`,
                    textDecoration: "none",
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      background: p.avatar_url
                        ? `url(${p.avatar_url}) center/cover`
                        : "rgba(255,255,255,0.08)",
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
                    {!p.avatar_url ? initials : null}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "DM Sans, sans-serif",
                        fontSize: 13,
                        fontWeight: 600,
                        color: headingColor,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.name || p.handle || "Member"}
                    </div>
                    <div
                      style={{
                        fontFamily: "DM Sans, sans-serif",
                        fontSize: 11,
                        color: subtleColor,
                      }}
                    >
                      {[p.major, p.year ? String(p.year) : null, p.reason]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: "DM Sans, sans-serif",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#FFB89C",
                    }}
                  >
                    View →
                  </span>
                </Link>
              );
            })
          )}
        </OttoSection>

        <button
          type="button"
          style={{
            marginTop: 14,
            width: "100%",
            padding: "12px 14px",
            borderRadius: 999,
            border: "1px solid rgba(255,180,150,0.4)",
            background:
              "linear-gradient(180deg, rgba(255,92,53,0.5) 0%, rgba(255,92,53,0.22) 100%)",
            color: "#fff",
            fontFamily: "DM Sans, sans-serif",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 16px rgba(255,92,53,0.28)",
          }}
        >
          Open Otto’s command center →
        </button>
      </div>
    </aside>
  );
}

function OttoSection({
  title,
  subtitle,
  children,
  headingColor,
  subtleColor,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  headingColor: string;
  subtleColor: string;
}) {
  return (
    <div style={{ marginBottom: 14, position: "relative" }}>
      <div
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: subtleColor,
          marginBottom: subtitle ? 2 : 6,
        }}
      >
        {title}
      </div>
      {subtitle ? (
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 11,
            color: "rgba(255,255,255,0.4)",
            marginBottom: 6,
            fontStyle: "italic",
          }}
        >
          {subtitle}
        </div>
      ) : null}
      <div style={{ color: headingColor }}>{children}</div>
    </div>
  );
}

// Otto's signature orb: pulsing core + spinning orbit + breathing halo.
// Mirrors the persistent corner ring (public/html/_otto.js) so Otto reads
// as the same agent everywhere.
function OttoOrb({ size = 32 }: { size?: number }) {
  // Round to even so the core lands on a whole pixel and reads centered.
  const safeSize = size % 2 === 0 ? size : size + 1;
  const dotSize = Math.max(3, Math.round(safeSize * 0.1));
  const coreSize = Math.round((safeSize * 0.3) / 2) * 2;
  return (
    <div
      style={{
        position: "relative",
        width: safeSize,
        height: safeSize,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Breathing halo */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,92,53,0.5) 0%, rgba(255,92,53,0) 70%)",
          animation: "otto-breath 2.8s ease-in-out infinite",
        }}
      />
      {/* Spinning orbit ring with a tracer dot */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: "0.5px solid rgba(255,92,53,0.45)",
          animation: "otto-orbit-spin 8s linear infinite",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -dotSize / 2,
            left: "50%",
            transform: "translateX(-50%)",
            width: dotSize,
            height: dotSize,
            borderRadius: "50%",
            background: "#FF5C35",
            boxShadow: "0 0 6px rgba(255,92,53,0.8)",
          }}
        />
      </div>
      {/* Pulsing core — flex-centered so it stays perfectly in the middle */}
      <div
        style={{
          width: coreSize,
          height: coreSize,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 30% 30%, #FFB89C 0%, #FF5C35 60%, #C84A20 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 0 12px rgba(255,92,53,0.65)",
          animation: "otto-core-pulse 2.2s ease-in-out infinite",
        }}
      />
    </div>
  );
}

// Subtle constellation lines in the top-right — sells the "agent" / "network" vibe.
function ConstellationAccent() {
  return (
    <svg
      aria-hidden
      width="120"
      height="80"
      viewBox="0 0 120 80"
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        pointerEvents: "none",
        opacity: 0.55,
      }}
    >
      <g stroke="rgba(255,140,90,0.4)" strokeWidth="0.5" fill="none">
        <line x1="20" y1="40" x2="55" y2="20" />
        <line x1="55" y1="20" x2="90" y2="35" />
        <line x1="90" y1="35" x2="115" y2="15" />
        <line x1="55" y1="20" x2="75" y2="55" />
        <line x1="75" y1="55" x2="105" y2="60" />
      </g>
      <g fill="#FF5C35">
        {[
          [20, 40],
          [55, 20],
          [90, 35],
          [115, 15],
          [75, 55],
          [105, 60],
        ].map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="1.5"
            style={{
              animation: `otto-synapse 3s ease-in-out ${i * 0.35}s infinite`,
            }}
          />
        ))}
      </g>
    </svg>
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
                onMouseEnter={() => setHoveredId(m.id)}
                onMouseLeave={() =>
                  setHoveredId((prev) => (prev === m.id ? null : prev))
                }
                style={{
                  display: "flex",
                  gap: 10,
                  paddingTop: sameAuthor ? 1 : 8,
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
