# Roadmap update, Tuesday Sept 29 — final change list (NOT published yet)

Built from the live page's own saved copy (version 13/14), with Franky's review applied. 23 changed spots against the live page. James's card, Rylan's card, the timelines and every count except "days to launch" are untouched.

File to publish: `page-final.html` (same folder).

## A. Dates

- Cover, top line · "Updated Monday September 28, 2026" → "Updated Tuesday September 29, 2026"
- Cover, Days to launch · 33 → **32**
- Chapter 1, "Since the Sept 26 meeting" label · "Updated Mon Sep 28" → "Updated Tue Sep 29"
- Chapter 3, heading · "Thirty-three days, four dates that don't move." → "Thirty-two days, four dates that don't move."
- Chapter 4, intro · "updated Sept 28" → "updated Sept 29"
- Sources, end of the last paragraph · added: "Updated Tuesday September 29: what shipped Sept 28–29, the tagline, and the club chat redesign with its dates. The counts are still the Sept 28 ones; only "days to launch" moved."
- Kept: the five other counts and the note "Recounted from the live database on Monday September 28, 7 pm."

## B. f10 is done

- Chapter 4, Franky's list · task f10 ("Get the website ready for our first post", Sat Oct 3) → removed.
- Chapter 1, "Since the Sept 26 meeting", left column · new last line:
  > **The website is ready for our first post** (done Sept 28): the product journal is off the public site, link previews show the new tagline, and there's a share image.
- Chapter 7, "Where it stands" · "Before the first post, Franky takes the product journal off the public site and fixes the link preview (task f10)." →
  > The website is ready for the first post: the product journal is off the public site and link previews show the new tagline.

## C. The tagline is picked

- Chapter 2 · the "two finalists … Franky picks by Fri Oct 2" paragraph →
  > **Tagline, picked (Franky, Sept 28):** "Your campus. Your people. Yourself." It already shows in link previews and on the share image.
- Chapter 1, "Settled" line · "Franky picked two tagline finalists (Chapter 2)." → "The tagline is picked: "Your campus. Your people. Yourself." (Chapter 2)."
- Chapter 12, table · the row "The tagline · Franky picks by Fri Oct 2 …" → removed (it's decided).
- Chapter 12, heading · "Two product calls, then twelve quick ones." → "…then eleven quick ones."
- The "profile" version of the tagline is off the page (Franky's call).

## D. Shipped since Sept 28

- Chapter 1, right column · "Night mode is live too; everyone starts in Light for now." → removed from the first line, and a new line added under it:
  > **New Sept 28–29, all live:** club officers can delete a club post, and edit or cancel a club event; everyone who RSVP'd gets a notice from the club. Night mode is on every page, and the app now follows your phone's own light or dark setting. On a computer, Vibe has one top bar, in school colors.
- Chapter 1, last sentence · "Next in the app: Night mode on the older pages, and officer tools for clubs (…)." →
  > Night mode and the officer tools are done. Next in the app: the club chat redesign (Chapter 4).
- Chapter 12, "Recommended order" · "after the officer tools already next in line, the member list…" → "after the club chat redesign (Chapter 4), the member list…" (rest unchanged)

## E. Android (f9)

- Chapter 4, task f9 · "First step: install Android Studio on the Mac" →
  > **Build the Android app once.** It has never been built. Android Studio is installed on the Mac (Sept 29); next is its first-time setup, then the first build

  Date unchanged: By Fri Oct 9.
- Chapter 1, The phone app · "The project is set up; the first step is installing Android Studio." →
  > **Android has never been built.** The project is set up and Android Studio, the tool that builds it, is installed (Sept 29); the first build comes next.

## F. The club chat redesign

- Chapter 4, Franky's list · new task **f12**, flagged "New", in f10's old spot, dated **By Thu Oct 15**:
  > **Rebuild club chat so it feels like Vibe, not Discord.** Each club gets a Board (officers post news) and a Lounge (members talk), every event gets its own chat for the club members who RSVP'd, and polls, sign-ups and RSVPs work inside the chat. It lives in Messages, with "Your week" (the events you RSVP'd to) on top. **Week of Oct 5–9:** on for the three of us and SAE, so demo days can show it on SAE. **Oct 10–14:** event chats and polls. **No chat changes after Thu Oct 15,** so Apple's reviewer sees one steady app when we submit Oct 16. On for everyone Mon Oct 26, when doors open. On a computer, chat stays as it is today until after launch
- Chapter 5, Week 2 (Oct 5–11), Franky's lane · new line:
  > **New club chat on for the three of us and SAE** (Board, Lounge, "Your week" in Messages), so demo days can show it on SAE
- Chapter 5, Week 3 (Oct 12–18), Franky's lane · new line, just above "Submit to both stores by Fri Oct 16":
  > Event chats and polls done by Wed Oct 14. **No chat changes after Thu Oct 15,** so Apple's reviewer sees one steady app
- Chapter 5, Week 5 (Oct 26–31), Franky's lane · new line:
  > New club chat switched on for everyone Mon Oct 26, when doors open
- Chapter 11, "Not yet" · "No big new features before launch beyond the club asks in Chapter 12" →
  > No big new features before launch beyond the club chat redesign and the club asks in Chapter 12

  (rest of the sentence unchanged)

## G. Supabase Pro

- Chapter 12, table, Supabase Pro row, third column · "Yes, now. It closes the photo takedown gap (task f11) and stops people signing up with passwords already leaked online." →
  > Not yet (Franky, Sept 28); f11 waits on this call.

  The question and the "about $25 a month" stay. Task f11 itself is unchanged.

## H. Changed since the first draft (Franky's review)

- **Task r9 removed** (the SAE heads-up on Rylan's list). Reason: SAE's page has one member today, its owner, and that is Franky; nobody new can read the old messages. No replacement line. Rylan's card is now identical to the live page.
- f12 and Week 5: "at launch" → "Mon Oct 26, when doors open".
- f12: event chats are "for the club members who RSVP'd". The phrase was only in f12, not in any week lane.
- Chapter 11 and the Supabase Pro row: as in F and G above.

## I. Left alone on purpose

- James's tasks and card, and Rylan's tasks and card: identical to the live page.
- The two timelines and the logo (the drawings): not touched.
- SAE is still "Franky's test page", Clubs signed is still 0. No equity or ownership wording added.
- The page's "New" flag is drawn in James's blue, so f12 carries Franky's coral written on the task itself; the page's stylesheet is unchanged.

## J. Validation results

Run on `page-final.html` against the live page's saved copy (`validate.py page-final.html diff-final.txt f10,r9 f12`):

```
checking page-final.html
PASS · JSON in #page-source parses
PASS · .page equals the HTML inside <div id="doc"> · 69176 chars
PASS · JSON text uses the original's convention (\u003c for every <, other characters as-is)
PASS · no raw < and no </script inside the JSON text
PASS · title + fonts link unchanged
PASS · #page-style unchanged
PASS · #page-app unchanged
PASS · no publish-time wrapper in the file
PASS · element ids unique in the page · 50 ids
PASS · task data-ids unique · f2, f3, f4, f5, f6, f9, f12, f11, f8, j8, j2, j4, j5, j6, j7, j9, r1, r2, r3, r4, r5, r6, r7, r8
PASS · every task: input id, data-id and label 'for' agree
     task ids removed: ['f10'] · added: ['f12']
PASS · tasks expected gone are gone (f10,r9) and expected present are present (f12)
PASS · no data-editable / contenteditable / data-dirty baked in
PASS · tags open and close in order
PASS · SVGs unchanged · 3 SVGs
PASS · James's card unchanged
PASS · cover counts: only days-to-launch changed · 20 / 14 / 0 / 0 / 0 / 32
PASS · recount note unchanged
PASS · no equity / ownership wording in anything added
PASS · 'Clubs signed' still 0 and SAE still a test page
     diff (split on '>'): 23 hunks, 41 pieces removed, 53 pieces added
RESULT: all checks passed
```

- **The rebuild recipe is exact:** putting the ORIGINAL page text through the same rebuild gives back the original file, character for character. So the only differences in the final file are the edits listed above.
- **The diff against the ORIGINAL live page** (page text split on `>`) is in `diff-final.txt`: 23 changed spots, each one listed in sections A to G. Nothing else.
- **Rylan's card** is identical to the live page (checked separately); "r9" and "owner of SAE" appear nowhere in the file.
- **Browser check:** the first draft was opened in a real browser (no sideways scroll at 375 or 1100 wide, three columns intact, text survives the browser's own reader unchanged). The final file was NOT re-opened in a browser: the preview pane was full with other work's tabs and I left those alone. The final differs from that checked draft only by plain wording and the removal of the r9 block; its tag sequence equals the checked draft minus r9, and the new wording has no characters a browser would rewrite. Worth one scroll through Chapters 1, 4, 5, 11 and 12 after publishing.
- **One side effect to know:** editable text blocks go from 373 to 375, so anyone holding unsaved Edit-mode changes on the old version won't be offered "Bring them back" after this publish. Save or note any open edits first.

Working files in the folder (`extract.py`, `edits_a.py`, `edits_b.py`, `build.py`, `build_final.py`, `validate.py`, `orig-*.html`, `part-*.html`, `*-page-inner.html`, `diff*.txt`) are not for publishing. `page-new.html` and `changes.md` are the first draft, replaced by the two final files. The `preview-*-local-only.html` files include the publish-time wrapper: do not publish those.
