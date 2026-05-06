"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { CampusAppShell } from "@/components/campus-app-shell";

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

type BackdropKey = "sand-purple" | "ember" | "deep-violet" | "forest" | "midnight";

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

const DEFAULT_BACKDROP: BackdropKey = "sand-purple";

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
  if (tab === "chat") return { css: CHAT_CHROME_BACKDROP, tone: "light" };
  if (tab === "feed") return { css: FEED_BACKDROP, tone: "dark" };
  if (tab === "events") return { css: BACKDROP_PRESETS.midnight.css, tone: "light" };
  if (tab === "orgs") return { css: BACKDROP_PRESETS.ember.css, tone: "light" };
  if (tab === "map") return { css: BACKDROP_PRESETS.forest.css, tone: "light" };
  return { css: BACKDROP_PRESETS["sand-purple"].css, tone: "light" };
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
  const [tab, setTab] = useState<CampusTab>("chat");
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [channelSettingsId, setChannelSettingsId] = useState<string | null>(null);

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

  const activeBackdropKey: BackdropKey = activeOrg?.backdrop_preset ?? DEFAULT_BACKDROP;
  const activeBackdrop = BACKDROP_PRESETS[activeBackdropKey].css;

  // Optimistic backdrop swap + persist via PATCH.
  const handlePickBackdrop = useCallback(
    (key: BackdropKey) => {
      if (!activeOrg) return;
      setOrgs((prev) =>
        (prev ?? []).map((o) =>
          o.id === activeOrg.id ? { ...o, backdrop_preset: key } : o
        )
      );
      void fetch(`/api/orgs/${activeOrg.handle}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ backdrop_preset: key }),
      }).catch((e) => console.error("[campus] patch backdrop", e));
    },
    [activeOrg]
  );

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
              activeBackdrop={activeBackdropKey}
              onPickBackdrop={handlePickBackdrop}
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
            <TabBody tab={tab} onCreateOrg={() => setShowCreateOrg(true)} />
            <OttoPanel />
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
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: on ? "rgba(255,92,53,0.18)" : "transparent",
                  color: on ? "#fff" : COLORS.glassMuted,
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 13,
                  fontWeight: on ? 700 : 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
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
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: on ? "rgba(255,92,53,0.18)" : "transparent",
                  color: on ? "#fff" : COLORS.glassMuted,
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 13,
                  fontWeight: on ? 700 : 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
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
}: {
  tab: CampusTab;
  onCreateOrg: () => void;
}) {
  if (tab === "feed") return <FeedTabBody />;
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
  created_at: string;
  author: FeedAuthor | null;
  org: FeedOrg;
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

function FeedTabBody() {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/feed?limit=50", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        setPosts(
          data?.ok && Array.isArray(data.posts) ? (data.posts as FeedPost[]) : []
        );
      } catch (e) {
        console.error("[campus] feed", e);
        if (!cancelled) setPosts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      <SceneHeader
        eyebrow="Feed · IU"
        title="What’s on campus today"
        subtitle="Posts from clubs, orgs, and your network."
        tone="dark"
      />

      {/* Composer card — separate glass surface for visible Liquid Glass layering */}
      <div style={feedGlass}>
        <div
          style={{
            display: "flex",
            gap: 12,
            padding: "16px 20px",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              background: "#1C1C1E",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Fraunces, serif",
              fontWeight: 800,
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            FC
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
            <div
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontSize: 16,
                color: "rgba(28,28,30,0.45)",
              }}
            >
              What’s happening on campus?
            </div>
          </div>
          <button
            type="button"
            style={{
              padding: "8px 18px",
              borderRadius: 999,
              border: "none",
              background: COLORS.accent,
              color: "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(255,92,53,0.3)",
            }}
          >
            Post
          </button>
        </div>
      </div>

      {/* Posts column — second glass surface stacked under the composer */}
      <div style={feedGlass}>
        {posts === null ? (
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
        ) : posts.length === 0 ? (
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
          posts.map((p, idx) => (
            <FeedRow
              key={p.id}
              post={p}
              hairline={idx < posts.length - 1 ? hairline : "none"}
            />
          ))
        )}
      </div>
    </section>
  );
}

function FeedRow({
  post,
  hairline,
}: {
  post: FeedPost;
  hairline: string;
}) {
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

  return (
    <article
      style={{
        display: "flex",
        gap: 12,
        padding: "16px 20px",
        borderBottom: hairline,
        transition: "background 120ms ease",
      }}
    >
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
            gap: 28,
            marginTop: 12,
            color: COLORS.faint,
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
          }}
        >
          <EngagementAction icon={<CommentIcon />} />
          <EngagementAction icon={<LikeIcon />} />
          <EngagementAction icon={<ShareIcon />} />
        </div>
      </div>
    </article>
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

function LikeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 13.5s-5-3.2-5-7a3 3 0 0 1 5-2.2A3 3 0 0 1 13 6.5c0 3.8-5 7-5 7z"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinejoin="round"
      />
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
}: {
  icon: React.ReactNode;
  count?: number;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {icon}
      {typeof count === "number" ? <span>{count}</span> : null}
    </span>
  );
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

function EventsTabBody() {
  const events = [
    { name: "IU Spring Hackathon 2026", when: "Sat March 15 · 9am–9pm", where: "Assembly Hall", going: 120, rsvp: "RSVP", accent: "#5A9CFF" },
    { name: "Spring Career Fair", when: "Wed March 19 · 10am–4pm", where: "Memorial Stadium", going: 480, rsvp: "RSVP", accent: "#FFB85A" },
    { name: "Kelley Investment Pitch Night", when: "Thu March 27 · 6pm", where: "Hodge Hall", going: 62, rsvp: "RSVP", accent: "#9B7BFF" },
  ];
  return (
    <section style={{ flex: 1, padding: "28px 24px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100, width: "100%" }}>
      <SceneHeader
        eyebrow="Events · IU"
        title="What’s coming up"
        subtitle="RSVP early — events on campus, in space, and online."
        tone="light"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {events.map((e) => (
          <GlassCard key={e.name} style={{ borderLeft: `3px solid ${e.accent}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
              <div style={{ fontFamily: "Fraunces, serif", fontWeight: 800, fontSize: 17, color: "#fff" }}>
                {e.name}
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.1)",
                  color: "#fff",
                  fontFamily: "DM Sans, sans-serif",
                  whiteSpace: "nowrap",
                }}
              >
                {e.going} going
              </span>
            </div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, color: COLORS.glassMuted, lineHeight: 1.7, marginBottom: 12 }}>
              🗓 {e.when}
              <br />📍 {e.where}
            </div>
            <button
              type="button"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                fontFamily: "DM Sans, sans-serif",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
              }}
            >
              {e.rsvp}
            </button>
          </GlassCard>
        ))}
      </div>
    </section>
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
        tone="light"
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
            border: showDormant
              ? "1px solid rgba(232,77,77,0.45)"
              : "1px solid rgba(255,255,255,0.14)",
            background: showDormant
              ? "linear-gradient(180deg, rgba(232,77,77,0.22) 0%, rgba(232,77,77,0.08) 100%)"
              : "rgba(255,255,255,0.04)",
            color: showDormant ? "#FFD0CC" : COLORS.glassMuted,
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            fontWeight: showDormant ? 700 : 500,
            cursor: "pointer",
            boxShadow: showDormant
              ? "inset 0 1px 0 rgba(255,255,255,0.18)"
              : "none",
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
                ? "rgba(232,77,77,0.55)"
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
        <GlassCard>
          <div style={{ color: "#fff", fontFamily: "DM Sans, sans-serif", fontSize: 14 }}>
            {debouncedQ
              ? `No orgs match “${debouncedQ}”${filter !== "all" ? ` in ${filter}` : ""}.`
              : filter !== "all"
              ? `No ${filter} orgs to discover yet.`
              : "No orgs to discover yet — be the first to create one."}
          </div>
        </GlassCard>
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
        ...GLASS_SURFACE,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 18px",
        borderRadius: 14,
        textAlign: "left",
        cursor: "pointer",
        color: "#fff",
        fontFamily: "DM Sans, sans-serif",
        background:
          "linear-gradient(180deg, rgba(255,92,53,0.32) 0%, rgba(255,92,53,0.10) 100%), " +
          COLORS.glassFill,
        border: "1px solid rgba(255,180,150,0.45)",
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
}: {
  title: string;
  hint: string;
  orgs: DiscoverOrg[];
  pending: Record<string, "joined" | "pending">;
  busy: string | null;
  onJoin: (org: DiscoverOrg) => void;
  onPreview: (org: DiscoverOrg) => void;
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
            color: "#fff",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
          <span
            style={{
              marginLeft: 8,
              fontSize: 13,
              fontWeight: 500,
              color: COLORS.glassMuted,
            }}
          >
            {orgs.length}
          </span>
        </div>
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            color: COLORS.glassMuted,
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
        ...GLASS_SURFACE,
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
                ? "linear-gradient(180deg, rgba(255,92,53,0.32) 0%, rgba(255,92,53,0.14) 100%)"
                : "rgba(255,255,255,0.04)",
              color: "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              fontWeight: on ? 700 : 500,
              cursor: "pointer",
              boxShadow: on ? "inset 0 1px 0 rgba(255,255,255,0.22)" : "none",
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
        ...GLASS_SURFACE,
        padding: 16,
        borderRadius: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hover
          ? [
              "inset 0 1px 0 rgba(255,255,255,0.22)",
              `0 12px 32px ${hexToRgba(orgColor, 0.35)}`,
            ].join(", ")
          : "inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 32px rgba(20,8,40,0.25)",
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

function MapTabBody() {
  return (
    <section style={{ flex: 1, padding: "28px 24px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100, width: "100%" }}>
      <SceneHeader
        eyebrow="Map · IU"
        title="Find what's nearby"
        subtitle="Buildings, events pinned in space, friends nearby."
        tone="light"
      />
      <GlassCard
        style={{
          minHeight: 480,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(120% 80% at 30% 20%, rgba(180,220,140,0.18) 0%, rgba(180,220,140,0) 60%), " +
            "radial-gradient(110% 90% at 80% 80%, rgba(70,160,110,0.22) 0%, rgba(70,160,110,0) 60%), " +
            COLORS.glassFill,
        }}
      >
        <div style={{ textAlign: "center", color: COLORS.glassMuted, fontFamily: "DM Sans, sans-serif" }}>
          <div style={{ fontFamily: "Fraunces, serif", fontWeight: 800, fontSize: 22, color: "#fff", marginBottom: 6 }}>
            Campus map coming soon
          </div>
          Interactive overlay with buildings, events pinned in space, and friends nearby.
        </div>
      </GlassCard>
    </section>
  );
}

function OttoPanel() {
  // Otto stays dark + orange-hued regardless of scene — consistent identity
  const headingColor = "#fff";
  const subtleColor = "rgba(255,255,255,0.55)";
  const dividerColor = "rgba(255,255,255,0.06)";

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

        <OttoSection title="Heads up" subtitle="Events you RSVP'd to or saved." headingColor={headingColor} subtleColor={subtleColor}>
          {[
            { label: "IU Spring Hackathon 2026", chip: "Sat", chipColor: "#5A9CFF" },
            { label: "Spring Career Fair", chip: "Mar 19", chipColor: "#FFB85A" },
            { label: "Kelley Pitch Night", chip: "Mar 27", chipColor: "#9B7BFF" },
          ].map((d) => (
            <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${dividerColor}` }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: d.chipColor, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0, fontFamily: "DM Sans, sans-serif", fontSize: 13, color: headingColor, lineHeight: 1.3 }}>
                {d.label}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: d.chipColor, fontFamily: "DM Sans, sans-serif", whiteSpace: "nowrap" }}>
                {d.chip}
              </span>
            </div>
          ))}
        </OttoSection>

        <OttoSection title="Trending on campus" subtitle="Most-posted hashtags right now." headingColor={headingColor} subtleColor={subtleColor}>
          {[
            { tag: "#IUHackathon", count: "284" },
            { tag: "#CareerFair2026", count: "196" },
            { tag: "#LuddySchool", count: "142" },
            { tag: "#StartupIU", count: "98" },
          ].map((t) => (
            <div key={t.tag} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
              <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 600, color: "#FFB89C" }}>
                {t.tag}
              </span>
              <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: subtleColor }}>
                {t.count}
              </span>
            </div>
          ))}
        </OttoSection>

        <OttoSection title="People to connect" subtitle="Mutuals, same major, similar interests." headingColor={headingColor} subtleColor={subtleColor}>
          {[
            { name: "Jordan Thompson", sub: "CS · Senior · 4 mutuals", initials: "JT" },
            { name: "Amara Roberts", sub: "Design · Junior · 2 mutuals", initials: "AR" },
            { name: "Sofia Kim", sub: "InfoSci · Junior · same major", initials: "SK" },
          ].map((p) => (
            <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${dividerColor}` }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
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
                {p.initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 600, color: headingColor }}>
                  {p.name}
                </div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: subtleColor }}>
                  {p.sub}
                </div>
              </div>
              <button
                type="button"
                style={{
                  padding: "5px 12px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,180,150,0.32)",
                  background: "rgba(255,140,90,0.12)",
                  color: "#FFB89C",
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Connect
              </button>
            </div>
          ))}
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
  activeBackdrop,
  onPickBackdrop,
  onOpenCreateChannel,
  onOpenSettings,
  onOpenChannelSettings,
}: {
  org: Org | null;
  channels: Channel[];
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
  activeBackdrop: BackdropKey;
  onPickBackdrop: (key: BackdropKey) => void;
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
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "Fraunces, serif",
              fontWeight: 800,
              fontSize: 17,
              color: COLORS.railText,
              lineHeight: 1.2,
              letterSpacing: "-0.01em",
            }}
          >
            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
            >
              {org.name}
            </span>
            {org.verified ? <VerifiedBadge size={14} /> : null}
          </div>
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
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: COLORS.railMuted,
              marginBottom: 6,
            }}
          >
            Backdrop
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {(Object.keys(BACKDROP_PRESETS) as BackdropKey[]).map((key) => {
              const preset = BACKDROP_PRESETS[key];
              const active = key === activeBackdrop;
              return (
                <button
                  key={key}
                  type="button"
                  title={preset.label}
                  onClick={() => onPickBackdrop(key)}
                  style={{
                    flex: 1,
                    height: 22,
                    borderRadius: 6,
                    background: preset.css,
                    border: active
                      ? "1.5px solid rgba(255,255,255,0.85)"
                      : "1px solid rgba(255,255,255,0.14)",
                    boxShadow: active
                      ? "0 0 0 2px rgba(255,255,255,0.18), inset 0 1px 0 rgba(255,255,255,0.3)"
                      : "inset 0 1px 0 rgba(255,255,255,0.18)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              );
            })}
          </div>
        </div>
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
            color: COLORS.glassMuted,
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
            color: COLORS.glassText,
            letterSpacing: "-0.01em",
          }}
        >
          {channel.name}
        </span>
        <span style={{ color: COLORS.glassMuted, fontSize: 13 }}>·</span>
        <span
          style={{
            color: COLORS.glassMuted,
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

      <ChannelChat key={channel.id} channelId={channel.id} channelName={channel.name} />
    </main>
  );
}

type ChatMessage = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  users?: { id: string; handle: string | null; name: string | null; avatar_url: string | null } | null;
};

function ChannelChat({
  channelId,
  channelName,
}: {
  channelId: string;
  channelName: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Channel switches remount this component (parent passes key={channelId}),
  // so initial state above is the reset — no effect needed.

  // Poll messages every 2s while this channel is open.
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const res = await fetch(`/api/me/threads/${channelId}/messages?limit=80`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
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

  // Auto-scroll to bottom when new messages arrive.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft("");
    try {
      const res = await fetch(`/api/me/threads/${channelId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data?.ok && data.message) {
        // Optimistic — append immediately so it doesn't take 2s to show.
        setMessages((prev) => [...prev, data.message as ChatMessage]);
      } else {
        setDraft(content); // restore so user can retry
      }
    } catch (e) {
      console.error("[campus] send", e);
      setDraft(content);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <section
        ref={scrollerRef}
        style={{
          flex: 1,
          padding: "20px 28px 16px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minHeight: 0,
        }}
      >
        {!loaded ? (
          <div style={{ color: COLORS.glassMuted, fontFamily: "DM Sans, sans-serif", fontSize: 13 }}>
            Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div
            style={{
              color: COLORS.glassMuted,
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
            const author = m.users;
            return (
              <article
                key={m.id}
                style={{
                  display: "flex",
                  gap: 10,
                  paddingTop: sameAuthor ? 1 : 8,
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
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                      <span style={{ fontFamily: "Fraunces, serif", fontWeight: 800, fontSize: 14, color: "#fff" }}>
                        {author?.name ?? author?.handle ?? "Unknown"}
                      </span>
                      <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: COLORS.glassMuted }}>
                        {formatChatTime(m.created_at)}
                      </span>
                    </div>
                  ) : null}
                  <p
                    style={{
                      margin: 0,
                      color: "rgba(255,255,255,0.9)",
                      fontFamily: "DM Sans, sans-serif",
                      fontSize: 14,
                      lineHeight: 1.45,
                      whiteSpace: "pre-wrap",
                      wordWrap: "break-word",
                    }}
                  >
                    {m.content}
                  </p>
                </div>
              </article>
            );
          })
        )}
      </section>

      <div style={{ padding: "0 24px 20px" }}>
        <div
          style={{
            ...GLASS_SURFACE,
            borderRadius: 16,
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={`Message #${channelName}`}
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

function formatChatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
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
