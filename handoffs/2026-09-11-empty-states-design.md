## Empty states that lie: design

### 1. Rules for every load

- **First load fails:** call `vibeRequest(..., { quiet: true })`, then render `<LoadFailed>` in place of the list. Show neither the skeleton nor the empty copy.
- **Refetch fails:**
  - **User-initiated** (after posting, an RSVP, closing a thread, a Retry): keep the rows already on screen and call `vibeRequest` non-quiet, so the toast carries the caller's line.
  - **Background poll** (2 s chat, 30 s list): stay quiet and keep the rows.
- **Treat a malformed 2xx as a failure.** A 2xx whose body lacks the expected array means "Couldn't load X. Try again.", not `[]`.
- **401 and `terms_required`:** the failure's mapped `action` (Sign in / Review Terms, from `describeFailure`) replaces the Retry button. A retry would only fail again.
- **Aborts:** `vibeRequest` turns an abort into a status-0 failure ("Couldn't reach Vibe"). Call sites must drop results after `cancelled` or a sequence change *before* painting a failure.
- **Empty copy** renders only when the request succeeded **and** the array is empty.

### 2. React: `src/components/feedback/LoadFailed.tsx` (new, `"use client"`)

```tsx
import type { ToastAction } from "@/lib/feedback/failure-copy";
import type { VibeResult } from "@/lib/feedback/request";
export type LoadFailure = { message: string; action?: ToastAction };
/** A quiet vibeRequest failure keeps its mapped line and action. A 2xx with the wrong shape becomes the caller's line + " Try again." */
export function asLoadFailure(r: VibeResult<unknown>, line: string): LoadFailure;
export function LoadFailed(props: {
  failure: LoadFailure;
  onRetry?: () => void;          // omitted → window.location.reload() (server components)
  tone?: "light" | "dark";       // cream surfaces vs glass/Otto/map
  compact?: boolean;             // comments, search dropdowns, zone sheets, strip cards
}): JSX.Element;
```

- **Markup:** a `role="alert"` box holding the message in DM Sans 13–14 px, plus one pill button.
- **The button:**
  - When `failure.action` is set, it is `action.label` and calls `window.location.assign(action.href)`, the same as `ToastHost.tsx:118-125`.
  - Otherwise it reads "Retry" and calls `onRetry`.
- **Style:** inline, like `ToastHost`, with a coral button (`#FF5C35`).
- **Light tone:** text `#5C5853`, dashed border `rgba(28,28,30,.14)`.
- **Dark tone:** text `rgba(255,255,255,.7)`, border `rgba(255,255,255,.14)`.
- **Server components** (the org page) pass only serializable props (`failure`, `tone`) and get the reload fallback.

**Call-site recipe:**

```ts
const [rows, setRows] = useState<T[] | null>(null);
const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
const loadedRef = useRef(false);
const load = useCallback(async (mode: "first" | "refresh" | "poll") => {
  const r = await vibeRequest<{ items?: T[] }>(url, { cache: "no-store", quiet: mode !== "refresh", failure: "Couldn't load X." });
  if (stale()) return;                                   // cancelled / seq changed
  if (r.ok && Array.isArray(r.data.items)) { loadedRef.current = true; setLoadErr(null); setRows(r.data.items); return; }
  if (!loadedRef.current) setLoadErr(asLoadFailure(r, "Couldn't load X."));
  else if (r.ok && mode === "refresh") toast({ message: "Couldn't load X. Try again.", tone: "error" }); // bad shape: vibeRequest didn't toast
  // otherwise keep rows
}, [url]);
// render: rows === null ? (loadErr ? <LoadFailed failure={loadErr} onRetry={() => { setLoadErr(null); void load("first"); }} /> : <Skeleton/>)
//       : rows.length === 0 ? <Empty/> : rows
```

- A list keyed by tab or org (`NetworkMobile.usersByTab`, campus-home `channelsByOrg`) keeps a failure map beside the cache. It never writes `[]` on failure, and Retry deletes the key.
- A tab or search switch that loads a *different* list shows the skeleton, not the previous list's rows.

### 3. Static twin: add to `vibeFeedbackInit` in `public/html/_persistence.js`

```js
window.vibeLoadFailure(r, line)                 // same as asLoadFailure
window.vibeLoadFailed(el, failure, onRetry, { tone: 'light'|'dark', compact })
```

- It empties `el` and appends a `div.vibe-load-failed[role=alert]`, with the message set via `textContent`, so no escaping is needed.
- **The button:**
  - When `failure.action` is set, it calls `window.__vibeTopNav(action.href)`, so it escapes the /messages iframe.
  - Otherwise it reads "Retry" and calls `onRetry()`, or `location.reload()` when no `onRetry` is given.
- **Styles** are inline and match the React component.
- **Call-site recipe:** `const r = await window.vibeRequest(url, { quiet: !loaded, failure })`. On a failure with nothing loaded, call `vibeLoadFailed(listEl, vibeLoadFailure(r, line), retryFn)` and hide the pane's empty-state element. With rows already loaded, keep them. A refresh the student asked for shows the toast (non-quiet); polls stay silent.
- `profile.html:9306-9339` and `:9617-9652` already do this by hand. They can move to the helper, but are not counted.

### 4. Already right (not items)

- `MapMobile` and the desktop map overview do say "Couldn't load the map". They are listed only because they lack a Retry control.
- Network counts hide the number on failure (`NetworkPageClient.tsx:458`).
- Campus stats stay "loading…" (`campus-home.tsx:3271`).
- `OttoCorner` keeps its prior unread count.
- The messages.html Connections tab note works (`:2017-2020`).
- `/otto` renders "otto's offline" when the whole payload fails (`otto/page.tsx:40-50`).
- Compose search in `messages.html:2613-2616` already says "Search failed. Try again."
- The MessagesMobile compose suggestions fall back to neutral copy ("Search above…").

### 5. Tone per surface

- **Dark:** campus-home Events, Orgs, Chat, Map and the Otto strip; the org page; the Otto side panel and `_otto.js`; MapMobile; the CampusMobile chat pane and drawer.
- **Light:** everything else.