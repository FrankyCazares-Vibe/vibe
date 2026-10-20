# Franky's critique, Oct 19 2026: answers, decisions, build plan

Read-only planning pass. Nothing in the app was changed and no database was written. The evidence (screenshots, scripts, notes) sits in the folders next to this file: `feed/`, `hashtags/`, `bloomington/`, `profile/`, `messages/`, `otto/`, `calendar/`, `docs/`.

**Where things stand.** Main is `9117dc6`. Event check-in is **committed and live**: Vercel finished the deploy on Oct 19, its migration `20261019120000` is on production, and the Privacy Policy is dated Oct 19. The task text called it uncommitted, and that was out of date. So **no batch below has to wait for check-in**. Check-in did change `campus-home.tsx` by 547 lines, though, so builders must re-read line numbers and not trust old ones. I re-checked every line number in this plan against `9117dc6`.

Launch is **Oct 26** (roadmap v14: "Vibe still opens Oct 26").

---

## 1. Answers to your questions

**M1: a like doesn't carry between the open post and the feed (bug, reproduced).** The feed card and the open post each keep their own copy of like, save and repost, and neither one updates the other. The card sets its state once, when it first appears (`CampusMobile.tsx:1877-1881`). The open post loads its own copy (`PostViewerMobile.tsx:192-199`). The feed gives the open post only close, delete, block and edit hooks (`CampusMobile.tsx:1342-1365`). Saves and comment counts have the same problem. The open post's Repost can only add a repost: there's no undo and no count (`PostViewerMobile.tsx:451-462`). Desktop doesn't have this bug, because comments open inside the card. **Fix:** one shared record per post that the card and the open post both read (batch B1).

**M2: how should the green "reposted" look?** Today it's a filled green pill. On desktop it stretches across the whole card (634 of 672px), and the post's ⋯ button sits on top of its right end. Nothing happens when you tap it. **Recommendation, the way Instagram and TikTok do it:**
- One quiet line above the author, the same on phone and desktop: up to 3 tiny overlapping faces (initials when someone has no photo) and grey 12px text. Keep green only for the small repost icon.
- Wording: "**Maya** reposted", "**Maya** and **Jonah** reposted", "**Maya** and 6 others reposted".
- The line is only as wide as its text and stays clear of the ⋯.
- Tap it to open a "Reposted by" list: a bottom sheet on the phone, a small pop-up on desktop. It names the people you follow, each with a Follow button, and shows everyone else as a number ("+ 12 others").

The Privacy Policy already lets any signed-in account see reposts (`sections-4-5.tsx:93`), so this needs no policy change. (My Instagram and TikTok comparison is from general knowledge; I didn't check the apps today.)

**M3: how do # tags work? Limits? How many in the strip?**
- **Today:**
  - A tag is `#` plus 1 to 32 characters, using only a-z, 0-9 and `_`.
  - Up to 10 tags are saved per post, and a caption holds up to 2,000 characters.
  - The "today." strip shows up to 8 tags from your campus over the last 7 days, ranked by how many different people used each one. One person is enough to make a tag trend (`count-tags.ts:29`, the floor is 1).
- **What's off:**
  - The phone and desktop-profile composers read tags differently. For example, `#café` saves as `caf` on the phone and as nothing on the desktop profile.
  - A link like `x.com/page#section` saves a tag.
  - A tag longer than 32 characters gets cut short.
  - Tags 11 and 12 are highlighted in the caption but never saved, so tapping one opens a filter that doesn't show the post.
  - Every screen shows tags differently. The phone viewer shows each tag twice.
- **Production numbers:** 25 posts, 7 with tags, at most 5 tags on one post, and no tag used by 2 or more people this week.
- **Recommendation:**
  - At most **5** tags per post, each 2 to 32 characters with at least one letter, and never a tag inside a word or a link.
  - The strip shows at most **5** tags, and a tag needs **2 different people** to trend, starting on launch day. Raising it today would leave the strip with events only.
  - Tags are highlighted and tappable inside the caption, with no chip row underneath, the way Instagram and TikTok do it.

**M4: Bloomington school events.** Today the server switches school events off for every campus except Indianapolis (`school-events/route.ts:111`, `sources.ts:13`). The screens are already ready for other campuses, so the fix is mostly on the server.
- I found three working Bloomington calendars: IU Athletics (282 events), Bloomington Student Life (group 76) and Bloomington Featured (group 341).
- There are 64 timed home games ahead, 36 of them in the evening.
- Building it also fixes two bugs that would hit Indy too: the same event showing twice, and a crash when a new calendar name appears.
- Effort is about a day (batch B4).
- Same as Indy: the athletics site's terms ask for written permission. I'll draft the ask to IU Athletics; you send it.
- **Demo heads-up (not verified):**
  - You'll see "Viewing Bloomington · home is Indianapolis". RSVP works only on your home campus.
  - The Map tab is hidden while you're viewing another campus (`campus-home.tsx:1001`).
  - The Bloomington feed and club list in production are probably empty.

**D1: the composer outline is too close to the tabs (bug).** The tab row is pulled 28px up, which was right only when the tabs were the first thing on the card (`profile.html:2000-2003`). The composer was later moved above them, so the tabs now sit 12px inside the composer's box. Fixing it takes one CSS rule (batch B6).

**D2: is Saved only for you?** Yes, only you, on phone and desktop.
- The database lets each account read only its own saves (`bookmarks_all_own`).
- The API reads only the signed-in person's saves.
- Visitors never get the tab.
- Authors see only a total, with no names, on any plan.
- This matches the Privacy Policy. Nothing to change.

**D3: why does Saved show "chat boxes" on desktop, with photos on the phone?**
- **Desktop** builds every saved post as a coloured text tile and never reads the photo, even though the server sends it (`profile.html:11112-11126`). Its pastel colours are typed in directly, so they glow in Night.
- **The phone** shows the photo when there is one, and a grey text tile for text-only posts. Those text tiles are the "chat boxes".
- **Fix (batch B6):** desktop matches the phone: photos as photo tiles, and text tiles in theme colours.

**D4: club and people pictures in Messages (bug).**
- A club row with no message under its name is only 48px tall, the same height as its picture. Two such rows in a row have pictures touching (`ClubRow.tsx:73`, `:87`).
- People rows use a smaller 44px picture.
- **Fix (batch B5):** every row always has two lines and a minimum height, and every picture is the same size.

**D5: why do my other DMs and clubs vanish when I open a chat?** It's a deliberate cap. With a chat open, the narrow list keeps pinned, unread and the open chat, then fills up to **8 rows** in total (`desktop-rules.ts:181`). The list already scrolls, so the cap isn't needed. **Fix (batch B5):** show every chat, in the same order as the full list.

**D6: how do I delete my own messages?**
- **Today you mostly can't.** The server supports deleting your own message in every chat, but the app shows it in only one place: a tiny unlabeled trash icon in the desktop DM hover pill (`messages.html:1531`).
- On the phone, in club rooms and event chats, and on the Board, there is no Delete.
- **Recommendation:** add Delete to your own messages everywhere. It removes the message for everyone, with no "message deleted" note and no time limit. That's what the server already does, and it's what the Privacy Policy promises ("Deleted means gone from Vibe's systems"). An officer can delete their own Board post, and the confirm warns that its replies go too (batch B7).

**D7: why is there an Apple emoji in Reposts?** The desktop profile hard-codes the 🔁 emoji (`profile.html:10987`, there since May 6). The phone uses Vibe's own two-arrow icon. **Fix (batch B6):** use the same icon, plus "Reposted 5d ago" like the phone.

**D8: should we revamp the Otto command center?**
- **Yes.** It's the last screen still dressed for the old landing page:
  - a purple gradient with a starfield (`globals.css:1438-1482`)
  - frosted-glass cards, a pulsing dot on every heading, and a console-style hero
  - it ignores Light mode
  - the phone version has its own separate background
- **Direction:** the feed's background, the flat Tonight trays, Fraunces headings, a hero where Otto says something real, and stats as one number with a 7-day bar strip.
- **Recommendation:** fix the stats page now (batch B9). Draw a design board for the full revamp this week, and build it after Oct 26 unless you want it for the Bloomington demo. Effort L.

**D9: why does the stats page look bunched up?** There are two causes.
- **The emoji row.** Each post's counts are one string of emojis at 11px (`OttoMetrics.tsx:407-411`). The ↻ falls back to another font, and the 🔖 gets clipped.
- **The columns blow out.** The grid uses plain `1fr` (`globals.css:2029-2033`). A long post title stretches one column to twice the other, and on the phone the page runs 15px past the screen.
- **Fix (batch B9):** Vibe's own feed icons in neat columns, plus a grid that can't stretch. It also fixes "1 comments".

**D10: does it show what day people viewed your profile?**
- **Yes, one day per person:** the last day they looked, going back 90 days. It reads "Today", "Yesterday", a weekday, or "Sep 17".
- It doesn't show how many times they looked or the time of day.
- Days follow UTC, so a look after 8pm Indianapolis time counts as the next day. That's on purpose, so the list matches the Today tile.
- **Who sees what:** names show only with Vibe+, which the server checks; free accounts get counts only. You see names because your account was given Vibe+ (Sep 15).
- **Recommendation:** keep it as it is for launch.

**D11: why is the calendar uneven? (bug)**
- The day columns are plain `1fr`, so a column grows to fit its event title (`LeftNav.tsx:975`).
- Days with 3 or more entries grow taller (`minHeight: 84`, `:1008`).
- With long titles, Friday and Saturday get pushed under the side panel.
- **Fix (batch B8):** fixed, equal day cells, with titles cut off by "…".

**D12: does the calendar sync every time you RSVP, on every page?** **Mostly. Three gaps:**
- **The desktop /profile calendar** never shows RSVPs at all. It's a separate calendar stored only in this browser (`profile.html:7766`), and events added there never reach the real one.
- **An RSVP made in the small Messages window** (the Otto corner) doesn't refresh the page's calendar (verified).
- **Another tab or your phone** doesn't update until you reload.

Fix in batches B8 and B6.

**D13: do RSVP'd events always show green? Can I click an event to open it?**
- **Colours:** no. Green appears only in the big My Calendar. There, Going is green and Interested is amber, and your own entries can be any colour, including that same green and amber. The mini calendar uses coral dots, and Messages uses coral for Going and grey for Maybe. White text on green or amber is also hard to read.
- **Recommended key (the one Messages already uses):**
  - Going: solid coral
  - Interested: coral outline
  - Your own entries: plain, with a thin bar in your colour
  - A small key under the grid
  - Call the middle choice "Interested" everywhere, as the Policy and the event card already do.
- **Clicking an event:** today a click only selects the day. Vibe has no event page. **Recommendation:** each event opens its club's page and scrolls to the event card there (`/orgs/<handle>?event=<id>`), which works for any campus and for past events. The day panel links to the event chat and the club. A real event page comes after launch (check-in's page is a ready template).

---

## 2. Decisions only you can make

Each one has a recommended default. The batches are built on that default, so a "yes" costs nothing; a different answer changes only the step named.

| # | Decision | Options | Recommendation | What changes if you pick otherwise |
|---|---|---|---|---|
| 1 | **Who the "Reposted by" list names** | (a) people you follow, plus a number for everyone else; (b) everyone who reposted | **(a)**. It keeps "counts public, identities private" and matches what the feed already does. (b) is allowed by the Policy but is a new surface. | B2: the reposters route's query. |
| 2 | **How the repost line looks** | (a) one quiet line with tiny faces and first names, tap for the list; (b) keep a green pill, just smaller and not full width | **(a)** | B1: the repost line step. |
| 3 | **Tag limits** | Per post: 5 or keep 10. Length: 2-32 with a letter, or keep 1-32. Strip: 5 or keep 8 | **5 / 2-32 with a letter / 5** | B3 constants. |
| 4 | **When a tag needs 2 people to trend** | (a) launch day, Oct 26; (b) now, which leaves the strip with events only; (c) never | **(a)**. A one-line change on launch morning. | Launch checklist only. |
| 5 | **How tags show on posts** | (a) inside the caption only, tappable, no chips; (b) keep chips under the caption | **(a)**, like Instagram and TikTok | B1 and B6: the last step of each is skipped. |
| 6 | **Turn on Bloomington before IU Athletics answers in writing** | (a) on now, with the off switch ready, and the ask drafted for you to send (what you did for Indy); (b) wait for the written OK | **(a)**, with no public post naming the school until they answer (gate G11) | B4 ships with the athletics feed off (`SCHOOL_EVENTS_OFF=iub-athletics`). |
| 7 | **Bloomington details** | Should group 341 count as "Featured by your school"? Should tonight's home game come before a school event that's merely on now (this changes Indy too)? What place shows when the feed has no venue? Title wording? | **341 counts as a plain calendar**; **a home game tonight comes first**; **"Bloomington"** as the place; **"IU vs Purdue"** | B4: one setting each. |
| 8 | **What Delete leaves behind** | (a) gone for everyone, with no note; (b) a "Message deleted" note | **(a)**. It matches the server and the Policy. (b) means keeping a stored row and changing the Policy the same day. | B7, plus a Policy change for (b). |
| 9 | **Can an officer delete their own Board post (its replies go too)?** | yes / no | **Yes**, with the confirm saying "its N replies go too" | B7: one step. |
| 10 | **Otto revamp: when and how** | (a) design board this week, build after Oct 26; (b) build before the Bloomington demo; (c) not now | **(a)**. The stats fixes (B9) ship now either way. | A new plan after the board. |
| 11 | **Profile views: show more than the last day?** | (a) keep last day only; (b) add "looked 3 times"; (c) time of day | **(a)** for launch. (b) fits the Policy; (c) goes finer than the "day" rule, so no. | None for (a). |
| 12 | **Calendar colours and the middle word** | Use the key in D13 above, or keep green and amber; "Interested" or "Maybe" | **Coral key** and **"Interested"** (the Policy and the event card already say it) | B8: the colour step and about 6 labels. |
| 13 | **Clicking a calendar event** | (a) open the club's page at that event, now; (b) wait for a real event page | **(a)** now, the event page after launch | B8: the click-through step. |
| 14 | **Picture size in the Messages list** | 48px for all, or 44px for all | **48px** | B5: one number. |
| 15 | **Saved text-only tile** | (a) a plain tile in theme colours, like the phone; (b) a quote card with the author's initials | **(a)** for launch | B6. |
| 16 | **Which "vision" is current** | The Vibe Growth Brief (Claude Doc, Oct 19) says clips, a recruiter marketplace, "Otto is not live" and an orange-on-maroon brand. The repo and the brand guide say otherwise. Is the brief your new direction, or was it written in a chat that didn't have the repo? | **I'd guess the second; you decide.** This must be settled before any vision rewrite. | Docs step 5. |
| 17 | **The empty "Untitled" Claude Doc** (artifact RuwML2Wak7RDeDGfTvjXQs) | delete / keep | **Delete.** I'll ask before deleting. | none |

---

## 3. Build batches

**How the batches are split.** Each file belongs to exactly one batch. Two waves:
- **Wave 1** (5 batches, run in parallel): mostly new files and small, self-contained areas.
- **Wave 2** (4 batches): the big screen files, which use what wave 1 built.

Every batch does the following:
- It follows the wave rules: implement, then adversarial review, then repair, and no single Write or Edit over about 150 lines.
- It runs `npm test` and the type check.
- It commits and pushes, so you can test on your phone through Vercel.
- It does a browser pass at **390x844 on an iPhone user agent and at 1440x900, as a non-admin seed account, in Light and Night**, with the dev badge hidden. Screenshots go to `handoffs/2026-10-19-critique/<area>/after/`.

None of these changes what Vibe collects, so **no Privacy Policy change** is needed with the recommended defaults. The exception is decision 8(b).

**Check-in overlap.** Check-in has shipped, so nothing waits on it. Its files that these batches touch are `campus-home.tsx` (B1 only, edits far from the check-in code), `OrgPastEvents.tsx` (B8) and `src/app/api/events/route.ts` (no batch). The check-in tests (`checkin-routes.test.ts`, `events-list-route.test.ts`, `event-item.test.ts`) must stay green.

### Wave 1

#### B2: "Reposted by" list (new files only). M. Built on decision 1(a).
- **Owns:**
  - new `src/lib/posts/reposters.ts` and its `.test.ts`
  - new `src/app/api/posts/[id]/reposters/route.ts` and its test
  - new `src/components/feed/RepostersSheet.tsx` (phone)
  - new `src/components/feed/RepostersPopover.tsx` (desktop)
  - `src/lib/limits/budgets.ts`: one new budget
- **Changes:**
  - `GET /api/posts/[id]/reposters`:
    - Signed-in only, under the same visibility as `GET /api/posts/[id]`: a hidden club's post gets 404 for non-members.
    - Returns `{ followed: [{id,name,handle,avatar_url}], followed_total, others_total }`.
    - Names only people the viewer follows, and leaves out anyone the viewer blocked or muted. Copy the feed's reposter lookup (`src/app/api/feed/route.ts:883-980`), but don't edit that route.
    - `others_total` = repost count − followed_total, never below 0.
    - Sends `private, no-store` like the post route.
  - **Phone sheet:** copy the shape of `src/components/mobile/MutualsSheet.tsx`, with photo, name, @handle and a Follow button, then "+ N others reposted".
  - **Desktop pop-up:** anchored, closes on Esc or an outside click, and uses tokens only.
  - **Contract for B1:** `<RepostersSheet postId open onClose />` and `<RepostersPopover postId open onClose anchor />`.
- **Tests:** signed out gets 401; a hidden post gets 404 for non-members; a blocked reposter is left out; non-followed reposters are counted but not named; others_total never goes below 0.
- **Browser check:** comes in B1, once the line is wired up. Here, check by rendering the sheet alone with mocked data at 390 and 1440 in both themes.

#### B3: one rule for tags, plus the strip. S-M. Built on decisions 3 and 4.
- **Owns:**
  - `src/lib/posts/edit.ts`, `src/lib/posts/tags.ts`, and their tests (`edit.test.ts`, `tags.test.ts`)
  - `src/components/campus/rolling-strip-view.ts` and its test
  - `src/components/campus/RollingStrip.tsx`
  - any other test that asserts `POST_TAG_MAX === 10`: grep first (`text-filter.test.ts` mentions the rule)
- **Changes:**
  - **`tags.ts`:**
    - `POST_TAG_MAX` goes from 10 to 5.
    - Add `isNewPostTag(t)`: 2-32 of `[a-z0-9_]` with at least one letter. `normalizePostTags` uses it for writes.
    - Keep `POST_TAG_RE` and `isValidPostTag` as the **database twin for reads**, so old tags like `#1` still filter and link.
    - Update the header comment.
  - **`edit.ts` `extractPostTags`:**
    - A tag starts at the beginning of the text or after a space or punctuation, never after a letter, a digit, `_`, `#` or `/`.
    - It must end at the end of the text, a space or punctuation. If it runs on into more word characters or an accented letter, it isn't a tag at all: never cut short.
    - It must pass `isNewPostTag`, and only the first 5 are kept.
  - **`rolling-strip-view.ts`:** `STRIP_MAX_TAGS` goes from 8 to 5. The feed files keep asking for 8, which is harmless; B1 doesn't need to change them.
  - **`RollingStrip.tsx`:**
    - Tag chips get `maxWidth: 160` with an ellipsis.
    - The count reads "N people" when N ≥ 2, and shows no number at 1.
    - The hover title stays.
  - **`count-tags.ts`:** **not changed now.** The floor goes to 2 on launch morning (one line, plus `count-tags.test.ts:51`), on your yes.
- **Tests:**
  - Every case in `hashtags/extractor-probe.jsonl` gets the new expected result: `#café` → none, `x.com/page#section` → none, `hello#world` → none, `#a` / `#1` → none, a 40-character tag → none, 6 tags → the first 5.
  - `normalizePostTags` keeps 5.
  - `isValidPostTag("1")` is still true.
  - The strip view keeps at most 5 tags.
- **Browser check:** the phone and desktop strips show at most 5 chips, a long tag is cut off with "…", and "#mobile 1" shows no bare number.

#### B4: Bloomington school events. M (about a day). Built on decisions 6 and 7.
- **Owns:**
  - `src/lib/school-events/`: `sources.ts`, `read-server.ts`, `types.ts`, `switch.ts`, new fixtures, and all their tests
  - `src/app/api/school-events/route.ts` and its test
  - `src/components/campus/tonight/`: `tonight-view.ts` and its test, `TonightSheet.tsx`, `SchoolEventCard.tsx`, `use-school-events.ts`, `TonightBits.tsx` (labels only)
  - `.env.example`
  - It does **not** touch `CampusMobile.tsx` or `campus-home.tsx`.
- **Changes, in this order:**
  1. **Crash guard first (protects Indy today).**
     - `SchoolEventCard.tsx` `schoolAccent` gets a default case (IU crimson).
     - The exported `SchoolEventCard` renders its card inside `<QuietBoundary name="school-card">`, so the feed files need no edit.
     - `use-school-events.ts:42` drops events whose calendar isn't in the answer's `sources`.
  2. **`sources.ts`:**
     - Replace `SCHOOL_CAMPUS_ID` with feeds per campus and `feedsForCampus(campusId)`.
     - Each feed carries `campus_id`, `featured` (instead of the key check at `:291`), `role` ("athletics" or "calendar"), `label`, and game rules: the home-place pattern, the title prefix, the home label "IU", a place fallback, whether to drop "at" games, ticket hosts, the `admin.iuhoosiers.com` → `iuhoosiers.com` link rewrite, and removing a "#N" rank.
     - LiveWhale duplicates: key on the number in the link (`/(\d+)-[^/]*$/`), falling back to title + start.
     - `tidyPlace` keeps IU and IMU in capitals.
     - Add the three Bloomington feeds (table in `bloomington/` notes): `iub-athletics`, `iub-student-life` (group 76), `iub-featured` (group 341, `featured: false` per decision 7).
     - Add `iuhoosiers.com` and `iuhoosiers.evenue.net` to the allowed link hosts.
  3. **`route.ts:111`:** answer off only when `feedsForCampus(campusId)` is empty, and pass `campusId` on. **`read-server.ts:235`** reads that campus's feeds. The `:178` warning depends on the flag, not the key.
  4. **`types.ts` and `switch.ts`:** add the keys. A campus id (`iu-bloomington`, `indianapolis`) turns off that campus. Fix the bug where an unknown word turns everything off. Document it in `.env.example`.
  5. **Labels:**
     - `tonight-view.ts:70` and `:86`, and `TonightSheet.tsx:376`, `:382` and `:444`: build the labels from the athletics source's `label` ("IU Athletics" in Bloomington, "IU Indy Athletics" in Indy).
     - `tonight-view.ts:376` builds home games from `ev.kind === "game"`.
     - Add "kickoff" for football and "first pitch" for baseball and softball (`:114-121`).
  6. **Ranking (decision 7):** a home game tonight comes before a school event that's merely on now. Indy's tests get updated to match.
  7. **Fixtures:** copy `bloomington/hoosiers.ics`, `iu-group-76.trimmed.ics` and `iu-group-341.trimmed.ics` into `src/lib/school-events/fixtures/` as `iub-*.ics`. They're already stripped of staff contact lines.
- **Tests:**
  - **`sources.test.ts`:** the Bloomington feed list; home on the bare place and on place + venue; Indianapolis neutral games dropped; the IU prefix and rank removal; the link rewrite; ticket hosts; the 76 × 341 duplicate merge; "IU CINEMA" kept in capitals.
  - **`ics.test.ts`:** fixture counts 282 / 108 / 181.
  - **`switch.test.ts`:** the key list, a campus-id switch, and the unknown-word fix.
  - **`route.test.ts`:** move the "off" case to `iu-kokomo`. Bloomington fetches only its 3 feeds, and Indy only its own.
  - **`tonight-view.test.ts`:** labels from a non-"athletics" key, and the ranking.
  - **The crash:** a test that a card with an unknown source renders.
- **Browser check:**
  - Use `SCHOOL_EVENTS_FIXTURES=1` and the clock param from the notes, with `?campus=iu-bloomington`.
  - The Tonight card, the sheet ("Home games this week · IU Athletics"), the School chip and the Events tab cards all show, at both sizes and in both themes.
  - Indianapolis is unchanged.
  - A simulated unknown key doesn't crash.
  - **After deploy:** check production with `?campus=iu-bloomington`, signed in. The Imperva CDN in front of iuhoosiers.com may block Vercel's servers (not verified); if so, the logs show the "nothing kept" warning.
- **Also:** draft the written-OK ask to IU Athletics Strategic Communications (`mediarel@iu.edu`) in `vibe-marketing/outreach/`. It's a draft only; you send it.

#### B5: the Messages list. S. Built on decision 14.
- **Owns:**
  - `src/components/mobile/messages/home/ClubRow.tsx`, `PersonRow.tsx`, `FollowedBoardsRow.tsx`
  - the copy file that holds those rows' strings, if a new line is needed
  - `src/components/desktop/messages/desktop-rules.ts` and `desktop-rules.test.ts`
- **Changes:**
  - **`ClubRow.tsx`:** when there's no preview and no event chip, show a quiet "No messages yet" second line.
  - **All three rows:**
    - a minimum height of 66px with space above and below
    - the divider moves to the bottom of the row
    - every picture is 48px (`PersonRow`'s `Disc size={44}` becomes 48, and the group discs go from 30 to 32)
  - **`desktop-rules.ts`:** `slimRows` returns every row in the full list's order.
    - Kept rows (pinned, unread, open) keep their dot; the others are quiet.
    - The open chat that isn't in either list is still put on top.
    - Remove `SLIM_TARGET`.
- **Tests:** update `desktop-rules.test.ts:115-175`: no cap, order kept, quiet rows have no dot, the open chat is supplied first.
- **Browser check:**
  - As avery (9 clubs, 5 chats), at 1440 and 390: no two pictures touch, and all rows are the same height.
  - With Blake's DM open, the narrow list shows all 14 chats and scrolls.
  - The mini messenger (Otto corner) looks right.

#### B9: Otto stats tidy-up. S.
- **Owns:**
  - `src/components/otto/OttoMetrics.tsx`
  - `src/app/globals.css` (only the `.otto-metrics*` rules, lines about 2027-2216)
  - new `src/components/icons/engagement-icons.tsx`
- **Changes:**
  - **The new icons file:** EyeIcon, LikeIcon, CommentIcon, RepostIcon and BookmarkIcon, copied from `campus-home.tsx:10087-10162` (16-unit grid, stroke 1.4). `campus-home.tsx` keeps its own copies for now; removing the duplicates is a later chore, so B1's file isn't touched twice.
  - **`OttoMetrics.tsx:407-411`:** each count is a 13px icon followed by the number, with a 4px gap and no "·".
    - The row is a grid: `minmax(0,1fr) repeat(5, 44px)`.
    - Digits are the same width and muted.
    - Screen readers get labels like "7 views".
    - Singular forms: "1 comment", "1 like", "1 save" (`:447-455`).
  - **CSS:**
    - `.otto-metrics` becomes `repeat(2, minmax(0,1fr))`, and the 760px rule becomes `minmax(0,1fr)`.
    - `.otto-metrics-block` gets `min-width: 0`.
    - The post text cuts off with "…".
- **Tests:** a small one for the plural helper.
- **Browser check:**
  - Otto > Stats with the mocked numbers from `otto/`, at 1440: two equal columns, no wrapped "30 DAYS".
  - At 390: no sideways scroll, and the counts are visible.
  - Both themes.

### Wave 2 (after wave 1 has merged)

#### B1: feed and open post. M-L. Uses B2's components. Built on decisions 2 and 5.
- **Owns:**
  - `src/components/mobile/CampusMobile.tsx`
  - `src/app/campus/campus-home.tsx`
  - `src/components/mobile/PostViewerMobile.tsx`
  - `src/app/api/posts/[id]/route.ts` and its test
  - new `src/lib/posts/engagement-store.ts` and its `.test.ts`
  - new `src/lib/feed/friend-repost-label.ts` and its `.test.ts`
- **Steps** (commit after each):
  1. **Shared engagement store (M1).**
     - `engagement-store.ts` is a small store keyed by post id, read with `useSyncExternalStore`. It holds `{liked, likeCount, saved, reposted, repostCount, commentCount}`.
     - The feed seeds it. A fresh server read (opening a post, or refreshing the feed) overwrites it, except for a field with a tap still in flight.
     - The phone card (`CampusMobile.tsx:1877-1960`, comment count `:2376`), the open post (`PostViewerMobile.tsx:192-199`, `:360`, `:419-462`, `:507`) and the desktop card (`campus-home.tsx:8075-8080`, `:8277-8320`) all read and write it.
     - A failed tap rolls back the store, not local state.
  2. **"You reposted this" in the post read.**
     - `api/posts/[id]/route.ts:329` gets `viewer.reposted`, counted the same way as `viewerLikeRes`.
     - The open post's Repost becomes an on/off toggle (POST, or DELETE `/api/posts/[id]/repost`) with its count shown.
  3. **The repost line (M2).**
     - `friend-repost-label.ts` returns "Maya reposted" / "Maya and Jonah reposted" / "Maya and 6 others reposted", using first names.
     - It replaces the phone pill (`CampusMobile.tsx:2224-2266`, plus the label at `:4455-4470`) and the desktop `FriendRepostPill` (`campus-home.tsx:9228+`).
     - The look: 16px overlapping faces with initials when there's no photo, a 12px muted line, and a green repost icon.
     - It's only as wide as its text (`alignSelf: flex-start`) and leaves room for the ⋯.
     - Tapping opens B2's sheet or pop-up.
     - Delete the dead `RepostBanner` (`campus-home.tsx:8578-8580`, `:9284+`).
  4. **Caption tags highlight only saved tags.**
     - `campus-home.tsx:7944` and `PostViewerMobile.tsx:1686` highlight a `#tag` only when it's in `post.tags`.
     - `CampusMobile.tsx:1603` `normalizeFeedTag` uses `isValidPostTag` from `tags.ts`.
  5. **Inline tags only (decision 5; skip if you keep chips).**
     - Make the phone card's caption tags tappable (`CampusMobile.tsx:2137`) and remove its chip row (`:2185-2221`).
     - Remove the duplicate chips in the phone viewer (`PostViewerMobile.tsx:1008-1030`).
- **Tests:**
  - **The store:** seed, patch, a server read overwriting, an in-flight field kept, rollback.
  - **The post route:** `viewer.reposted` is true or false.
  - **The label helper:** 1, 2 and N, plus a missing name falling back to the @handle.
- **Browser check (blake, 390):**
  - Like inside a post, swipe out: the card shows liked with +1. Unlike inside, close: the card shows unliked. Same for save.
  - Repost in the post: the card's repost lights up. Comment in the post: the card's count goes up.
  - Desktop 1440: the repost line is short and clear of the ⋯, and tapping it opens the pop-up.
  - Use the in-browser repost mocks from `feed/` (the local database has no reposts).
  - Both themes.

#### B6: profile twins. L. Built on decisions 5 and 15.
- **Owns:**
  - `public/html/profile.html`
  - `src/components/mobile/ProfileMobile.tsx`
  - `public/html/_postViewer.js`
- **Steps** (commit after each):
  1. **D1:** add `body:not(.viewer-mode) .profile-composer + .content-tabs { margin-top: 4px; }` next to `profile.html:2003`. The visitor view stays flush.
  2. **D7:** replace the 🔁 emoji at `profile.html:10987` with the phone's two-arrow drawing, and show "Reposted 5d ago" from `repost.reposted_at` through `_formatRelativeDate`. Fix the comment at `:10984`.
  3. **D3 desktop:**
     - `_buildSavedCell` (`:11112`): a post with a photo gets a photo tile (the unused `.vibe-grid-thumb` and `.vibe-grid-bg` at `:2024-2031`), and a video gets the `.vibe-grid-play` badge.
     - The six pastel themes (`:2069-2074`) become a token tile (`rgba(var(--scrim-rgb),.06)` with `var(--ink-body)`).
     - Keep a `.post-thumb-body` element, so the `vibe:post-edited` listener (`:6637-6639`) still works.
  4. **D3 phone:**
     - `SavedGrid` (`ProfileMobile.tsx:3584`) and `RepostRow` (`:3410`) use `media_kind === "image"` instead of `type === "post"`.
     - Add `media_kind` to `SavedPost` (`:247`).
     - The text tile's span stops overflowing past its "…" (`:3610-3622`: `maxHeight`, not `inset:0`).
     - `RepostRow` shows the repost's quote text (`entry.comment`), as desktop does.
  5. **Tags, same rule as B3:**
     - The desktop profile composer's reader (`profile.html:6780-6793`) gets the same rule, copied as a regex, with a comment naming `edit.ts` as its twin.
     - After publishing, the chips come from `j.post.tags` (`:6887`).
     - Phone profile caption tags (`ProfileMobile.tsx:3189-3211`): highlight only saved tags and make them tappable (to `/campus?tag=<tag>`).
     - Desktop profile and viewer tags (`profile.html:2275`, `:10866`, `_postViewer.js:1093`) become tappable. Per decision 5 they move inline; skip that part if you keep chips.
  6. **D12, the desktop profile calendar uses the real calendar:**
     - `openCalModal` and the page start read `GET /api/me/calendar`.
     - `saveNewEvent` sends `POST /api/me/personal-events`, and `removeCalEvent` sends `DELETE /api/me/personal-events/<id>` (personal entries only; RSVPs get no ×).
     - Chips use B8's key: Going solid coral with dark text, Interested a coral outline, yours plain with a colour bar.
     - Offer once to move the entries saved in `vibe_cal_events_v1` (`:7766`) into the real calendar, then clear that store.
     - The Policy already lists "your personal calendar", so this is a known category.
- **Tests:**
  - A small test that loads the page script and builds a saved cell from a photo post and from a text post.
  - The tag-regex twin test runs the same probe cases as B3 against the static page's regex.
- **Browser check:**
  - As franky (owner) and as franky visiting `/profile/hanasato`, at 1440 in both themes:
    - a gap between the composer and the tabs
    - photos in Saved
    - the drawn repost icon with "Reposted 5d ago"
    - the calendar shows blake-style RSVPs (seed one in the local database) and saves a personal entry
  - At 390: Saved photos, no text overflow, the repost quote showing.
  - Visitors still never see Saved.
  - Use the bookmark and repost mocks from `profile/`.

#### B7: delete your own messages. M. Built on decisions 8(a) and 9.
- **Owns:**
  - Phone DM and group: `src/components/mobile/messages/ConversationView.tsx`, `MessageBubble.tsx`, `ReactionPicker.tsx`
  - Clubs: `club/RoomThread.tsx`, `club/HoverActions.tsx`, `club/BoardView.tsx`, `club/BoardPost.tsx`
  - The card wrapper `src/components/mobile/messages/cards/CardBubble.tsx`, plus `card-rules.ts` if needed. Delete on a poll or event card goes in the wrapper's menu. `EventCardView.tsx` belongs to B8.
  - `public/html/messages.html`
  - new `src/components/mobile/messages/delete-rules.ts` and its `.test.ts`
- **Changes:**
  - **`delete-rules.ts`:**
    - `canDeleteOwn(message, viewerId)` is true for your own message, poll, event card or Board reply.
    - `canDeleteBoardPost(post, viewer)` is true for your own post when you're an officer.
    - Officer Remove on other people's messages stays as it is (hide, not delete).
  - **Phone DM and group:**
    - The long-press sheet (`ReactionPicker.tsx`) gets a red "Delete" row on your own message.
    - `MessageBubble.tsx:592` shows ⋯ on your own messages too.
    - `ConversationView.tsx` confirms, calls `DELETE /api/me/threads/[id]/messages/[messageId]`, drops the row, and refreshes pins.
    - The mini messenger frames this page, so it gets this for free.
  - **Clubs:**
    - `RoomThread.tsx:367` allows Delete when it's your message.
    - `HoverActions.tsx:153` gets a More menu with Delete on your own rows.
    - `BoardView.tsx:188` and `BoardPost.tsx:360` / `:371` get Delete on your own post and replies. The post confirm says "Its N replies go too."
  - **Desktop DM (`messages.html:1531`, `:3601`):** the trash moves into a labeled "Delete" item, and the browser's `confirm()` becomes the page's own dialog.
  - **Copy:** "Delete for everyone?" / "It's removed from this chat for everyone. Anyone who already got a notification may still see it there." Call it "Delete", not "Unsend". The server needs no change.
  - **Not in scope:** the full-page calendar inside `messages.html` (`:1801`, `:1903-1934`). It shows only when the chat_desktop switch is off, which it isn't today.
- **Tests:** `delete-rules.test.ts` (own, other person's, an officer on someone else's, a Board post with replies).
- **Browser check:**
  - On local data, avery and blake each in their own window, in a DM, a group, a Lounge, an event chat and a Board.
  - Delete on one side: it's gone there. Then check the other person's open screen: does it drop right away or only on reopening? This isn't verified today. If it stays until reopening, write it down as a follow-up; don't widen this batch.
  - 390 and 1440, both themes.

#### B8: the calendar. M. Built on decisions 12 and 13.
- **Owns:**
  - `src/components/LeftNav.tsx`
  - new `src/lib/calendar/calendar-sync.ts` and its `.test.ts`
  - `src/app/api/me/calendar/route.ts` and its test, if there is one
  - `src/components/mobile/messages/club/RsvpSheet.tsx`
  - `src/components/mobile/messages/home/YourWeek.tsx`, `MonthBody.tsx`
  - `src/components/desktop/messages/WeekBand.tsx`
  - `src/app/orgs/[handle]/OrgEventsSection.tsx`, `OrgPastEvents.tsx`
  - the other "Maybe" labels, checked by grep: `club/helpers.ts` and `club/helpers.test.ts` (`rsvpWord`, `:267`, `:378`), `club/EventAbout.tsx`, `cards/EventCardView.tsx` (`:167`)
- **Steps:**
  1. **D11, even grid (`LeftNav.tsx`):**
     - Columns become `repeat(7, minmax(0, 1fr))` (`:975`).
     - The weekday letters get their own grid row.
     - Day cells get `height: 96`, `minWidth: 0` and `overflow: hidden` instead of `minHeight: 84` (`:1008`).
     - Keep 2 chips plus "+N more", and add `title={e.title}`.
     - The modal widens to `min(1040px, 100vw - 48px)` (`:808`).
  2. **D12, sync:**
     - `calendar-sync.ts` holds `emitCalendarChanged` and one `BroadcastChannel("vibe-calendar")` per page. It fires the local event and posts on the channel; a message on the channel fires the local event.
     - `LeftNav.tsx` re-exports it, so the existing imports keep working.
     - `CalendarWidget` re-reads when the tab becomes visible again, at most every 30 seconds.
     - `RsvpSheet.tsx` `pick()` calls `emitCalendarChanged()` after `r.ok`, which fixes the Otto-corner window.
     - The mini-calendar badge counts upcoming entries only (`:526`).
  3. **D13, colours:**
     - `route.ts:147` stops sending green and amber for RSVPs; the client styles by `viewer_status`. Personal entries keep their `color`.
     - Chips: Going is solid coral with `var(--on-coral)` text and ✓; Interested is a coral outline with ink text; yours is a neutral chip with a 3px left bar in your colour.
     - Remove green and amber from `EVENT_COLOR_PRESETS` (`:1706`).
     - Add a one-line key under the grid: "● Going ○ Interested ▍Yours".
     - The mini-calendar dot: solid coral for Going, a ring for Interested (`:696`).
  4. **"Interested" everywhere (decision 12):**
     - `RsvpSheet` ROWS (`:49`), `WeekBand`, `YourWeek:484`, `MonthBody:371`, `helpers.ts` `rsvpWord`, `EventAbout` and `EventCardView:167` change "Maybe" to "Interested".
     - The stored value stays `maybe`.
  5. **D13, click-through:**
     - Restructure the day cell: it becomes a plain block, the day number is the button, and each chip is a link to `/orgs/<handle>?event=<id>`.
     - The side card links the title (to the club page at the event), "Event chat" (`/messages?channel=<room_id>` when it has a room) and the club name (`/orgs/<handle>`).
     - Personal entries get no link.
     - `OrgEventsSection.tsx` and `OrgPastEvents.tsx` read `?event=` once their list has loaded, then scroll to and flash that card. If it isn't found, they show a quiet toast: "That event isn't listed anymore."
     - On the phone, `YourWeek.tsx:499-512` and `MonthBody.tsx:376-384` rows without a chat link to the same club-page URL.
- **Tests:**
  - **`calendar-sync.test.ts`:** a local emit fires once, a channel message fires the local event, and there are no echo loops.
  - **The calendar route:** RSVPs carry status and no fixed colour.
  - **A pure helper** for the chip style by kind.
- **Browser check (blake, 1440 and 1280, both themes):**
  - All 7 columns are equal width and all rows are the same height, even with long titles.
  - The colours match the key.
  - RSVP from the Events tab, the Messages club panel and the Otto-corner window: the calendar updates each time.
  - RSVP in a second tab: the first tab updates.
  - Clicking a chip lands on the club page with the card flashing, including "Open Club Study Night", which isn't in blake's Events list.
  - Phone 390: Your week rows without a chat open the club page.

### Not in this plan (needs your yes first)
- **The Otto revamp** (decision 10): a design board on the canvas first, then its own plan. It owns `globals.css` `.otto-room-*`, `OttoHero`, `OttoSection`, `OttoPageClient` and `OttoMobile`'s hero, and only runs after B9 is in.
- **A real event page** `/campus/events/<id>` (after launch). Start from `src/app/campus/checkin/[id]/page.tsx`.
- **Tag suggestions while typing `#`** (`_mentionPicker.js`, after launch).
- **One shared repost icon** across `campus-home`, `PostViewerMobile` and `ProfileMobile` / `CampusMobile`, plus removing the duplicate icons in `campus-home`: do these with the motion or design pass.
- **Launch morning, Oct 26:** `TRENDING_MIN_AUTHORS` goes to 2 (decision 4).

---

## 4. Docs to update (after the batches land)

Order, from the docs report:
1. **A new close handoff** for this session: `handoffs/2026-10-19-session-80-critique-and-fixes.md` (confirm the session number).
   - Main at the new commit, and the test count. `npm test` gave 3,297 at `9117dc6`.
   - Check-in live; the `9a0a0d2` and `6bb6c04` follow-ups; the unsent Jaguars outreach drafts; this plan and its decisions.
   - Point the **memory index** handoffs line at it. Mark the motion pass and the Tonight card as done. Add pointers for Tonight (sources, Indy plus Bloomington, the off switch, turned on before the written OKs), check-in (live Oct 19, counts from 5), motion and fonts, and the side-space canvas. Fix `project_journal.md` ("PUBLIC" should be PRIVATE).
2. **The private journal** (`journal/vibe_journal.html`, `DEFAULT_DATA` around line 1497):
   - Cards for S76 to S79 and Oct 19 (fonts, Tonight, school colours, check-in, this critique and its fixes).
   - Bump `version`, `sessionCount` and `lastUpdated`, and move `current: true` off v7.8.
   - Rewrite Next Steps (`sec-next`).
   - The vision, summary, features and design sections wait for decision 16.
3. **`ARCHITECTURE.md`:**
   - Fonts (`src/lib/theme/fonts.ts`, the wordmark woff2, Mono only on the landing).
   - Line counts (18,489 / 5,066).
   - Feature rows: Tonight and school events (now per campus), check-in, motion, per-tab scroll, the engagement store, the reposters route, the calendar sync module.
   - Name the three different "check-ins" apart.
   - `app_settings.school_events_off`.
   - **`README.md`:** the product line, the `SCHOOL_EVENTS_*` env vars, the calendar hosts (iuindyjags.com, iuhoosiers.com, events.iu.edu).
   - **`scripts/README.md`:** `sql/event-checkins-check.sql`.
4. **Marketing workspace:**
   - **`vibe-marketing/CLAUDE.md`:** what Vibe is now (Tonight, check-in, Bloomington school events for the demo). Add the rule that no public post names the schools until athletics and IU Licensing answer in writing. Replace "3 posts a week" with the idea bank and posting windows. Fix the folders list.
   - **`README.md`:** fix the "Empty so far" lines.
   - **`brand/brand-guide.md`:** Soft Fraunces on all titles, the logo file, Mono only on the landing, school colours on school cards, and a Motion section (springs SNAPPY, SOFT and POP; transform and opacity only).
   - **`research/whats-changed-2026-10-19.md`:** a new overlay that also covers this critique's changes: tag limits, delete, calendar colours, the repost line.
5. **The vision rewrite** (journal, `principles-and-positioning.md`, `timeline.md` and the Growth Brief), **only after decision 16**.
   - Refresh the **Vibe Build Overview** artifact: 903 commits, 3,297 tests, 127 migrations, 190 routes, then the new totals.
   - Add an "after Oct 19" note to the research doc and its artifact. Its check-in lines are out of date.
   - Optional: `pitch/pitch.md:95`.
6. **Mark `DOCS/ROADMAP.md` as superseded.**
7. **Privacy Policy:** nothing to change with the recommended defaults. Re-check if you pick decision 8(b) or 1(b).

## Not verified (carried from the reports)
- Anything with real reposts or comments, since the local database has none.
- A feed refresh after liking inside a post.
- Whether Vercel can get past the Imperva CDN on iuhoosiers.com.
- That the final iuhoosiers game page loads.
- What production Bloomington shows (clubs, posts).
- Whether a deleted message leaves the other person's open screen right away.
- The cross-tab calendar case, and the officer-tool emits (read from code only).
- Night-mode screenshots for the calendar.
- The Instagram and TikTok behaviour (from general knowledge).
