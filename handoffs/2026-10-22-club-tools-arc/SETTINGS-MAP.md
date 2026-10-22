# Club settings for officers, and the club background: a decision map

Prepared Oct 22, 2026. I only read files; nothing was edited and no database was touched. Paths are relative to `/Users/franciscocazares/vibe/.claude/worktrees/club-page-in-shell-0b76e3/`. Line numbers are from branch `claude/club-page-in-shell-0b76e3` at `3ca8db4`.

## The short answer
- **Background.** Officers can't change their club's background from the club page or a phone today. The only picker is in the old desktop settings window (`/campus?manage=<handle>`). That picker is also out of step with the club page: picking "Cream paper" saves but the page shows Sand purple, and the swatches don't look like what the page paints. Recommendation: one list of preset backgrounds in code, a picker in the Edit page (the same one for phone and computer), and 10 dark presets that pass a contrast test.
- **Settings.** Most of what officers need already exists. What's missing before launch is small: rename on the phone, the background, a note with join requests, and one place for settings.
- **Mobile.** Yes for the settings and the background picker. Building them into the Edit page and the tools screens gives phones the same thing as computers. **No** to the Arc on phones.

## Top 10 to do before launch
1. **One list of backgrounds in code** (`src/lib/orgs/backdrops.ts`), used by the club page, both pickers and both API routes. A stored `cream` shows as the default. The PATCH refuses an unknown key with a 400 instead of quietly ignoring it. Fixes a bug that is live now. S, no DB change.
2. **A "Look" section at the top of the Edit page**: photo, cover and background, with a live preview. It goes to phone and computer at once. S–M, no DB change.
3. **Retune the 5 existing presets** so text stays readable (section B), and add a test that renders each gradient and checks its contrast. Keys stay the same, so no stored row changes. S, no DB change.
4. **Add 5 new presets** (Cardinal, Lantern, Canal, Rose, Onyx). This is one CHECK constraint change; bundle it into wave 3's event-cover migration so production gets one change, with Franky's yes. S, DB change.
5. **Name field in the Edit page.** Renaming a club is only possible in the old desktop window today. The PATCH already checks 2–50 characters and runs the word filter (`src/app/api/orgs/[slug]/route.ts:576-583`). S, no DB change.
6. **"Say hi" note with a join request.** The join route already stores a 500-character message (`src/app/api/orgs/[slug]/join/route.ts:402-406`) and Join requests shows "their note". But the club page sends `{}` (`src/components/orgs/OrgJoinControl.tsx:249`), so no note ever arrives. Add an optional field to the Membership box. Check the Privacy Policy's join-request lines first. S, no DB change.
7. **Point desktop "Manage club" at the club page's Club tools** instead of the old window (`src/components/desktop/messages/ClubPanel.tsx:418`, `ClubPane.tsx:606`). After items 2 and 5 the old window's Overview has nothing the new screens lack. S, no DB change.
8. **Hand-over (wave 4, as planned).** It is the first thing to slip if time runs short. M, DB change.
9. **Club link picture and table QR (wave 3, planned).** Paint the link picture with the club's background and logo so the club's colour travels with every shared link. M, no DB change.
10. **Check the background on an iPhone during the phone walk.** `src/app/orgs/[handle]/page.tsx:521` uses `backgroundAttachment: "fixed"`. iPhone browsers ignore that, so the colour is probably stretched over the whole page instead of the screen. A fixed background layer would make phone and computer match. S.

## A. What officers can set today

**Where each setting is reached**
- **Edit page:** `src/app/orgs/[handle]/admin-actions.tsx:93` `EditPageModal`.
  - Change photo and Change cover, 215 and 223. Both open `UploadAssetModal` (346); the cover crops to 3:1 (442).
  - Description, 228 (400 characters).
  - When you meet, 242 (60 characters).
  - Links, 272 (up to 10, https only).
  - Philanthropy, 276 (500 characters).
  - Who can join, 290; Open to, 298. Neither shows on a hidden club.
  - It has **no name and no background**.
- **Club tools pages** (`src/app/orgs/[handle]/tools/*`, screens in `src/components/orgs/tools/*`). These are the phone's way in; on a computer the same screens open inside the Arc panel.
  - **Index:** `ToolsIndex.tsx:111-148` has Share the club, Invite members, Members' link (checked clubs only), Join requests, Members, Followers, Officers and titles, Edit the page, Past events and who came, and Club settings.
  - **Settings** (`SettingsScreen.tsx`): the Board switch (62), Leave for officers (177), Delete for the owner after typing the handle (236). Owners can't leave yet; the screen says "Handing the club to an officer is coming soon" (267).
  - **Members and officers** (`MembersScreen.tsx`, rules in `member-rules.ts:27-45`):
    - The owner titles anyone; an officer titles members and themselves. Titles are up to 32 characters (`src/lib/profile/club-flair.ts:25`).
    - Only the owner makes someone an officer or a member again.
    - The owner removes officers and members; an officer removes members only.
  - **Followers** (`FollowersScreen.tsx`): remove a follower, invite a follower.
  - **Requests** (`RequestsScreen.tsx`): approve or deny.
- **Members' link** (`src/components/orgs/MembersLinkPanel.tsx`): one per checked club, with a QR. It ends after 3 weeks or 150 sign-ups, or when an officer turns it off. Officers see only how many joined.
- **Old desktop window** (`src/app/campus/campus-home.tsx:1715-1885`, tabs at 1757-1765: Overview, Channels, Members, Followers, Invites, Requests, Danger).
  - Overview (`SettingsOverview`, 1887) holds Name (2050), Description, Who can join, Open to, **Backdrop (2103-2126)**, Links and Philanthropy.
  - It is reached only from desktop Messages' "Manage club" (`?manage=`, 611-615 and 789-798).
- **Rooms** (`src/components/desktop/messages/RoomsDialog.tsx`, desktop only): up to 5 extra rooms, who sees each one, who posts (`post_policy` everyone, officers or listed), its people list, and delete.
- **Events** (`CreateEventModal`, `campus-home.tsx:12315`): title, description, location, start, end (12536-12560), club, and "Who can see it: Everyone / Members only" (12585, live since Oct 22, migration `20261025100000`).
  - Only owners and officers of a checked club can make events.
  - There is no cover, capacity, reminder or repeat.
- **PATCH `/api/orgs/[slug]`** (`route.ts:67-82`) accepts name, description, backdrop_preset, logo_url, banner_url, is_public (legacy), join_policy, audience, links, philanthropy, campus or campus_id, followers_read_board and meeting_time.
  - It does **not** accept `tags`. The column exists (`20260928150000_club_chat_posts_rules.sql:25`) but nothing in the app edits it.
  - An unknown backdrop is silently dropped (594-599), not refused.

**The background today**
- **Database.** Column `orgs.backdrop_preset`, default `'sand-purple'` (`20260507100000_org_channels_schema.sql:12`). Its CHECK allows 6 keys: cream, sand-purple, ember, deep-violet, forest, midnight (`20260508140000_orgs_cream_backdrop.sql:7-8`). Only the server writes it: signed-in users lost UPDATE on `orgs` in `20260928150000`.
- **Three lists that disagree:**
  - `campus-home.tsx:398-446` has 6 labelled presets with three colour washes each. Cream is a light preset.
  - `src/app/orgs/[handle]/page.tsx:72-91` has 5 simpler versions and **no cream**. A cream club falls back to Sand purple (453-454).
  - The routes (`route.ts:56-63`, `src/app/api/orgs/route.ts:49`) allow 6. New clubs default to sand-purple (`route.ts:739-743`; desktop create `campus-home.tsx:1297`).
- **Pickers:** only the old desktop window (2103) and the desktop create dialog (1477). There is none in the Edit page, setup, Club tools or anywhere on a phone. The swatches show campus-home's versions, not what the club page paints.
- **Where the background shows:**
  - The club page, all widths (`page.tsx:516-523`). The page is a dark "night island" in Light and Night alike.
  - The old desktop chat pane (`campus-home.tsx:905-906`).
  - The old phone channel rail (`src/components/mobile/CampusMobile.tsx:3031`). It only appears when the old chat is on, which is nobody since chat v2 went to everyone.
  - The new Messages doesn't use it.
- **The pattern to copy:** the student cover picker (`src/lib/profile/cover-themes.ts:1-27`). The key is stored, never CSS. A CSS string in a column was once an IP beacon (`20260912100000`).

## B. Background picker: recommendation

**Presets only for launch, stored as keys.** Here is why:
- **Readability can be tested.** Every preset can be checked automatically, and the page is a night island where white text sits straight on the background.
- **It keeps the brand.** Near-black with a colour bloom is Vibe's look.
- **The database change is small.** It is one CHECK line, and the route stays the only writer.
- **It is safe.** It follows the cover-themes rule: no CSS is ever stored.
- **Others work the same way.** GroupMe offers group themes and Discord's profile themes are limited to two colours. Discord also had to re-colour text automatically on custom themes.

Custom colours come after launch, if clubs ask:
- Store two hex colours, each with a CHECK `~ '^#[0-9a-f]{6}$'`, only when `backdrop_preset = 'custom'`.
- The server clamps their brightness and builds the CSS from a fixed template.
- The same contrast test runs on save.
- "Match my logo" would pick two suggestions from the uploaded logo in the browser and pass them through the same clamp.
- A national Greek organisation setting every chapter's colours could be part of a later paid tier (the Kaki meeting's possible payers).

**Readability: I measured it.** I rendered each gradient at 390×844 and 1440×900 and found the brightest spot. The script is in `/private/tmp/claude-501/-Users-franciscocazares-vibe--claude-worktrees-club-page-in-shell-0b76e3/ef7d1d74-d09d-41a1-a60b-cbc03e98815a/scratchpad/contrast.py`.

On today's five club-page presets, at their brightest spot:
- **Main text** (#F6F1EA) passes everywhere: 6.2–12.5:1.
- **Secondary text** (#CFC8BE) is 4.2:1 on Sand purple and 4.3:1 on Ember, both below 4.5.
- **Muted text** (#9C958C, used for the handle, quiet lines and count labels) is **2.3–3.0:1 on four of the five**. Only Midnight passes, at 4.7.
- Coral labels (#FF8A66) are 3.0–6.1:1.

**Rule for the test:** at the brightest spot, main text ≥ 7:1, secondary ≥ 4.5:1, muted ≥ 4.5:1. Muted text is the hardest to keep, so it sets the limit. `--ink-faint` should never sit straight on the background: it reaches about 3.8:1 at best.

**The 10 presets.** These are the tuned values; every one gives main text 12.2:1 or better, muted 4.6:1 or better and coral 5.9:1 or better. They keep today's four-layer shape, so the code change is only numbers. Five keys stay; five are new.
- Labels change for free: sand-purple becomes "Dusk" and deep-violet becomes "Violet". Sand-purple stays the default.
- Retire Cream from the picker, but keep it in the CHECK so no row breaks. Main text on cream is 1.05:1 on the night island.
- Picker order: Dusk, Midnight, Violet, Rose, Cardinal, Ember, Lantern, Forest, Canal, Onyx.

```
sand-purple  "Dusk"
radial-gradient(120% 80% at 0% 0%, rgba(123,95,224,0.23) 0%, rgba(123,95,224,0) 55%), radial-gradient(110% 90% at 100% 100%, rgba(255,92,53,0.2) 0%, rgba(255,92,53,0) 55%), radial-gradient(140% 100% at 70% 20%, rgba(255,140,90,0.06) 0%, rgba(255,140,90,0) 60%), linear-gradient(180deg, #140F24 0%, #1A1430 50%, #1C1220 100%)

midnight  "Midnight"
radial-gradient(120% 90% at 0% 0%, rgba(60,90,200,0.39) 0%, rgba(60,90,200,0) 55%), radial-gradient(110% 90% at 100% 100%, rgba(180,120,255,0.27) 0%, rgba(180,120,255,0) 55%), radial-gradient(140% 100% at 50% 50%, rgba(120,180,255,0.12) 0%, rgba(120,180,255,0) 60%), linear-gradient(180deg, #07091A 0%, #0E1230 55%, #050614 100%)

deep-violet  "Violet"
radial-gradient(120% 90% at 0% 0%, rgba(138,90,255,0.31) 0%, rgba(138,90,255,0) 55%), radial-gradient(110% 90% at 100% 100%, rgba(80,40,200,0.26) 0%, rgba(80,40,200,0) 55%), radial-gradient(140% 100% at 50% 50%, rgba(200,140,255,0.07) 0%, rgba(200,140,255,0) 60%), linear-gradient(180deg, #0D061E 0%, #140B2A 50%, #0A0618 100%)

rose  "Rose"  (new)
radial-gradient(120% 90% at 0% 0%, rgba(235,70,150,0.26) 0%, rgba(235,70,150,0) 55%), radial-gradient(110% 90% at 100% 100%, rgba(150,60,220,0.21) 0%, rgba(150,60,220,0) 55%), radial-gradient(140% 100% at 70% 25%, rgba(255,150,200,0.05) 0%, rgba(255,150,200,0) 60%), linear-gradient(180deg, #16081A 0%, #1D0B22 55%, #130716 100%)

cardinal  "Cardinal"  (new; Indiana's state bird, names no school)
radial-gradient(120% 90% at 0% 0%, rgba(200,30,50,0.38) 0%, rgba(200,30,50,0) 55%), radial-gradient(110% 90% at 100% 100%, rgba(140,20,60,0.35) 0%, rgba(140,20,60,0) 55%), radial-gradient(140% 100% at 70% 25%, rgba(255,90,90,0.08) 0%, rgba(255,90,90,0) 60%), linear-gradient(180deg, #16080A 0%, #1F0B0F 55%, #14070A 100%)

ember  "Ember"
radial-gradient(120% 90% at 10% 0%, rgba(255,92,53,0.24) 0%, rgba(255,92,53,0) 55%), radial-gradient(110% 90% at 100% 100%, rgba(255,170,80,0.13) 0%, rgba(255,170,80,0) 55%), radial-gradient(140% 100% at 70% 30%, rgba(180,40,40,0.13) 0%, rgba(180,40,40,0) 60%), linear-gradient(180deg, #140A0C 0%, #1E0E11 55%, #16090C 100%)

lantern  "Lantern"  (new, warm gold)
radial-gradient(120% 90% at 0% 0%, rgba(230,170,60,0.18) 0%, rgba(230,170,60,0) 55%), radial-gradient(110% 90% at 100% 100%, rgba(255,120,50,0.14) 0%, rgba(255,120,50,0) 55%), radial-gradient(140% 100% at 60% 30%, rgba(255,210,120,0.04) 0%, rgba(255,210,120,0) 60%), linear-gradient(180deg, #120E07 0%, #19130A 55%, #100C06 100%)

forest  "Forest"
radial-gradient(120% 90% at 0% 0%, rgba(70,160,110,0.21) 0%, rgba(70,160,110,0) 55%), radial-gradient(110% 90% at 100% 100%, rgba(40,100,140,0.19) 0%, rgba(40,100,140,0) 55%), radial-gradient(140% 100% at 60% 30%, rgba(180,220,140,0.05) 0%, rgba(180,220,140,0) 60%), linear-gradient(180deg, #0A1412 0%, #0D1C17 55%, #08110F 100%)

canal  "Canal"  (new, teal)
radial-gradient(120% 90% at 0% 0%, rgba(30,170,170,0.2) 0%, rgba(30,170,170,0) 55%), radial-gradient(110% 90% at 100% 100%, rgba(40,90,200,0.18) 0%, rgba(40,90,200,0) 55%), radial-gradient(140% 100% at 60% 30%, rgba(140,230,220,0.04) 0%, rgba(140,230,220,0) 60%), linear-gradient(180deg, #061316 0%, #0A1A20 55%, #050F12 100%)

onyx  "Onyx"  (new, neutral with Vibe's coral corner; good for pre-professional clubs)
radial-gradient(120% 90% at 0% 0%, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 55%), radial-gradient(110% 90% at 100% 100%, rgba(255,92,53,0.22) 0%, rgba(255,92,53,0) 55%), radial-gradient(140% 100% at 60% 30%, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 60%), linear-gradient(180deg, #0E0D0D 0%, #121111 55%, #0A0909 100%)
```

- **Trade-off:** the existing four become softer, with their washes at about half today's brightness, to pass the muted-text rule. A side-by-side render of today's versus the tuned set is at `/private/tmp/claude-501/-Users-franciscocazares-vibe--claude-worktrees-club-page-in-shell-0b76e3/ef7d1d74-d09d-41a1-a60b-cbc03e98815a/scratchpad/swatches.png`. All ten keep colour.
- **Colour advice:** red, blue, violet and magenta stay vivid when dark. Gold and green turn muddier, which is why Lantern and Forest read warmer and quieter.
- **The other route:** keep today's brighter washes and make quiet text on the club page use secondary ink instead. I don't recommend it, because it breaks the token system.

**The picker's design**
- **Where it lives:** the Edit page, first section "Look" (Photo, Cover, Background). It saves with the page's one Save, and Cancel restores the old one.
- **Swatches:** a radio group with one Tab stop and arrow keys, copying `EventVisibilityField` (`campus-home.tsx:12662`). Each swatch is at least 44×44. The selected one gets a ring and a check, not colour alone, with its name shown and in its label.
- **Preview:** on a phone the sheet covers the page, so a small preview card shows the cover strip, logo and name on the chosen background. On a computer the page behind also repaints live through a CSS variable on `<main>`.
- **Light and Night:** the backgrounds are dark in both looks, so there are no light versions.
- **Later:** a backdrop strip on Discover cards and story cards.

## C. The full map

**Where these come from (other products):**
- **Anthology Engage:** positions, approving members, primary contacts and officer hand-over, forms, elections, re-registration.
- **CampusGroups:** permissions set per officer, Access & Privacy, membership tiers with end dates, social links.
- **Heylo:** manual approval, a member questionnaire (Pro), who can invite, create chats or create events, any number of admins, discoverability.
- **GroupMe:** avatar, topic, theme, join question, share link, who can join, visibility, who adds or removes people, change owner, end group, announcement groups.
- **Discord:** rules screening, onboarding, Server Insights (only from 500 members), slow mode, role colours.
- **Instagram professional:** category label, contact buttons, Insights.
- **Slack:** invitations that need an admin's approval.
- **BAND:** secret, closed or public groups; co-admin privileges; cover design.
- **OmegaFi Vault (Greek):** dues and bill pay, rosters, event check-in, tagging recruits.
- **What recurs:** who can join and approval; co-admins and hand-over; name, photo, cover, bio and links; visibility; who can do what; join questions. Analytics only show at scale. Colour themes are common in social apps (GroupMe, Discord, BAND) and rare in campus admin tools, where colour is set by the school.

In the tables, "When" is Before launch, After, or Not for Vibe. "DB" is whether a database change is needed.

### Look and identity
| Setting | Today | Why officers want it (who has it) | When | DB |
|---|---|---|---|---|
| Name | Old desktop window only (`campus-home.tsx:2050`; PATCH 576) | Fix typos, rebrand (all products) | **Before launch**: add to Edit page | No |
| Handle | Permanent | Branded links (BAND vanity URL) | Not for Vibe: changing it breaks links and QRs; Admin can change it by hand later | — |
| Photo, cover | Have it (Edit page 215, 223) | Identity (all) | Done | — |
| Background | Partly: desktop old window only, lists disagree | Identity; customisation is the student hook (GroupMe theme, BAND cover) | **Before launch** (Top 10, items 1–4) | CHECK only |
| Accent colour | Missing | Discord role colours | Not for Vibe: coral is the app's action colour; the background carries identity | — |
| Bio, links, when you meet, philanthropy | Have it (Edit page 228–276) | All | Done | — |
| Category or tags | `orgs.tags` exists, no UI, not in PATCH | Discover filters (Engage, CampusGroups, Instagram category) | After: week 2–3, once there are more than 20 clubs | No for tags; yes for a fixed list |
| National org or chapter name | Missing | Greek chapters; Kaki's possible payers | After | Yes |

### Joining and membership
| Setting | Today | Why (who has it) | When | DB |
|---|---|---|---|---|
| Who can join (open, request, invite) | Have it (Edit page 290; setup) | All | Done | — |
| Open to (IU, Purdue, both) | Have it (298; owner's school enforced) | — | Done | — |
| Members' link | Have it (checked clubs) | GroupMe share link, Slack invites | Done | — |
| Invite people or followers | Have it (OrgInviteSheet, FollowersScreen) | All | Done | — |
| Who can invite (members too) | Fixed: owner and officers (`join-state.ts:194`) | Heylo, GroupMe, Slack | After, if asked; members can already Share the page | Yes |
| Join question or note | Partly: the route stores a 500-character note, the UI never sends one | Officers decide faster (GroupMe join question, Heylo questionnaire) | **Before launch**: a free "Say hi" note. A club-written question comes after | Note: no. Question: yes |
| Auto-approve rules | "Open" is the auto-approve | Heylo, Slack | Not for Vibe | — |
| Member cap | Missing | Rare | Not for Vibe; event capacity is the real need | — |
| Wait after a decline | Fixed at 14 days (Oct 22) | Heylo lets people reapply | Done, keep it fixed | — |
| Membership terms or yearly re-confirm | Missing | CampusGroups tiers with end dates, Engage re-registration | After, before spring; use titles like "New member" instead of a role | Yes |

### Roles and permissions
| Setting | Today | Why (who has it) | When | DB |
|---|---|---|---|---|
| Owner and officers, titles | Have it (`20261021100000`; `member-rules.ts:27-45`) | All | Done | — |
| Hand over ownership | Missing ("coming soon", `SettingsScreen.tsx:267`) | Elections (GroupMe change owner, Engage transitions) | Before launch per Franky's call (wave 4); first to slip | Yes |
| Permissions per officer (treasurer, social chair) | Missing | CampusGroups | Not for Vibe now: two roles was the decision; revisit if chapters ask | Yes |
| Who can post events, Board posts, edit the page | Fixed: owner and officers | Heylo "who can create events" | Keep fixed | — |
| Faculty advisor | Missing | Engage, CampusGroups | After, maybe; advisors aren't students | Yes |

### Events
| Setting | Today | Why (who has it) | When | DB |
|---|---|---|---|---|
| Everyone or Members only | Have it (Oct 22) | Fraternities | Done | — |
| A club-wide default for that | Missing | Chapters that keep most events private | After; remembering the last choice in the browser needs no DB | No |
| Cover picture | Wave 3 | Flyers | As planned | Yes |
| Capacity and waitlist | Missing (sign-up cards have slots) | Engage, CampusGroups registration caps | After | Yes |
| Reminders to people going | Missing | Heylo, Engage | After, with week-1 notices | Yes (notification type) |
| Repeating events | Missing ("when you meet" covers it) | Heylo, Google Calendar | After | Yes |
| Check-in settings | Fixed window and door code | Heylo check-in counts, OmegaFi | Keep fixed | — |

### Board and chats
| Setting | Today | Why (who has it) | When | DB |
|---|---|---|---|---|
| Followers can read the Board | Have it (`SettingsScreen.tsx:62`, ⋯ menu, RoomsDialog) | — | Done | — |
| Extra rooms (who sees, who posts) | Desktop only (RoomsDialog) | Discord channels, GroupMe announcement groups | After: phone room management | No |
| Pin a Board post | Missing in club rooms (pins exist for direct and group chats) | Discord, GroupMe pins | After | Yes (policy) |
| Pictures on Board posts | Week 2 (decided) | Flyers | As planned | Yes |
| Slow mode | Missing | Discord | Not for Vibe; clubs are small | — |

### Notifications for officers
| Setting | Today | Why | When | DB |
|---|---|---|---|---|
| Join request notification | Have it (`org_join_request`, Oct 22; push follows "Club invites") | GroupMe, Heylo | Done | — |
| New followers, RSVPs | The needs-you line ("+6 followers this week") | — | Not for Vibe as single pings; a weekly digest after launch | Yes |
| Settings per club | Missing | Slack | After, if clubs say it's noisy | Yes |

### Privacy and visibility
| Setting | Today | When |
|---|---|---|
| Hidden club | Vibe's moderators only (`hidden_at`) | Not for Vibe as an officer switch before launch. A self-serve "pause" comes later (see Danger zone) |
| Member list | Members only (`20261017120000`) | Keep. No setting: identities stay private |
| Counts | Public from 5, exact for officers (`FOLLOWER_COUNT_FLOOR`, `src/lib/orgs/following.ts:109`) | Keep. No setting: counts are public |
| Club on members' profiles | Each member hides it themselves | Keep |

### Growth and sharing
| Setting | Today | When |
|---|---|---|
| Share page | Have it (`share-page.ts`; `ToolsIndex.tsx:81-97`) | Done |
| Members' link QR | Have it | Done |
| Club link picture, table QR | Wave 3 | Before launch. The link picture should use the club's background |
| Story cards | Week 1 | After |

### Insights
| Item | Today | When |
|---|---|---|
| Exact counts and the needs-you line | Have it (`src/lib/orgs/officer-counts.ts`) | Done |
| Who came, for 30 days | Have it (`OrgPastEvents.tsx`) | Done |
| Insights page (followers by week, turnout by event) | Week 2 | After. No "seen by" and no rankings that shame. Discord only shows Insights from 500 members, so small clubs need only simple numbers |

### Danger zone
| Item | Today | When | DB |
|---|---|---|---|
| Leave (officer) | Have it (`SettingsScreen.tsx:177`) | Done | — |
| Delete (owner, typed handle) | Have it (236; route DELETE 861); a hidden club can't be deleted | Done | — |
| Hand over | Missing | Wave 4 | Yes |
| Archive or pause (keep history, stop new joins) | Missing | After, before spring (GroupMe end group, Engage re-registration) | Yes |
| Undo a delete within 7 days | Missing (hard delete) | After | Yes |

## D. Should we implement a mobile version?
- **(a) Settings: yes, but not a separate build.** Phones already have Club tools pages (wave 2), and the Edit page works on phones. Put every setting into components both use (Edit page and tools screens) and mobile comes with it. The phone gaps today are rename, background and rooms. Rename and background go into the Edit page before launch (items 2 and 5); phone room management comes after.
- **(b) Background picker: yes.** It is the same Edit page section.
  - On a phone: a 5×2 grid of swatches at least 44px each, the selected one's name below, and the preview card on top, because the sheet covers the page.
  - On a computer: the page behind repaints live.
- **(c) Arc and in-place tools: no.** Phones keep the `/orgs/<h>/tools` pages and the Profile-tab switch. Reasons:
  - The Arc needs a mouse and a wide screen: names on hover and a 560px panel. It closes under 900px (`src/app/orgs/[handle]/club-page/club-tools-launcher.ts:12`).
  - A long-press on a planet would compete with the Profile tab's hold.
  - Full pages get the phone's own back gesture.
  - Franky's "two hops back" complaint is already solved on phones: each tools page has a one-tap link back to the club (`src/components/orgs/tools/tools-ui.tsx` header).

## One more thing I found
The live Privacy Policy still says "A request to join a club. You cannot take it back" and that you keep following after a no (`src/app/legal/privacy/sections-6-8-delete.tsx:119`, and the `.md` copy at line 441). But students can cancel a pending request since `44b0923`, and cancelling drops a follow the request made (`src/app/api/orgs/[slug]/join/route.ts:512-529`). Worth correcting the same day as any other policy change.

Sources: [Heylo permissions](https://heylo.com/help/permissions), [Heylo prospective members](https://heylo.com/help/prospective-members), [GroupMe group settings](https://support.microsoft.com/en-us/office/manage-group-settings-in-groupme-5be01806-049f-4ebb-8d3a-d23dc32b900f), [GroupMe announcement groups](https://support.microsoft.com/en-us/office/what-are-announcement-group-chats-and-how-do-i-use-them-in-groupme-1a90edc0-da6e-4d4c-a7cb-8db0dd51d20b), [CampusGroups group settings](https://readyedu.atlassian.net/wiki/spaces/CGSD/pages/407797794/Managing+Group+Settings), [CampusGroups officer permissions](https://readyedu.atlassian.net/wiki/spaces/CGSD/pages/462127105/Managing+Officer+Permissions), [CampusGroups branding](https://readyedu.atlassian.net/wiki/spaces/CGSD/pages/377683969/Basic+Branding), [Anthology Engage student leader guide](https://help.anthology.com/engage/en/student-leader-resource-guide.html), [Georgia Tech officer requirements](https://studentengagement.gatech.edu/index.php/annual-registration-101/officer-requirements), [Discord Server Insights](https://discord.com/community/understanding-server-insights), [Discord rules screening](https://support.discord.com/hc/en-us/articles/1500000466882), [Discord profile themes](https://n3tc0rd.digitalpress.blog/discord-profile-updates/), [Instagram professional accounts](https://help.instagram.com/iphone-app/138925576505882), [Slack invitation approval](https://slack.com/help/articles/115004854783-Manage-workspace-invitation-permissions-and-requests), [OmegaFi Vault](https://apps.apple.com/us/app/id853280453), [BAND release notes](https://apkmirror.com/apk/naver-corp/band-organize-your-groups/band-organize-your-groups-8-8-0-6-release).
