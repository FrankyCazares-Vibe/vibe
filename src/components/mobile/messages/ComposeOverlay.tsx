"use client";

import { useEffect, useRef, useState } from "react";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { vibeRequest } from "@/lib/feedback/request";

import { initialsOf } from "./format";
import { useNightTheme } from "./theme";
import { ListSkeleton } from "./ThreadList";

type SearchUser = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url?: string | null;
  major?: string | null;
  year?: number | string | null;
};

export function ComposeOverlay({
  onCancel,
  onPick,
}: {
  onCancel: () => void;
  onPick: (handle: string) => void;
}) {
  // Top bar + search strip: translucent cream/white with no Night token yet.
  const night = useNightTheme();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [suggested, setSuggested] = useState<SearchUser[] | null>(null);
  const [results, setResults] = useState<SearchUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  // A search that didn't run, shown instead of "No matches". Retry bumps
  // searchSeq, which re-runs the same query.
  const [searchErr, setSearchErr] = useState<LoadFailure | null>(null);
  const [searchSeq, setSearchSeq] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Hide the bottom tab bar while compose is open.
  useEffect(() => {
    document.body.classList.add("vibe-composer-open");
    return () => document.body.classList.remove("vibe-composer-open");
  }, []);

  // Autofocus on mount — keyboard opens immediately. Small delay so
  // iOS Safari honors the focus after the slide-in. The field is 16px,
  // so taking focus no longer zooms the page in.
  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, []);

  // Debounce typing → search query.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);

  // Initial picks — same data source as Network's Discover. Lets
  // users start a DM with someone they already know without typing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/me/suggested-connections?limit=20", {
          cache: "no-store",
        });
        const j = await r.json();
        if (cancelled) return;
        setSuggested(
          j?.ok && Array.isArray(j.suggestions) ? (j.suggestions as SearchUser[]) : [],
        );
      } catch {
        if (!cancelled) setSuggested([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Search fetch — same endpoint Network uses, debounced.
  useEffect(() => {
    if (!debounced) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const r = await vibeRequest<{ users?: SearchUser[] }>(
        `/api/users/search?q=${encodeURIComponent(debounced)}&limit=20`,
        { cache: "no-store", quiet: true, failure: "Couldn't search people." },
      );
      // A newer query (or Retry) owns the list now.
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.users)) {
        setSearchErr(null);
        setResults(r.data.users);
      } else {
        setSearchErr(asLoadFailure(r, "Couldn't search people."));
        setResults(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, searchSeq]);

  const list = debounced ? results : suggested;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New message"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "var(--cream)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "calc(env(safe-area-inset-top, 0px) + 8px) 14px 8px",
          // Cream at .94 (no --cream-94 yet): Night takes the tab bar's step.
          background: night ? "var(--tabbar-bg)" : "rgba(250, 247, 242, 0.94)",
          backdropFilter: "saturate(160%) blur(14px)",
          WebkitBackdropFilter: "saturate(160%) blur(14px)",
          borderBottom: "1px solid rgba(var(--scrim-rgb),0.06)",
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--charcoal)",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 14,
            fontWeight: 600,
            padding: "8px 4px",
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          Cancel
        </button>
        <span
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 17,
            fontWeight: 800,
            color: "var(--charcoal)",
          }}
        >
          New message
        </span>
        <span style={{ width: 60 }} />
      </header>

      {/* Search field */}
      <div
        style={{
          padding: "12px 16px 8px",
          background: night ? "var(--tabbar-bg)" : "rgba(250, 247, 242, 0.94)",
          borderBottom: "1px solid rgba(var(--scrim-rgb),0.04)",
        }}
      >
        <div style={{ position: "relative" }}>
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--ink-muted)",
              display: "inline-flex",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M11 11l3 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="search"
            placeholder="Search people"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            style={{
              width: "100%",
              padding: "11px 14px 11px 38px",
              borderRadius: 14,
              border: "1px solid rgba(var(--scrim-rgb),0.10)",
              // White at .78 (no --paper-78 yet): Night takes --paper-70.
              background: night ? "var(--paper-70)" : "rgba(255,255,255,0.78)",
              fontFamily: "DM Sans, sans-serif",
              // 16px: any smaller and iOS zooms in when the autofocus
              // above lands.
              fontSize: 16,
              color: "var(--charcoal)",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Results list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "6px 0",
        }}
      >
        {!debounced && suggested === null ? (
          <ListSkeleton />
        ) : debounced && loading ? (
          <ListSkeleton />
        ) : debounced && searchErr ? (
          <div style={{ padding: "12px 16px" }}>
            <LoadFailed
              failure={searchErr}
              tone={night ? "dark" : "light"}
              compact
              onRetry={() => setSearchSeq((n) => n + 1)}
            />
          </div>
        ) : !list || list.length === 0 ? (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              color: "var(--ink-2)",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13.5,
            }}
          >
            {debounced
              ? `No matches for "${debounced}"`
              : "Search above to start a new message."}
          </div>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
            }}
          >
            {!debounced ? (
              <li
                style={{
                  padding: "6px 18px 8px",
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ink-muted)",
                }}
              >
                Suggested
              </li>
            ) : null}
            {list.map((u) => (
              <ComposeUserRow
                key={u.id}
                user={u}
                onPick={() => u.handle && onPick(u.handle)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ComposeUserRow({
  user,
  onPick,
}: {
  user: SearchUser;
  onPick: () => void;
}) {
  const initials = initialsOf(user.name || user.handle);
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        disabled={!user.handle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: user.handle ? "pointer" : "default",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
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
            fontSize: 15,
            border: "1px solid rgba(255,255,255,0.6)",
          }}
        >
          {!user.avatar_url ? initials : null}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 15,
              fontWeight: 700,
              color: "var(--charcoal)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {user.name || (user.handle ? `@${user.handle}` : "Member")}
          </div>
          <div
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              color: "var(--ink-muted)",
              marginTop: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {[user.handle ? `@${user.handle}` : null, user.major]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </button>
    </li>
  );
}
