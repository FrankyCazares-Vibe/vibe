# W2-S1 contrast (contract 11.0: every text under 18px at ≥ 4.5:1 in both themes)

Every colour pair on the wave-2 Messages home (`messages/home/*`, the flag
fork's bare header reuses today's chrome and is not new), once, with its WCAG
2.x ratio in Night and Light. Computed by a node script over the tokens of
`messages/v2-tokens.ts` (`palette(night)`) and the app's `globals.css`
values they resolve to: Night `--cream #0C0B0B`, `--charcoal #F6F1EA`,
`--ink-2 #CFC8BE`, `--ink-muted #9C958C`, `--paper #161515`; Light
`--cream #FAF7F2`, `--charcoal #1C1C1E`, `--ink-2 #5C5853`, `--ink-sub
#5A564F` (the Light muted, SCREENS-M4), `--paper #FFFFFF`. A translucent
surface is blended over the page (or over the chip it sits on) before the
ratio is taken; a gradient is measured at both ends. "need" is 4.5:1 for text
under 18px, 3:1 for larger text, icons and marks.

Two pairs were moved to the coral MARK token while writing this table (11.0:
"coral mark on a tinted surface … `Live` on the live/soon card chrome"): the
`Going` word on the live week card (coral text `#C8401E` on `#FFE9E0` is
4.27:1) and the `Live now · <title>` chip on a club row (coral text on the
chip's `rgba(255,92,53,0.14)` tint is 4.01:1 in Light). Both now use
`coralMark` (`#B5381A` in Light, `#FF8A66` in Night) and pass.

| element | size | need | Night pair | Night | Light pair | Light | ok |
|---|---|---|---|---|---|---|---|
| Header `Messages` | 30px/800 | 3:1 | #F6F1EA on #0C0B0B | 17.49 | #1C1C1E on #FAF7F2 | 15.92 | yes |
| Pencil icon on its button | icon | 3:1 | #CFC8BE on #151414 | 11.12 | #5C5853 on #FFFFFF | 7.06 | yes |
| `Your week` heading | 16px/700 | 4.5:1 | #F6F1EA on #0C0B0B | 17.49 | #1C1C1E on #FAF7F2 | 15.92 | yes |
| `Oct 5 – 11 · your RSVPs` | 12px/600 | 4.5:1 | #9C958C on #0C0B0B | 6.64 | #5A564F on #FAF7F2 | 6.83 | yes |
| Day strip weekday, future | 10.5px/600 | 4.5:1 | #CFC8BE on #0C0B0B | 11.85 | #5C5853 on #FAF7F2 | 6.60 | yes |
| Day strip number, future | 15px/700 | 4.5:1 | #F6F1EA on #0C0B0B | 17.49 | #1C1C1E on #FAF7F2 | 15.92 | yes |
| Day strip, past day (both texts) | 10.5/15px | 4.5:1 | #9C958C on #0C0B0B | 6.64 | #5A564F on #FAF7F2 | 6.83 | yes |
| Today chip weekday | 10.5px/700 | 4.5:1 | #4A4541 on #F6F1EA | 8.42 | #CCCAC6 on #141416 | 11.21 | yes |
| Today chip number | 15px/800 | 4.5:1 | #0C0B0B on #F6F1EA | 17.49 | #FAF7F2 on #141416 | 17.22 | yes |
| Live card `Live now` (gradient start) | 12px/700 | 4.5:1 | #FF8A66 on #381614 | 7.04 | #B5381A on #FFE9E0 | 5.07 | yes |
| Live card `Live now` (gradient end) | 12px/700 | 4.5:1 | #FF8A66 on #1D1413 | 7.83 | #B5381A on #FFFFFF | 5.92 | yes |
| Live card `Going` (coralMark; start / end) — start | 12px/700 | 4.5:1 | #FF8A66 on #381614 | 7.04 | #B5381A on #FFE9E0 | 5.07 | yes |
| Live card `Going` (coralMark; start / end) — end | 12px/700 | 4.5:1 | #FF8A66 on #1D1413 | 7.83 | #B5381A on #FFFFFF | 5.92 | yes |
| Live card title (start / end) — start | 15.5px/700 | 4.5:1 | #F6F1EA on #381614 | 14.48 | #1C1C1E on #FFE9E0 | 14.57 | yes |
| Live card title (start / end) — end | 15.5px/700 | 4.5:1 | #F6F1EA on #1D1413 | 16.11 | #1C1C1E on #FFFFFF | 17.01 | yes |
| Live card club name (start / end) — start | 12px/500 | 4.5:1 | #CFC8BE on #381614 | 9.81 | #5C5853 on #FFE9E0 | 6.04 | yes |
| Live card club name (start / end) — end | 12px/500 | 4.5:1 | #CFC8BE on #1D1413 | 10.91 | #5C5853 on #FFFFFF | 7.06 | yes |
| Quiet card time / `Ended` | 12px/600 | 4.5:1 | #CFC8BE on #151414 | 11.06 | #5C5853 on #FFFFFF | 7.06 | yes |
| Quiet card `Going` | 12px/700 | 4.5:1 | #FF8A66 on #151414 | 7.94 | #C8401E on #FFFFFF | 4.99 | yes |
| Quiet card `Maybe` | 12px/700 | 4.5:1 | #CFC8BE on #151414 | 11.06 | #5C5853 on #FFFFFF | 7.06 | yes |
| Quiet card title | 15.5px/700 | 4.5:1 | #F6F1EA on #151414 | 16.34 | #1C1C1E on #FFFFFF | 17.01 | yes |
| Quiet card club name | 12px/500 | 4.5:1 | #9C958C on #151414 | 6.20 | #5A564F on #FFFFFF | 7.29 | yes |
| `Nothing on your week yet.` | 13.5px/500 | 4.5:1 | #CFC8BE on #0C0B0B | 11.85 | #5C5853 on #FAF7F2 | 6.60 | yes |
| `Find events` | 13.5px/700 | 4.5:1 | #FF8A66 on #0C0B0B | 8.50 | #C8401E on #FAF7F2 | 4.67 | yes |
| Filter pill, active | 13px/700 | 4.5:1 | #0C0B0B on #F6F1EA | 17.49 | #FAF7F2 on #141416 | 17.22 | yes |
| Filter pill, inactive | 13px/700 | 4.5:1 | #CFC8BE on #0C0B0B | 11.85 | #5C5853 on #FAF7F2 | 6.60 | yes |
| All badge (#140806 on coral) | 11.5px/800 | 4.5:1 | #140806 on #FF5C35 | 6.40 | #140806 on #FF5C35 | 6.40 | yes |
| Requests count, inactive pill | 11.5px/800 | 4.5:1 | #F6F1EA on #292828 | 13.04 | #1C1C1E on #DFDDD9 | 12.53 | yes |
| Requests count, active pill (the chip's own ink at .12: Night `rgba(12,11,11,0.12)` on #F6F1EA, Light `rgba(250,247,242,0.12)` on #141416; repair, S1-DESIGN-6) | 11.5px/800 | 4.5:1 | #0C0B0B on #DAD5CF | 13.48 | #FAF7F2 on #302F30 | 12.48 | yes (the pill itself is a tint, 1.30 / 1.38 against the chip — a container, not a mark) |
| Row name (person 15px, club 16.5px) | 15px/700 | 4.5:1 | #F6F1EA on #0C0B0B | 17.49 | #1C1C1E on #FAF7F2 | 15.92 | yes |
| Row time, unread | 12px/600 | 4.5:1 | #CFC8BE on #0C0B0B | 11.85 | #5C5853 on #FAF7F2 | 6.60 | yes |
| Row time, read | 12px/600 | 4.5:1 | #9C958C on #0C0B0B | 6.64 | #5A564F on #FAF7F2 | 6.83 | yes |
| Row preview, unread (ink) | 13.5px/600 | 4.5:1 | #F6F1EA on #0C0B0B | 17.49 | #1C1C1E on #FAF7F2 | 15.92 | yes |
| Row preview, read (secondary) | 13.5px/400 | 4.5:1 | #CFC8BE on #0C0B0B | 11.85 | #5C5853 on #FAF7F2 | 6.60 | yes |
| Live chip `Live now · <title>` (coralMark) | 12px/700 | 4.5:1 | #FF8A66 on #2E1611 | 7.31 | #B5381A on #FBE1D8 | 4.76 | yes |
| Next-event chip | 12px/600 | 4.5:1 | #CFC8BE on #181717 | 10.76 | #5C5853 on #EFECE7 | 5.99 | yes |
| `Going` mark on the row | 12px/700 | 4.5:1 | #FF8A66 on #0C0B0B | 8.50 | #C8401E on #FAF7F2 | 4.67 | yes |
| `Maybe` mark on the row | 12px/600 | 4.5:1 | #CFC8BE on #0C0B0B | 11.85 | #5C5853 on #FAF7F2 | 6.60 | yes |
| `N new` pill | 11.5px/700 | 4.5:1 | #CFC8BE on #1F1F1F | 9.97 | #5C5853 on #E8E5E1 | 5.64 | yes |
| No clubs: heading | 24px/700 | 3:1 | #F6F1EA on #0C0B0B | 17.49 | #1C1C1E on #FAF7F2 | 15.92 | yes |
| No clubs: sentence | 14.5px/500 | 4.5:1 | #CFC8BE on #0C0B0B | 11.85 | #5C5853 on #FAF7F2 | 6.60 | yes |
| `Find clubs on campus` (gradient start / end) — start | 15px/800 | 4.5:1 | #140806 on #FF7B4A | 7.67 | #140806 on #FF7B4A | 7.67 | yes |
| `Find clubs on campus` (gradient start / end) — end | 15px/800 | 4.5:1 | #140806 on #FF5C35 | 6.40 | #140806 on #FF5C35 | 6.40 | yes |
| `Start a club` | 14px/600 | 4.5:1 | #CFC8BE on #0C0B0B | 11.85 | #5C5853 on #FAF7F2 | 6.60 | yes |
| Pin icon (non-text) | icon | 3:1 | #9C958C on #0C0B0B | 6.64 | #5A564F on #FAF7F2 | 6.83 | yes |
| Coral dots and the unread pill (non-text marks; the word carries the meaning) | mark | 3:1 | #FF5C35 on #0C0B0B | 6.40 | #FF5C35 on #FAF7F2 | 2.88 | NO |

**Avatars (theme-independent; the mockups' own values, `avatar.ts`)**

| avatar | size | need | pair | ratio | ok |
|---|---|---|---|---|---|
| person initials (14px/700; 10.5px in a group pair) | 14px/700 | 4.5:1 | #CFE6F2 on #2E4A5A | 7.25 | yes |
| person initials (14px/700; 10.5px in a group pair) | 14px/700 | 4.5:1 | #E6D8F5 on #4A3A5E | 7.53 | yes |
| person initials (14px/700; 10.5px in a group pair) | 14px/700 | 4.5:1 | #F5E1B8 on #5E4A2A | 6.57 | yes |
| person initials (14px/700; 10.5px in a group pair) | 14px/700 | 4.5:1 | #FFD3C2 on #5A3A2E | 7.38 | yes |
| person initials (14px/700; 10.5px in a group pair) | 14px/700 | 4.5:1 | #CFE6F2 on #2A4550 | 7.87 | yes |
| person initials (14px/700; 10.5px in a group pair) | 14px/700 | 4.5:1 | #CDEBD9 on #2F4A3A | 7.62 | yes |
| club initials (18px/800) — gradient start | 18px/800 | 4.5:1 | #FAF7F2 on #C23A72 | 4.74 | yes |
| club initials (18px/800) — gradient end | 18px/800 | 4.5:1 | #FAF7F2 on #962858 | 7.17 | yes |
| club initials (18px/800) — gradient start | 18px/800 | 4.5:1 | #FAF7F2 on #1F7580 | 5.02 | yes |
| club initials (18px/800) — gradient end | 18px/800 | 4.5:1 | #FAF7F2 on #155158 | 8.36 | yes |
| club initials (18px/800) — gradient start | 18px/800 | 4.5:1 | #FAF7F2 on #337A5A | 4.83 | yes |
| club initials (18px/800) — gradient end | 18px/800 | 4.5:1 | #FAF7F2 on #245942 | 7.61 | yes |
| club initials (18px/800) — gradient start | 18px/800 | 4.5:1 | #FAF7F2 on #8A6A22 | 4.72 | yes |
| club initials (18px/800) — gradient end | 18px/800 | 4.5:1 | #FAF7F2 on #664C14 | 7.53 | yes |


**Notes**

- The one row under its line is not text: the coral dots (`#FF5C35`) and the
  unread pill on cream are 2.88:1 against the 3:1 mark rule. Each dot sits
  beside the word that carries its meaning (`Board:` in ink, `Live now`, the
  day button's `aria-label`, the row's label saying "unread"), so no meaning
  rests on the dot alone (11.0 Accessibility: shape AND label, never colour
  alone); the coral itself is the contract's pinned token. Recorded, not
  changed.
- The skeleton bars (`rgba(var(--scrim-rgb),0.06/0.08/0.05)`), the bottom
  fade and the bloom carry no text.
- `LoadFailed` draws its own tones (`tone={night ? "dark" : "light"}`); its
  pairs are that component's, unchanged here.
- The old list (`MessagesMobileV1`) and the bare header while the flag is
  unknown (`FlagPending`, 28px/900 `--charcoal` on today's translucent cream)
  are today's pairs, untouched.
