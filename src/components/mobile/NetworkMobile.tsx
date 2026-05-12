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

export function NetworkMobile() {
  const [tab, setTab] = useState<Tab>("discover");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ListUser[] | null>(null);
  const [tabUsers, setTabUsers] = useState<ListUser[] | null>(null);
  const [searchResults, setSearchResults] = useState<SearchUser[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Debounce the query — 280ms matches the profile.html typeahead.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 280);
    return () => clearTimeout(t);
  }, [query]);

  // Initial suggestions fetch (cached for the session).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/me/suggested-connections?limit=25", {
          cache: "no-store",
        });
        const j = await r.json();
        if (cancelled) return;
        setSuggestions(j?.ok && Array.isArray(j.users) ? (j.users as ListUser[]) : []);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tab-scoped fetch — when switching tabs (and query is empty).
  useEffect(() => {
    if (debouncedQuery) return; // Search overrides tabs.
    if (tab === "discover") return; // Discover is fed by `suggestions` above.
    let cancelled = false;
    // Reset prior tab's rows so the skeleton paints during the swap.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTabUsers(null);
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
        setTabUsers(j?.ok && Array.isArray(j.users) ? (j.users as ListUser[]) : []);
      } catch {
        if (!cancelled) setTabUsers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
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
      // Updates the right list when the in-row Connect toggle flips.
      const patch = (rows: ListUser[] | null) =>
        rows
          ? rows.map((u) => (u.id === id ? { ...u, follow_state: next } : u))
          : rows;
      setSuggestions(patch);
      setTabUsers(patch);
    },
    [],
  );

  const activeList: ListUser[] | null = (() => {
    if (debouncedQuery) return null; // SearchResults render path branches below.
    if (tab === "discover") return suggestions;
    return tabUsers;
  })();

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

      <div style={{ padding: "12px 16px 24px" }}>
        {debouncedQuery ? (
          <SearchPane
            query={debouncedQuery}
            loading={searchLoading}
            results={searchResults}
          />
        ) : (
          <ListPane
            tab={tab}
            users={activeList}
            onStateChange={onStateChange}
          />
        )}
      </div>
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
}: {
  tab: Tab;
  users: ListUser[] | null;
  onStateChange: (id: string, next: FollowState) => void;
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
  return (
    <ul style={listStyle}>
      {users.map((u) => (
        <UserRow key={u.id} user={u} onStateChange={onStateChange} />
      ))}
    </ul>
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
}: {
  user: ListUser;
  onStateChange: (id: string, next: FollowState) => void;
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
    <li style={rowItemStyle}>
      <UserAvatarLink user={user} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <UserNameLink user={user} />
        <div style={metaLineStyle}>
          {[
            user.handle ? `@${user.handle}` : null,
            user.major,
            user.mutual_count
              ? `${user.mutual_count} mutual${user.mutual_count === 1 ? "" : "s"}`
              : user.reason,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
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
