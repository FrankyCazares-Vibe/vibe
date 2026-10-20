# The club's view: build order (Oct 20, 2026)

What must work on launch night (Thu Oct 29) and what follows in the first weeks. The decisions are in
`DECISIONS.md`; what exists today, with file references, is in `INVENTORY.md`. Sizes are S / M / L, not hours.
**Approved by Franky, Oct 20.** Wave 1 starts now in its own session.

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

### Wave 3 · Sun Oct 25 to Mon Oct 26 · "The night itself, and sharing"
| Piece | Size | Recommendation |
|---|---|---|
| **Up next with its steps** (posted, going, check-in, who came, thank-you); the button is always the next thing (share, start check-in, who came, post a thank-you). | M | Must, but if time runs short, keep the one button and drop the step rail. |
| **Share page / share event:** the phone's share sheet and copy link, the club's own link picture (today a pasted link shows the generic Vibe picture), and the table QR (the check-in QR component exists). | M | Must. This is how clubs market for us on launch night. |
| **Event covers:** a picture or a simple icon on every event. | M | Should. If late, icons only, pictures in week 1. |

### Wave 4 · Tue Oct 27 · hand-over, then stop building
| Piece | Size | Recommendation |
|---|---|---|
| **Hand-over:** the owner picks an officer, who accepts; the old owner becomes an officer or leaves. | M | Your call: before launch. Mine: first to slip. Nobody needs it until spring elections, and it's the only piece with no launch-night job. |

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
| Week 2 · Nov 9 to 15 | **One picture on Board posts** | M | Week 2. Flyers can go up as club posts until then. |
| Week 2 | **Insights** (followers by week, turnout by event) | S | Week 2, when there's data to show. |
| Week 2 or later | **Phone push** for the same notices | S | When Apple accepts the app (store work stays parked until then). |
| Week 3 · Nov 16 to 22 | **Start a club on your own** with "Get checked" (a code to the club's email, or ask Vibe), the optional club email, and **getting a club back** when its owner disappears | M | Week 3. The first 20 come through setup links, so nobody needs this sooner. Needs a Privacy Policy line for the club email. |
| As space allows | Anything cut from the waves above | | In the cut order below. |

## If we run late, cut in this order
1. Hand-over (to week 1).
2. Event cover pictures (keep icons).
3. The step rail on Up next (keep its one button).
4. Followers and club settings on the phone (desktop keeps them a week longer).
5. Desktop "Clubs you run" (desktop keeps its Manage club link).

**Never cut:** roles, the two links and the gate change, the setup list, the switch, the club page, join requests on
the phone, and Share with the link picture and QR.

## What needs Franky's yes, and when
- **Production database changes**, each with his yes at the time, bundled to keep them few: Wave 1 (roles; club
  codes and the sign-up gate change), Wave 2 (the meeting-time field), Wave 3 (event covers), Wave 4 (hand-over).
- **Privacy Policy**, same day: club codes (Wave 1), event covers (Wave 3), the club email (week 3).
- **Staying out of the way:** the Otto page redesign stays after launch; `TRENDING_MIN_AUTHORS` 1 → 2 is still a
  launch-morning job.
