# Marketing, Oct 14, 2026: video from code, three more transcripts, and the first test ad

First draft. Read this before any marketing or motion work. The S77 handoff
(`2026-10-13-session-77-motion-notice-docs-and-next-up.md`) still holds for the app.

## In one breath

Franky sent three more transcripts (6, 7, 8) about motion graphics, AI-made
ads and buttery motion. We set up **HyperFrames** (a free, open-source tool from
HeyGen: write a page, it renders an MP4) in `vibe-marketing/video/`, and made a
**15-second test ad**. The ad renders well, but **it is not safe to post yet**:
three of its four screens fail the campaign's gates, and it opens with the tagline
as a headline. The fix is cheap (below).

## The transcripts, sorted

| # | What it said | Verdict |
|---|---|---|
| 6 | Claude doesn't make video; it writes code that paints every frame, Chrome captures, ffmpeg stitches. Feed it real assets, enforce spring physics, cut on the beat, let it grade its own frames. | **Do**, except "make the sound in code": **skip** (sounds cheap). |
| 7 | HyperFrames Studio, a free desktop editor where Claude Code edits the video by chat. | **Do** the framework (installed). Studio is Franky's own install (hyperframes.dev). |
| 8 | A tilting 3D card; Motion for React, Spline 3D, Lottie for Flutter; animate only transform and opacity. | **Do** springs and transform-only motion (we already have Motion). **Skip** Spline (too heavy for the app), Lottie/Flutter (we aren't Flutter), touchStart (outdated). Idea bank: "tilt it and place it" photo/sticker placement on profiles, after launch. |

## What exists now

| What | Where | State |
|---|---|---|
| HyperFrames CLI 0.8.157 (pinned) | `vibe-marketing/video/` (README there) | Installed. Run with `HYPERFRAMES_NO_TELEMETRY=1`. |
| The 21 HyperFrames Claude skills | `vibe-marketing/.agents/skills/`, linked from `.claude/skills/` | Installed by Franky for this folder only. They load in a Claude session **started in `vibe-marketing`**. Copies are gitignored; `skills-lock.json` is committed. |
| `find-skills` (Vercel) | `~/.agents/skills`, `~/.claude/skills` | The installer added it **globally**. Harmless; remove if unwanted. |
| Test ad `teaser-15s` | `vibe-marketing/video/teaser-15s/` | 15 s, 9:16, 60 fps, silent. The MP4 is in `renders/` (gitignored, sent to Franky's phone Oct 14). |

**How the ad plays:** "Your campus. / Your people. / **Yourself.**" springs up →
a phone rises with Feed, Events, Clubs, Club chat sliding in like tab switches
("Post what's yours." / "See what's on." / "Find your clubs." / "Talk it out.") →
"vibe" rises letter by letter, the coral dot drops and bounces on the beat →
"The social app for your campus." · **Join the waitlist** · connectvibe.app ·
not affiliated with IU or Purdue.

**How it was checked:** HyperFrames' own check (layout, contrast, motion) passes;
frames were pulled from the real MP4 and four flaws fixed (a descender peeking
under a label, the dot hanging in the sky, the dot sinking below the baseline,
the dot staying squashed in the air). **Nobody has judged the feel on a phone yet.**

## Why it can't be posted yet (from `campaigns/2026-10-launch/gates-and-decisions.md`)

1. **G5 / G7:** `feed.png`, `events.png`, `orgs.png` show the crimson "IU Bloomington"
   header (wrong campus) and sample clubs named like real residence halls
   ("North Hall", "Tower Floor 3"), with no SAMPLE label. Only `club-lounge.png`
   is cleared, and only with a SAMPLE label.
2. **Decision 10:** the tagline stays a sign-off, never a headline. The ad opens with it.
3. **Music:** an earlier note in the session suggested laying a 120 BPM track under
   it in Instagram. **That was wrong for this campaign:** the rules say no song
   (G14, decision 16). The cuts are still on a 120 BPM grid, which is harmless.
4. **G12:** a second founder looks at it before it posts, like every post.

## The fix (recommended, about an hour once the screens exist)

1. **Retake the practice screens** on an Indianapolis practice campus with renamed
   sample clubs and a SAMPLE label (decision 6, due Sun Oct 18; "the stills are
   the cheaper half"). This unblocks every app-screen post, not just this ad.
2. **Swap the opening** for a line from the campaign's one set of words
   (`campaign-plan.md`), and keep the tagline for the end card only. Candidate:
   open on "Class, then home." if Franky keeps that line (decision 1).
3. **Match the end card** to the campaign's existing `official/_endcard/`, so every
   video ends the same way.
4. **Sound:** silent, or Franky's own recorded sound. No song.
5. Re-render, pull frames at every cut, send to Franky's phone, then G12.

## Motion rules (for ads AND the app's motion pass)

The app's motion pass comes after usage stats and rate limits (Franky's order, Oct 13).

1. Springs, not fixed timings: entrances use a closed-form spring; exits accelerate away.
2. Animate transform and opacity only. Little blur, never on big surfaces.
3. Respect the phone's reduce-motion setting (already done in 17 files).
4. Franky judges the feel on a real phone; Claude only sees stills.

## Calls for Franky (each with a recommendation)

- **Retake the screens?** Yes, this week (it unblocks G7 for the whole campaign).
- **The ad's opening line?** "Class, then home." if decision 1 holds; otherwise one
  plain line from `campaign-plan.md`.
- **HyperFrames Studio desktop app?** Optional. Useful if you want to tweak a video
  by talking to it; everything also works from a Claude session in `vibe-marketing`.
- **Remove the global `find-skills`?** Keep; it's one harmless text file.

## Commits

`vibe-marketing` (its own repo, not pushed anywhere): `1062804` (HyperFrames and the
teaser), `5b1de7d` (skills lock file and README).
