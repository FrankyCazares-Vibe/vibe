# Club tools on a phone: the Inline tray (Oct 23, 2026)

Franky saw six phone mockups on the canvas (claude.ai/artifact/Aoee3QoLVqJ92Gts9Vuf6f, row "Club tools on a
phone"; boards PhoneA-F). The first three "felt too large and overtake the screen too much". Of the smaller
three he picked **E, the Inline tray** (board `PhoneE.dc.html`; its render is the scratchpad
`tools-board/shots/PhoneE.png`), and: **"Also drop the Board switch from officers' ⋯ menu."**

## What ships
**Phones only** (the club page outside the app frame, `!framed`, for the owner and officers). Computers keep
the Arc exactly as today; a computer window under 900px keeps today's Club tools pill (it brings out the Arc).

1. **The row's Club tools pill becomes a toggle** (not a link). Pressed look while open (coral-tinted face,
   coral ring), a chevron that flips, `aria-expanded` + `aria-controls`. The coral count of waiting join
   requests sits on the pill's small planet when there are any (`planetCount`), the pill's name is
   `planetLabel(...)` ("Club tools, 1 wants to join").
2. **The tray opens right under the row, INSIDE the page** (no overlay, no dimming), pushing Finish setting
   up and the rest down. A rounded glass panel in the page's column (dark, like the Arc's cards; the page is a
   Night island already), a small pointer up to the pill. It holds:
   - **Needs you** (only when someone is waiting): the oldest request: initials, name, "wants to join",
     **Approve** (coral) and **Decline**, the same calls and refusals as the Arc's Join requests card. When
     more than one wait: "and N more" goes to the Join requests card. Nothing when nobody waits.
   - **The seven tools** as small tinted bubbles with their names always shown, in a 4 + 4 grid whose eighth
     cell is **All Club tools** (`/orgs/<h>/tools`). Order, names, tints and count chips as the Arc
     (`ARC_TOOLS`, `chipText`, `bubbleLabel` in club-tools-arc.ts). A hidden club shows what the Arc shows
     for one.
   - **A tool's card opens inside the tray** in place of the grid (the tray grows only as much as the card
     needs): the SAME card components the Arc uses (`RequestsCard`, `MembersCard`, `FollowersCard`,
     `OfficersCard`, `EventsCard`, `SettingsCard` (its Edit page row), `InviteCard`), with `onPanel`
     undefined so their footer links go to the phone's Club tools pages. The card's × goes back to the grid
     and focus returns to that tool's bubble.
3. **Closing:** tap the pill again, or Escape (a keyboard): from a card back to the grid, from the grid shut,
   focus to the pill. When the tray closes after something changed (an approve, a follower removed), the
   page is read again (`router.refresh()`), as the Arc does.
4. **Keep it in view:** when it opens (and when a card opens), if the tray's bottom sits under the phone tab
   bar (`.vibe-mobile-tabbar`, about 84px with the home indicator), scroll the page by the difference
   (smooth, or instant with reduced motion). Never scroll it out of view upward.
5. **Motion** (springs.ts, transform and opacity only): the tray settles in from the pill (opacity + a small
   y and scale from the top), bubbles pop in staggered, the card swaps in sideways like the Arc's
   (`AnimatePresence mode="wait"`). Content below the tray moves instantly (no height animation). Reduced
   motion: fades only (MotionRoot already sets `reducedMotion="user"`).
6. **⋯ menu:** officers no longer get "Stop followers reading the Board" / "Let followers read the Board"
   (Club settings has that switch on phone and computer). Mute posts and Leave club stay as they are; the
   leave confirm still reads the Board switch for its line. Remove the dead toggle code in OrgMenu.

Not changed: computers (the Arc, the Campus bar), the `/orgs/<h>/tools` pages, members' and visitors' rows,
the Edit page button (hidden, mounted; Club settings opens it). No database change. No Privacy Policy change.

## Interfaces (builders work in parallel against these exactly)
- **B1** `src/app/orgs/[handle]/club-page/use-join-requests.ts` (NEW, client hook), extracted from
  `RequestsCard` (ClubToolsLauncherRequests.tsx), which then uses it with no change in behaviour:
  ```ts
  export function useJoinRequests(opts: {
    handle: string; clubName: string; enabled?: boolean;          // enabled false: no read
    onCount?: (n: number) => void; onChanged?: () => void;
  }): {
    rows: RequestRow[] | null; failure: LoadFailure | null; busy: ReadonlySet<string>;
    act: (row: RequestRow, action: "approve" | "deny") => Promise<void>;
    retry: () => void;
  }
  ```
  (`RequestRow` from wherever it lives today; export it from the hook's file if it must move.)
- **B2** `src/app/orgs/[handle]/club-page/ClubToolsTray.tsx` (NEW, client; split into
  `ClubToolsTrayParts.tsx` if long):
  ```tsx
  export function ClubToolsTrayRow(props: {
    before: ReactNode;   // + Post (when not hidden) and the hidden Edit page button
    after: ReactNode;    // the share square (absent on a hidden club)
    club: ArcClub;       // from ClubToolsLauncherCards.tsx
    counts: ArcCounts;   // { requests, members, followers }, each null when unknown
  }): JSX.Element
  ```
  It renders `<div className="vibe-club-actions">{before}<the toggle/>{after}</div>` then the tray.
  Edit page from the Settings card: `openEditPage()` (club-tools-launcher.ts; the hidden button registers it),
  falling back to `router.push(<club>?edit=1)`. Invite from the Invite card: `OrgInviteSheet` as the Arc does
  (phone presentation). The roster cache (`RosterRead`) is the tray's own ref, cleared when it opens.
- **B3** `src/app/orgs/[handle]/page.tsx` (officers && !framed: render `ClubToolsTrayRow` in place of the
  row, `before` = RowPostButton (not on a hidden club) + EditPageButton, `after` = SharePageButton compact (not
  on a hidden club); everyone else unchanged), plus the ⋯ change: `src/lib/orgs/join-copy.ts`
  (`orgMenuItems`), `src/components/orgs/OrgMenu.tsx`, and their tests (`src/lib/orgs/join-copy.test.ts`
  and any other test that expects the officers' readers row). globals.css only if the tray needs a rule.

## Checks
`npx tsc --noEmit -p .`, eslint on touched files, `npm test`, and the club-page tests run by hand
(`cd "src/app/orgs/[handle]/club-page" && node --test *.test.ts`). Then a walk at 390 (phone UA), Night and
Light, as officer (Maya) and member (Blake): pill toggles the tray, Needs you approve works (local only; put
the data back), each bubble opens its card and × returns, All Club tools goes to the page, Escape, the tray
stays above the tab bar, the ⋯ has no Board row for officers; and at 1440 the Arc is untouched.
