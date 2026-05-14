"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * iOS-native mobile rebuild of the /network surface. Built around
 * discovery: the page opens to a search field + a Suggestions feed of
 * people you haven't connected with yet. Existing-relationship views
 * (Connections / Following / Followers) live behind tabs but aren't
 * the default destination.
 *
 * Data sources:
 *   - /api/me/suggested-connections  → discover feed
 *   - /api/me/connections | following | followers → relationship tabs
 *   - /api/users/search?q=           → typeahead, takes over the
 *                                       content area while a query is
 *                                       in the search field
 *   - /api/me/follow                 → POST/DELETE for Connect / Unfollow
 */

type FollowState = "none" | "following" | "followed_by" | "connected" | "self";

type ListUser = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url?: string | null;
  banner_gradient?: string | null;
  major?: string | null;
  year?: number | null;
  mutual_count?: number;
  follow_state?: FollowState;
  /** Optional — only set on suggestions. */
  shared_org_count?: number;
  same_major?: boolean;
  reason?: string;
};

type SearchUser = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url?: string | null;
  school?: string | null;
  major?: string | null;
  year?: number | string | null;
};

type Tab = "discover" | "connections" | "following" | "followers";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "discover", label: "Discover" },
  { id: "connections", label: "Connections" },
  { id: "following", label: "Following" },
  { id: "followers", label: "Followers" },
];

const PAGE_LIMIT = 25;

type RelationshipTab = Exclude<Tab, "discover">;
const TAB_ORDER: Tab[] = ["discover", "connections", "following", "followers"];

export function NetworkMobile() {
  const [tab, setTab] = useState<Tab>("discover");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ListUser[] | null>(null);
  // Per-tab cache so swiping between Connections / Following /
  // Followers doesn't flash stale data into the next tab (each tab
  // owns its own list rather than sharing a single tabUsers slot).
  const [usersByTab, setUsersByTab] = useState<
    Record<RelationshipTab, ListUser[] | null>
  >({
    connections: null,
    following: null,
    followers: null,
  });
  const [searchResults, setSearchResults] = useState<SearchUser[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Swipeable tab content. Mirrors the profile-tabs pattern.
  const tabScrollRef = useRef<HTMLDivElement | null>(null);
  const isProgrammaticScrollRef = useRef(false);

  // Debounce the query — 280ms matches the profile.html typeahead.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 280);
    return () => clearTimeout(t);
  }, [query]);

  // Initial suggestions fetch (cached for the session). The endpoint
  // returns `suggestions`, not `users` — different shape from the other
  // relationship endpoints below.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/me/suggested-connections?limit=25", {
          cache: "no-store",
        });
        const j = await r.json();
        if (cancelled) return;
        setSuggestions(
          j?.ok && Array.isArray(j.suggestions)
            ? (j.suggestions as ListUser[])
            : [],
        );
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Per-tab fetch — caches each relationship tab's rows in usersByTab.
  // Skips refetching if data is already cached so swiping back is
  // instant. Search overrides everything (handled separately below).
  useEffect(() => {
    if (debouncedQuery) return;
    if (tab === "discover") return;
    if (usersByTab[tab] !== null) return; // already loaded
    let cancelled = false;
    (async () => {
      try {
        const path =
          tab === "connections"
            ? "/api/me/connections"
            : tab === "following"
              ? "/api/me/following"
              : "/api/me/followers";
        const r = await fetch(`${path}?limit=${PAGE_LIMIT}&offset=0`, {
          cache: "no-store",
        });
        const j = await r.json();
        if (cancelled) return;
        const rows =
          j?.ok && Array.isArray(j.users) ? (j.users as ListUser[]) : [];
        setUsersByTab((prev) => ({ ...prev, [tab]: rows }));
      } catch {
        if (!cancelled) setUsersByTab((prev) => ({ ...prev, [tab]: [] }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, debouncedQuery, usersByTab]);

  // Programmatic scroll to the active tab pane whenever `tab` changes
  // (via a tap on the strip). Skipped if we're already there to avoid
  // bouncing after a swipe.
  useEffect(() => {
    const el = tabScrollRef.current;
    if (!el) return;
    if (debouncedQuery) return; // swipeable strip is hidden under search
    const idx = TAB_ORDER.indexOf(tab);
    if (idx < 0) return;
    const target = el.clientWidth * idx;
    if (Math.abs(el.scrollLeft - target) < 4) return;
    isProgrammaticScrollRef.current = true;
    el.scrollTo({ left: target, behavior: "smooth" });
    const t = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 420);
    return () => window.clearTimeout(t);
  }, [tab, debouncedQuery]);

  // Search fetch — fires whenever the debounced query has content.
  useEffect(() => {
    if (!debouncedQuery) {
      // Clear stale results when the query empties so the tab-content
      // path takes over cleanly on the next render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    (async () => {
      try {
        const r = await fetch(
          `/api/users/search?q=${encodeURIComponent(debouncedQuery)}&limit=20`,
          { cache: "no-store" },
        );
        const j = await r.json();
        if (cancelled) return;
        setSearchResults(j?.ok && Array.isArray(j.users) ? (j.users as SearchUser[]) : []);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const onStateChange = useCallback(
    (id: string, next: FollowState) => {
      // Updates every tab's cached list so swiping between them shows
      // the same toggle state regardless of which tab the user changed
      // it from.
      const patch = (rows: ListUser[] | null) =>
        rows
          ? rows.map((u) => (u.id === id ? { ...u, follow_state: next } : u))
          : rows;
      setSuggestions(patch);
      setUsersByTab((prev) => ({
        connections: patch(prev.connections),
        following: patch(prev.following),
        followers: patch(prev.followers),
      }));
    },
    [],
  );

  // Dismiss a Discover suggestion — optimistic remove + server POST.
  // On failure, restore the user back into the suggestions list so the
  // UI matches reality.
  const onDismissSuggestion = useCallback(
    async (user: ListUser) => {
      let snapshot: ListUser[] | null = null;
      setSuggestions((prev) => {
        snapshot = prev;
        if (!prev) return prev;
        return prev.filter((u) => u.id !== user.id);
      });
      try {
        const r = await fetch("/api/me/dismiss-suggestion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ target_id: user.id }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Dismiss failed");
      } catch {
        // Restore on failure.
        setSuggestions(snapshot);
      }
    },
    [],
  );


  return (
    <main
      style={{
        background:
          "radial-gradient(120% 80% at 0% 0%, rgba(255,222,180,0.40) 0%, rgba(255,222,180,0) 60%), " +
          "radial-gradient(110% 80% at 100% 100%, rgba(255,200,170,0.32) 0%, rgba(255,200,170,0) 60%), " +
          "linear-gradient(180deg, #FAF7F2 0%, #F4EDE2 100%)",
        minHeight: "100dvh",
      }}
    >
      <header
        style={{
          padding:
            "calc(env(safe-area-inset-top, 0px) + 14px) 16px 6px",
          background: "rgba(250, 247, 242, 0.86)",
          backdropFilter: "saturate(160%) blur(14px)",
          WebkitBackdropFilter: "saturate(160%) blur(14px)",
          position: "sticky",
          top: 0,
          zIndex: 5,
          borderBottom: "1px solid rgba(28,28,30,0.06)",
        }}
      >
        <h1
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: "-0.8px",
            color: "#1C1C1E",
            margin: 0,
          }}
        >
          People
        </h1>
        <SearchInput value={query} onChange={setQuery} />
        <TabStrip active={tab} onChange={setTab} disabled={!!debouncedQuery} />
      </header>

      {debouncedQuery ? (
        <div style={{ padding: "12px 16px 24px" }}>
          <SearchPane
            query={debouncedQuery}
            loading={searchLoading}
            results={searchResults}
          />
        </div>
      ) : (
        <div
          ref={tabScrollRef}
          onScroll={(e) => {
            if (isProgrammaticScrollRef.current) return;
            const el = e.currentTarget;
            const w = el.clientWidth;
            if (w === 0) return;
            const idx = Math.round(el.scrollLeft / w);
            const next = TAB_ORDER[idx];
            if (next && next !== tab) setTab(next);
          }}
          className="vibe-no-scrollbar"
          style={{
            display: "flex",
            overflowX: "auto",
            overflowY: "hidden",
            scrollSnapType: "x mandatory",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
            width: "100%",
          }}
        >
          {TAB_ORDER.map((t) => (
            <div
              key={t}
              style={{
                flex: "0 0 100%",
                scrollSnapAlign: "start",
                padding: "12px 16px 24px",
                minWidth: 0,
              }}
            >
              <ListPane
                tab={t}
                users={
                  t === "discover"
                    ? suggestions
                    : usersByTab[t as RelationshipTab]
                }
                onStateChange={onStateChange}
                onDismissSuggestion={onDismissSuggestion}
              />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <div
      style={{
        position: "relative",
        marginTop: 10,
        marginBottom: 8,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 14,
          top: "50%",
          transform: "translateY(-50%)",
          color: "#8A8580",
          display: "inline-flex",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
      <input
        ref={ref}
        type="search"
        placeholder="Search people"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        style={{
          width: "100%",
          padding: "11px 38px 11px 38px",
          borderRadius: 14,
          border: "1px solid rgba(28,28,30,0.10)",
          background: "rgba(255,255,255,0.78)",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 15,
          color: "#1C1C1E",
          outline: "none",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
        }}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            width: 24,
            height: 24,
            borderRadius: 999,
            border: "none",
            background: "rgba(28,28,30,0.08)",
            color: "#5C5853",
            fontSize: 14,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function TabStrip({
  active,
  onChange,
  disabled,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  disabled: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        overflowX: "auto",
        margin: "4px -16px 0",
        padding: "0 16px 8px",
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {TABS.map((t) => {
        const isActive = t.id === active && !disabled;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => !disabled && onChange(t.id)}
            disabled={disabled}
            style={{
              padding: "7px 14px",
              borderRadius: 999,
              border: "1px solid rgba(28,28,30,0.10)",
              background: isActive ? "#1C1C1E" : "rgba(255,255,255,0.7)",
              color: isActive ? "#fff" : "#5C5853",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              fontWeight: 700,
              cursor: disabled ? "default" : "pointer",
              flexShrink: 0,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function ListPane({
  tab,
  users,
  onStateChange,
  onDismissSuggestion,
}: {
  tab: Tab;
  users: ListUser[] | null;
  onStateChange: (id: string, next: FollowState) => void;
  onDismissSuggestion: (user: ListUser) => void;
}) {
  if (users === null) return <ListSkeleton />;
  if (users.length === 0) {
    return (
      <EmptyState
        title={
          tab === "discover"
            ? "No suggestions yet"
            : tab === "connections"
              ? "No mutuals yet"
              : tab === "following"
                ? "Not following anyone yet"
                : "No followers yet"
        }
        body={
          tab === "discover"
            ? "We'll surface people once your school has more students on Vibe — or once you've joined a club or two."
            : tab === "connections"
              ? "Connections are people who follow you back. Follow some folks and they may follow you back."
              : tab === "following"
                ? "Search for someone above or check Discover."
                : "Post a clip, RSVP to an event, or join a club — your graph fills in once you show up."
        }
      />
    );
  }
  // Discover: group by reason category so users see WHY before WHO.
  // Other tabs: flat list — they're relationship views, not discovery.
  if (tab === "discover") {
    return (
      <SuggestionGroups
        users={users}
        onStateChange={onStateChange}
        onDismiss={onDismissSuggestion}
      />
    );
  }
  return (
    <ul style={listStyle}>
      {users.map((u) => (
        <UserRow
          key={u.id}
          user={u}
          onStateChange={onStateChange}
          variant="relationship"
        />
      ))}
    </ul>
  );
}

const SUGGESTION_GROUP_ORDER: Array<{
  key: SuggestionCategory;
  label: string;
  blurb: string;
}> = [
  { key: "mutuals", label: "Friends of friends",  blurb: "People your connections know" },
  { key: "org",     label: "From your clubs",     blurb: "Members of orgs you're already in" },
  { key: "major",   label: "Same major",          blurb: "Other students studying what you study" },
  { key: "school",  label: "Around your school",  blurb: "On campus, not yet in your circle" },
  { key: "new",     label: "New on Vibe",         blurb: "Just joined" },
];

function SuggestionGroups({
  users,
  onStateChange,
  onDismiss,
}: {
  users: ListUser[];
  onStateChange: (id: string, next: FollowState) => void;
  onDismiss: (user: ListUser) => void;
}) {
  // Bucket users by category; the API already pre-sorts by strength
  // (mutuals desc → shared_orgs desc) so within-group order is honored.
  const buckets: Record<SuggestionCategory, ListUser[]> = {
    mutuals: [],
    org: [],
    major: [],
    school: [],
    new: [],
  };
  for (const u of users) buckets[categorizeSuggestion(u)].push(u);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {SUGGESTION_GROUP_ORDER.map(({ key, label, blurb }) => {
        const bucket = buckets[key];
        if (bucket.length === 0) return null;
        return (
          <section key={key}>
            <header
              style={{
                padding: "0 4px 8px",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span
                style={{
                  fontFamily: "Fraunces, serif",
                  fontSize: 16,
                  fontWeight: 800,
                  color: "#1C1C1E",
                  letterSpacing: "-0.2px",
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 11.5,
                  color: "#8A8580",
                  letterSpacing: "0.01em",
                }}
              >
                {blurb}
              </span>
            </header>
            <ul style={listStyle}>
              {bucket.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  onStateChange={onStateChange}
                  variant="suggestion"
                  onDismiss={() => onDismiss(u)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function SearchPane({
  query,
  loading,
  results,
}: {
  query: string;
  loading: boolean;
  results: SearchUser[] | null;
}) {
  if (loading || results === null) return <ListSkeleton />;
  if (results.length === 0) {
    return (
      <EmptyState
        title={`No matches for "${query}"`}
        body="Try a name or @handle — we search across your campus."
      />
    );
  }
  return (
    <ul style={listStyle}>
      {results.map((u) => (
        <li key={u.id} style={rowItemStyle}>
          <UserAvatarLink user={u} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <UserNameLink user={u} />
            <div style={metaLineStyle}>
              {[
                u.handle ? `@${u.handle}` : null,
                u.major,
                u.year ? `Year ${u.year}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function UserRow({
  user,
  onStateChange,
  variant = "relationship",
  onDismiss,
}: {
  user: ListUser;
  onStateChange: (id: string, next: FollowState) => void;
  /** "suggestion" surfaces the reason ("3 mutuals", "Same major") as
   *  its own line with an icon — the most clickable thing in Discover
   *  was getting buried before. "relationship" rows skip it. */
  variant?: "suggestion" | "relationship";
  /** When provided, renders a top-right × that hides the row + tells
   *  the server "don't suggest this person again". Suggestion-only. */
  onDismiss?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const state: FollowState = user.follow_state ?? "none";
  const isFollowing = state === "following" || state === "connected";
  const label = isFollowing
    ? state === "connected"
      ? "Connected ✓"
      : "Following ✓"
    : state === "followed_by"
      ? "Follow back"
      : "Connect";

  const toggle = async () => {
    if (busy || !user.handle) return;
    const next: FollowState = isFollowing
      ? state === "connected"
        ? "followed_by"
        : "none"
      : state === "followed_by"
        ? "connected"
        : "following";
    setBusy(true);
    onStateChange(user.id, next);
    try {
      const r = await fetch("/api/me/follow", {
        method: isFollowing ? "DELETE" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_handle: user.handle }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) onStateChange(user.id, state);
    } catch {
      onStateChange(user.id, state);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li style={{ ...rowItemStyle, position: "relative" }}>
      {variant === "suggestion" && onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss suggestion"
          onClick={onDismiss}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 22,
            height: 22,
            borderRadius: 999,
            border: "none",
            background: "rgba(28,28,30,0.08)",
            color: "#5C5853",
            fontSize: 12,
            lineHeight: 1,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          ×
        </button>
      ) : null}
      <UserAvatarLink user={user} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <UserNameLink user={user} />
        <div style={metaLineStyle}>
          {variant === "suggestion"
            ? [user.handle ? `@${user.handle}` : null, user.major]
                .filter(Boolean)
                .join(" · ")
            : [
                user.handle ? `@${user.handle}` : null,
                user.major,
                user.mutual_count
                  ? `${user.mutual_count} mutual${user.mutual_count === 1 ? "" : "s"}`
                  : user.reason,
              ]
                .filter(Boolean)
                .join(" · ")}
        </div>
        {variant === "suggestion" ? (
          <SuggestionReason user={user} />
        ) : null}
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        style={{
          flexShrink: 0,
          padding: "7px 14px",
          borderRadius: 999,
          fontFamily: "DM Sans, sans-serif",
          fontSize: 12,
          fontWeight: 700,
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.6 : 1,
          background: isFollowing
            ? "rgba(255,255,255,0.78)"
            : state === "followed_by"
              ? "#FF5C35"
              : "#1C1C1E",
          color: isFollowing ? "#1C1C1E" : "#fff",
          border: isFollowing
            ? "1px solid rgba(28,28,30,0.16)"
            : "1px solid rgba(0,0,0,0.06)",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {label}
      </button>
    </li>
  );
}

type SuggestionCategory = "mutuals" | "org" | "major" | "school" | "new";

function categorizeSuggestion(u: ListUser): SuggestionCategory {
  if ((u.mutual_count ?? 0) > 0) return "mutuals";
  if ((u.shared_org_count ?? 0) > 0) return "org";
  if (u.same_major) return "major";
  if (u.reason === "same school") return "school";
  return "new";
}

function SuggestionReason({ user }: { user: ListUser }) {
  const category = categorizeSuggestion(user);
  const text =
    category === "mutuals"
      ? `${user.mutual_count} mutual${user.mutual_count === 1 ? "" : "s"}`
      : category === "org"
        ? user.shared_org_count === 1
          ? "In your org"
          : `${user.shared_org_count} shared orgs`
        : category === "major"
          ? "Same major as you"
          : category === "school"
            ? "Same school"
            : "New on Vibe";
  const accent =
    category === "mutuals"
      ? "#FF5C35"
      : category === "org"
        ? "#C6A0FF"
        : category === "major"
          ? "#FFD23F"
          : category === "school"
            ? "#5BE3B9"
            : "#8A8580";
  return (
    <div
      style={{
        marginTop: 4,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "DM Sans, sans-serif",
        fontSize: 11.5,
        fontWeight: 700,
        color: "#1C1C1E",
        letterSpacing: "0.01em",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          width: 18,
          height: 18,
          borderRadius: 999,
          background: `${accent}22`,
          color: accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {category === "mutuals" ? (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="8.5" cy="4.5" r="1.7" stroke="currentColor" strokeWidth="1.3" />
            <path d="M1 10.5c.4-1.6 1.6-2.4 3-2.4s2.6.8 3 2.4M7 10.5c.3-1.2 1.1-1.9 2-1.9s1.7.6 2 1.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
          </svg>
        ) : category === "org" ? (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5l3-2 3 2v3l-3 2-3-2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
            <circle cx="6" cy="6" r="1.1" fill="currentColor" />
          </svg>
        ) : category === "major" ? (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M1 5L6 2.5l5 2.5-5 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
            <path d="M3 6.5v2.2c0 .8 1.3 1.6 3 1.6s3-.8 3-1.6V6.5" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
          </svg>
        ) : category === "school" ? (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 5l4-2.5L10 5v.4H2z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
            <rect x="3" y="5.6" width="6" height="4.4" stroke="currentColor" strokeWidth="1.3" fill="none" />
            <rect x="5" y="7.6" width="2" height="2.4" stroke="currentColor" strokeWidth="1.1" fill="none" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="3.8" stroke="currentColor" strokeWidth="1.3" fill="none" />
            <path d="M6 4.4v3.2M4.4 6h3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        )}
      </span>
      <span>{text}</span>
    </div>
  );
}

function UserAvatarLink({ user }: { user: ListUser | SearchUser }) {
  const initials = (user.name ?? user.handle ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <Link
      href={user.handle ? `/profile/${user.handle}` : "#"}
      aria-label={user.name ?? user.handle ?? "Profile"}
      style={{
        width: 48,
        height: 48,
        borderRadius: 999,
        background: user.avatar_url
          ? `url(${user.avatar_url}) center/cover`
          : "#FFD3C2",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#1C1C1E",
        fontFamily: "Fraunces, serif",
        fontWeight: 800,
        fontSize: 17,
        textDecoration: "none",
        border: "1px solid rgba(255,255,255,0.6)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      {!user.avatar_url ? initials : null}
    </Link>
  );
}

function UserNameLink({ user }: { user: ListUser | SearchUser }) {
  return (
    <Link
      href={user.handle ? `/profile/${user.handle}` : "#"}
      style={{
        display: "block",
        fontFamily: "Fraunces, serif",
        fontSize: 16,
        fontWeight: 800,
        color: "#1C1C1E",
        textDecoration: "none",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {user.name || (user.handle ? `@${user.handle}` : "Member")}
    </Link>
  );
}

function ListSkeleton() {
  return (
    <ul style={listStyle}>
      {[0, 1, 2, 3, 4].map((i) => (
        <li
          key={i}
          style={{
            ...rowItemStyle,
            background: "rgba(255,253,248,0.45)",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 999,
              background: "rgba(28,28,30,0.06)",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                width: "55%",
                height: 14,
                background: "rgba(28,28,30,0.08)",
                borderRadius: 6,
                marginBottom: 6,
              }}
            />
            <div
              style={{
                width: "75%",
                height: 11,
                background: "rgba(28,28,30,0.05)",
                borderRadius: 5,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        padding: "36px 18px",
        textAlign: "center",
        background: "rgba(255,253,248,0.6)",
        border: "1px dashed rgba(28,28,30,0.14)",
        borderRadius: 18,
        marginTop: 8,
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: 17,
          color: "#1C1C1E",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontSize: 13.5,
          color: "#5C5853",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {body}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

const listStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const rowItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  background: "rgba(255,253,248,0.78)",
  border: "1px solid rgba(255,255,255,0.7)",
  borderRadius: 16,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 14px rgba(180,120,60,0.08)",
};

const metaLineStyle: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12,
  color: "#8A8580",
  marginTop: 2,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
