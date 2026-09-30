# W2-S1 review — lens: security

Reviewed at `94bcb1d` (S1's commits `7678656`, `22d920e`, `92a0810`, `005020d`,
`048cb1f`, `b47a72b`, `866ab0a`; `git diff a9355d1 -- <S1 files>`), against
`wave-2-contracts.md` 1.2, 2, 8.1, 9.3, 11.0–11.2, 11.9, 11.10, 12, 13.2, 13.3,
the mockup facts (MK) and the code on the branch (`request.ts`,
`failure-copy.ts`, `LoadFailed.tsx`, the three reads, the thread GET, the
features route). Read-only; the gates re-run here: `npx tsc --noEmit` exit 0
(repo-wide), `npx eslint <the S1 files>` = the six baseline errors only
(CampusMobile 4 × `set-state-in-effect`, MessagesMobile `immutability` +
`set-state-in-effect`, both inside `MessagesMobileV1`; compared against
`git show a9355d1:<path> | npx eslint --stdin`), `node --test` on
`week.test.ts` (7), `avatar.test.ts` (5), `home-rules.test.ts` (10) all pass.
`npm run build` was NOT re-run here (two builds collide in `.next`; the
builder's S1-gate.md records exit 0 after the last code edit).

## Verdict

**PASS — no HIGH, no MEDIUM.** Three LOW. Every item of the lens holds (the
list at the end). The seven STOPPED entries and the SIBLING entry were checked
against the sources and are right.

## Findings

### S1-SECURITY-1 — LOW — the calendar is also re-read on the 30-s timer
- where: `src/components/mobile/messages/home/MessagesHome.tsx:169-181`
- what: 11.1 pins the calendar to "on mount and on return to visible at most
  once per 5 min". The `tick` that the 30-s interval fires while visible also
  calls `readWeek()` once 5 min have passed, so a home left open and visible
  re-reads `/api/me/calendar` every 5 min without a visibility change. The
  header comment (`:31-32`) states the contract's rule; the code does one
  more. Bounded (never while hidden, at most once per 5 min) and cheap, so
  LOW; the same point is S1-CONTRACT-2. Not a leak: a visible page, the
  viewer's own calendar, `no-store`.
- fix: split `tick`: the interval calls only the list branch
  (`if (Date.now() - listAtRef.current >= LIST_RESYNC_MS) void readLists();`);
  the `visibilitychange` handler runs both branches. Two lines.

### S1-SECURITY-2 — LOW — the once-only redirect keys on `tab`, which the swipe track may rewrite first
- where: `src/components/mobile/CampusMobile.tsx:299-303` (with `:884-896`)
- what: when the flag answers `true` with `?tab=chat` / `?channel=`, the
  redirect effect requires `tab === "chat"`. In the same commit `tabOrder`
  loses `"chat"`, the chat pane section unmounts, and the track's `onScroll`
  (`:888-896`: `tabOrder[Math.round(scrollLeft / w)]`) can map the old scroll
  offset to a different tab and `setTab(next)` before the passive effect
  runs. If that ordering happens, `tab` is no longer `"chat"`, the effect
  skips, `chatRedirectedRef` stays false, and the viewer sits on another tab
  with `?channel=<id>` still in the URL: the deep link is lost (no loop, no
  leak, no old chat: `oldChatMounts` is false). Timing-dependent and
  unlikely, so LOW.
- fix: decide from the URL, not the state: `if (chatV2 !== true ||
  !chatWanted || chatRedirectedRef.current) return;` (`chatWanted` is
  `tab === "chat" || initialChannelId !== null`, `:294`), deps
  `[chatV2, chatWanted, initialChannelId, router]`. The contract's "if
  `tab === "chat"` at that moment (from `?tab=chat` or `?channel=`)" is the
  same condition read from its source.

### S1-SECURITY-3 — LOW — a forward `popstate` leaves `?channel=<id>` in the bar with nothing open
- where: `src/components/mobile/MessagesMobile.tsx:200-211` (`onPop`)
- what: after Back closed a layer, the browser's Forward returns to the
  depth-1 entry (`{ vibeChat, depth: 1 }`, URL `/messages?channel=<id>`).
  `onPop` returns on `depth >= 1` (correct: that popstate may be
  `ClubSpace`'s), so nothing opens and the URL shows a room that is not on
  screen. Nothing re-triggers (`firstChannelId` is a one-time `useState`
  initialiser, 2.3 "read once"), a reload would resolve it as a deep link,
  and the next row tap `pushState`s over it. Cosmetic; 2.3 does not cover
  Forward.
- fix: in `onPop`, before the `depth >= 1` return: `if (depthOf(e.state) >= 1
  && !openRef.current) { window.history.replaceState(null, "",
  homeUrl(filterRef.current)); return; }` — with nothing open, a layer entry
  is stale and the URL goes back to the home's.

## The STOPPED and SIBLING entries (S1-notes.md), judged

- **Part 1 (four club gradients, not six)**: right. `grep -oh
  "linear-gradient(145deg,[^)]*)" boards/W0_*.dc.html | sort -u` gives
  exactly four; six is the person-colour count. Nothing invented.
- **10 (the ONE popstate handler vs `ClubSpace`'s pinned props)**: right.
  `ClubSpace`'s props (`{ orgHandle; initialRoomId; initialRoomKind; onClose }`)
  give the shell no way to close the event layer; the R1–R3 split (the shell
  owns depth < 1, `ClubSpace` owns depth 2, the deep link writes depth 1 then
  depth 2) keeps 2.3's state shape and its Back behaviour. The doubled read
  of a deep-linked room until `initialPage?` exists is recorded, not hidden.
- **11 (no unread count on a person row)**: right. `GET /api/me/threads`
  sends `unread: boolean` (`threads/route.ts` ThreadEntry, `messages/types.ts:9`);
  the pill carries no number, the label says `unread`.
- **12 (`eventTimeShort` never answers a bare `Sat`; tomorrow drops the day)**:
  right (`when.ts:183-185`: `days === 1` → the time alone in the short form).
  Built with the pinned function.
- **13 (the spoken time as the last clause)**: a reading, not a change of any
  pinned clause; consistent with 1.2's "the row's time is spoken with
  `rowTimeSpoken`".
- **14 (`coralMark` on the two tinted surfaces)**: right; 11.0 defines the mark
  token for a tinted surface and the table in S1-contrast.md carries the pairs.
- **15 (the pencil `aria-disabled` while the flag is unknown)**: acceptable;
  2.1 asks for "the pencil" and there is no list to compose into yet.
- **16 (`?tab=` via `useSearchParams`)**: right; `page.tsx` passes `to` and
  `channel` only and is not S1's. Build gate (S1-gate.md) records no Suspense
  complaint.
- **17 (failure placement in All)**: a reasonable reading of "the list's club
  position" when All interleaves.
- **SIBLING: none**: confirmed, `npx tsc --noEmit` exit 0 here too.

## Holds (checked, nothing to fix)

- **The flag comes only from `/api/me/features`**: `useChatV2` is the one
  reader (`use-chat-v2.ts`), `vibeRequest` with `cache: "no-store"`, `true`
  only on `{ ok: true, chat_v2: true }`, anything else `false`; no client file
  imports `@/lib/chat/flag` or reads a `NEXT_PUBLIC_` value (grep);
  `MessagesMobile` and `CampusMobile` both call the hook, nothing caches it.
- **A gated 404 shows `LoadFailed`, never the old list**: `MessagesHome`
  keeps its own `clubsErr` (`asLoadFailure` → "That's no longer available.",
  `retryable: false` → the line alone) in the club position; threads still
  list (11.1); both failing → one box; `MessagesMobile` never falls back to
  `MessagesMobileV1` once the flag is `true` (the fork is on the hook's
  answer alone).
- **No HTML from payloads**: no `dangerouslySetInnerHTML` / `innerHTML` in any
  S1 file (grep); every server string is a React text child. `logo_url` /
  `avatar_url` go into an inline `background: url(...)` via the CSSOM (React
  sets `style.background`), so a hostile value is an invalid declaration
  that is dropped, not a second declaration; the same pattern as the old
  `ThreadRow` (`a9355d1:ThreadList.tsx:118`).
- **Encoded links**: `channelUrl` (`encodeURIComponent(id)`), the week card's
  `href`, the thread GET path, the calendar `from`/`to`, CampusMobile's
  `router.replace("/messages?channel=" + encodeURIComponent(...))`. `homeUrl`
  and `parseHomeFilter` whitelist the four filters, so `?tab=` never carries
  an arbitrary string back into the URL. S1 builds no `/orgs/<handle>` link
  (the club page link is S2's).
- **Logs**: one `console.warn` in `use-chat-v2.ts:45`, once per page load,
  the features body (`{ ok, chat_v2 }`) or a status + code — no message
  content, no thread or user id. Nothing else logs.
- **No browser storage**: no `localStorage` / `sessionStorage` / IndexedDB in
  any S1 file; the only state outside React is `history.state` (validated by
  `depthOf`) and the two module counters (`logged`, `mounted`).
- **The deep-link failure path**: any non-200 or a 2xx without `messages[]` →
  filter `all`, `replaceState(null, "", "/messages")`, the toast
  `asLoadFailure(r, "Couldn't open this chat.").message`; `firstChannelId` is
  read once, so nothing re-triggers; a `?to=` and a `?channel=` racing are
  ordered by `deepLinkSeqRef`. `replaceState(null, …)` is safe under the
  app router (Next copies `__NA` and its tree into a null state).
- **Polling**: one 30-s interval, its `tick` returns unless
  `document.visibilityState === "visible"`, cleared on unmount with the
  `visibilitychange` listener; the return-to-visible reads are rate-limited
  by `listAtRef` / `weekAtRef`; nothing polls in `MessagesMobileV2`,
  `YourWeek`, `ClubRow`, `PersonRow`, `HomeEmpty`, `FlagPending`.
- **CampusMobile's redirect runs once**: `chatRedirectedRef`; `/messages`
  never redirects back to `/campus` (`page.tsx`, `MessagesSwitch`); with the
  flag `true` the chat section, `OrgChannelsDrawer` and the synthesized
  `ConversationView` never mount (`chatV2 === true ? null`, `oldChatMounts`);
  with `null` + `?tab=chat` / `?channel=` only `ListSkeleton` mounts, so the
  old `# name` thread GET never runs before the flag is known (2.2). The
  track effect guards `idx < 0` and the swipe handler guards `next &&`, so
  the missing `"chat"` index throws nothing.
- **Toasts**: every failure line is `describeFailure`'s mapping through
  `asLoadFailure` / `vibeRequest`; the only server strings that reach a toast
  are the sentences `failure-copy.ts` deliberately passes (`isHumanSentence`
  on 403/409, e.g. the thread GET's "Not a member"), which 2.3 calls "its
  mapped line". No `r.error` is shown directly.
- **Ownership (13.2)**: the seven commits touch only S1's files; `layout.tsx`
  is the one fonts line; `MessagesMobileV1` is the old body under a new name
  (the diff's 13 deletions are the header comment); no new dependency.
- **Seen, not re-raised here** (not this lens): `className="vibe-no-scrollbar"`
  on the week's card row (S1-CONTRACT-1).
