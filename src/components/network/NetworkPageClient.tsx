"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { UserCard, type UserCardProps } from "./UserCard";

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

type Tab = "connections" | "following" | "followers" | "suggestions";

type ListUser = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  banner_gradient: string | null;
  major: string | null;
  year: number | null;
  mutual_count: number;
  follow_state: UserCardProps["follow_state"];
};

type SuggestionUser = ListUser & {
  shared_org_count: number;
  same_major: boolean;
  reason: string;
};

type Counts = {
  followers: number;
  following: number;
  connections: number;
};

const TAB_ORDER: Tab[] = ["connections", "following", "followers", "suggestions"];
const TAB_LABEL: Record<Tab, string> = {
  connections: "Connections",
  following: "Following",
  followers: "Followers",
  suggestions: "Suggestions",
};

const PAGE_SIZE = 20;

export function NetworkPageClient() {
  const [tab, setTab] = useState<Tab>("connections");
  const [counts, setCounts] = useState<Counts | null>(null);

  // Cached per-tab state. Suggestions has its own pool that doesn't paginate
  // the same way, so we treat it specially below.
  const [users, setUsers] = useState<ListUser[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [tabTotal, setTabTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [suggestionFilter, setSuggestionFilter] = useState<
    "all" | "orgs" | "mutuals" | "major"
  >("all");

  // Debounce query — server hit per keystroke would be wasteful.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(query.trim()), 220);
    return () => window.clearTimeout(id);
  }, [query]);

  // Network tour: final leg, triggered by ?welcome=1 or pending-flag handoff.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Desktop-only. Mobile network tour is wired in `useMobileTour` and
    // targets `#otto-mobile-tour-network-tabs` + the Otto tab in the
    // bottom bar. Skip here so the engine doesn't fall back to a
    // centered bubble with desktop-targeted selectors that don't exist.
    if (window.matchMedia("(max-width: 899px)").matches) return;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("welcome") === "1";
    let fromPending = false;
    try { fromPending = localStorage.getItem("vibe_tour_pending") === "network"; } catch {}
    if (!fromUrl && !fromPending) return;
    const seenKey = "vibe_network_tour_seen_v1";
    if (localStorage.getItem(seenKey) === "1") {
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
            selector: "#network-tabs",
            title: "Your <span class=\"accent\">people</span>, sorted.",
            body: "Connections, who you follow, your followers, and people Otto thinks you'd vibe with.",
          },
          {
            selector: "#otto-corner",
            title: "I'm always <span class=\"accent\">right here</span>.",
            body: "Tap me anytime for notifications, reminders, or to bounce a thought. I won't pester you.",
            endLabel: "I'm set →",
          },
        ],
        {
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
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Counts refetched after follow toggles + on first mount.
  const refreshCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/me/connections-summary", {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && data?.ok && data.counts) setCounts(data.counts as Counts);
    } catch {
      /* keep prior counts on error */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/connections-summary", {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data?.ok && data.counts) {
          setCounts(data.counts as Counts);
        }
      } catch {
        /* keep prior counts on error */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch the current tab's first page when tab/query changes. All setState
  // calls live inside the async IIFE — the synchronous effect body only
  // bumps a sequence number used to discard stale responses.
  const requestSeq = useRef(0);
  useEffect(() => {
    const seq = ++requestSeq.current;
    (async () => {
      setLoading(true);
      setUsers([]);
      setSuggestions([]);
      setHasMore(false);

      try {
        if (tab === "suggestions") {
          const res = await fetch(
            `/api/me/suggested-connections?limit=${PAGE_SIZE}`,
            { cache: "no-store" },
          );
          const data = await res.json();
          if (seq !== requestSeq.current) return;
          if (data?.ok && Array.isArray(data.suggestions)) {
            setSuggestions(data.suggestions as SuggestionUser[]);
            setTabTotal(data.suggestions.length);
          } else {
            setSuggestions([]);
            setTabTotal(0);
          }
          setHasMore(false);
          return;
        }

        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: "0",
        });
        if (debouncedQ.length > 0) params.set("q", debouncedQ);
        const res = await fetch(`/api/me/${tab}?${params.toString()}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (seq !== requestSeq.current) return;
        if (data?.ok && Array.isArray(data.users)) {
          setUsers(data.users as ListUser[]);
          setTabTotal(data.total ?? data.users.length);
          setHasMore(Boolean(data.has_more));
        } else {
          setUsers([]);
          setTabTotal(0);
          setHasMore(false);
        }
      } catch {
        if (seq !== requestSeq.current) return;
        setUsers([]);
        setSuggestions([]);
        setTabTotal(0);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    })();
  }, [tab, debouncedQ]);

  const loadMore = async () => {
    if (loading || !hasMore || tab === "suggestions") return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(users.length),
      });
      if (debouncedQ.length > 0) params.set("q", debouncedQ);
      const res = await fetch(`/api/me/${tab}?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data?.ok && Array.isArray(data.users)) {
        setUsers((prev) => [...prev, ...(data.users as ListUser[])]);
        setHasMore(Boolean(data.has_more));
      }
    } finally {
      setLoading(false);
    }
  };

  // After a follow/unfollow inside a card, splice the new state in place so
  // the UI doesn't need a full refetch. Counts get a background refresh.
  const onCardStateChange = useCallback(
    (id: string, next: UserCardProps["follow_state"]) => {
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, follow_state: next } : u)),
      );
      setSuggestions((prev) =>
        prev.map((u) => (u.id === id ? { ...u, follow_state: next } : u)),
      );
      void refreshCounts();
    },
    [refreshCounts],
  );

  const filteredSuggestions = useMemo(() => {
    let pool = suggestions;
    const q = debouncedQ.toLowerCase();
    if (q.length > 0) {
      pool = pool.filter((u) => {
        const name = (u.name ?? "").toLowerCase();
        const handle = (u.handle ?? "").toLowerCase();
        return name.includes(q) || handle.includes(q);
      });
    }
    if (suggestionFilter === "orgs")
      pool = pool.filter((u) => u.shared_org_count > 0);
    else if (suggestionFilter === "mutuals")
      pool = pool.filter((u) => u.mutual_count > 0);
    else if (suggestionFilter === "major")
      pool = pool.filter((u) => u.same_major);
    return pool;
  }, [suggestions, debouncedQ, suggestionFilter]);

  return (
    <main
      className="vibe-network-main"
      style={{
        // Same warm radial cream wash the campus Feed uses — keeps the surface
        // continuous when bouncing between Campus → Network → Messages.
        background: [
          "radial-gradient(120% 80% at 0% 0%, rgba(255,222,180,0.45) 0%, rgba(255,222,180,0) 60%)",
          "radial-gradient(110% 80% at 100% 100%, rgba(255,200,170,0.35) 0%, rgba(255,200,170,0) 60%)",
          "linear-gradient(180deg, #FAF7F2 0%, #F4EDE2 100%)",
        ].join(", "),
        borderRight: "1px solid rgba(28,28,30,0.08)",
        padding: "32px 28px 80px",
        minWidth: 0,
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <div
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#C84A20",
            marginBottom: 6,
          }}
        >
          Network
        </div>
        <h1
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: "clamp(26px, 3vw, 32px)",
            fontWeight: 900,
            color: "#1C1C1E",
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          People in your orbit
        </h1>
        <p
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 14,
            color: "#5C5853",
            margin: "6px 0 0",
          }}
        >
          Connections, following, followers, and people we think you should know.
        </p>
      </header>

      <div id="network-tabs">
        <NetworkTabs
          tab={tab}
          counts={counts}
          suggestionsCount={suggestions.length}
          onSelect={setTab}
        />
      </div>

      <SearchBar
        query={query}
        onChange={setQuery}
        placeholder={
          tab === "suggestions"
            ? "Search suggestions"
            : `Search ${TAB_LABEL[tab].toLowerCase()}`
        }
      />

      {tab === "suggestions" ? (
        <SuggestionFilters
          value={suggestionFilter}
          onChange={setSuggestionFilter}
        />
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {tab === "suggestions" ? (
          <SuggestionsList
            loading={loading}
            users={filteredSuggestions}
            isFiltered={
              debouncedQ.length > 0 || suggestionFilter !== "all"
            }
            onStateChange={onCardStateChange}
          />
        ) : (
          <ListBody
            tab={tab}
            loading={loading}
            users={users}
            tabTotal={tabTotal}
            hasMore={hasMore}
            onLoadMore={loadMore}
            onStateChange={onCardStateChange}
            isFiltered={debouncedQ.length > 0}
          />
        )}
      </div>
    </main>
  );
}

function NetworkTabs({
  tab,
  counts,
  suggestionsCount,
  onSelect,
}: {
  tab: Tab;
  counts: Counts | null;
  suggestionsCount: number;
  onSelect: (t: Tab) => void;
}) {
  const countFor = (t: Tab): number | null => {
    if (!counts && t !== "suggestions") return null;
    if (t === "connections") return counts!.connections;
    if (t === "following") return counts!.following;
    if (t === "followers") return counts!.followers;
    return suggestionsCount > 0 ? suggestionsCount : null;
  };

  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 8,
        marginBottom: 16,
        flexWrap: "wrap",
      }}
    >
      {TAB_ORDER.map((t) => {
        const active = tab === t;
        const count = countFor(t);
        return (
          <button
            key={t}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onSelect(t)}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: active
                ? "1px solid rgba(200,74,32,0.4)"
                : "1px solid rgba(28,28,30,0.10)",
              background: active
                ? "linear-gradient(180deg, #FF7B4A 0%, #FF5C35 100%)"
                : "linear-gradient(180deg, rgba(255,253,248,0.78) 0%, rgba(255,250,240,0.68) 100%)",
              color: active ? "#fff" : "#1C1C1E",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              backdropFilter: "blur(12px) saturate(160%)",
              WebkitBackdropFilter: "blur(12px) saturate(160%)",
              boxShadow: active
                ? "inset 0 1px 0 rgba(255,255,255,0.32), 0 4px 12px rgba(255,92,53,0.22)"
                : "inset 0 1px 0 rgba(255,255,255,0.85)",
              transition: "background 120ms ease, color 120ms ease",
            }}
          >
            {TAB_LABEL[t]}
            {count !== null ? (
              <span
                style={{
                  marginLeft: 6,
                  fontWeight: 700,
                  color: active ? "rgba(255,255,255,0.78)" : "#8A8580",
                }}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function SearchBar({
  query,
  onChange,
  placeholder,
}: {
  query: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <input
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "11px 16px",
          borderRadius: 999,
          border: "1px solid rgba(28,28,30,0.10)",
          background:
            "linear-gradient(180deg, rgba(255,253,248,0.78) 0%, rgba(255,250,240,0.68) 100%)",
          backdropFilter: "blur(12px) saturate(160%)",
          WebkitBackdropFilter: "blur(12px) saturate(160%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)",
          color: "#1C1C1E",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 14,
          outline: "none",
        }}
      />
    </div>
  );
}

function SuggestionFilters({
  value,
  onChange,
}: {
  value: "all" | "orgs" | "mutuals" | "major";
  onChange: (v: "all" | "orgs" | "mutuals" | "major") => void;
}) {
  const opts: Array<{ id: "all" | "orgs" | "mutuals" | "major"; label: string }> = [
    { id: "all", label: "All" },
    { id: "orgs", label: "From your orgs" },
    { id: "mutuals", label: "Mutuals" },
    { id: "major", label: "Same major" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: active
                ? "1px solid rgba(200,74,32,0.4)"
                : "1px solid rgba(28,28,30,0.10)",
              background: active
                ? "rgba(255,140,90,0.20)"
                : "linear-gradient(180deg, rgba(255,253,248,0.78) 0%, rgba(255,250,240,0.68) 100%)",
              color: active ? "#C84A20" : "#5C5853",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ListBody({
  tab,
  loading,
  users,
  tabTotal,
  hasMore,
  onLoadMore,
  onStateChange,
  isFiltered,
}: {
  tab: Tab;
  loading: boolean;
  users: ListUser[];
  tabTotal: number;
  hasMore: boolean;
  onLoadMore: () => void;
  onStateChange: (id: string, next: UserCardProps["follow_state"]) => void;
  isFiltered: boolean;
}) {
  if (loading && users.length === 0) {
    return <SkeletonList />;
  }
  if (users.length === 0) {
    return <EmptyState tab={tab} isFiltered={isFiltered} />;
  }
  return (
    <>
      {users.map((u) => (
        <UserCard
          key={u.id}
          {...u}
          onStateChange={(next) => onStateChange(u.id, next)}
        />
      ))}
      {hasMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loading}
          style={{
            margin: "10px auto 0",
            padding: "10px 18px",
            borderRadius: 999,
            border: "1px solid rgba(28,28,30,0.10)",
            background:
              "linear-gradient(180deg, rgba(255,253,248,0.78) 0%, rgba(255,250,240,0.68) 100%)",
            backdropFilter: "blur(12px) saturate(160%)",
            WebkitBackdropFilter: "blur(12px) saturate(160%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)",
            color: "#1C1C1E",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            fontWeight: 700,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading
            ? "Loading…"
            : `Load more (${Math.max(0, tabTotal - users.length)} left)`}
        </button>
      ) : null}
    </>
  );
}

function SuggestionsList({
  loading,
  users,
  isFiltered,
  onStateChange,
}: {
  loading: boolean;
  users: SuggestionUser[];
  isFiltered: boolean;
  onStateChange: (id: string, next: UserCardProps["follow_state"]) => void;
}) {
  if (loading && users.length === 0) {
    return <SkeletonList />;
  }
  if (users.length === 0) {
    return <EmptyState tab="suggestions" isFiltered={isFiltered} />;
  }
  return (
    <>
      {users.map((u) => (
        <UserCard
          key={u.id}
          {...u}
          reason={u.reason}
          onStateChange={(next) => onStateChange(u.id, next)}
        />
      ))}
    </>
  );
}

function SkeletonList() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          aria-hidden
          style={{
            height: 88,
            borderRadius: 18,
            background:
              "linear-gradient(180deg, rgba(255,253,248,0.55) 0%, rgba(255,250,240,0.4) 100%)",
            border: "1px solid rgba(255,255,255,0.6)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
            opacity: 0.7,
          }}
        />
      ))}
    </>
  );
}

function EmptyState({
  tab,
  isFiltered,
}: {
  tab: Tab;
  isFiltered: boolean;
}) {
  if (isFiltered) {
    return (
      <div
        style={{
          padding: "28px 18px",
          borderRadius: 18,
          background:
            "linear-gradient(180deg, rgba(255,253,248,0.6) 0%, rgba(255,250,240,0.5) 100%)",
          border: "1px dashed rgba(28,28,30,0.14)",
          textAlign: "center",
          fontFamily: "DM Sans, sans-serif",
          color: "#5C5853",
          fontSize: 14,
        }}
      >
        Nothing matches that search.
      </div>
    );
  }
  const copy: Record<Tab, { title: string; body: string; cta?: { href: string; label: string } }> = {
    connections: {
      title: "No mutuals yet",
      body: "Connections are people who follow you back. Start by following classmates, club members, or the people Otto suggests.",
      cta: { href: "/campus?tab=orgs", label: "Find your clubs →" },
    },
    following: {
      title: "Not following anyone yet",
      body: "Follow people you actually want to keep up with. Browse Discover or your org rosters to find them.",
      cta: { href: "/campus?tab=orgs", label: "Browse orgs →" },
    },
    followers: {
      title: "No followers yet",
      body: "Post a clip, RSVP to an event, or join a club — your graph fills in once you show up.",
      cta: { href: "/campus?tab=feed", label: "Open the feed →" },
    },
    suggestions: {
      title: "Nothing to suggest yet",
      body: "We'll surface people once your school has more students on Vibe — or once you've joined a club or two.",
      cta: { href: "/campus?tab=orgs", label: "Find clubs to join →" },
    },
  };
  const c = copy[tab];
  return (
    <div
      style={{
        padding: "36px 24px",
        borderRadius: 22,
        background:
          "linear-gradient(180deg, rgba(255,253,248,0.78) 0%, rgba(255,243,228,0.66) 100%)",
        border: "1px solid rgba(255,255,255,0.7)",
        boxShadow: [
          "inset 0 1px 0 rgba(255,255,255,0.85)",
          "inset 0 -1px 0 rgba(28,28,30,0.04)",
          "0 8px 28px rgba(180,120,60,0.10)",
        ].join(", "),
        color: "#1C1C1E",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 22,
          fontWeight: 900,
          color: "#1C1C1E",
          letterSpacing: "-0.01em",
          marginBottom: 6,
        }}
      >
        {c.title}
      </div>
      <p
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 14,
          color: "#5C5853",
          margin: "0 auto 16px",
          maxWidth: 440,
          lineHeight: 1.5,
        }}
      >
        {c.body}
      </p>
      {c.cta ? (
        <Link
          href={c.cta.href}
          style={{
            display: "inline-block",
            padding: "10px 18px",
            borderRadius: 999,
            background: "linear-gradient(180deg, #FF7B4A 0%, #FF5C35 100%)",
            color: "#fff",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
            border: "1px solid rgba(200,74,32,0.35)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.32), 0 4px 12px rgba(255,92,53,0.22)",
          }}
        >
          {c.cta.label}
        </Link>
      ) : null}
    </div>
  );
}
