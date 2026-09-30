# Silent-failure pattern: design
*Read-only investigation, 2026-09-11. No files were edited.*

## Bottom line

One React helper (`vibeRequest`), one toast host mounted in the root layout, and one static twin in `public/html/_persistence.js` fix **50 of the 74 rows**. The other 24 break down as:
- **15** are different bugs that happen to sit in this list.
- **8** are the same control listed twice.
- **1** is misdescribed.
- **0** are already fixed.

The work is **49 call sites in 8 batches** (B0–B6, plus a separate B2b). B0 (helpers) lands first. After it, B1, B2, B3, B4 and B6 can run in parallel. B2b (PostViewerMobile.tsx) and B5 (messages.html) must wait: other agents are editing those files right now. PostViewerMobile shifted by +3 lines while I was reading it.

**Correction to the brief:** follows are **not** terms-gated. `src/app/api/me/follow/route.ts` never calls `requireTermsAccepted`, so a follow can fail with 401, 429, 403 "Unavailable" (a block in either direction) or 500, but never `terms_required`. These routes are terms-gated (27 route files):
- posts, comments, reposts, reports
- threads and messages
- uploads and profile writes
- orgs, events and personal events

## 1. Error vocabulary: what the server actually returns

- **Terms gate**, `src/lib/legal/require-terms.ts:9-14`: 403 `{ok:false, error:"Accept the Terms to continue", code:"terms_required"}`. This is one of only two machine `code`s in the whole API. The other is `terms_version_mismatch`.
- **Rate limiter**, `src/lib/rate-limit.ts:55-66` (`tooManyRequests`): 429 `{ok:false, error:"Too many requests. Try again shortly."}` plus a `Retry-After` header set to the window length. It sends **no `code`**, so detect it by status alone. 18 routes use it: follow, comments, reports, threads, thread messages, handle, profile-sync, profile-upload, the three upload-url routes, publish-post, orgs, password-reset, school-email request, resume, and others.
- **Everything else** is `{ok:false, error:"<string>"}`:
  - **401** "Unauthorized" (128 sites).
  - **500** "Request failed" (103 sites).
  - **400** (233 sites), mostly developer strings: "Invalid JSON" ×47, "Missing post id" ×13, "channel_ids must be UUIDs".
  - **403**, either a human sentence or a generic token:
    - Sentences: "You can only add people you're connected with", "Only the sender can delete this message", "Join the org first", "Not a member", "Couldn't send this message".
    - Generic tokens: "Unavailable", "Forbidden", "Request failed".
  - **409**, always human: "That handle is taken", "Channel name already exists", "Request already resolved".
  - **503**, either "… not configured" or "Mute is rolling out — try again in a minute."
- **"Not connected"** is not an error for 1:1 threads. `POST /api/me/threads` files a message request instead (`threads/route.ts:179-180`). It is a 403 sentence only for group adds (`:235-241`).

**Mapping.** The first matching row wins. "here" is the page the student is on.

| Signal | Student sees | Action |
|---|---|---|
| `fetch` threw (status 0) | Couldn't reach Vibe. Check your connection and try again. | — |
| 401 | You've been signed out. Sign in and try again. | **Sign in** → `/auth/login?next=<here>` |
| 403 + `code === "terms_required"` | Accept the Terms first, then try again. | **Review Terms** → `/auth/terms?next=<here>` |
| 429 | You're going a little fast. Try again in a minute. (Say "in N seconds" when Retry-After < 60.) | — |
| 403 `"Unavailable"` | You can't connect with this person. | — |
| 403 with a human sentence | The server's `error`, verbatim | — |
| 403 `"Forbidden"` / `"Request failed"` | You don't have access to do that. | — |
| 404 | That's no longer available. | — |
| 409 | The server's `error`, verbatim | — |
| 400 | The caller's `failure` line. Pass through only `/exceeds \d+ characters/`, "Comment is empty", "Message too long" and "Empty message". | — |
| 5xx, a non-JSON body, or 2xx with `ok:false` | The caller's `failure` line + " Try again." | — |

**The Terms route**, `src/app/auth/terms/page.tsx`:
- `resolveNext` (`:25-33`) reads `?next=` and passes it through `isSafeRelativePath` (`src/lib/auth/login-next.ts`: same-origin only, no `//`, no backslash, no control characters).
- It rejects `/auth/terms` itself and defaults to `/onboarding`.
- `AcceptTermsForm` posts `/api/me/accept-terms`, then calls `router.push(next)`.
- Signed-out visitors are already chained through `/auth/login?next=/auth/terms?next=…`.

So `next` should be the page's own `pathname + search`, and the action should do a full navigation (`location.assign`) so the server-side gate runs.

## 2. Existing feedback infrastructure

**React.**
- There is no toast library in `package.json`.
- There are four local, ad-hoc toasts, none of them global:
  - `CampusMobile.tsx:2193` (the post-options sheet's inline banner)
  - `orgs/[handle]/ChannelsSection.tsx:38`
  - `network/OttoCorner.tsx:53` (the mention toast)
  - `MessagesMobile.tsx:1571`
- `src/app/layout.tsx` mounts `<CustomCursor />` once for every React route. That is the natural mount point for a host.

**Static pages.** All three pages load `/html/_persistence.js` in `<head>`. It already holds cross-page helpers: `window.__vibeTopNav` at `:55` and the terms redirect at `:175-180`.

| Page | Where it runs | `showToast` |
|---|---|---|
| `profile.html` | Top level on desktop (`profile-html-bridge.tsx:71` and `ProfileHandleSwitch.tsx:44` use `location.replace`) | Global `function showToast` at `:5306-5314`. It writes into `#save-toast`, whose markup at `:3124` has a hardcoded ✓, so it is **wrong for errors**. |
| `messages.html` | Iframe inside `CampusAppShell` (`MessagesSwitch.tsx:42-48`) | None. So the guarded calls at `_sharePicker.js:291` and `messages.html:2669` never fire. |
| `onboarding.html` | Served at `/onboarding/classic`, iframed full-viewport (`OnboardingSwitch.tsx:24-38`) | None |

`_safetyActions.js:30-46` keeps a private `showToast` with its own fallback element (`#vsa-toast`, z-index 11500).

## 3. The pattern

### 3a. React helper and host

**Files.** All are new except the layout.
- `src/lib/feedback/failure-copy.ts`: pure, no DOM. Holds the table above.
- `src/lib/feedback/toast.ts`: a module-level store, so any client component can call `toast()` without a provider.
- `src/lib/feedback/request.ts`: `vibeRequest`, `copyText`, `downloadFile`.
- `src/components/feedback/ToastHost.tsx`: `"use client"`. Reads the store with `useSyncExternalStore`, the same idiom as `src/lib/use-is-mobile.ts`.
- `src/app/layout.tsx`: render `<ToastHost />` right after `{children}`, next to `<CustomCursor />`.

```ts
// failure-copy.ts
export type FailureSignal = { status: number; code: string | null; error: string | null; retryAfterSec: number | null };
export type ToastAction = { label: string; href: string };
export function describeFailure(sig: FailureSignal, fallback: string, here: string): { message: string; action?: ToastAction };

// toast.ts
export type ToastTone = "info" | "error";
export type ToastInput = { message: string; tone?: ToastTone; action?: ToastAction; durationMs?: number };
export function toast(input: string | ToastInput): void;
export function dismissToast(): void;
export function subscribeToast(listener: () => void): () => void;
export function getToastSnapshot(): ToastItem | null;

// request.ts
export type VibeRequestInit = Omit<RequestInit, "body"> & {
  json?: unknown;          // stringified; sets content-type
  body?: BodyInit | null;  // FormData uploads
  failure: string;         // REQUIRED, e.g. "Couldn't post your comment."
  success?: string;        // info toast, only when the UI otherwise shows nothing
  quiet?: boolean;         // no toast; the caller renders the failure inline
};
export type VibeFailure = { ok: false; status: number; code: string | null; error: string | null; message: string; action?: ToastAction };
export type VibeResult<T> = { ok: true; status: number; data: T } | VibeFailure;
export function vibeRequest<T = Record<string, unknown>>(url: string, init: VibeRequestInit): Promise<VibeResult<T>>;
export function copyText(text: string, opts?: { success?: string; failure?: string }): Promise<boolean>;
export function downloadFile(url: string, filename: string, opts: { failure: string; success?: string }): Promise<boolean>;
```

**How `vibeRequest` behaves:**
1. Performs the fetch inside try/catch. A thrown fetch becomes status 0.
2. Reads the body with `res.text()`, then `JSON.parse` inside try. HTML error pages and empty bodies become `null`, so nothing throws the way `res.json()` does today.
3. Treats the request as failed when `!res.ok` **or** `body?.ok === false`.
4. On failure, builds the signal from `{status, body.code, body.error, Retry-After}` and runs `describeFailure(signal, init.failure, location.pathname + location.search)`. Unless `quiet` is set, it shows an error toast carrying the mapped action.
5. **Never throws.** Callers branch on `r.ok`.

`failure` is required so every call site writes its own one-line verb message, and a student never sees "Request failed".

**Host.**
- Shows one toast at a time. A new toast replaces the old one, and an identical message within 1.5 s is ignored.
- Position: fixed, bottom-center.
  - Desktop: `bottom: 24px`.
  - At ≤899px (`MOBILE_BREAKPOINT_PX`): `bottom: calc(env(safe-area-inset-bottom,0px) + 76px)`, which clears `.vibe-mobile-tabbar` (`globals.css:2507-2521`, z 9988).
- z-index 12000. The highest React z-index today is 11000.
- Accessibility: `role="status"` with `aria-live="polite"`; errors use `role="alert"`.
- Look: a dark DM Sans pill in inline styles, like OttoCorner and CampusMobile. Errors get a coral accent.
- The action is a button that calls `window.location.assign(href)`.
- Durations: info 2.4 s, error 5 s, error with an action 8 s. Tap to dismiss.

**Coverage.** Because it lives in the root layout, it covers:
- `/campus` desktop (CampusAppShell)
- every mobile component (MobileShell renders inside the root)
- `/posts/[id]`, `/orgs/[handle]`, `/network`, `/otto`, `/settings`
- mobile `/onboarding` and `/auth/*`

It does not reach inside iframes. That is what the static twin is for.

### 3b. Static-page twin

**Where it lives: `public/html/_persistence.js`.** Every static page already loads it in `<head>`, so wiring it up needs no HTML edits. It defines:
- `window.vibeToast(message, { tone, action: {label, href} })`. Renders its own lazily-created `#vibe-toast` at z 11600: above page modals (≤10000) and `#vsa-toast`, below the custom cursor (2147483646). It never reuses profile's ✓ `#save-toast`.
- `window.vibeRequest(url, { method, json, body, failure, success, quiet })`, with the same result shape as React.
- `window.vibeCopy(text, success)`.
- `window.showToast = window.showToast || (m => window.vibeToast(m))`.
  - This is a plain, configurable assignment, so `profile.html`'s later top-level `function showToast` still overrides it and profile keeps its own save toast.
  - `messages.html` and `onboarding.html` get the default. That alone fixes row 72 and makes row 68's summary toast appear.
- The copy table, duplicated in about 12 lines of JS (a static page can't import TS). Add a comment in both files pointing at the other.

**Iframes: render the toast inside the iframe, don't forward it to the parent.** This is the simpler and more robust option:
- Both iframes (messages, onboarding) fill the content column or the whole viewport, so a fixed bottom-center toast inside the iframe lands exactly where the student is looking.
- Forwarding would need a postMessage protocol, an origin-checked listener in the React host, and a second code path for the top-level `profile.html`. That is more moving parts for no visible gain.

**What must escape the iframe is navigation.**
- Action hrefs (Terms, Sign in) go through `window.__vibeTopNav(href)`.
- `here` is computed from `window.top.location.pathname + search`, with a try/catch falling back to `self`. A student in `/messages?channel=…` comes back there, not to a bare `/html/messages.html?app=1`.
- Top-level `/html/profile.html?app=1…` works as a `next` target, because the proxy lets signed-in `?app=1` through (`src/proxy.ts:94`).

**Follow-up, outside the 74 rows:** `_persistence.js:178-179` redirects to Terms using the iframe's own path and `location.replace`. It should use the top path and `__vibeTopNav`.

### 3c. Optimistic updates

1. **Confirm, then paint** is the default for anything consent-gated or destructive: post, comment, repost, follow, message, accept/decline, delete, join.
   - Wait for the result before changing the UI.
   - On failure, the draft stays in the box and the button re-enables.
   - Nothing needs rolling back.
2. **Where the UI already changes first** (row removal, reorder, reaction, pin, a label flip):
   - Snapshot the exact prior value before changing anything.
   - On failure, restore that snapshot, reinserting removed rows at their original index, and show the toast.
   - Don't use a refetch as the rollback. A refetch can race the next action and can fail too.
3. **Debounced writes** (OttoSettings):
   - Keep a `lastConfirmedRef`.
   - On success, set it to the server's returned `settings`.
   - On failure, `setState(lastConfirmedRef.current)` and show one toast per flush.
4. **Never show success before the result.** Rows 56, 58 and 64 are that defect. They are classed not-pattern.
5. **Success toasts** only where the UI otherwise shows nothing: report, mobile repost, copy link, download, mute. Where a comment appears or a button flips, don't toast.

### 3d. Clipboard and downloads

**`copyText`**
1. Try `navigator.clipboard.writeText`.
2. Fall back to a hidden textarea plus `document.execCommand('copy')`.
3. Toast "Link copied" on success, or "Couldn't copy the link." if both fail.

The menu closes either way.

**`downloadFile`** (replaces the synthetic `<a download>`)
1. `fetch(url, {credentials:'include'})`.
2. Require `res.ok` and a content-type that isn't `application/json`. Today a 401 JSON body is saved to disk as `vibe-calendar.ics`.
3. Save the blob: object URL, then an `<a download>` click, then `revokeObjectURL` on the next tick.
4. Toast "Calendar file downloaded. Open it to import." on success.

For the Google row, call `window.open` synchronously inside the click handler before any `await`, or popup blockers eat it.

## 4. Accounting

| Classification | Count | Rows |
|---|---|---|
| pattern | 50 | — |
| not-pattern | 15 | 16, 17, 20, 29, 40, 51, 54, 56, 57, 58, 61, 64, 65, 66, 69 |
| duplicate | 8 | 34, 44, 45, 47, 48, 49, 50, 52 |
| misdescribed | 1 | 18 |
| already-fixed | 0 | — |

**Not-pattern, grouped by the actual defect:**
- **Fake success before the save:** avatar, cover and edit-exit toasts (56, 58, 64).
- **Blob URL never saved:** cover drag-drop (57).
- **Delete that never calls the API:** profile post × (66).
- **Hardcoded unread dot:** profile nav (54).
- **Fake accept timer:** visited-profile Connect fallback (61).
- **Banner always opens the first request:** messages (69).
- **No request at all:**
  - landing warp watchdog (16)
  - paste-a-link hint (20)
  - Otto mobile Pass (29), local-only by design
  - B/I/U toolbar (65)
- **Supabase existing-email case on signup (17):** the page already shows errors.
- **Mark-read on panel open (40):** background, and should stay silent.
- **Org join request (51):** the page already checks and shows errors. The real gap is on the server: no notification is sent to org staff.

**Duplicates:**
- `/posts/[id]` renders PostViewerMobile, so rows 47–50 duplicate 23–26.
- OttoMobile renders the same `OttoSettings`, so rows 44–45 duplicate 30.
- 34 duplicates 22; 52 duplicates 21.

**Shared handlers, counted once:**
- Rows 9 and 10 share `submit`; rows 12 and 13 share `handleJoin`; rows 1–3 share `trigger`.
- Rows 36 and 37 share `follow()`.
- Row 43 needs no edit in `OttoRequests.tsx`; fixing the handlers for rows 41 and 27 fixes it.

## 5. Batches (by file ownership)

| Batch | Files | Call sites |
|---|---|---|
| **B0 helpers** (first, blocking) | new `src/lib/feedback/{failure-copy,toast,request}.ts`, `src/components/feedback/ToastHost.tsx`; edits to `src/app/layout.tsx` and `public/html/_persistence.js` | 0 converted; fixes row 72 outright |
| **B1** | `src/app/campus/campus-home.tsx` | 9 |
| **B2** | `OttoMobile.tsx`, `ProfileMobile.tsx`, `OnboardingMobile.tsx` | 8 |
| **B2b** | `PostViewerMobile.tsx` (wait for the concurrent edit) | 4 |
| **B3** | `LeftNav.tsx`, `NetworkPageClient.tsx`, `UserCard.tsx`, `OttoPageClient.tsx`, `OttoSettings.tsx`, `SettingsClient.tsx` | 11 |
| **B4** | `profile.html` | 7 |
| **B5** | `messages.html` (wait for the concurrent edit) | 5 |
| **B6** | `onboarding.html`, `_safetyActions.js`, `_sharePicker.js` | 5 |

## 6. Riskiest edits

1. **B6, onboarding Finish.** Every new student passes through it.
   - Remove the `/auth/login` fall-through (`onboarding.html:997`) and send every navigation through `__vibeTopNav`.
   - Today the terms redirect and the success warp both load inside the full-viewport iframe.
   - A real 401 must still reach login, through the mapped action.
   - Test replay mode, the terms path, and a 409 on the handle claim.
2. **B5, Accept/Decline.** Decline deletes `__realDM.T[channelId]` and clears `active` before the fetch. Moving to confirm-then-paint changes when the bar hides, and the file is being edited concurrently.
3. **B1, campus-home.tsx (12.6k lines).**
   - Many similarly named `submit`/`send` functions.
   - The reorder rollback must reuse the ids captured before the swap.
   - The messages route behind Send is also being edited concurrently.
4. **B4, pin rollback.** `pinFromProfile` moves DOM and writes localStorage. Restore by calling it programmatically without a `btn`, which skips the re-sync, to avoid a loop.
5. **B3, OttoSettings.** The component is shared by desktop and mobile. The debounce merges several keys into one PATCH, so rollback has to restore the whole last-confirmed object.
6. **B0, `_persistence.js`.** It runs in `<head>` before `<body>` exists, so create the toast element lazily. Assign the default `showToast` with plain assignment so profile's function declaration can still override it.

## 7. Not verified

- No code was changed, so `tsc` and `eslint` were not run.
- Nothing was clicked live.
- Two claims in the rows are unconfirmed:
  - Row 2: the Google URL. `/r/settings/export` is, as far as I know, Google's combined Import & export page, which would make the "EXPORT not import" sub-claim wrong.
  - Row 17: the Supabase `identities: []` behaviour on signup.
- Line numbers for `PostViewerMobile.tsx` and `messages.html` may drift again before B2b and B5 run.