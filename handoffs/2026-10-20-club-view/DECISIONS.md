# The club's view: decisions (Franky, Oct 20, 2026)

Board: https://claude.ai/artifact/FZQgjLYfoBojmPFuKF3NKe (opens on Round 2). What exists today, with file
references: `INVENTORY.md`. Nothing below is built yet.

## The design (Round 2)

1. **No sixth tab. Switch to your club on the Profile tab**, Instagram-style: tap your name on your profile, or
   hold the Profile tab, and pick a club. The tab then becomes the club's own page (banner, counts, posts, events,
   Edit page, Share page) until you switch back. Chats and Board posts still show the person's own name and title.
   Desktop: "Clubs you run" in the left nav, built like the founders' Admin link (which stays founders-only).
2. **On the club's page, officers see only two extra things:** a "needs you" line (join requests, new followers,
   unfinished setup) and the Up next card with its steps (Posted, Going, Check-in, Who came, Thank-you) and the
   next action as its button. Posting (Board post, new event, poll) sits behind +; everything else is in Club tools.
3. **Several clubs:** the switcher lists you first, then each club you run; one nav line per club on desktop; a
   dot where you're needed. Only clubs where you're an officer.
4. **Setup:** people sign in as themselves; there are no club logins. The club's email is optional, used only to
   check a club that set itself up and to get a club back. The first 20 clubs get a one-time setup link from
   Admin › Clubs, handed over in person: it marks the club checked, lets the president past the waitlist and makes
   them the owner.

## Round 1's calls

1. **Roles: Owner and Officers.** Mod goes away; today's mods become officers. Only the owner adds or removes
   officers, deletes the club or hands it over. Titles (President, Social chair) stay labels.
2. **A members' link, with limits.** One per checked club; it gets people past the waitlist and asks them to join
   that club; school email still required; ends after 3 weeks; 150 sign-ups; officers can turn it off and see
   only how many joined.
3. **Flyers.** Officers can add one picture to a Board post, and every event gets a cover picture or a simple icon.
   The Lounge stays text.
4. **Notices.** New events reach members and followers; Board posts reach members. In the app's notifications now,
   phone push after Apple accepts the app. At most one a day per club; anyone can mute a club.
5. **The whole share kit.** The club's own link picture, three story cards (club, event, after an event), a table
   QR, and a page for every event. No names or faces; counts from 5 up.
6. **The club page opens on Posts**, with the next event pinned above the tabs. Tabs: Posts, Events, Board. About
   folds into the header: bio, one link, who can join, when it meets (a new field), and "More about us".
7. **Numbers.** Officers see exact followers and members (even under 5), this week's change, going and who came,
   and an Insights page in Club tools (followers by week, turnout by event). No "seen by".
8. **Hand-over, before launch.** The owner picks an officer, who accepts; the old owner becomes an officer or
   leaves. If an owner disappears, Vibe moves the club after checking with the club's email or two officers.

## What each one touches (for the build plan)

- **Production database changes** (each needs Franky's yes at the time): mods to officers and the new owner-only
  rules (`org_members`, `can_post_org_channel`, the members route); the members' link (today `INVITE_LINKS_ENABLED
  = false`, and waitlist codes are one person each); an optional club email; event covers and the meeting-time
  field; Board pictures (photos are off in club rooms: `src/lib/chat/types.ts`, the messages upload route); new
  notification types (the type list is a check constraint); ownership hand-over (`orgs.owner_id`, "coming soon"
  today).
- **Privacy Policy, same day as the change:** the members' link (which link let someone in), the club email,
  event covers, and anything new Insights shows.
- **Code areas:** the club page `src/app/orgs/[handle]/` (it already opens on Posts on the phone); the phone tab
  bar and profile (`MobileTabBar.tsx`, `ClubsSection.tsx`); the desktop nav (`LeftNav.tsx`, next to the Admin
  block); Admin › Clubs (`src/app/admin/`); the club link picture (`generateMetadata` in the club page has no
  image today); the QR (`src/components/events/checkin/QrCode.tsx`); a new event page (today an event's link is
  `/campus?tab=events&event=<id>`); counts (`FOLLOWER_COUNT_FLOOR` in `src/lib/orgs/following.ts`). Any new
  outside host needs the Content-Security-Policy in `src/proxy.ts`.
- **Honest note:** with hand-over before launch, this is a lot for the nine days before Oct 29. The next step is a
  build order: what must work on launch night, and what follows in the first weeks.
