# Session 57 handoff: DM media, post images, and the 74 silent failures (2026-09-11)

This session worked the S56 handoff §4 in order, as an orchestrator running ultracode workflows.
- **Done and verified live:** §4 items 1, 2 and 3.
- **Also done:** most of item 4, folded into the same batches by file.
- **Commits:** 10 on main, all deployed.

**Next session starts at §4-1: empty states that lie.**

## §1: What shipped (all live on www.connectvibe.app)

| Commit | What |
|---|---|
| `5b62ff5` | **DM photos, videos and shared posts show on a phone** (the last Blocking break).<br>• The phone's `MessageRow` never declared the media fields.<br>• DM media now goes through a members-only proxy, `/api/me/threads/<ch>/messages/<id>/media`. It signs per request and returns a 307. Every denial is a 404, and the redirect is cached privately for 5 min.<br>• A deleted shared post reads "Post unavailable". Its FK is `ON DELETE SET NULL`, so only `attachment_kind` survives.<br>• The media-key rule reuses `MESSAGE_MEDIA_KEY_RE` on write and on read.<br>• The phone unread dot now uses the server's `unread` flag.<br>• Muted threads are left out of the badge. |
| `8973c8c` | **Post photos load everywhere, not just the feed.** One serializer, `withPostMediaUrls()` in `src/lib/post-media-url.ts`, is used at 13 call sites and adds `media_kind`. The post media proxy serves a draft to its author only. |
| `086dc06` | **The shared feedback layer.**<br>• `vibeRequest` never throws. `describeFailure` maps the answer to one plain line:<br>&nbsp;&nbsp;– Terms → "Accept the Terms first" plus **Review Terms**<br>&nbsp;&nbsp;– 401 → Sign in<br>&nbsp;&nbsp;– 429 → wait N seconds<br>&nbsp;&nbsp;– a human-readable 403/409 sentence is shown verbatim<br>&nbsp;&nbsp;– anything else → the caller's own line<br>• `ToastHost` lives in the root layout. Its live regions carry `aria-live`, so toasts survive a Radix modal's `aria-hidden`.<br>• There is a static twin in `public/html/_persistence.js`.<br>• A body sent with no method defaults to POST. |
| `5680dad` | **Desktop campus.**<br>• Comments, replies, repost, report, delete, join, channel reorder (with rollback) and chat send now report failures.<br>• `?tag=` seeds the tag filter.<br>• Comment authors link to their profiles. |
| `5b4abf1` | **Network, Otto, Settings, calendar.**<br>• Replay tour works on a phone.<br>• Your own profile link on a phone hands off to the gated `/profile`.<br>• Phone share links no longer land on the desktop page.<br>• "Verify now →" and the school-email back link work.<br>• Otto "Coming up" links to `/campus?tab=events` (it used to 404). |
| `0adb0eb` | **Mobile.**<br>• Post viewer failures fixed; tapping a toast no longer eats the draft.<br>• `<video>` in PostViewerMobile, so video posts play. (Clips themselves stay parked since S49.)<br>• Feed-card like, repost and save roll back and explain why.<br>• `#tag` filter, `?tag=`, `?tab=`, and author links.<br>• Onboarding Skip saves Otto's config (see §2). |
| `047accd` | **profile.html stops faking success.**<br>• The post × delete now calls the API. It never did before.<br>• Cover, avatar, "Auto-saved" and "Changes saved" wait for the real save, and roll back on refusal.<br>• A dropped cover is actually saved.<br>• The fake accept timer is gone.<br>• Connect, Follow instead, the search pills (now wired), pin and the connections list confirm with the server. Share and connections show "couldn't load" with Retry.<br>• The Messages dot is real.<br>• B/I/U removed.<br>• Video posts and reposts render `<video>`. |
| `4008fcc` | **messages.html.**<br>• Accept/Decline are confirm-then-paint.<br>• Reactions restore the exact prior state.<br>• Add-to-group reports partial failures.<br>• `?to=` failures are explained.<br>• The requests banner lists every request.<br>• The Connections tab filters.<br>• The "+ Add another event" button, which threw on every click, is removed. |
| `a2b3f0d` | **Onboarding and shared scripts.**<br>• Finish navigations escape the iframe, and the `/auth/login` fall-through is gone.<br>• Handle errors are reported.<br>• Skip saves first, and the logo asks before leaving.<br>• The Drive/Notion link note is honest.<br>• The safety report no longer hangs.<br>• The share picker stops on refusal.<br>• Profile cards and @mentions escape the messages frame.<br>• The desktop post viewer plays video. |
| `29f7aaa` | **Journal v6.9, the Session 57 block,** and rewritten next steps. |

**Verified live, signed in, not just shipped:**
- **DM media, phone:**
  - DM image `1965081a` and group image `df15ee1c` render at phone size.
  - The proxy returns 404 when anonymous, when a message id is sent with the wrong channel (Franky is in both), and for a bogus id.
- **Post image:** post `c171e570` loads on the profile grid (307 → 200 `image/jpeg`).
- **Simulated `terms_required` refusals** (in-page fetch override, no prod writes):
  - Phone feed Repost flips back and shows "Accept the Terms first, then try again." with **Review Terms**.
  - A refused desktop comment keeps its draft and shows the same toast.
- **Phone:** `/campus?tab=events` opens Events.
- **Static pages:**
  - Own profile: only the Messages nav button carries the badge and none is hardcoded; B/I/U are gone; the static helpers are present.
  - The messages frame now has `showToast` (row 72).
  - The desktop Connections tab filters: "All" shows 9+ threads, including groups; "Connections" shows 5 DMs.
  - A simulated `terms_required` refusal on a ❤️ reaction inside the messages frame (the POST was intercepted) rendered the static toast in the frame, with **Review Terms**, and left no stale chip.
  - The Connect refusal on a visited profile was **not** run live. The only unconnected account is a teammate's, and opening a desktop profile writes a `profile_views` row into their analytics.

Screenshots were sent to Franky.

## §2: Decisions

- **Onboarding "Skip anyway" saves instead of just leaving.** `/campus` and `/profile` run `enforceCampusAccess`, which sends anyone with empty `otto_answers` back to `/onboarding`. So any plain "go to /campus" skip reloaded step 1 and threw away what the student had typed. Both skips now POST `/api/me/onboarding-complete` with Otto's config and no profile.
  - Mobile then follows the server's `next`.
  - Desktop goes to `/campus`. Both targets are gated app pages, so the difference is cosmetic.
  - The copy now says that what you typed won't be saved.
- **Muted threads are out of the phone badge.** Desktop copy and the server's `muted_until` comment already promised this.
- **The DM media redirect is cached 5 minutes, not 50.** That matches the old inline signed URL's lifetime, so leaving a chat cuts access about as fast as before.
- **Toasts render inside iframes; only navigation escapes,** via `__vibeTopNav`.
- **B / I / U are removed from the profile editor instead of made to persist.** Saving HTML would open XSS surface. Clear stays.

## §3: Method, and what the reviewers caught

Every batch went implement → adversarial review → one repair round. The reviewers caught six real problems:
- The first Skip fix wiped students' answers.
- Error toasts were silent to screen readers inside the post viewer.
- Tapping a toast closed the viewer and threw away the draft.
- On a phone, your own profile link opened an ungated owner view that dead-ends 7 of 8 accounts.
- A queued profile save could claim success while dropping an edit made mid-flight.
- The 403 "sentence" test rejected a real server sentence containing "→".

All were fixed before shipping. I fixed three low-severity items from batch 1 by hand, and four from batch 2:
- Screen-reader toasts inside the modal.
- Feed-card like, repost and save now say why.
- `?tab=` on the phone.
- A failed tag load no longer reads as an empty result.

Checks run on every commit:
- **"No new lint problems"** is checked per file against HEAD (`eslint --stdin` on `git show HEAD:<path>`, compared by rule): 0 new across 20 TS files.
- **Static pages** have no build step. Every inline `<script>` is parsed alone and together, and every `.js` file goes through `node --check`.

**Profile first load after the post-image fix:** it makes one stale-cache request that 404s (`vibe_posts_v1` paints before the page hydrates). It heals on the same load.

## §4: Pick-up list (in priority order)

1. **Empty states that lie** [S54 rows 11–14, 44]. A failed load still reads as "No posts yet" or "no followers". Use `vibeRequest` with `quiet` and render "couldn't load" plus Retry, keeping whatever already loaded. `profile.html`'s share and connections lists show the pattern (rows 55, 59).
2. **Messaging on a phone, the rest of the way.**
   - The composer can't attach photos or videos (`/api/me/messages-upload-url` exists).
   - There's no Accept / Decline on requests; desktop's calls are in `messages.html`.
   - Quote-reply stubs aren't rendered.
   - The thread-list preview says "Attachment", because `last_message` has no media fields.
3. **A Block / Mute / Report ⋯ menu on the phone's visited profile.** This is an app-store requirement, and all three endpoints exist.
4. **Decline a message request: check the server.** S54 found no DELETE policy. Desktop now reports a refusal instead of hiding the request, so either it works or a student now sees an error. Confirm which one.
5. **Low-severity leftovers from the reviews** (none blocking):
   - **profile.html:**
     - The ⋯ menu's "Unfollow", `_saveProfileHandle`, and the share modal's Send/Copy still use raw fetch.
     - Connect shows a misleading "didn't finish loading" on the owner's "View as visitor" preview.
     - Cmd/Ctrl+B/I/U and rich paste still format a field that saves as text only.
     - A delete that returns 404 shows a red toast while the card is removed.
     - Some success toasts duplicate a visible state change.
   - **messages.html:**
     - The reaction rollback misbehaves when two refusals are in flight at once.
     - The add-to-group summary drops the server's human reason.
     - `addCalEvent` and `.color-swatch` are dead code.
     - `seedEvents` still injects 4 demo events, but only on the gated raw `/html/messages.html`.
   - **Onboarding:**
     - A Skip already in flight can't be cancelled, and can race Finish.
     - The link note appears for links the server rejects.
     - `OnboardingMobile` shows the rate-limit line for the handle cooldown (desktop now says "change your handle again in N days") and still skips a malformed handle silently.
     - A pasted Drive or Notion resume link will make profile.html try to rasterize it as a PDF (CORS).
   - **React:**
     - The campus-home `?tag=` stays in the URL after the filter is cleared.
     - The reorder guard resets on remount.
     - OttoMobile reinserts in tap order.
     - ProfileMobile `savePortfolioPatch` is quiet for four callers that show no inline error.
     - `getSession` is unbounded in ProfileHandleSwitch.
     - OttoPageClient drops a pending settings flush on unmount.
   - **Infrastructure:**
     - The static toast has no visible cursor on desktop `/messages`.
     - `_persistence.js` has `catch (_)` lint warnings.
     - Neither media proxy is rate-limited.
6. **S56 §4 items 5+ still stand:**
   - The sharing surface.
   - The metrics screens (the "N mutual" pill first).
   - People: Franky picks a campus. Fix report-2 #17 before any back-fill.
   - Legal, then the **security-sentinel re-run.** New surface since the last run: the DM media proxy, the post media proxy's draft gate, `src/proxy.ts`, and the toast action links.

## §5: Notes for the next session

- **Live verification recipe** is in memory as `reference_live_verification`.
  - Signed-in gstack browser.
  - Simulate refusals with a per-route in-page fetch override, and navigate away after.
  - Vercel deploy status via `gh` (~20–60 s).
  - `browse` quirks.
- **Design docs** for the silent-failure work:
  - `handoffs/2026-09-11-silent-failure-design.md`
  - `handoffs/2026-09-11-silent-failure-rows.json`: all 74 rows classified. 50 pattern, 15 not-pattern, 8 duplicate, 1 misdescribed.
- **Workflow sizes that worked:** batch 1 used 6 agents (25 min), batch 2 used 14 (76 min), wave 2 used 7 (49 min). All pipelines, with one barrier where the helpers had to land first. No run died.
- **Use the helper for new work.** Any new write should use `vibeRequest` (React) or `window.vibeRequest` (static) with its own one-line `failure` sentence. The pattern is now the default, not a retrofit.

## §6: Later the same day. Franky's bug reports, and the rest of §4

Franky reported three things after the first ten commits:
- Messages on his iPhone zooms in and reacts to taps he didn't make.
- Desktop feels laggy.
- The cursor ring trails too far.

He also asked to keep going down §4, and reminded me that **clips are parked**. The phone `<video>` branch plays *video posts*; the journal and memory are corrected (`project_clips_parked`).

**Diagnosis:** read-only, 5 agents. Output is in `handoffs/2026-09-11-s57b-diagnosis.json`, `-empty-states-design.md` / `-items.json` and `-phone-parity-design.md` / `-items.json`.
- **Phone Messages.** Two independent lenses agreed on both symptoms.
  - Zoom: iOS focus-zooms any field under 16px (the composer was 14.5px, the new-message search 15px and self-focusing), and once zoomed, double-tap zoom stays on.
  - Phantom actions: the long-press reaction picker fired under a resting thumb, and S57 had spread it onto media and cards. The conversation also closed on a rightward swipe from anywhere.
- **Desktop.** Measured live: 120 fps and zero dropped frames on every page. The felt lag is the cursor: an 80 ms CSS transition stacked on a lerp, so the ring takes 166 ms to catch up. Franky's Mac was also at 2% battery, which made Chrome run everything at 30 fps.
- **Decline.** It never worked. There was no DELETE policy, the route answered ok, and the request came back.
- **Mute and Block.** Mute did nothing anywhere, and Block didn't hide posts or notifications.

**Wave A.** Shipped, with every batch reviewed and repaired:

| Commit | What |
|---|---|
| `cca356a` | Phone Messages: 16px fields; long-press 500 ms, scroll-aware, off video controls; the tap that dismisses the picker is eaten; `handleOnly` (no swipe-to-close); auto-growing composer. |
| `0af92fe` | One time-based cursor follow (~40 ms to 90%) in all four cursors, sleeping when idle; phone inputs forced to at least 16px (`data-keep-font` opts out); `html { touch-action: manipulation }`; pdf.js only when a PDF opens. |
| `2dbffdd` | `LoadFailed` (React) and `vibeLoadFailed` (static): the shared "couldn't load" piece. |
| `de4ce76` | Decline actually declines. **Migration `20260911100000` was applied by hand before the deploy and verified:** the policy is live and the `schema_migrations` row is recorded. |
| `daf3157` | Block and Mute filter `/api/feed` and `/api/me/notifications` (`src/lib/safety/hidden-users.ts`), and block tears down the reverse follow. |

**Verified live after the Wave A deploy (`daf3157`):**
- **Cursor on `/campus`**, measured with a synthetic 540 px jump:
  - the ring reaches 90% in **25 ms** (was 166 ms);
  - the dot lands on the pointer in the same frame;
  - **0** animation-frame calls in a second of stillness (was about 120).
- **Phone:** the Messages composer and the Campus search both compute to 16px, and `html` has `touch-action: manipulation`.
- **Plain profile view:** pdf.js is no longer loaded.
- **APIs:** `/api/feed` returns 12 posts (it answers with `feed`/`posts`; `entries` is only the tag-feed shape), and `/api/me/notifications` returns 200 with data.
- **Decline:** can't be exercised live, because production has 0 pending requests. The policy and route were checked by reading the code and running `pg_policies`.

**Product trade-offs Franky will notice:**
- Swipe-right-to-close is gone from phone chats; Back is the way out.
- A video-only message can't get a reaction (the long-press stays off native controls).
- Chat text can't be selected.

**iPhone checklist, which Chromium can't reproduce:**
- Messages and New message no longer zoom.
- A resting or flick-stopping thumb doesn't open reactions, but a deliberate 0.5 s hold does.
- The chat doesn't close mid-scroll.
- A long draft grows, then scrolls.
- Pinching at the bottom of a chat may still be eaten by vaul's scroll lock.

**Still open from Wave A:**
- The unread badge (`/api/me/notifications/count`) and the phone Otto tab (`/api/me/otto`) still count and name blocked or muted people. They are routed into Wave B (WB5) and Wave C (WC1).
- **Nobody reviews reports.** They are insert-only, and there is no moderation surface. Apple 1.2 expects timely action, so this is Franky's call.

**Wave B.** Shipped and pushed; every batch was reviewed, and four medium findings were repaired:

| Commit | What |
|---|---|
| `093fda0` | Phone messaging parity: attach a photo or video (DM and group only), an Accept / Decline bar (Decline asks to confirm), quote stubs plus a ↩ Reply in the long-press picker (which flips below the bubble when there's no room), Photo / Video / Shared-a-post previews, and the thread list is never wiped by a failed refetch. |
| `c67816a` | The phone visitor ⋯ menu: Report (6 reasons plus a note), Mute / Unmute (with durations), and Block (confirm, then the blocked view without a reload). Also, the four profile loads never show a failure as their empty copy. |
| `fb7fe3a` | Desktop campus, all 12 empty-state items. A failed channel load is no longer cached as "no channels", in either the rail or org Settings. |
| `7b71521` | Phone campus and the post viewer, M1–M7 and PV1–PV2. **The #tag view read `entries`, a key `/api/feed` never sends, so the full tagged list had never loaded.** It now reads `feed`/`posts`. |
| `0a0f9d0` | Network lists show "couldn't load" plus Retry, and the phone no longer caches a failed tab. The unread badge now honours Block and Mute. OttoCorner doesn't toast mentions that are already read. |

**Verified live after the Wave B deploy (`0a0f9d0`), phone size, nothing submitted:**
- The attach button shows in the DM with James and is hidden in the "announcements" org channel (the composer is still there).
- James's profile ⋯ ("More options for James Andres") opens Report / Mute / Block / Cancel.
- On Network, a simulated 500 on `/api/me/followers` shows Retry instead of "No followers yet".

**Found by that screenshot, and fixed (`67dca17`):** the phone profile keeps the tab bar on screen (z 9988) while its sheets sat at z 1200/1201, so the bar covered their last row — Cancel in the new ⋯ menu, and the Report sheet's Submit. The shared bottom sheets and the full-screen drawer now sit above the bar and below the toasts. MessagesMobile and CampusMobile were checked and are fine: their sheets only open where the tab bar is already hidden (`vibe-composer-open`).

**Wave C.** Shipped (`e7dac5a`, `dd01cfe`, `f4fbd4b`, `6fc167d`): the last 53 empty-state call sites, across Otto (page, side panel, phone tab, and `/api/me/otto` reporting which sections failed plus honouring Block/Mute), org pages, Settings, the sidebar calendar, MapMobile, the share sheet, `profile.html`, `messages.html` and the four shared static scripts. Desktop thread previews now say Photo / Video / Shared a post.

- **The pattern its reviewers caught, worth remembering:** four failure boxes were gated on "has this pane ever loaded" rather than on what it is showing right now, so a reopen or a single keystroke silently replaced the failure with "Loading…" or "No conversations yet". All four now gate on what's on screen.
- **Verified live after deploy, with forced failures:**
  - the desktop profile's Reposts tab shows "couldn't load" with Retry and no "Nothing here yet";
  - opening a thread in desktop messages shows "Couldn't load this conversation. Try again." with Retry, instead of leaving the previous thread's bubbles under the new header.
- **Wave C died once** to the account's session limit, with all four builders lost and nothing cached. Re-running the same script from scratch worked. Batches of 4–5 agents per wave remain the right size.

**That suspicion was right, and worse (`c8f67cb`).** The share sheet sat at z 1200/1201 while the phone post viewer sits at 10000, and both portal to `<body>`: "Send to chats" from the viewer's ⋯ drew **entirely behind** an opaque full-screen page, so the tap read as doing nothing. Raised to 10400/10401, which also fixed the tab bar covering its Send button from a feed card and the Otto orb painting over it on desktop. Both mounts that open inside another drawer now pass `nested`, so closing the share sheet no longer tears down the scroll lock the sheet underneath needs. **Verified live:** the sheet renders above the viewer, with its search field, post preview and "Pick a chat" all visible.

**Then swept the whole phone z-index ladder (`ca35fe5`), because fixing these one screenshot at a time was not working.** Two more sheets sat under the tab bar (z 9988) on screens that keep it: the feed post's ⋯ sheet (Report is its bottom row) and the Map's zone sheet. Both raised. Every other sheet below 9988 belongs to a component that hides the bar itself — `ConversationView`, `GroupSettingsView`, `ComposeOverlay`, `OrgChannelsDrawer`, `CampusSearchOverlay`, `PostComposerMobile` — so those two were the last. **The ladder now:** tab bar 9988 → post viewer / profile sheets / ⋯ and zone sheets 10000-10001 → share sheet 10400-10401 → cropper 11000 → static toast 11600 → React toasts 12000.

**Verified live at phone size (`ca35fe5`):** the feed post's ⋯ sheet sits at z 10001 over the tab bar's 9988, its rows read Send to chats / Copy link / Report post / Cancel, and a hit test at the centre of the bottom row returns the row itself rather than the bar — so Report is reachable again.

**Franky's next report, fixed (`0490dd5`): reacting to a message jumped the conversation to the bottom.** The auto-scroll effect was keyed on `messages`, and a reaction rewrites that array, so reacting to an older message yanked the reader to the newest one. It now fires only when the newest message's id changes (a new message or your own send) and only when the reader is already at the bottom, measured off the list at that moment rather than read from the scroll handler's ref — which also cleared the `react-hooks/immutability` error the first attempt introduced. A first paint still lands on the newest message. **Verified live at phone size:** scrolled to the top of the James DM (`scrollTop` 0), toggled a reaction with the POST intercepted, and the list stayed at 0 where the bottom is 1483.

**Left open from that pass (all low, none blocking):**
- `SharePostSheet`'s send bypasses `vibeRequest` and can surface a raw exception string.
- Retrying a partial send re-sends to the chats that already worked, duplicating the post.
- `PostViewerMobile`'s header comment still claims a Share button in the engagement bar; the button doesn't exist and its dead code is still there. Wire it or delete both.
- The Otto hero's "N reminders" can undercount (pre-existing; the count is capped server-side while the others recompute locally).

**Low-severity leftovers from Wave B:**
- **Campus:**
  - The channel Save and Delete in `ChannelEditorRow` still use raw fetch.
  - While channels are loading, the rail says "· 0 channels".
  - After a failed search, the previous results stay visible under the new query while it reloads.
- **Profile (phone):** a superseded refresh can still toast.
- **Network (phone):** the page's two writes still use raw fetch.
- **Notifications count route:**
  - Its header comment is stale.
  - Its 30-day stats now also exclude hidden people. That's a judgement call: revert `countByType` if the stats should show all activity.

**Wave C** is running: the Otto panels (including `/api/me/otto` honouring Block/Mute), org pages, the small React surfaces, `profile.html`, and `messages.html` with the shared static scripts.

### Session 58 kickoff prompt

> Read `handoffs/2026-09-11-session-57-dm-media-silent-failures.md`, **including §6**. Items 1–3 of §4 and most of item 4 are done and verified live, as are the empty states, phone messaging parity and the phone safety menu. **Start by asking Franky what his iPhone actually does now** — Chromium can't reproduce iOS zoom, so his phone is the only real check: opening Messages, typing in the composer, a thumb resting on a message while scrolling, and pinching at the bottom of a chat. Fix whatever he reports before anything else. Then work §6's open list: the block/mute leftovers, `SharePostSheet`'s send path and its duplicate-on-retry, the campus and phone low-severity leftovers, and the S56 carry-overs (the sharing surface, the metrics screens, the campus back-fill, legal, then the security-sentinel re-run — its new surface is the DM media proxy, the post media proxy's draft gate, `src/proxy.ts`, the toast action links and the new `channel_members` DELETE policy). **One decision is still Franky's: who reviews reports** — they are insert-only with no moderation surface, and Apple 1.2 expects timely action on them. Verify live in the signed-in gstack browser, simulating refusals with an in-page fetch override (memory `reference_live_verification`), and **screenshot anything you ship to a phone**: two real bugs this session were invisible in the code and obvious in a screenshot. Orchestrator mode with ultracode workflows, 4–5 file-owned batches per wave, implement → adversarial review → repair (memory `feedback_workflow_waves`); commit and push as you go.
