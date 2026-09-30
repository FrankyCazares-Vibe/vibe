# Vibe — metrics as a product, and what premium sells

**Written:** September 10, 2026 · **Decided by:** Franky, this session · **Status:** plan, not built

## The rule this all hangs on

> **Counts are public. Identities are private.**
> Anyone can open a profile and see how many followers, connections, mutuals and posts that person has, the same as Instagram, Facebook or X. Only the owner sees *who* — who viewed their profile, who viewed each post, who liked, who commented. That "who" is what premium sells.

This replaced the April principle "No vanity metrics", which forbade public follower counts and did not describe the product being built. Retired September 10.

A second paid lever sits beside it, and Franky flagged it as core rather than polish: **paying unlocks more customization.** Vibe's draw for students is that a profile is a portrait, not a form, and premium should let you go further. The detail is his to define; this plan does not guess at it.

## The good news: the collection layer is already done

Nothing here needs new data plumbing. Every number below is being recorded today.

| Signal | Recorded? | Rows today | Includes identity? |
|---|---|---|---|
| Profile views | Yes | 21 | **Yes**, plus where they came from |
| Post views | Yes | 144 | **Yes**, per person per day |
| Likes | Yes | — | Yes |
| Comments | Yes | — | Yes |
| Reposts | Yes | — | Yes |
| Followers / following / connections | Yes | 6 each for the founder | Yes |
| Major and year, for audience breakdowns | Yes | 6 of 8 users | — |
| Campus | Partly | 1 of 8 users | — |
| **Saves** | **No** | — | Not persisted anywhere |
| **Search appearances** | **No** | — | Not instrumented |

So the work is screens, not schema. That is a much smaller job than it sounds.

**Two things are genuinely differentiated**, and both are accidents of decisions already made:

1. **Where a viewer came from.** `profile_views` stores a referrer, and all 21 rows have one. "Someone found you from the campus map" is a different sentence from "someone viewed you", and the big networks handle this poorly.
2. **Who viewed a specific post.** Most networks discard this. You keep it per person per day.

And one is only possible because Vibe is campus-scoped: **audience breakdown by major and year.** "Twenty-three Informatics juniors saw this post" is a sentence LinkedIn cannot say.

## What ships free vs paid

**Free, public, on every profile.** Followers, connections, mutuals, posts. Visible to anyone who opens the profile. This is the social-network baseline and it is not negotiable — it is what makes the app feel normal.

**Free, private, to the owner.** The counts about you: "12 people viewed your profile this week", "your post was seen 40 times". Numbers only, no names. This is the teaser that makes the paid tier obvious.

**Paid.** The names, and the breakdowns:
- Who viewed your profile, and where they came from
- Who viewed each post
- Who liked and who commented, as a browsable list rather than a count
- Audience breakdown by major, year and campus
- Trend over time, so a spike is attributable to a specific post
- Further profile customization (definition pending)

## Build order

**1. Mutuals — DONE today (`ac0d93b`).** The visited-profile API returned the literal string "0" for every profile in the product. The math already existed and was never called. The count is honest as of this commit.

*Still open from it:* Session 55 hid the "N mutual" pill on the desktop profile because it always read zero and opened a permanently empty modal. The count is real now, so the pill should come back — but only once the modal behind it lists actual people. Two pieces: un-hide the pill, and build the "people you both know" list.

**2. Views panel honesty — DONE today (`5bc957a`).** Windowed view counts had read zero since the table shipped, because the stats route queried a deliberately private table with a client that respects that privacy. Verified live: the 30-day count went from 0 to 16. Nothing could be sold on top of a metric that always read zero.

**3. "Who viewed your profile."** The strongest hook, and the data is the richest because of the referrer. Needs: a list screen, a free/paid boundary, and a decision on retention (how far back does a paid user see?).

**4. "Who liked / commented on this."** Cheapest of the remaining screens — the data is fully attributed and already fetched in places. Mostly a matter of showing names instead of a number.

**5. "Who viewed this post."** Same shape as 3, scoped to one post.

**6. Audience breakdown.** The differentiated one. Blocked on campus adoption: only 1 of 8 accounts has a campus set, and 6 of 8 have a major. Worth building after a few real students are on, so the numbers are not embarrassing.

**7. Saves and search appearances.** Both need collecting before they can be shown. Lowest priority; do not promise them.

## Two things worth deciding before building

**Retention and the paywall shape.** LinkedIn shows the last handful of viewers free and gates the rest. The journal already sketches a version of this ("every 3 days see 3 names, rest behind paywall"). Pick the shape before building the screen, because it changes the data access pattern.

**Who actually pays.** Students have little money; clubs, orgs and recruiters have budgets. An org paying to see who viewed their page, who opened an event without RSVPing, and which majors their reach concentrates in may be an easier first sale than a student subscription. The org data model already exists. This is a suggestion, not a decision.
