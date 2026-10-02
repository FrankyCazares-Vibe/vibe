# Obsidian diagnosis: skeptical verification (Oct 2, 2026)

Reviewer notes. Read-only. Each claim from obsidian.md gets a verdict: CONFIRMED / WRONG / PARTLY / UNVERIFIED.

## Log

(started; findings appended below as I go)

## A. Diagnosis claims (my own recount, own script, Oct 2)

| Claim | Verdict | What I measured |
|---|---|---|
| 443 notes through symlinks | CONFIRMED | `find -L ~/vault -name '*.md'` = 443 |
| 425 are handoffs | CONFIRMED | `find -L Founder/Handoffs -name '*.md'` = 425 (917 files total) |
| 16 notes physically in vault | CONFIRMED | `find` without -L = 16 |
| By folder 428 / 6 / 4 / 4 / 1 | CONFIRMED | Founder 428, Daily 6, Reference 4, Templates 4, README 1 |
| Inbox, People, Product empty | CONFIRMED | `ls -la` shows only . and .. |
| 14 notes with a real [[link]] | CONFIRMED | 15 hits, 1 is the `[[:alnum:]]` regex in wave-plan-sec2/critique-Bcross.md |
| 61 links, 57 resolve | CONFIRMED | 61 total, 4 unresolved (double brackets, Handoffs/_index, :alnum:, Obsidian vs Notion) |
| 39 joined, 404 loose (91%) | CONFIRMED | 51 note-to-note lines, 39 connected, 404 orphans. 397 of the 404 are handoffs. The other 7: README.md, Daily/2026-09-17.md, Templates/Daily, Idea, Decision, Reference/Brand-files/README.md, Reference/Brand-files/more/README.md |
| Zero [[links]] inside handoffs | CONFIRMED | 0 real ones |
| Only 2 handoff-to-handoff lines (44 to 43, 40 to 39) | CONFIRMED | both are `[text](file.md)` links |
| 1,175 backticked paths / 931 bare / 770 session mentions | ROUGHLY CONFIRMED | my regex: 1,414 backticked .md, 1,147 resolve; 920 bare, 823 resolve; 874 session mentions. Same story, numbers move with the regex. Say "about 1,150", "about 850", "about 800". |
| 700 line-number cites | CONFIRMED | exactly 700 `file.md:NN` |
| Index stops at session 52, 45 of 73 top-level unlinked | CONFIRMED | `Founder/Handoffs Index.md` last edit Sep 3; 45 top-level handoffs have no link in or out |
| 38 memory notes, 68 links, outside the vault | CONFIRMED | 38 .md, 29 with links, 68 links, 50 resolve, 18 hyphen-form (9 distinct names) |
| MEMORY.md = hub with 36 links | SMALL FIX | 38 link lines, 37 distinct files, all 37 exist |
| app.json {} / graph.json no filter, orphans on, no groups | CONFIRMED | read both files. Also appearance.json = {} |
| No community plugins | CONFIRMED | no plugins folder, no community-plugins.json |
| Obsidian 1.12.7 | SMALL FIX | installer is 1.12.7 (Info.plist) but the app has self-updated: `~/Library/Application Support/obsidian/obsidian-1.13.7.asar`. Running version is most likely 1.13.7. Does not change anything. |
| Obsidian reads through the folder symlink | CONFIRMED | workspace.json lastOpenFiles lists Founder/Handoffs/chat-redesign/wave-2-build/... |
| Journal symlink broken | CONFIRMED | readlink = vibe/public/journal/vibe_journal.html, target missing; real file /Users/franciscocazares/vibe/journal/vibe_journal.html (363,958 bytes) |
| Journal.md links [[Handoffs/_index]], says v6.1 / Session 49 | CONFIRMED | journal html now carries up to v7.8 |
| Handoffs, Brand-files, 8 mockup symlinks fine | CONFIRMED | all resolve |
| 42 sessions, 23 to 71, 4 with two handoffs | CONFIRMED | 42 distinct session numbers; 65, 67, 68, 69 have two files. Gaps: 32, 33, 35, 36, 37, 61, 62 have no file. 27 top-level handoffs have no session number. |
| 15 folder hubs | CONFIRMED | 17 subfolders, 2 have no .md (wave-plan-notes, wave-plan-verification) |
| 9 duplicate names | CONFIRMED | README x4, plan x4, critic x3, critic-w3, critique-product, B4-gate, B4-notes, B4-repair, B4-review-contract x2 each. All in subfolders. Top-level names are unique. |
| 101 commits touched handoffs in 14 days, one cloud branch | CONFIRMED | git log count = 101; origin/claude/relaxed-davinci-9d11h3 |
| Vault has no backup | CONFIRMED | no .git in ~/vault (a .gitignore exists but no repo); sync plugin on but no sync config |

Verdict on the diagnosis: it holds. I could not break it. The cause is real: handoffs cite each other with backticked paths and plain words, and Obsidian draws lines only for real links.

One thing the report did not say: 352 of the 404 loose dots are sub-agent working files in subfolders (chat-redesign 151, wave-plan-sec2 71, ...). Only 73 are the top-level handoffs Franky actually reads.

## B. The proposed fix (Option 2): what survives and what needs correcting

### B1. Would it really connect the graph? YES, by construction
- 73 top-level handoffs get a link from an index note. 352 subfolder files get a link from their folder hub. 73 + 352 = 425. Checked: subfolder counts add to 352 (151+71+35+32+16+10+8+8+6+6+3+2+2+1+1).
- Session notes: 42 numbers exist, so 42 notes. The chain must skip the gaps (31 to 34, 34 to 38, 60 to 63).
- "Docs this session cites": I count 174 distinct docs cited by the 46 session handoff files (report said 180). Same ballpark.
- Loose dots left after the fix: README.md, 2 brand READMEs, Templates/Daily, Idea, Decision, and Daily/2026-09-17.md (no session handoff has that date). So 7, or 4 once Templates is excluded. Report said "about 7". OK.

### B2. Link-format traps I checked
- Duplicate names: 9 basenames repeat (all in subfolders). A bare `[[plan]]` would land on one of 4 files. The report knew this. CORRECTION: do not special-case. Write EVERY generated link as the exact vault path with `.md` plus a display name: `[[Founder/Handoffs/chat-redesign/plan.md|chat-redesign/plan]]`. An exact path needs no name matching, so duplicates cannot bite.
- Dots in names: 9 files end in `.factcheck.md` (roadmap-2026-09-25/ambassadors.factcheck.md, bank.factcheck.md, 7 under wave-plan-pwa/research*). The report missed these. A bare `[[ambassadors.factcheck]]` may be read as a file with extension "factcheck". The exact-path-with-.md rule above removes the question.
- Dates and hyphens in names (`2026-09-12-decisions`) are fine. The existing index already links 28 such names and all 28 resolve.
- No handoff .md path contains a space, #, |, ^, [ or ]. Nothing to escape.
- Hub names do not clash with any existing note name (checked the 15 folder names, "Session NN", "Vibe Map").
- Links inside backticks do not count. The generator must never wrap a link in backticks. The vault README shows the trap: its 5 `[[Templates/...]]` lines are in backticks and draw nothing.

### B3. Would anything dirty the git repo?
- New script `vibe/scripts/vault-map.mjs`: one new tracked file. It must be committed. A push to main triggers a normal Vercel deploy (no vercel.json ignore rule). Harmless: `.vercelignore` drops handoffs/ but not scripts/, the build does not run scripts/, tsconfig only includes .ts/.tsx, and there is no CI workflow folder. Precedent: `vibe/scripts/sync-vibe-hub.sh` already copies repo files to a folder outside the repo. Repo is PRIVATE (gh repo view). Let it ride with the S72 handoff commit.
- Output folder `~/vault/Founder/Map/` is a real vault folder, not inside the repo. OK. But `~/vault/Founder/Handoffs` IS the repo. GUARD NEEDED: the script must resolve the real path of its output folder and stop if it is inside /Users/franciscocazares/vibe.
- Months of Obsidian use have not dirtied the repo: `git status` shows only `handoffs/chat-redesign/s71-walk/` (7 jpgs from this session). Obsidian keeps its own files in `~/vault/.obsidian`.
- "## Related footer on new handoffs from S72": this DOES change committed files going forward, shows as raw `[[text]]` on GitHub, and depends on every agent (cloud ones too) remembering. The generator already lifts the backticked paths. RECOMMEND SKIP. Not needed for a connected graph.

### B4. Would anything get overwritten or lost?
- CORRECTION (real loss): the report regenerates `~/vault/Founder/Handoffs Index.md`. That file has hand-written content: one-line summaries for sessions 49 to 52, the note that session 22 is an HTML file, and the explanation of the 32-37 gap. A regenerate wipes it. FIX: the script writes ONLY inside `Founder/Map/`. Put the full list in a new `Founder/Map/All Handoffs.md`. Add one line by hand to the old index pointing at it.
- CORRECTION (safety): "wipes and rebuilds that one folder". Do not `rm -rf` a path built from $HOME. Write each file only if its content changed, and delete only stale files that start with the GENERATED line. This also stops Obsidian from closing open tabs on every run.
- graph.json and app.json: Obsidian has the vault open right now (obsidian.json says open:true) and rewrites these on change. Edits made on disk while it is open get lost. The report already says to use the Graph panel. Agreed. Or quit Obsidian first.
- Founder/Journal.md and Vibe.md edits are tiny and hand-made. Fine.

### B5. The memory symlink: I disagree with it
What the report proposes: `~/vault/Founder/Memory` -> `~/.claude/projects/-Users-franciscocazares-vibe/memory`.
Problems:
1. Memory files have NO git history. A rename, delete or property edit in Obsidian changes how Claude behaves in every later session, and nothing records it. (Handoffs are different: git protects them.)
2. Obsidian's own help page strongly advises against symlinks. This would add a third one, pointing into a tool's private state folder.
3. 18 of the 68 links use the hyphen `name:` from the front matter (`[[project-launch-plan]]`) and would show as 9 grey "missing" dots. The report's cure is to edit 11 files under ~/.claude.
BETTER: the same script copies the 38 memory files into `~/vault/Founder/Map/Memory/` on each run, read-only, and rewrites the 18 hyphen links to the underscore file names in the COPY. No symlink, no edits under ~/.claude, zero grey dots. MEMORY.md's 37 `[Title](file.md)` links keep working because the copies sit side by side.
Cost: the copy is as fresh as the last script run, and edits made to a copy in Obsidian are lost on the next run (each copy starts with a "COPY, edit through Claude" line).
If the vault is ever backed up to a cloud, exclude `Founder/Map/` (it can always be rebuilt, and the memory copies hold private notes).

### B6. Is there a simpler fix?
- 5-second view fix, connects nothing: graph panel > Filters > turn "Orphans" off. Shows only the 39 linked notes.
- No plugin does it better. Dataview lists do not draw graph lines. Folder-note plugins (Waypoint and similar) write their index INSIDE the folder, which means inside the git repo.
- "Lite" version of the script: skip the 42 session notes. Just `Vibe Map.md` + `All Handoffs.md` + 15 folder hubs = 17 notes, about 60 lines of code, 20 minutes. Everything is connected, but the graph is 16 stars with no timeline.
- Full corrected Option 2 is about 150 lines and 1 hour. The session chain is the part that makes the graph mean something. Recommend the full version, built lite-first (hubs first, then sessions).

## C. FINAL recommended fix (corrected Option 2), exact steps

Time: about 1 hour. Nothing in an existing handoff changes. One new file in the repo.

### Step 1. New script (the only repo change)
File: `/Users/franciscocazares/vibe/scripts/vault-map.mjs` (plain Node, no packages, about 150 lines).
Reads: `/Users/franciscocazares/vibe/handoffs/**/*.md` and `/Users/franciscocazares/.claude/projects/-Users-franciscocazares-vibe/memory/*.md`.
Writes: ONLY inside `/Users/franciscocazares/vault/Founder/Map/`.
Rules inside the script:
- Exit quietly if `~/vault` does not exist (cloud sessions).
- Resolve the real path of the output folder. Stop if it is inside `/Users/franciscocazares/vibe`.
- Every link is an exact vault path with `.md` and a display name: `[[Founder/Handoffs/<path>.md|<short name>]]`. Never inside backticks.
- First line of every generated file: `> GENERATED by vibe/scripts/vault-map.mjs. Do not edit. Re-run the script instead.`
- Write a file only if its content changed. Delete a file in Founder/Map only if it starts with that GENERATED line and is no longer wanted. No `rm -rf`.

### Step 2. What the script creates (97 files today)
a. `Founder/Map/Vibe Map.md` (home). Sections: "Sessions" (42 links in order), "Folders" (15 links), "Everything" (link to All Handoffs), "Memory" (link to the MEMORY copy), "Anchor notes" (`[[Founder/Vibe.md|Vibe]]`, `[[Founder/Journal.md|Journal]]`, `[[Founder/Handoffs Index.md|Handoffs Index]]`, `[[Reference/Brand.md|Brand]]`, `[[Reference/Mockups.md|Mockups]]`).
b. `Founder/Map/All Handoffs.md`. All 73 top-level handoffs grouped by month, newest first. One line each: link + the file's first `# ` title.
c. `Founder/Map/Sessions/Session 23.md` ... `Session 71.md` (42 files). Pattern:
   ```
   > GENERATED by vibe/scripts/vault-map.mjs. Do not edit. Re-run the script instead.
   # Session 71
   Previous: [[Founder/Map/Sessions/Session 70.md|Session 70]]  Next: (none yet)
   ## Handoff
   - [[Founder/Handoffs/2026-09-30-session-71-audit-chat-waves-1-2.md|2026-09-30 audit chat waves 1-2]]
   ## Docs this session cites
   - [[Founder/Handoffs/chat-redesign/wave-1-contracts.md|chat-redesign/wave-1-contracts]]
   ## Memory notes that mention S71
   - [[Founder/Map/Memory/project_supabase_keys_s71.md|project_supabase_keys_s71]]
   ## Daily note (only if Daily/<same date>.md exists)
   ```
   Previous/Next skip missing numbers (31 -> 34 -> 38, 60 -> 63). Sessions 65, 67, 68, 69 list two handoffs.
   "Docs this session cites" = every backticked or bare `something.md` in the handoff that matches a real handoff file (same folder first, then by path).
d. `Founder/Map/Folders/<folder>.md` (15 files: chat-redesign, wave-plan-sec2, wave-plan-s67, wave-plan-pwa, wave-plan-sections, roadmap-2026-09-25, wave-plan-week1, legal-2026-09-29, s67-understand, s67-sec-lenses, legal-drafts, wave-plan-s68, wave-plan-moderation, wave-plan-stripe, stores). Each lists every .md in that folder, grouped by sub-folder, plus "Sessions that cite this folder".
e. `Founder/Map/Memory/*.md` (38 files): copies of the memory notes. Line 1 after the front matter: `> COPY of Claude's memory. Edits here are lost. Ask Claude to change the original.` Hyphen links rewritten to file names (`[[project-launch-plan]]` -> `[[project_launch_plan]]`), 18 links in 11 files.

### Step 3. Three hand edits to real vault notes
- `~/vault/Founder/Handoffs Index.md`: add at the top `**Full, always-current list:** [[All Handoffs]] and [[Vibe Map]]. This page stops at session 52.` Keep the rest.
- `~/vault/Founder/Vibe.md`: under "Anchor docs" add `- [[Vibe Map]] (start here)`.
- `~/vault/Founder/Journal.md`: fix 4 lines. Path -> `vibe/journal/vibe_journal.html` (private, this Mac only, about 364KB). The file:// link -> `file:///Users/franciscocazares/vibe/journal/vibe_journal.html`. "v6.1 / Session 49" -> the current version from the journal header (v7.8 is the highest I see). `[[Handoffs/_index]]` -> `[[Handoffs Index]]`.

### Step 4. Journal pointer
`ln -sfn /Users/franciscocazares/vibe/journal/vibe_journal.html /Users/franciscocazares/vault/Founder/vibe_journal.html`
Tidiness only. An .html file never shows in the graph.

### Step 5. Graph settings (Franky, in Obsidian, 2 minutes; not by editing files while Obsidian is open)
- Graph > Groups, in this order: `path:"Founder/Map/Memory"` blue, `path:"Founder/Map"` coral, `path:"Founder/Handoffs"` grey, `path:Daily` green.
- Settings > Files and links > Excluded files: add `Templates/`.
- Calm view: type `path:"Founder/Map" OR file:session` in the graph filter.

### Step 6. Habit
Run `node scripts/vault-map.mjs` when a session closes, right after the handoff is written. Record that in memory `project_handoffs.md` and fix the stale journal path in `reference_obsidian_vault.md` (both are normal memory updates by the main session).

### Step 7. Acceptance check (do not skip, see section D)
1. Open `Founder/Map/Folders/roadmap-2026-09-25.md` in Obsidian. Click `ambassadors.factcheck`. It must open the real file, not offer to create a note.
2. Click a `plan` link in `Folders/chat-redesign.md` and in `Folders/wave-plan-pwa.md`. Each must open its own folder's plan.
3. Graph: no grey "missing" dots except the 3 old ones (double brackets, Obsidian vs Notion, :alnum:).
4. `git -C ~/vibe status` shows only the new script.

## D. What I could not verify
- I did not open Obsidian (no browser or app driving allowed). So these are from how Obsidian is documented to work, not from watching it: (1) that `[[exact/path/file.md|name]]` resolves, (2) how a bare `[[name.factcheck]]` behaves, (3) that "Excluded files" removes Templates from the graph, (4) how the graph will actually look. Step 7 is the test.
- The Obsidian help page on symlinks was not re-fetched. The caveats in the report match what I know of that page.
- My reference counts differ from the report's by a few percent (regex differences). Neither is "the" number.
- Whether Franky wants memory visible in Obsidian at all. It is private working state.
- The journal's current version label. I only grepped for the highest "vN.N" string (v7.8).
- Node is installed (checked `node -v`), but the script does not exist yet, so run time and the 97-file count are estimates from counting, not from a run.
