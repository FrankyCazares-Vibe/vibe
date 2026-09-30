# W2-S1 notes (the screens batch, Messages home)

Branch `claude/relaxed-davinci-9d11h3`, started at `a9355d1`. The contract is
`handoffs/chat-redesign/wave-2-contracts.md` (final); the facts are
`wave-2-asis/mockups-map.md` (MK) and `messages-mobile-map.md` (MM).

## Part 1 — the first commit (serial prelude, contract 13.1)

Built alone before the three screen batches run side by side. Files (13.2):

1. `src/components/mobile/messages/v2-tokens.ts` — `palette(night)`, every token of 11.0 from MK:0.1's two columns; `SERIF`, `FONT`.
2. `src/components/mobile/messages/avatar.ts` + `avatar.test.ts` — `clubGradient(id)`, `personColor(id)` (1.4).
3. `src/lib/chat/use-chat-v2.ts` — `useChatV2(): boolean | null` (2.1).
4. `src/lib/chat/use-hide-tabbar.ts` — `useHideTabBar()` with a module-level count (11.0, SCREENS-H1).
5. `src/app/layout.tsx` line 96 only — the fonts query string of 11.0.

Gates (13.3): `npm run typecheck`, `npm test`, `npm run build`, `npx eslint <files>`.
One commit: `feat(chat): wave-2 screen tokens, hooks and fonts (W2-S1 first commit)`.

### Facts read before the first edit

- MK:0.1 palette table (Night / Light columns), MK:0.2 (club avatar gradient, person colours).
- The mockup sources hold FOUR club gradients (`145deg`): `#C23A72→#962858`
  (Salsa Club), `#1F7580→#155158`, `#337A5A→#245942`, `#8A6A22→#664C14`; and
  SIX person colours (`#2E4A5A/#CFE6F2`, `#4A3A5E/#E6D8F5`, `#5E4A2A/#F5E1B8`,
  `#5A3A2E/#FFD3C2`, `#2A4550/#CFE6F2`, `#2F4A3A/#CDEBD9`). See STOPPED.
- `globals.css`: Light `--ink-sub #5A564F` (:115), `--ink-muted #8A8580`; Night
  `--ink-muted #9C958C`; `--hairline`, `--paper`, `--cream`, `--charcoal`, `--ink-2`.
- `/api/me/features` → `FeaturesResponse = { ok: true; chat_v2: boolean }` (types.ts:177).
- `vibeRequest(url, { failure, quiet, cache })` never throws; `r.ok` branches.
- `layout.tsx:96` today: `family=Fraunces:ital,wght@0,400;0,700;0,900;1,400&family=DM+Sans:wght@300;400;500;600;700`.
- Old mounters of `vibe-composer-open` (boolean add/remove): ConversationView:150,
  GroupSettingsView:57, ComposeOverlay:43, PostComposerMobile:115, CampusMobile:2506/3968 — untouched.
- Tests: `node --test` over `src/**/*.test.ts`; pure tests import with the `.ts` extension.

### STOPPED (part 1)

- Contract 1.4 says `clubGradient(id)` picks one of "the six mockup gradients"
  and to "read MK for the six values". MK:0.2 names one club gradient (Salsa
  Club) and the mockup sources (`boards/W0_*.dc.html`) hold FOUR club
  gradients in all, not six; six is the count of PERSON colours. Built with the
  four real club gradients (no invented values) and the six person colours.
  Two more club gradients are a design decision, not this batch's.

### Log
- 2026-09-30T07:46:27Z notes written; starting v2-tokens.ts
- 2026-09-30T07:46:27Z v2-tokens.ts written
- 2026-09-30T07:47:01Z avatar.ts + avatar.test.ts written
- 2026-09-30T07:47:41Z use-chat-v2.ts, use-hide-tabbar.ts written; layout.tsx:96 fonts line replaced (one line)
- 2026-09-30T07:47:50Z layout.tsx:96 re-written with node after a sed & mishap; diff is the one line
- 2026-09-30T07:49:49Z gates: typecheck 0, npm test 1580/1580, build 0, eslint 0 errors (layout.tsx warning pre-existing on a9355d1); S1-gate.md written; committing
