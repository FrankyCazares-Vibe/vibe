# Club view, wave 2: "officers run it from the phone" (built Oct 21, 2026)

Branch `claude/cool-jang-f223da` (worktree `cool-jang-f223da`), cut from main `46881b0`. **SHIPPED Oct 21, 2026**
(see "Shipped" at the end). Plan: `handoffs/2026-10-20-club-view/BUILD-ORDER.md` (wave 2), decisions `DECISIONS.md`, how it's
built `WAVE2-DESIGN.md` (same folder). Wave 1's record: `2026-10-20-club-view-wave-1.md`.

## What's built
- **The switch.** On a phone, hold the Profile tab, or tap your name on your own profile (a small arrow shows
  after it when you run a club), and a sheet opens: "Switch to." with you, then every club you're the owner or an
  officer of ("2 to review" when join requests wait). Pick a club and the Profile tab shows the club's picture and
  opens its page until you switch back; a coral dot on the tab says a club of yours has requests. On the club page
  itself, the arrow after the club's name opens the same sheet. Only this phone remembers the choice; signing out
  forgets it, and if you stop being an officer the tab goes back to you. On a computer, "Clubs you run" sits in the
  left menu above Admin (Admin stays founders-only), one line per club with the same dot.
- **The club page, Instagram-style** (phone and computer): the cover, the club's picture over it with two big
  counts (followers, members), name, @handle, bio, the first link, who can join, when it meets, "More about us"
  (every link, philanthropy, the facts, Report this club). Officers get Edit page and Share page; everyone else gets
  Join/Follow and a small Share button. Officers also get + (Post to the page, New event, Board post or poll) and
  Club tools on the cover, "Finish setting up · n of 6" (wave 1's line, unchanged) and the needs-you line ("1 wants
  to join · +6 followers this week"). The next event is pinned as **Up next**; the tabs are Posts (first), Events,
  Board. On a computer, officers also get a Club tools card on the right. The page stays dark in Light and Night,
  as before (its background is the club's own).
- **Exact counts for officers.** Officers see the real follower and member numbers, even under 5. Members still
  see their exact member count, as before; everyone else sees each count only from 5 up. "This week" counts people
  who first followed in the last 7 days.
- **When it meets.** A new line a club writes in Edit page ("Thursdays · 7 PM, the Lantern Room"), up to 60
  characters, shown on the page with a small clock. It needs one new database column (below).
- **Club tools on the phone** (`/orgs/<club>/tools`): Share the club, Invite members, Members' link; Join requests
  (approve, deny); Members (add a title, make officer or member: owner only, remove); Officers and titles;
  **Followers** (remove a follower) and **Club settings** (followers read the Board, leave or delete the club).
  The two that were allowed to slip a week did not slip. The desktop settings window is unchanged.
- **Nothing was removed.** The old officer bar's buttons moved: Banner and Logo into Edit page ("Change photo",
  "Change cover"), New post into +, Invite people and Members' link into Club tools.

## What you need to approve (production)
1. **One database change**, `supabase/migrations/20261023100000_club_meeting_time.sql`: adds `orgs.meeting_time`
   (empty for every club) with a 60-character limit. No grants change; the club settings route stays the only
   writer. Rehearsed on the local database only (applied, checked, rolled back, applied again); the file's header
   has the read-only pre-flight (expected answers in brackets), the post-check and the rollback. **Not applied to
   production.** Either deploy order is safe (without the column the page shows no meeting line and only a save
   that sets it is refused), but apply it first so the field works the moment the build is live.
2. **The Privacy Policy**, both copies, dated `<SHIP DAY>` (a production build refuses to deploy until the real
   date is in `src/app/legal/privacy/page.tsx` and line 3 of `handoffs/legal-2026-10-04-privacy-v3/
   privacy-policy-final.md`). Two lines changed: section 5a's "Club pages" now lists philanthropy (it always showed,
   the policy never said so) and **when it meets**; section 7 now says the browser keeps **which of the clubs you
   run your Profile tab shows**. Officers' exact counts and "+N this week" add nothing new: officers already see
   the member list and every follower with the date they first followed (section 5f). The page-against-text
   checker passes; so do the policy tests.
3. **The merge** to main, which deploys it.

**Ship order, on your yes:** run the pre-flight (read-only) → apply the migration with the connector (body without
begin/commit; rename the connector's auto-timestamp row in `schema_migrations` to `20261023100000` /
`club_meeting_time`) → run the post-check → set the policy date to that day in both places → merge this branch
→ once live, open a club you run on your phone: hold the Profile tab, switch, open Club tools.

## Checks
- `npx tsc --noEmit` clean; `npm test` 3,721 of 3,721 pass; eslint clean on the wave's files.
- Privacy Policy: the page-against-text checker passes (`node handoffs/legal-2026-10-04-privacy-v3/check/check.mjs
  --url http://localhost:3000/legal/privacy`), and the five policy tests pass (one new: `club-page-policy.test.ts`).
- The migration, on the local database only: pre-flight, apply, post-check, rollback, apply again. With the column
  removed, the club page still loads, Edit page hides the field, ordinary saves work, and a meeting-time save gets
  503 "This isn't ready yet."
- **Security pass** (notes: side-session folder `wave2-security-pass.md`): nothing Critical, High or Medium. Fixed:
  the clubs-you-run cache now lives in page memory only (it was per-tab browser storage, so a sign-out in one tab
  left a copy in another for the next person); the meeting line carries a clock so a club can't make it look like
  one of the page's own chips; meeting text needs a letter or a number; removing a follower now refuses a suspended
  officer, as the other officer routes do. Left as is (it predates wave 2, shows presence, never who): an officer's
  exact follower count includes people in a block pair with them, while the list leaves them out.
- **Adversarial review** (notes: `wave2-adversarial-review.md` in the same folder): no High; every old club page
  feature is still reachable. Fixed: Approve was offered on a hidden club, where the server always refuses it (now
  Deny only, with a line saying why); deleting or leaving a club left the phone switched to it; the desktop menu
  asked for your clubs on phones too, where it's hidden; the phone tab bar turned dark on club pages in Light mode
  (it now keeps the app's theme, like every other page); officers of a hidden club lost Club tools on the phone;
  unchecked clubs were told to post an event with +; Up next didn't re-sort after an event's time was edited; the
  join buttons didn't fill their share of the row; the Events tab's own event form left the tab bar over it. The
  hold on the Profile tab now also fires on the phone browser's own long-press (Chrome on Android can cancel the
  touch before our timer), which still needs a real Android phone to confirm.

## The browser walk (local copy, local database, never production)
At 375px as a non-admin officer (`maya.okafor.w1a@purdue.edu`, officer of Sixty-Four Chess) and as a plain member
(`blake@example.test`), Light and Night, plus a follower who isn't a member (`amara@example.test`) and the officer
on a computer:
- Officer: the page (exact counts 5 and 3, then 6 and 4), the needs-you line, Up next, the tabs, no sideways
  scroll; the chevron opens "Switch to."; switching made the Profile tab the club (its picture, lit, the coral dot,
  "join requests to review" for screen readers); a 0.7 s hold on the tab opened the sheet without navigating; a
  quick tap still navigates; switching back to "You" goes to the profile; the name on the profile opens the same
  sheet. Club tools: approved a request (the database shows the member), added the title "Social chair" (an officer
  is offered Add a title and Remove, never Make officer); Edit page opened from `?edit=1` once and saved "Thursdays ·
  7 PM, the Lantern Room" and an Instagram link, both shown on the page; + sheet; Share page copied the link with
  "Link copied."; More about us has no Report row for officers. Desktop: the Club tools card, "Clubs you run" in the
  left menu with its dot.
- Member: no officer controls, no needs-you line; Following ✓ · Joined ✓ · a small Share button in one row; More
  about us with Report this club; the Board tab (Board card and the club's chats).
- Follower who isn't a member: the member count (4) stays hidden under 5, the follower count (6) shows; Request to
  join offered.
- No console errors on any page walked.

## Not done, or not verified
- **On a real phone:** the hold on iPhone (no link-preview pop-up) and on Android, the phone's own share sheet
  (headless Chrome has none, so only the copy fallback was seen), and photo and cover uploads from Edit page (the
  local storage bucket is off; same upload as before, now behind "Change photo" / "Change cover").
- **Not built (on the board, not in the plan):** "Start a club" at the bottom of the switcher (self-serve clubs are
  week 3), "Check-in tonight" in the switcher rows, the "shown once" tip under your name. Up next's step rail and
  the share kit's link picture and QR are wave 3.
- **Known, left as is:** an officer's exact follower count includes people in a block pair with them (it shows
  presence, never who; the desktop window has always done the same). Posts stays a list, not a picture grid.
- **Local test data** added on the local database only: Blake and Casey are members of Sixty-Four Chess (Casey
  through an approved request), Hana's request is pending, Amara and Noor follow it, a second event (Rapid Night,
  Oct 30), its meeting line and Instagram link, and Blake's title "Social chair".

## Calls for you (each with my recommendation)
- **Ship wave 2 with the meeting-time migration as one step on Oct 23?** Recommendation: yes, migration first,
  then the merge, the same day the policy date is set.
- **Club settings holds the Board switch, Leave and Delete; who can join stays in Edit page.** Recommendation: keep
  it that way (one place to edit the page's words and its door).
- **"Past events and who came" in Club tools has no count** (the drawing shows 4). Recommendation: leave it until
  Insights (week 2), where turnout by event lives.

## Shipped (Oct 21, 2026, about 05:55 to 06:10 Indianapolis time, Franky's yes in chat)
Shipped from the wave 1 session (`busy-aryabhata-7b6991`); this branch's own session stood down unchanged.
- **Pre-flight on production (read-only):** not applied [f], 6 clubs, anon SELECT f / UPDATE f, authenticated t / f,
  service_role t / t. As the file expects.
- **Database:** `20261023100000_club_meeting_time` applied with the connector (the body between begin and commit,
  verbatim), its `schema_migrations` row renamed to `20261023100000` / `club_meeting_time`. Post-check:
  `meeting_time | text | not null | ''::text`, `orgs_meeting_time_len` validated, anon UPDATE f and no SELECT on the
  column, authenticated UPDATE f and SELECT t, 6 clubs, 0 with a meeting line.
- **Code:** this branch fast-forwarded onto main with both Privacy Policy copies dated October 21, 2026 (checker
  PASS against the dev page, tsc clean, 3,721 of 3,721 tests pass): main `4948ce6` (from `46881b0`). Vercel
  production built it.
- **Live checks (signed out):** the policy shows "when it meets" and "which of the clubs you run your Profile tab
  shows"; `/orgs/sae` is the new page at 375px (no sideways scroll, More about us, tabs Posts / Events / Board);
  `/orgs/sae/tools` sends a signed-out visitor to sign in. The page's two 401s on `/api/events` signed out are
  old (the page before wave 2 makes the same two; they give "Sign in to see this club's events").
- **Not checked:** Vercel's runtime-error list (the connector answers 403); the signed-in officer views on
  production (Franky's phone test below).
- **Franky's phone test:** open a club you run, hold the Profile tab, switch to the club, open Club tools, write a
  meeting time in Edit page. On iPhone, check the hold doesn't open a link preview.
- **Later Oct 21 (Franky: the separate block pushed his profile card out of sight):** "Clubs you run" on a computer
  moved from its own block above Admin into the left menu's profile card, under the name. The card is now a frame
  (profile link, then the clubs) in every state, so the clubs come from their cache at once; the card and the
  menu's divider lines never shrink (a tall menu scrolls instead); the profile link draws its keyboard ring inside
  the card (`.vibe-identity-me:focus-visible`); the school strip lets clicks through. Reviewed by three lenses with
  a skeptic per finding (three fixed: clubs waiting on the profile read, the clipped focus ring, the strip's dead
  click zone); tsc clean, 3,721 tests pass; checked locally at 910px in Night and Light, and in a 520px-tall window.
- **Later still, Oct 21 (Franky: two clubs already pushed the calendar out of view; members want a quick way to
  their club's page too):** the in-card list became one "Your clubs" row (the label, up to three stacked logos and
  "+N", a coral badge while a club you run has join requests, a chevron) that opens a list floating over the
  calendar with a spring (opacity and transform only, reduced motion respected): "Clubs you run", then "Clubs
  you're in". New light read `GET /api/me/clubs-in` (your plain memberships, hidden clubs left out, 60/min, a
  two-minute page-memory cache in `src/lib/orgs/clubs-in.ts`, never browser storage). The card is the same height
  however many clubs (147px with any). Each opening asks both lists fresh; Club settings' leave and delete clear
  both. `src/components/orgs/ClubsYouRunNav.tsx` is gone (`YourClubsMenu.tsx`). No Privacy Policy change: it shows
  you only your own memberships, which the app already holds and shows you on your profile. Reviewed by three
  lenses with a skeptic per finding; nine fixed (Tab from the row into the list, closing on focus elsewhere or an
  iframe, only the menu or page scrolling closes it, the fading list catches no clicks, labelled groups, the last
  answer holds the row's place between pages, fresh on open, hover). tsc clean, 3,730 tests pass, walked headless at
  1280x800 in Night, Light and reduced motion.
- **Evening, Oct 21 (Franky: on a computer, going to a club page felt like leaving the app):** on a computer, the
  club page, its setup list and Club tools (members, followers, officers, requests, settings) now sit in the same
  app frame as Campus, Network and Messages: the left menu with "Your clubs" and My Calendar, then the club page in
  the middle, unchanged. The club's own colours now stop at the middle column; the left menu and the right column
  keep the app's Light or Night. The page's old top bar ("vibe." and "Return to Organizations") is gone on a
  computer. The left menu does its job: Campus is lit on a club's pages (as on the phone's tab bar), and from them it
  goes back to Campus → Orgs, to the visited campus's list when a student is browsing another campus.
  **Right column:** the owner and officers get the Club tools card there from 1100px wide; under 1100px it hides and
  the cover's Club tools button is still there. **Everyone else gets no right column:** Up next, the club's link
  and More about us are already on the page, a second copy would only repeat them, and the page keeps the room.
  **Phones are unchanged:** a phone gets the page with no frame at all and never downloads the frame's code (the
  server's phone-or-computer guess, the one Campus and Network use). A computer window under 900px draws the
  same page pixel for pixel (checked headless, Night and Light: club page as officer, member and signed out, setup,
  tools, members). **Signed-out visitors** keep the standalone page with "Sign in", since every place in the left
  menu is a signed-in one. The Otto orb, new on these pages, stands down while one of their dialogs is open (it sat
  above Edit page, and one Escape could close both and lose the typing). Code: `src/app/orgs/[handle]/club-frame.tsx`
  and `ClubShell.tsx`, `CampusAppShell`'s new `pageTabBar` and `campusHref`, the right column's 1100px start (no
  other page used it). Reviewed by four lenses with a skeptic per finding: 8 of 11 findings held, all fixed (the
  four above: officers' narrow-window width, the phone download, the orb over dialogs, the way back to
  Organizations). tsc clean, 3,731 tests pass. Walked headless at 900, 1100, 1280, 1440 and 375 as Maya (officer),
  Blake (member) and signed out, Night and Light, no sideways scroll. No database change, no Privacy Policy change
  (nothing new is collected or shown). **Not checked:** a real iPad held upright (it reads as a computer, so it
  gets the frame, which steps aside under 900px), and the signed-in views on production (Franky: open a club you
  run on a computer and on your phone).
- **Later that night, Oct 21 (Franky: "make the club tools come out instead of always being out", a nice
  animation, after Otto or something space based):** on a computer the always-open right column is gone; nobody
  has one now. The owner and officers get a small handle on the window's right edge instead, from 1024px wide
  (Otto's orbit on it, a coral count while someone wants to join). The handle, or the cover's Club tools button
  (from 900px), brings Club tools out: a deep-space panel springs out of the right edge, a coral nebula blooms in
  where it came from with a violet one in the far corner, the stars come on one by one, Otto's orbit turns slowly
  behind the title, and the rows rise in one after another. Same rows as before, plus "Invite, share and more" to
  the full Club tools page. It goes back on Escape, the ×, a click outside, a pick, a page change or a window under
  900px; focus comes back to what opened it. Springs and transform/opacity only; with reduce motion on it only
  fades and nothing loops. Under 900px, on a phone, and outside the frame, nothing changed (the cover's button
  still goes to the Club tools page; outside the frame a wide screen still has the side card). Files:
  `club-page/ClubToolsDrawer.tsx`, `ClubToolsPanel.tsx`, `GalaxyBackdrop.tsx`, `club-tools-drawer.ts`; the
  `--with-rail` and shell changes from earlier tonight are undone (no page uses the rail). Reviewed by three lenses
  with a skeptic per finding: 11 held, all fixed (a fast reopen left focus behind the panel, a double-click on the
  handle hit a row still sliding in, the handle sat on the ⋯ button between 900 and 1020px, focus lost after
  "Past events" or narrowing the window, counts too faint on the nebula, the coral button greying on hover, the
  Otto orb popping back over the closing panel). tsc clean, 3,731 tests pass; walked headless at 900 to 1440,
  Night, Light and reduce motion; phones unchanged pixel for pixel. **Not checked:** on Franky's own officer
  account on production (open a club you run on a computer, use the handle and the cover's button).
- **Oct 22 (Franky: likes the Arc mockup best; doesn't want people to confuse following with asking to join;
  "fix everything else"; "why is the banner small"):**
  - **Club tools on a computer are the Arc now.** The owner and officers get the little planet on the window's
    right edge (from 1024px; the cover's Club tools button opens it from 900px). Press it and seven tools float
    out of it in an arc: Invite and share, Members, Followers, Join requests (bigger, coral, in the middle),
    Officers and titles, Past events, Club settings. Hovering (or tabbing to) one names it; clicking opens a card
    with what it needs, with real data and real buttons: Join requests lists who's waiting with Approve and
    Decline; Followers lists followers who aren't members with "Invite to join"; Members and Officers list
    people; Invite and share has Share the club page, Invite members and the members' link; each card links to
    the full Club tools page. Escape closes the card, then the arc. The slide-out panel is gone.
  - **Following and joining are now two separate things on the club page.** The button row has Follow (or
    Following ✓; members see "Member ✓") and Share. Joining lives in its own small "Membership" box under it, for
    anyone who isn't a member: one plain line and one button ("Officers approve new members. Asking also follows
    the club." [Request to join]; "Request sent. An officer will look at it." [Cancel request]; "Invite only.
    Officers invite members."; an invite's Accept and Decline; "Sign in to follow or join."). The old invite
    banner and the "Officers approve members" notice are folded into the box.
  - **Fixed:** a student turned down waits 14 days before asking again (the box says "Not this time. You can ask
    again on <day>", the day after the wait ends), unless the officers invite them in after all; a student can
    cancel a pending request (which also undoes the follow the request made); followers can be invited from the
    Followers card and from the phone's Followers screen ("Invite followers" and Invite on each row).
  - **Officers will be told when someone asks to join** (Otto and push: "<name> asked to join <club>", opening
    Join requests; it uses the "Club invites" push switch). **This needs one database change, which is NOT
    applied:** `supabase/migrations/20261024100000_org_join_request_notification.sql` adds the new kind to the
    notifications list. Until Franky says yes and it's applied, requests work as before and officers just aren't
    told (the app logs it and carries on). No Privacy Policy change: the policy already says officers see
    requests to join.
  - **The banner:** the cover was small because the page's text column is capped at 760px for readable lines
    and the cover followed it at 3:1. On a computer it now runs the middle column's width (up to 1100px), the
    text staying at 760; officers' covers stop short of the planet.
  - **Not built, Franky's call: events for fraternities.** Today every club event is visible to anyone who can
    see the club; chats are members-only and the Board is members plus followers (with its switch).
    Recommendation: one choice per event, "Everyone" (default) or "Members only" (chapter meetings, private
    socials); no "followers only" tier, since anyone can follow (it would be public in all but name). It needs a
    database column and touches the events lists, Tonight, the calendar and check-in.
  - Checks: built in three file-owned batches, each reviewed and repaired, then a whole-change review (3 lenses,
    a skeptic per finding; 4 held, all fixed). tsc clean, 3,773 tests pass, eslint clean (4 old-pattern warnings).
    Walked headless as an officer, a member, a non-member, a pending requester and signed out, on a computer
    (900 to 1440) and a phone, Night. Plan and details: `handoffs/2026-10-22-club-tools-arc/PLAN.md`.
    **Not checked:** the "Not this time" state live (no local data for it; unit-tested), Approve/Decline/Invite
    clicks against real data (viewed only, to leave the local test club as it was), a real phone.
- **Oct 22, later (Franky's yes in chat): officer notifications for new join requests are ON in production.**
  Migration `20261024100000_org_join_request_notification` rehearsed on the local stack (apply, apply again,
  rollback, apply; then a real request as Avery notified both Sixty-Four Chess officers and not Avery, showed in
  Maya's list as "Avery Owner asked to join Sixty-Four Chess", and Cancel removed the request and its follow and
  marked the notices read; the test rows were then deleted). Production pre-flight (catalog and counts only): the
  type rule was exactly the old 8-type list, only known types in use, browser roles can't insert or update
  notifications. Applied with the connector (the body between begin and commit); its auto-dated
  `schema_migrations` row renamed to `20261024100000` / `org_join_request_notification`. Post-check: the rule now
  ends with `org_join_request` and is validated, the per-type counts are unchanged, grants unchanged. No code
  change was needed (main `44b0923` already writes the notices). Not checked on production: a real request (it
  needs a real student); the first one will show it.
- **Oct 22, later still (Franky: tools from the Arc shouldn't send him to other pages; "yes, apply that switch
  for Everyone or Members only"):**
  - **Club tools open in place on a computer.** From the Arc, "Open Join requests", "See all members", "See all
    followers", "Change roles and titles", "Open Club settings", "All Club tools" and "Members' link" no longer
    leave the club page: the planet's circle grows out and a panel slides in from the right (about 560px, like
    Otto's) with the full tool (approve and deny, members and roles, followers and invites, settings, the setup
    list). ‹ goes back a step and finally to the arc; ×, Escape or a click outside closes it. "Edit the page"
    opens Edit page directly; "Past events" goes to the Events tab. Phones keep the Club tools pages as they are.
  - **"Members only" events are live.** Officers pick "Who can see it: Everyone / Members only" when they create
    or edit an event (Everyone stays the default). A members-only event is seen only by the club's members (and
    the Vibe team): not followers, not people who left, not signed-out visitors; only members can RSVP or check
    themselves in; it can't be put on the Board, and the follower views (club space, Board, Board previews)
    leave it out. It shows a small "Members only" chip with a lock. Switching an upcoming event to members-only
    takes non-members' RSVPs off it. Checked locally: a member sees it with the chip and can RSVP; a follower and
    a pending requester don't see it anywhere (club list, campus list, club space, the .ics link) and get 404 on
    RSVP.
  - **Database, production (Franky's yes):** migration `20261025100000_event_visibility` (the `visibility`
    column with its rule, `event_visible` restated with the members arm, new `event_audience_ok`, the two RSVP
    rules, `event_checkin_self_as`, `chat_create_event_card`). Rehearsed locally (apply, again, rollback, apply,
    probes as each role). The production pre-flight found one difference: production's `event_checkin_self_as`
    was the Oct 19 body with four comment lines missing (same code); the guard now accepts that copy too (a test
    proves it's the repo body less its comments), and the apply tool was checked to keep comments. Applied before
    the code went out, row renamed to `20261025100000`, post-check: column and rule in, all 20 events "everyone",
    the four functions exactly as written, grants unchanged.
  - **Privacy Policy effective October 22, 2026** (5b, the section 5 table, 5e, 5f, section 8's RSVPs row,
    section 1's team access, 3c): both copies word for word; the policy checker passed on a rendered copy (1300
    of 1300 sentences); the live checker run on port 3105 is still to do.
  - Left for Franky: someone who leaves a club on their own keeps their RSVP to its members-only events (it still
    counts in Going and shows on the officers' list); a Board card of an event later switched to members-only
    and then cancelled shows its "Event cancelled" line to followers. Both small; say if either should change.
  - Checks: 4 batches with a reviewer each, tsc clean, 3,827 tests pass. Walked headless on the computer (the
    panel from Join requests and Members, the chip, the form); not on a real phone.
