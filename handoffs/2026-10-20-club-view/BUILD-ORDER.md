# The club's view: build order (Oct 20, 2026)

## Status, Oct 23, 2026
**All three waves before launch night are live, ahead of the dates below.** Everything under this block is the
plan as written on Oct 20 and 23; read it as history. The full record: `../2026-10-23-session-80-club-view-shipped-and-launch-priorities.md`.
- **Wave 1 shipped Oct 21** (main `64004a1`), together with the sign-up pre-registration fix. Records:
  `../2026-10-20-club-view-wave-1.md`, `../2026-10-21-signup-preregistration-fix.md`.
- **Wave 2 shipped Oct 21** (main `4948ce6`), two days early. Followers and club settings didn't slip. Record:
  `../2026-10-21-club-view-wave-2.md`.
- **Wave 3 shipped Oct 23.** Part 1 (Up next with its steps, the share sheet, the club's own link picture, the
  table card at `/orgs/<h>/table-card`): `02e0fed`, merged as `3d8d3cd`. Part 2 (event icons, 12 to pick from):
  `50a49ea`. Record: `../2026-10-23-club-view-wave-3/HANDOFF.md`.
- **Built Oct 21 to 23 that wasn't in this order** (each was Franky's ask, each shipped; plans in
  `../2026-10-22-club-tools-arc/`):
  - Club pages inside the app frame on a computer (`076e869`), with Campus's own top bar (`66b3cce`, `2651703`),
    and "Your clubs" in the left menu's profile card (`b7a9dc0`, `b7c783d`).
  - The Club tools **Arc** (a planet on the right edge), Follow vs Membership, the 14-day wait after a declined
    request, invite your followers (`44b0923`); tools open in place (`3ca8db4`). Officers are told about new join
    requests in Otto (no phone push on production yet).
  - **Members only events** (`3ca8db4`); leaving a club warns first and drops its Members only RSVPs (`e58942e`).
  - **The Look:** Edit page opens on photo, cover and 10 backgrounds, 5 of them new (`f04fa77`, `97b5fd5`).
  - **The phone tray:** the cover's corner is empty, the row is "+ Post · Club tools · share", and Club tools open
    as a tray under the row with "Needs you" (`bba504b`, `479fd2d`).
- **The hand-over (wave 4) moved to week 1** (Franky, Oct 23). Nobody needs it until spring elections.
- **Event cover pictures were pulled forward** by Franky's Oct 23 ask ("upload photos for the event"): **in
  progress (Oct 23)** in another session. It needs a production database change with his yes and a Privacy Policy
  line the same day. If it isn't ready by Tue Oct 27, it goes back to week 1.
- **The cut list is empty.** Nothing was cut: the step rail on Up next, the last item left, shipped.
- **Production database changes: 11, not the four bundles planned below**, each with Franky's yes at the time:
  `20261021100000_club_officers`, `20261021110000_club_links`, `20261021120000_club_links_gate`,
  `20261022100000_password_needed_column`, `20261022110000_first_confirm_drops_password`,
  `20261022120000_no_self_service_email_change`, `20261023100000_club_meeting_time`,
  `20261024100000_org_join_request_notification`, `20261025100000_event_visibility`,
  `20261026100000_club_backdrop_presets`, `20261027100000_event_icons`. The file versions are numbers, not ship
  dates: all 11 went on Oct 21 to 23. The Privacy Policy was re-dated the same days and is effective October 23, 2026.
- **`TRENDING_MIN_AUTHORS` 1 → 2** (last line below) is a code change, and nothing deploys on Thu Oct 29, so it goes
  into the Oct 28 freeze build.

What must work on launch night (Thu Oct 29) and what follows in the first weeks. The decisions are in
`DECISIONS.md`; what exists today, with file references, is in `INVENTORY.md`. Sizes are S / M / L, not hours.
**Approved by Franky, Oct 20.** Waves 1 and 2 shipped Oct 21 (main `64004a1`, `4948ce6`). **Oct 23: Franky started
wave 3 and moved the hand-over (wave 4) to week 1.**

**The idea behind the order:** clubs come first, so the first thing to work is a club getting on Vibe. Franky
can start onboarding the first clubs on **Fri Oct 23**. Then officers running the club from their phone, then
the night itself and sharing. Anything that only matters once clubs have members and data comes after launch.

## Before launch night

### Wave 1 · Wed Oct 21 to Thu Oct 22 · "A club can get on"
| Piece | Size | Recommendation |
|---|---|---|
| **Roles: Owner and Officers.** Today's mods become officers; only the owner adds or removes officers. Officers post on the Board, make events and run check-in (admins already can). | S | Must. Everything after this assumes it. |
| **Club codes, one mechanism for two links:** the setup link (one use: checked club, president gets past the waitlist and becomes owner) and the members' link (3 weeks, 150 sign-ups, asks to join, officers can turn it off, count only). | L | Must, and first. It changes the sign-up gate, the database hook that decides who can make an account (`20261003110000_waitlist_gate.sql`), so it gets the longest review and a local rehearsal before production. |
| **Admin › Clubs: "New club setup link"** with its QR. | S | Must. |
| **The setup landing and setup list** (name filled in, photo and cover, one line, who can join, officers, first event, members' link). It's the first screen a new owner sees. | M | Must. Today the phone can't create a club at all. |
| **Privacy Policy line** for the codes (which link let someone in), dated the day they go live. | S | Must, same day. |

### Wave 2 · Fri Oct 23 to Sat Oct 24 · "Officers run it from the phone"
| Piece | Size | Recommendation |
|---|---|---|
| **The switch:** tap your name or hold the Profile tab; the switcher (you, then the clubs you run); the tab shows the club. Desktop: "Clubs you run" in the left nav. | M | Must. It's how officers find their club. |
| **The club page, Instagram-style:** header with counts, bio, one link, who can join, meeting time (new field), "More about us"; Edit page, Share page, +; tabs Posts, Events, Board (the phone already opens on Posts); the "needs you" line; exact counts for officers. Mostly a re-style of today's page and its officer bar. | M | Must. On launch night this page is every club's storefront. |
| **Club tools on the phone:** join requests, members, officers and titles first; then followers and club settings. Today all of this is a desktop-only window. | L | Must for requests, members and officers; followers and settings can slip a week. |

### Wave 3 · from Fri Oct 23 (started early) · "The night itself, and sharing"
| Piece | Size | Recommendation |
|---|---|---|
| **Up next with its steps** (posted, going, check-in, who came, thank-you); the button is always the next thing (share, start check-in, who came, post a thank-you). | M | Must, but if time runs short, keep the one button and drop the step rail. |
| **Share page / share event:** the phone's share sheet and copy link, the club's own link picture (today a pasted link shows the generic Vibe picture), and the table QR (the check-in QR component exists). | M | Must. This is how clubs market for us on launch night. |
| **Event covers:** icons first (Franky, Oct 23); pictures follow in week 1. | M | Should. |

### Wave 4 · moved to week 1 (Franky, Oct 23)
The hand-over is no longer before launch; it's in week 1 below.

### Wed Oct 28 · review, not building
Adversarial review of every wave's diff, the feature sentinel on the club paths, a security pass on the sign-up
gate change, and Franky's phone walk (set up a test club from a setup link, join through the members' link, switch
on the Profile tab, start check-in). Freeze that night. **Thu Oct 29: launch night, no deploys.**

## The first weeks after launch

| When | Piece | Size | Recommendation |
|---|---|---|---|
| Week 1 · Nov 2 to 8 | **Event pages** (a link people can open and RSVP from, with the cover) | M | First after launch: every shared event needs somewhere to land. |
| Week 1 | **Story cards** (club, event, after an event) | M | Right after event pages; the event card links to one. |
| Week 1 | **Notices** in the app for new events (members and followers) and Board posts (members), one a day per club, mute a club | M | Week 1, once clubs are posting. |
| Week 1 | **Hand-over:** the owner picks an officer, who accepts; the old owner becomes an officer or leaves | M | Moved from wave 4 (Franky, Oct 23). Nobody needs it until spring elections. Needs a production database change. |
| Week 1 | **Event cover pictures** (wave 3 ships icons) | S | With event pages, which show the cover. Privacy Policy line if it adds anything new. |
| Week 2 · Nov 9 to 15 | **One picture on Board posts** | M | Week 2. Flyers can go up as club posts until then. |
| Week 2 | **Insights** (followers by week, turnout by event) | S | Week 2, when there's data to show. |
| Week 2 or later | **Phone push** for the same notices | S | When Apple accepts the app (store work stays parked until then). |
| Week 3 · Nov 16 to 22 | **Start a club on your own** with "Get checked" (a code to the club's email, or ask Vibe), the optional club email, and **getting a club back** when its owner disappears | M | Week 3. The first 20 come through setup links, so nobody needs this sooner. Needs a Privacy Policy line for the club email. |
| As space allows | Anything cut from the waves above | | In the cut order below. |

## If we run late, cut in this order
As of Oct 23 only one item is left to cut: **the step rail on Up next** (keep its one button). The rest already
happened: the hand-over and cover pictures moved to week 1, and followers, club settings and desktop "Clubs you run"
shipped in wave 2.

**Never cut:** roles, the two links and the gate change, the setup list, the switch, the club page, join requests on
the phone, and Share with the link picture and QR.

## What needs Franky's yes, and when
- **Production database changes**, each with his yes at the time, bundled to keep them few: Wave 1 (roles; club
  codes and the sign-up gate change), Wave 2 (the meeting-time field), Wave 3 (event covers), week 1 (hand-over).
- **Privacy Policy**, same day: club codes (Wave 1), event covers (Wave 3), the club email (week 3).
- **Staying out of the way:** the Otto page redesign stays after launch; `TRENDING_MIN_AUTHORS` 1 → 2 is still a
  launch-morning job.
