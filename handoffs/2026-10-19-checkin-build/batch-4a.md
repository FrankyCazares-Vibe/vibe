# Batch 4a: officer door (QR, door page)

Owner files: `package.json` / `package-lock.json` (uqr), `qr-path.ts` + test,
`QrCode.tsx`, `use-door-feed.ts`, `use-wake-lock.ts`, `DoorView.tsx`,
`src/app/campus/checkin/[id]/door/page.tsx`.

## Log

- `npm install --save-exact uqr@0.1.3`: package.json gets `"uqr": "0.1.3"` (no
  caret); the lockfile adds only `node_modules/uqr` (MIT, no dependencies).
  npm's "17 vulnerabilities" line is the existing tree, not uqr.
- `node_modules/uqr/dist/index.d.mts` checked: `encode()` returns
  `{ version, size, maskPattern, data: boolean[][], types }`; `size` counts the
  border. A real door link (about 110 characters) at ECC M, border 4 is
  version 7, 53 x 53 modules. Matches the contract, so no adaptation needed.
- `qr-path.ts`: `QR_OPTIONS` (`{ ecc: "M", border: 4 }`), `qrPathFromMatrix`
  (one `M x y h1v1h-1z` per dark module), `qrSvgFor(text)`. Test: 7 cases
  (square matrix, version <= 10 guard, three finder corners dark, quiet zone
  white, one M per dark module, a 2x2 hand case, qrSvgFor = encode + path).
- `QrCode.tsx`: `<svg role="img" viewBox="0 0 N N" shapeRendering="crispEdges">`,
  white rect + black path (fixed pair, commented), encode memoized on `text`.
- `use-wake-lock.ts`: feature-detects `navigator.wakeLock`, asks on open and
  on return to visible, releases on close/unmount, silent on refusal.
- `use-door-feed.ts`: returns `{ feed, failed, failCode, step, secondsLeft,
  serverNowMs, busy, start, stop, reload }` (contract's set plus `failCode`
  and `serverNowMs`; `busy` is `"start" | "stop" | null`). Each read books
  the next one (10 s; 60 s after any 4xx so a refused screen doesn't spend
  the door budget), reads on return to visible, and once per boundary when
  the shown step moves to `next`. The 1 s tick lines up on the server's
  whole seconds (skew taken at receipt). Answers carry a sequence number so
  an older read never overwrites a newer Start/Stop answer.
- `DoorView.tsx`: the 4.3 table; layout by a `<style>` block (760 px
  breakpoint, QR tile `min(78vw, 46dvh, 420px)` on phones and
  `clamp(300px, 46dvh, 420px)` beside the text; code
  `clamp(64px, 20vw, 128px)` on phones, `clamp(64px, 11vw, 128px)` beside the
  QR so both columns fit at 760 px). The code's live region stays mounted (a
  freshly mounted live region isn't announced); inside it a visually hidden
  "Code 4 8 1 2" and the visible digits `aria-hidden`.
  Small addition: on a failed first read, a refusal the check-in words cover
  (org_hidden, org_role_required, account_restricted, not_found) gets its
  `CHECKIN_ERRORS` line under `doorLoadFailed`.
- Door page: uuid -> `notFound()`, `enforceCampusAccess(doorPagePath(id))`,
  viewer read of the event (`notFound()` if hidden by RLS),
  `can_manage_event`, club name/handle via the service client (guarded by
  `isSupabaseServiceConfigured`; a failed read logs `error.code` only and
  draws no club line).

## Checks

- `node --test src/components/events/checkin/qr-path.test.ts`: 7/7 pass.
- `npm test`: 3270/3270 pass. `npm run typecheck`: clean (whole project).
- `npx eslint` on every 4a file: clean.
- No "safety", "location" or geolocation anywhere in 4a's files.
- Live door check NOT run: nothing answered on http://localhost:3000 for the
  whole batch (curl exit 7; no `next` process on the Mac). Not started, per
  the rule. To do once a dev server is up: as avery on `chat_seed_club`,
  open `/campus/checkin/<id>/door` -> Start -> QR + code + countdown, the
  code flips at :00/:30, Stop -> Start button; a member sees
  `doorNotOfficer`; signed out -> `/auth/login?next=%2Fcampus%2Fcheckin%2F<id>%2Fdoor`.

## For the others

- WITHDRAWN (review round 1): the earlier "D8 gap" suggestion to Batch 1 is
  dropped. A suspended officer never reaches the door: `src/proxy.ts`
  (restrictionInForce) sends every page to /account/suspended and refuses
  any non-GET /api call outside `restrictedApiAllowed`, so their DELETE is
  refused before the route runs. Changing what DELETE answers would change
  nothing. For the orchestrator to pick: allowlist
  `DELETE /api/events/<id>/checkin/door` in `restrictedApiAllowed` (and give
  them a button somewhere they can reach), or reword D8 ("They can stop")
  and the door route's comment to "another officer, or the window's end,
  stops it". No 4a change either way.
- Batch 4b: the door is `doorPagePath(id)`; "See who came" after the event
  links to `/orgs/<handle>` (your Past events block opens the list).

## Review round 1 (fixes)

- F1 race (use-door-feed.ts): an action now wins. `actingRef` is set while
  Start/Stop is out; `read()` returns early then; `act` clears the poll
  before it sends and books the next read after its answer is applied. A
  read already out when the action starts has a lower seq, so it can't
  overwrite the action's answer. New `book(wait)` clears before it sets, so
  a read and an action finishing together leave one timer, never two chains.
  The double-tap guard is the ref, not the `busy` state.
- F2 a11y (DoorView.tsx): the code's live region moved to DoorView, always
  mounted, `role="status" aria-live="polite" aria-atomic="true"`, visually
  hidden, empty when no code shows, so the first code after Start is
  announced. The `aria-label` on the role-less div is gone (the text content
  carries "Code 4 8 1 2"; contract 4.3's aria-label intent is met by the
  content). Focus: set before the request, moved in an effect on `open` to
  Stop after a start, Start after a stop, Done when that button isn't drawn.
  Start/Stop use `aria-disabled` while busy (a `disabled` button drops focus).
- F3 final refusals (use-door-feed.ts): a 4xx other than 408/429 on a read
  takes the feed down (`feedRef = null`, `feed: null`, appliedRef = that seq
  so an older read can't put it back). DoorView then shows `doorLoadFailed`,
  the CHECKIN_ERRORS line and Try again; wake lock and the reload hold drop.
  429 / 5xx / network keep the feed with "Reconnecting…". Retry stays 60 s.
- F4 door page: an event-read error now renders
  `<DoorView loadFailed>` ("Couldn't load check-in." + Try again via
  `router.refresh()` in a transition), not `notFound()`; a real null still
  404s. A `can_manage_event` error renders DoorView with `canManage` true:
  the feed route checks the role, so a non-officer gets
  `org_role_required` and no codes. The header falls back to "Check in"
  when there is no title.
- F7 idle polling: after `closes_at` the read is once a minute; before
  `opens_at` it is once a minute, closing to 10 s as the window nears (read
  right at opens_at). 10 s inside the window. The 1 s tick still flips the
  screen on time.
- F8: `refusalLine` uses an own-key check
  (`Object.prototype.hasOwnProperty.call`, works on iOS 15.0-15.3 too).
- F9 sideways phones: two-column QR side
  `clamp(min(300px, 62dvh), 46dvh, 420px)`, code
  `clamp(64px, min(11vw, 18dvh), 128px)`. At 844 x 390 the tile is about
  210 px and fits; at desktop heights the 300 px floor holds.
- Rejected / passed up: F5 (door count from 1 up) matches contract 4.3, not
  changed; F6 (D8) no 4a change, see above; F10 still no server on :3000
  (curl 000 again during this round), browser pass owed.
- Checks after the fixes: qr-path 7/7; `npm test` 3279/3279; typecheck
  clean (whole project); eslint clean on every 4a file (the project's 33
  lint errors are elsewhere, none in 4a files).
