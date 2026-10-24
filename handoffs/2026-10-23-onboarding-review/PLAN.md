# First run: sign-up, onboarding and the campus tour (S81, Oct 23, 2026)

Franky's brief: introduce Otto first, then the feed, then the things on the right and left; a world where things
grow into being, not everything on screen at once. Mentors: Parker (belonging; events and club updates beat the
feed), Eli (Vibe is app number six, so pay off before asking for anything).

This is the merged plan: the director's pick (`director-recommendation.md`) with every fix from the attack
(`critique.md`) applied. The code maps are `map-*.md`; the three designs are `design-*.md`.
**Status (Sat Oct 24): APPROVED.** Franky took all nine recommendations ("Go with all nine onboarding
recommendations ... and start Deploy A in a new session"). **Deploy A SHIPPED Sat Oct 24 (main 3653178, merge d676ed5;
`deploy-a-shipped.md` in this folder)**, plus a one-word fix that makes the tour spotlight actually cut its hole.
Franky re-runs his live sign-up test on it. Deploy B follows on Mon Oct 26 with an off switch, or moves to week 1.

## What's wrong today (short)
- **Everything shows at once.** A newcomer's computer Campus page has the feed, Tonight, Your clubs, My Calendar,
  the Otto orb and every tab on first load; nothing grows from what they do.
- **Four asks before any payoff.** Hello, campus, a nine-field profile (several fields from the LinkedIn era:
  "what you're building", Skills, "Showing my work"), then a photo. Clubs come fifth of six.
- **The tours ask instead of show.** The computer tour opens by asking for a photo; the phone tour ends by asking
  for a post. Neither points at Tonight, Your clubs, the Otto orb or the Otto tab. The phone tour names a Chat tab
  that no longer exists, and "Otto threads the right matches in" promises the AI agent.
- **Club-link guests are never told about their club** until after Finish, and their campus tour fires days later,
  out of context.
- **Skip on step 1 can finish with no campus**, which leaves "Pick your campus" and no club creation.
- **The shared laptop:** on a computer the second person never gets the tour (the phone doesn't have this bug).

## The first run, beat by beat
**Onboarding (both devices, six steps stay until week 1)**
1. Sign-up and code: no change.
2. Hello: Otto first, as today. "i keep an eye on campus: what's on tonight, which clubs are meeting, who's here. a
   few quick things and it's yours." Note: "about two minutes: your campus, your name, a photo, then your clubs and
   people."
3. Campus: same. Skip is gone on steps 1 and 2; on a computer a quiet **Sign out** takes its place there (the
   computer has no other way out).
4. Name: "what should your clubs call you?" Name and handle only; the other fields fold under "Add more about you
   (optional)". "Showing my work" stays inside the fold until week 1 (cutting it now drops saved answers and breaks
   `looking-for.test.ts`).
5. Photo: same screen, softer line.
6. Clubs: "find your clubs" / "Follow a club to get its updates and events. Join the ones that let you."
7. People: "students at {campus}. follow a few so you know who's here." Keep the IU-and-Purdue line for Indianapolis.

**First Campus visit, computer: the world grows in**
8. Quiet arrival: top bar, left menu, the feed and the Otto orb. Both side columns are held (invisible, inert, still
   taking their space, so the feed never moves). The hold is decided **before the first paint** by a tiny script
   beside the theme script, so nothing flashes.
9. Otto (bubble on the orb): "Hi again. I'm **Otto**." / "I live down here. Click me for what's new and your messages."
10. The feed (bubble on the feed's first screen, not the whole column, so the page doesn't scroll away):
    "This is {campus}, **live**." / "What students and clubs here are posting. Clubs and people you follow come first."
11. **Right side grows: Tonight** (rises 8px and fades in on the soft spring as the bubble appears):
    "What's on **tonight**." / "School and club events at {campus}, tonight and this week."
12. **Left side grows: Your clubs** (or, on 1100-1399px laptops, the folded Your clubs strip above Tonight; below
    that, the tabs): "Your **clubs**." / "Every club you follow or join posts its newest Board update here." The last
    button is **"Show me clubs"**, which opens the clubs tab.
13. Ways out, each shows everything at once: Done, Skip tour, the tour script failing, a 4-second ceiling, a tab change.

**First Campus visit, phone (no floating Otto)**
14. Three bubbles: the **Otto tab** ("This tab is me: what's coming up and what's new for you. Messages is right next
    door."), the feed (same words), the tabs ("Clubs and events, one swipe over."). The dead Chat line and the post
    ask go. The keep-your-account email card waits for the welcome visit on both devices.

**After the tour: growth from real actions**
15. Already true: follow a club on the clubs tab and it appears in Your clubs. Week 1: the new row pops in once, My
    Calendar grows after the first RSVP, Otto asks for a photo after the first follow.

## Build list
**Deploy A, by Sat Oct 24 night (about 7 h):** onboarding words; profile folds to name and handle; Skip hidden on
steps 1-2 with Sign out on the computer; the new computer tour (Otto, feed, right, left, "Show me clubs", empty steps
dropped, the phone's start rule so the shared laptop works); the phone tour; the email card waits. Then Franky
**re-runs his live sign-up test** on the new flow, since the CS club and SAE links go out this weekend.

**Deploy B, Mon Oct 26, with an off switch (about 6-7 h):** the quiet arrival: the pre-paint hold, `inert` columns,
the Tonight panel and the folded strip held separately, the reveal tied to Otto's bubbles, and the column height
limit tested at 1200 and 1440px with a short window. **If Monday night is red, it moves to week 1**; the new tour
alone still follows Franky's order.

**Optional, only if both are green:** Otto's hello names the club for members' link guests (officers on a setup
link get their own line); the onboarding exit drops its blur and the frame uses a colour token.

**Week 1 (Nov 2-8), about 55 h:** the reorder (Hello and Campus, then name, then clubs); club-link guests see their
club pinned first; the "Your campus so far" checklist on Otto; live growth (new club row pops); a phone Your clubs
row; Otto "goes home" in place of the hyperdrive; the tour engine on tokens, springs, Escape and focus; phone
onboarding on tokens and springs; retire "Showing my work" everywhere; first-visit club follows and day-7/day-30
returns, counts only (a database change and a Privacy Policy check, Franky's yes).

No production database change before the freeze. Nothing new is stored, so the Privacy Policy doesn't change.

## Questions for Franky (each with a recommendation)
1. Sides grow in only on the first visit, as Otto names them? **Yes.**
2. Tonight (right) first, then Your clubs (left), ending on clubs? **Yes.**
3. "Show me clubs" opens the clubs tab? **Yes.**
4. Fold the optional profile fields before the freeze? **Yes.**
5. Otto's hello names the club: before the freeze if both deploys are green, or week 1? **Only if green.**
6. Week 1: name before clubs (so officers don't see "Member" join)? **Yes.**
7. Week 1: rename the "Orgs" tab to "Clubs"? **Yes.**
8. Count first-visit club follows and day-7 and day-30 returns, counts only? **Yes, in week 1.**
9. Who builds it: the busy club page session owes event covers and three other items by Tue. **A new session**, in its
   own worktree, Deploy A first.
