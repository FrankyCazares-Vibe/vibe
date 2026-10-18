# Session 78 close (Oct 18, 2026): what shipped, and Franky's order for session 79

Read this first in session 79. The two longer session-78 records stay valid
for detail: `2026-10-16-session-78-rate-limits-follow-wording.md` (rate limits,
follow wording, the club model) and `2026-10-14-session-78-usage-stats-feed-delete.md`
(usage stats, delete from the feed). Marketing: `2026-10-14-marketing-video-from-code.md`.

**Where things stand.** Main is `df2a865`, deployed. 3,027 tests. Privacy
Policy dated October 18, 2026 (page = text, 1,215 sentences).

## START HERE — Franky's order (Oct 18)

1. **The app motion pass, first.** Franky put it after usage stats and rate
   limits; both are done. The rules, from his transcripts 6-8 (memory
   `project_video_from_code.md`): springs, not fixed timings (Motion is
   installed); animate transform and opacity only; little blur, never on big
   surfaces; respect reduced motion; Franky judges the feel on a real phone
   (sessions only see stills). Candidates from S78: post opening into the
   viewer, the tab underline sliding, sheets that drag to close, press
   feedback, a like burst, feed items fading in, skeleton → content
   crossfades, page transitions (check the Next docs in node_modules first).
   Bring Franky a short list to pick from, then build.

2. **The desktop main feed's empty side space (from the Kaki meeting).**
   Franky: "incorporate more on the main feed desktop side of things, we have
   a lot of empty space on the side we could utilize." Kaki's lens (memory
   `project_kaki_meeting.md`): orgs running themselves through Vibe deserve
   priority, keep it simple, campus-first, every feature must make the campus
   experience better. Ideas to bring him (his call which): clubs you're in
   and their next event, what's happening on campus tonight (item 3), new
   clubs to follow, announcements from clubs you follow (the Board), the
   Otto panel's place. Mock first, then build.

3. **"What's the vibe tonight?" — school athletics on the Campus page and/or
   Events.** At the very top or to the side of the main Campus feed, in the
   Events page, or both: the school's athletic events this week or tonight,
   with **who's playing who, where, and what time**. **No chats** in it.
   This is also the start of a partnership story with the school and its
   athletics (see item 4). To work out before building:
   - **Data source:** IU Indianapolis Jaguars (Horizon League) publish their
     schedules; check for a calendar feed (many athletics sites offer .ics or
     an API) rather than scraping, and the site's terms. Purdue Indianapolis
     has no varsity teams of its own to check for; confirm.
   - **Brand rules:** "Jaguars" is IU athletics only (marketing CLAUDE.md);
     school logos and marks need permission (campaign gate G11 says no school
     names until the lawyer answers). Start with plain text (team names,
     time, place) unless a partnership gives permission.
   - **Placement:** the desktop side space (item 2) is the natural home; on
     the phone, a compact card above the feed or in Events.
   - **Privacy:** schedule data only, nothing about people; no policy change
     unless something new about a person is collected.

4. **Research (Franky asked for it): sponsor money and advertising for Greek
   life and clubs, and partnerships with the school and athletics.**
   - Fraternity, Panhellenic (sorority), club and org **sponsor money**: who
     pays today and how much (national HQs, foundations, insurers, housing
     corporations, local businesses).
   - Kaki's example: **how much fraternities (and their nationals and
     insurers) spend on anti-hazing / prevention messaging and ads**, and
     whether that budget could pay for safety, education or event tools on
     Vibe.
   - **The school and athletics:** money or partnership routes (student
     affairs, student government funds, athletics marketing, ticketing and
     attendance goals, sponsorship of student-section campaigns).
   - Output: a plain-English doc for the three founders with sources, rough
     numbers, who to contact, and a recommendation per route. Ask Franky
     before launching a large research run (his standing rule).

5. **The pipeline tracker** (outreach, demos, prospects) when Franky gives
   the detail.

6. **Wave 4 of the security work:** the abandoned-upload sweep in
   count-only mode before launch; deleting and closing direct database
   writes after launch. Notes in the S78 part-2 handoff.

7. **Feed speed, second half,** once Sentry has more phone readings (one
   iPhone load at 8.3 s LCP with a fast server; the animated bloom shipped in
   the same release and is a suspect).

## Owed by Franky

1. **Two uploads on his phone** (a chat photo, and a video or photo post) to
   confirm the Wave 1 file-type lock. If one fails, revert the upload part of
   `0b9bc7e`.
2. **Cloudflare (1 minute):** R2 → `vibe-clips` → Settings: Public
   Development URL disabled, Custom Domains empty; note any lifecycle rules.
3. **Test the club model with a second account:** follow SAE and read its
   Board (no composer), hide a club and a title on your profile, give a
   member a title, leave a test club with "keep following", and look at Clubs
   in Portfolio (phone) and the side card (desktop).
4. **Delete from the feed** on a real phone; open admin > **Usage** on the
   live site.
5. **Share** the access-codes doc with James and Rylan (private until shared):
   https://claude.ai/code/artifact/29e21dab-ca4b-40ca-a838-4c2f11b29c92
6. **Marketing:** retake the practice screens on an Indianapolis campus
   (campaign gate G7, due Oct 18) and pick the teaser's opening line.
7. **Older:** the live sign-up test (Inbox or Junk), Terms v3, the lawyer
   file and a DMCA agent (James), the LLC postal address, Sentry's "Prevent
   Storing of IP Addresses", the Supabase Auth switches, two-step sign-in.
8. **Decided Oct 18:** no section 13 notice to account holders for now.

## What shipped in session 78 (one line each)

| Commit | What |
|---|---|
| `d3bffb9`, `21009d7` | Usage tab (counts only) and the day-total counter; "active now" only where 5+ others are on and 5+ are not |
| `9267809` | Delete your own post from the phone feed |
| `0b9bc7e`, `c06b304`, `d7fe8b2` | Rate limits and upload caps waves 1-3 (type-locked uploads, no IP in the limiter, 3-day purge, signed-out caps, 46 budgets, views capped in SQL) |
| `81a155d` | People: Follow → Following ✓ → Follow back → Connected ✓ |
| `ddf52e7` | The club model: verified followers read the Board, members take part, clubs on profiles, mute, leave, titles, request without following |
| `df2a865` | Clubs in Portfolio (phone) and a side card (desktop) |
| marketing | HyperFrames set up, a 15 s test ad (not safe to post yet) |

## Known gaps (not urgent)

- Any signed-in account can read the whole directory through the database's
  REST interface (`users_select_authenticated`).
- The Otto "Connections" tile can never fill (five places, phone, desktop and
  static).
- The heartbeat's old-way fallback can be removed now that production has
  `usage_touch`.
- Desktop composers still show raw error text (S76 leftover).
- Store-app work stays parked until Apple accepts.
