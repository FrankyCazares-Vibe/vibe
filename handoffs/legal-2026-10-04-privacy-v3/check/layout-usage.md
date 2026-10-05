# Layout pieces for the policy page: how to use them

All seven layout pieces are in place in the two files I own, and the current page.tsx and sections-*.tsx still compile and render (they now show the new question headings over the old v2 text until they are replaced). Nothing committed.

THE TWO IMPORT LINES (everything the six agents need)

import { LegalCallout, LegalLayout, LegalOL, LegalP, LegalStartHere, LegalTable, LegalToc, LegalUL } from "@/components/legal/LegalLayout";
import { Mail, PageLink, Sec, SECTION_LINKS, SectionH2, SubH3, WaitlistSection } from "./parts";

HOW TO USE EACH PIECE

1. Section heading (h2, id="section-N"). Titles are the fifteen question headings, held once in parts.tsx.
   <SectionH2 n={5} />
   <LegalTable head={[...]} rows={[...]} />
   <LegalP>The Vibe team and the cofounder with direct access can see more…</LegalP>

2. Lettered sub-section heading (h3, id="section-3a" … "section-5i"). The 17 titles are also held in parts.tsx, so pass only the key.
   <SubH3 n="5h" />
   <LegalP>Messages are not end-to-end encrypted. …</LegalP>
   <LegalP>… in <Sec to="5h">section 5h</Sec>.</LegalP>

3. Links to a section. `to` is now type-checked: "1" to "15", "3a" to "3h", "5a" to "5i". Anything else is a compile error, so a range like "5b to 5g" needs two Secs.
   <Sec to="8">Sections 8</Sec> and <Sec to="9">9</Sec>

4. Lists. `<LegalUL bullets>` and `<LegalOL>` nest with no extra props. Write an item's first words straight in the `<li>`, then any `<LegalP>`, `<LegalUL bullets>` or `<LegalOL>` after them; the list sets the spacing and keeps the indent. Bullets inside bullets come out hollow.
   <LegalOL>
     <li><strong>Vibe can read messages, and does so only in six cases:</strong>
       <LegalUL bullets><li>when one is reported;</li><li>…</li></LegalUL>
       <LegalP>This is our own rule, not a lock. …</LegalP>
     </li>
   </LegalOL>

5. Tables. Same props as before. A cell that is a JSX element needs a `key` or a fragment wrapper, or eslint fails (react/jsx-key).
   <LegalTable
     head={["Write to", "For"]}
     rows={[[<Mail key="hello" box="hello" />, "Questions about Vibe…"], ["Your sign-in email", <>Only you (<Sec to="3a">section 3a</Sec>)</>]]}
   />

6. "Start here" block with the "Two words to know" line (new, plain, no box).
   <LegalStartHere id="start-here" title="Start here"
     items={[{ question: "Who can see what I post?", answer: <Sec to="5">Section 5</Sec> }, …]}
     note={<><strong>Two words to know.</strong> When this policy says …</>} />

7. Section 11 with both anchors (new). It draws the heading itself, so do NOT also put `<SectionH2 n={11} />` inside.
   <WaitlistSection>
     <LegalP>Joining the waitlist does not make an account, …</LegalP>
   </WaitlistSection>

8. Unchanged: `<LegalToc items={SECTION_LINKS} />`, `<LegalCallout id="short-version" title="The short version">`, `<Mail box="hello" />`, `<PageLink href="/settings">Settings</PageLink>`, LegalLayout, LegalP.

Worked examples of every shape (short version item 4, 3d's error-report bullet, the Anthropic entry, section 9's step 3, the section 5 and club-rooms tables, Start here, WaitlistSection) are in /private/tmp/claude-501/-Users-franciscocazares-vibe/95993665-d589-438f-acb8-267060730d7e/scratchpad/privacy-v3/apply/layout/sample-a.tsx and sample-b.tsx. They import parts through "@/app/legal/privacy/parts"; a section file uses "./parts".

WHAT CHANGED UNDER THE HOOD

- Tables stack under 480px: left cell as a bold line, right cell under it. The header row stacks the same way ("What" bold, "Who can see it" under it) and reads as a key. From 480px up it is the same two-column table as before.
- The stacking and the nested-list spacing need CSS that an inline style cannot express, so LegalLayout.tsx now carries one small style sheet. Only marked lists and tables render it, so the other legal pages are served without it.
- The marked-list spacing rule uses one `!important`, because LegalP sets its margin inline.
- Two things I added that were not asked for:
  - A two-column table is no longer a keyboard tab stop. It can never scroll sideways now, so the stop did nothing. Tables with three or more columns keep it.
  - Mail and PageLink links can break mid-word when they would otherwise stick out of a narrow column (seen at 320px with connectvibe.app/legal/delete-account three lists deep).

Stills and test scripts are in /private/tmp/claude-501/-Users-franciscocazares-vibe/95993665-d589-438f-acb8-267060730d7e/scratchpad/privacy-v3/apply/layout/ (before/, after/).

## Checks the layout agent ran

Ran against the dev server at localhost:3105 with Playwright; nothing was committed, and the server and Supabase were not touched.

- Typecheck: `tsc --noEmit` on the whole release passes. Midway it showed three errors in src/lib/sentry-config.ts (another agent's file, not touched); they were gone by the final run.
- Lint: eslint passes on LegalLayout.tsx and the whole privacy folder. The fixtures also pass when linted as if they were section files.
- Other legal pages unchanged: terms, community, child-safety, delete-account and support were captured before and after at 375 and 1280, Light and Night. All 20 have the same structure and no style sheet, and 19 stills are byte-identical. The one that differs (terms, Light, 375) differs only in the Next.js dev badge, which read "Compiling" in the before shot.
- Existing shapes unchanged from 480px up: the old LegalLayout (from git HEAD) and the new one rendered the same flat bulleted list, a ten-item numbered list, the callout and two tables. Stills are byte-identical at 480, 600, 768 and 1280 in both themes.
- No sideways scroll: the fixture built from the real components showed scroll width equal to viewport width at 320, 360, 375, 430, 479, 480, 600, 768 and 1280, with no element past the right edge.
- Stacking boundary: stacked at 479, two columns at 480. The live page's section 8 table stacks at 375.
- Nested lists: looked at stills at 375 and 1280 in both themes for all the required shapes. Also tried an item that starts with a LegalP by mistake and a list three levels deep; both render correctly.
- Anchors:
  - Live page with the current sections-11-15.tsx: #waitlist and #section-11 land on the same scroll position at 375 and 1280, with no duplicate ids and no dead in-page links.
  - Fixture: WaitlistSection lands both anchors on the same spot, and #section-3d, #section-5e and #start-here land 24px below the top.
- Screen readers: at 375 the stacked table still exposes table, row, columnheader and cell roles in Chromium's accessibility tree.
- Style sheet delivery: one copy in the head on a full load. On a client-side move from /legal/terms to /legal/privacy it arrives and the table stacks; the console is clean.

Not run: `next build` (the dev server is using the same folder) and any browser other than Chromium.

## Notes

Nothing from the seven items is left open. Things the next agents or the orchestrator should know:

- page.tsx and the five sections-*.tsx still hold the v2 text; I did not touch them. Until they are replaced, the live page shows the new question headings and "On this page" list over the old wording, and its sub-section headings are still the old hand-written `<LegalH3 id="section-3a">` ones.
- The sub-section titles now live in parts.tsx (SUBSECTION_TITLES) alongside the section titles. If the wording pass changes a heading in privacy-policy-final.md, the edit goes in parts.tsx, not in a section file. I checked the headings against privacy-policy-final-r3.md as well; the two files were identical when I read them.
- Quotes in the section 2 title are curly (“verified”), as the page already did, where the markdown has straight ones.
- "Start here" answers sit in a right-hand column; on a phone a long question pushes its answer to the next line, still right-aligned. That was my layout choice and is easy to change in LegalStartHere.
- The header row of a stacked table is kept and stacked rather than hidden. If the founder prefers it hidden on phones, it is a one-line change in LEGAL_CSS.
- Not verified in Safari or Firefox, and not in a production build.
