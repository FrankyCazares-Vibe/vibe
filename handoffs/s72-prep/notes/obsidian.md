# Obsidian vault: why notes are not connected (S72 prep)

Started Fri Oct 2 2026. Read-only research. Findings appended below in chunks.

## 1. What is in the vault (evidence, Oct 2)

Vault: /Users/franciscocazares/vault (not a git repo; has a .gitignore but no .git).

| Folder | All files | Markdown notes | Notes |
|---|---|---|---|
| Founder/ | 920 | 428 | 3 real notes (Vibe.md, Journal.md, Handoffs Index.md) + 425 notes that come through the symlink Founder/Handoffs -> /Users/franciscocazares/vibe/handoffs |
| Daily/ | 6 | 6 | 2026-05-18, 09-02, 09-03, 09-15, 09-22 + one more |
| Reference/ | 25 | 4 | Brand.md, Mockups.md + Brand-files symlink -> vibe/brand, Mockups/*.html symlinks -> ~/Downloads/otto_mockups |
| Templates/ | 4 | 4 | Decision, Idea, Interview + 1 |
| Claude outputs/ | 12 | 0 | no markdown |
| Inbox/, People/, Product/ | 0 | 0 | EMPTY folders |
| README.md (root) | 1 | 1 | |
| TOTAL | 969 | 443 | only 16 notes physically live in the vault; 427 come through symlinks |

Handoffs folder itself (/Users/franciscocazares/vibe/handoffs): 917 files, 425 .md.
73 top-level handoffs, then subfolders: chat-redesign 151, wave-plan-sec2 71, wave-plan-s67 35,
wave-plan-pwa 32, wave-plan-sections 16, roadmap-2026-09-25 10, wave-plan-week1 8, legal-2026-09-29 8,
s67-understand 6, s67-sec-lenses 6, legal-drafts 3, wave-plan-s68 2, wave-plan-moderation 2, wave-plan-stripe 1, stores 1.
Also 305 png, 113 json, 29 html in there (graph has showAttachments=false so those are hidden).

### Link counts (script: scratchpad/s72prep/analyze.py)
- Notes with at least one [[wikilink]] outside code: 15 of 443 (one is a false positive: `[[:alnum:]]` regex in wave-plan-sec2/critique-Bcross.md). So 14 real.
- Total wikilinks: 61. Resolve to a real note: 57. Unresolved: 4
  (README.md -> "double brackets" (it is an example), Journal.md -> "Handoffs/_index" (file does not exist),
  critique-Bcross.md -> ":alnum:", Daily/2026-05-18.md -> "Obsidian vs Notion" (never created)).
- 17 more `[[...]]` strings sit inside backticks/code, which Obsidian ignores.
- Notes with an incoming link: 35. Connected notes total: 39. ORPHANS: 404 of 443 (91%).
- The ONLY file that links to handoffs in bulk is Founder/Handoffs Index.md: 28 links, all resolve, but it stops at session 52 (last edited Sep 3). Handoffs from session 53 to 71 (about 45 top-level files) are not linked from anywhere except 3 Daily notes.
- Not one of the 425 handoff files contains a real wikilink. Zero handoff -> handoff edges.
- Duplicate note names (matter for [[name]] links): README x4, plan x4, critic x3, critic-w3 x2, critique-product x2, B4-review-contract/B4-notes/B4-gate/B4-repair x2 each. Top-level handoff names are all unique.

## 3. Obsidian settings (/Users/franciscocazares/vault/.obsidian)
- app.json = {} (all defaults): useMarkdownLinks=false (wikilinks), newLinkFormat=shortest, no attachmentFolderPath, no userIgnoreFilters. Nothing is being excluded.
- graph.json: search="" (no filter), showOrphans=true, showTags=false, showAttachments=false, hideUnresolved=false, colorGroups=[] (none), linkDistance=250, repelStrength=10, scale 7.5 (zoomed in a lot).
  => The graph is not hiding anything. It honestly shows ~400 unlinked dots. No colour groups, so the dots also all look the same.
- core-plugins.json: graph, backlink, outgoing-link, tag-pane, properties, daily-notes, templates, bases, canvas, sync all ON. No community plugins (no community-plugins.json, no plugins folder). So no Dataview.
- templates.json: folder = Templates.

## 4. Broken or stale pointers
- BROKEN: vault/Founder/vibe_journal.html -> /Users/franciscocazares/vibe/public/journal/vibe_journal.html (folder public/journal no longer exists). Real file since S68: /Users/franciscocazares/vibe/journal/vibe_journal.html (363,958 bytes, Sep 25).
- OK: Founder/Handoffs -> /Users/franciscocazares/vibe/handoffs
- OK: Reference/Brand-files -> /Users/franciscocazares/vibe/brand
- OK: Reference/Mockups/*.html (8 file symlinks) -> ~/Downloads/otto_mockups/*.html
- Stale text: Founder/Journal.md links [[Handoffs/_index]] which does not exist.

## 2. How the files point at each other today (script: scratchpad/s72prep/refs.py + analyze2.py)

Obsidian only draws a line for `[[name]]` or `[text](note.md)`. A path inside backticks is code to Obsidian. It draws nothing.

Across the 425 handoff notes:
- Backticked `.md` paths: 1,407. Of those, 1,175 point at a handoff note that really exists. Example: `handoffs/2026-09-12-decisions.md` in 2026-09-12-session-58-metrics-plus-campuses.md.
- Bare `.md` names with no backticks: 969 (931 match a real note). 146 of them are in the S71 audit alone, e.g. `wave-1-contracts.md:586`, `B5-repair.md:14`.
- Markdown links `[text](path)`: 429 internal ones, but 358 go to .png screenshots, 69 go to code files that are not in the vault (src/...tsx), and only 2 go to another note (session 44 -> 43, session 40 -> 39). Those 2 are the only handoff-to-handoff lines in the whole graph.
- "session 63" / "S68" style mentions: 770, of which 560 name a session that has its own handoff file.
- Real `[[wikilinks]]` inside handoffs: 0 (one false hit, a `[[:alnum:]]` regex).
- YAML front matter / tags in handoffs: 0 of 73 top-level. No #tags anywhere in the vault.

If every path-style reference became a link: 1,164 distinct note-to-note lines, 375 of 425 handoff notes connected, 58 of 73 top-level handoffs connected. So the knowledge of "what relates to what" is already written down. It is just in a format Obsidian cannot see.

Sampled files (12): session-24, -40, -44, -53, -58, -64, -65-next-waves, -68-header, -69-chat-wave-0, -70-cloud, 2026-09-12-decisions, chat-redesign/wave-plan.md.
Pattern: early handoffs (Apr/May) say "Session 43" in prose; September ones cite `handoffs/<file>.md` in backticks; wave folders cite siblings by bare name (`code-map.md`, `wave-1-contracts.md`).

Vault's own hub notes are stale:
- Founder/Handoffs Index.md: last edit Sep 3, stops at session 52. 45 of 73 top-level handoffs have no link from anywhere.
- Founder/Vibe.md: last edit Sep 3. Says "IU Indianapolis", "Pricing model never discussed", latest wrap = session 52.
- Founder/Journal.md: last edit Sep 2. Says journal lives at vibe/public/journal (wrong since S68), "v6.1 / Session 49".
- Daily/: 6 notes, last one Sep 22. Daily/2026-09-17.md has zero links (cites `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` in backticks).
- Templates/Daily.md has no links, so new daily notes start unlinked.
- Inbox/, People/, Product/ are empty. So nearly everything in the vault is handoffs.

Memory notes (/Users/franciscocazares/.claude/projects/-Users-franciscocazares-vibe/memory/, 38 files) are NOT in the vault:
- 29 of 38 files have [[links]]; 68 links total. 50 resolve by file name. 18 use the hyphen form from the front-matter `name:` field (e.g. [[project-launch-plan]] while the file is project_launch_plan.md) and would show as grey "missing" dots in Obsidian.
- MEMORY.md uses `[Title](file.md)` links. Obsidian does count those, so MEMORY.md would become a ready-made hub for all 37 notes.
- Memory notes cite 19 different handoff files by backticked path (not links).
- No file-name clashes between memory notes and vault notes.

Obsidian state: version 1.12.7, one vault registered (/Users/franciscocazares/vault), the open tab is the graph view. workspace.json lastOpenFiles lists files under Founder/Handoffs/chat-redesign/..., which proves Obsidian IS indexing through the directory symlink.

## 3b. Does Obsidian read through a symlinked folder? Yes, with caveats
Proof it works here: Obsidian 1.12.7's recent-files list contains Founder/Handoffs/chat-redesign/... files.
Caveats (Obsidian help page "Symbolic links and junctions", fetched Oct 2):
1. Obsidian "strongly advises against" symlinks: risk of data loss or a crash. Keep the real copy backed up (handoffs are in git, good).
2. No loops. A link target must not contain the vault, sit inside it, or overlap another link target. Ours are fine (vibe/handoffs, vibe/brand, ~/.claude/.../memory are all separate from ~/vault).
3. Sync tools do not handle symlinks well (Obsidian Sync, iCloud, git all store the link, not the files). The Sync plugin is switched on but not set up (no sync config file). Phone Obsidian would not see handoffs.
4. FOLDER symlinks are watched for changes. FILE symlinks are "not officially supported" and outside changes are not noticed. Our file symlinks: Founder/vibe_journal.html and the 8 Reference/Mockups/*.html.
5. Real-world consequence: anything done in Obsidian to a handoff (edit, rename, delete, "update links") changes the real file in the git repo. A rename in Obsidian can also rewrite links inside other notes.
6. .html files are not notes. With default settings they do not show in Obsidian's file list and never become graph dots. So the journal can only appear in the graph through Founder/Journal.md.

## THE DIAGNOSIS IN ONE PARAGRAPH
Nothing is broken or hidden in Obsidian. The graph is honest. 443 notes, 404 of them have no link in or out. 425 of the 443 are handoff files, and handoffs talk to each other with file paths in backticks (1,175 of them) and "session 63" in prose (770), which Obsidian treats as plain text. The one hub that links handoffs (Founder/Handoffs Index.md) was written by hand and stopped at session 52 on Sep 3. The notes that DO use [[links]] (38 memory notes, 68 links) live outside the vault. Inbox, People and Product are empty.

## 5. Fix options

### Option 1: hand-written hubs (small)
What: rewrite Founder/Handoffs Index.md by hand up to S71, add one hub note per handoff subfolder, symlink memory in, fix the journal pointer.
Effort: about 45 minutes. Risk: very low (vault files only).
Graph after: one big star around Handoffs Index (73 lines) and 15 folder stars, plus a memory cluster. No timeline. No "this session used these docs".
Problem: it rots. The current index proves it: 19 sessions behind after 4 weeks.

### Option 2 (RECOMMENDED): a small generator script + memory symlink + pointer fixes
What gets created or changed:
a. NEW script /Users/franciscocazares/vibe/scripts/vault-map.mjs (about 200 lines, no dependencies, same style as the other scripts/*.mjs). It only READS vibe/handoffs and the memory folder. It only WRITES inside ~/vault/Founder/Map/ (wipes and rebuilds that one folder) and Founder/Handoffs Index.md. It quits quietly if ~/vault is missing (cloud sessions).
b. Generated notes (60 today):
   - 42 session notes: Founder/Map/Sessions/Session 23.md ... Session 71.md. Each has: previous / next session links (the chain), its handoff file(s) (4 sessions have two), "docs this session points at" (lifted from the backticked paths: 180 links today), the daily note of the same date if one exists, memory notes that mention that session.
   - 15 folder hubs: Founder/Map/Folders/chat-redesign.md (151 files), wave-plan-sec2.md (71), wave-plan-s67.md (35), wave-plan-pwa.md (32) ... each links every file in that folder. Uses full paths for the 9 duplicate names (plan, README, critic, B4-*).
   - Founder/Map/Sessions timeline.md (all 42 in order), Founder/Map/Vibe Map.md (home: timeline, folder hubs, MEMORY, Vibe, Journal, Brand, Mockups).
   - Founder/Handoffs Index.md regenerated: all 73 top-level handoffs by month with each file's own title line.
   Each generated note starts with "GENERATED by scripts/vault-map.mjs. Do not edit."
c. NEW symlink: ~/vault/Founder/Memory -> /Users/franciscocazares/.claude/projects/-Users-franciscocazares-vibe/memory. Brings in 38 notes. MEMORY.md becomes a hub (36 links). 50 of the 68 [[links]] work at once.
d. Journal pointer: re-point ~/vault/Founder/vibe_journal.html to /Users/franciscocazares/vibe/journal/vibe_journal.html, and fix 4 stale lines in Founder/Journal.md (path, file:// link, "v6.1 / Session 49", [[Handoffs/_index]] -> [[Handoffs Index]]).
e. Graph settings (in Obsidian's own Graph > Groups panel, not by editing the file while Obsidian is open): 4 colour groups: path:"Founder/Map" (coral), path:"Founder/Handoffs" (grey), path:"Founder/Memory" (blue), path:Daily (green). Add Templates/ to Settings > Files and links > Excluded files.
f. Habit: run `node scripts/vault-map.mjs` at session close, next to writing the handoff. New handoffs get a "## Related" footer with [[links]] from S72 on (no back-fill).
Effort: about 1 hour, one sitting. Risk: low. No existing repo file changes. One new script in the repo.
Numbers after (simulated, scratchpad/s72prep/simulate.py): 733 generated lines + about 86 from memory. 425 of 425 handoff notes connected. Total notes 443 + 38 + 60 = 541. Loose dots left: about 7 (README, 2 brand READMEs, 4 templates; templates get excluded).

### Option 3: real [[links]] written into the handoff files (big)
What: a one-time script appends a "## Related" footer to every handoff that cites another one, turning its backticked paths into [[file name]] links. Obsidian finds [[file name]] without a path, so a footer line is enough.
Scope: 306 of 425 handoff files change, about 1,164 links. All tracked in git (908 files under handoffs/). Plus the memory symlink and journal fix from Option 2.
Effort: 1.5 to 2 hours including reading a 300-file diff. Risk: medium.
- It rewrites historical records. 101 commits touched handoffs in the last 14 days, and one cloud branch is live (origin/claude/relaxed-davinci-9d11h3), so merge noise is likely.
- 700 places cite another handoff by line number (file.md:40). A footer at the END keeps those right. Anything inserted at the top would break them.
- 9 duplicate names (plan x4, README x4, critic x3 ...) need full paths or the link lands on the wrong file.
- On GitHub the links show as raw [[text]].
- Every future agent (including cloud ones) must keep the habit, or it rots like the index did.
Graph after: the richest picture. True doc-to-doc lines, 375 of 425 handoffs joined, and the Backlinks panel on any handoff shows who cites it. But no session chain and 50 files still loose, so it still wants the hubs from Option 2.

### Pieces (d) and (e) on their own
(d) Memory symlink: cheap and safe. Gives a 38-note cluster with real cross-links today. 18 links use hyphen names and will show as 9 grey "missing" dots: [[project-launch-plan]] x4, [[reference-design-canvas]] x3, [[project-security-model]] x3, [[project-handoffs]] x3, [[project-org-model]], [[project-school-context]], [[reference-obsidian-vault]], [[feedback-workflow-waves]], [[feedback-vault-capture]]. Fix = change those 18 links to the underscore file names in 11 memory files (needs Franky's yes, it edits ~/.claude memory), or tick "Existing files only" in the graph filter.
(e) Journal pointer: worth fixing for tidiness, but it adds nothing to the graph. An .html file is not a note. Note the journal is PRIVATE since S68 (gitignored, this Mac only), which is fine for a local vault.

## RECOMMENDATION: Option 2
Why: it connects everything without touching one committed handoff, it rebuilds itself so it cannot go stale the way the hand index did, and it adds the two things Franky actually thinks in: a session timeline and "what did this session touch". Option 3's direct lines are nicer but not worth rewriting 306 history files three weeks before the Oct 26 chat switch-on and the end-of-October deadline. Start the "## Related" footer on NEW handoffs from S72 so the direct lines grow from here.

What Franky will see in the graph after Option 2:
- Today: a field of about 440 same-coloured dots with one small clump (39 notes) around "Handoffs Index" and "Vibe".
- After: no loose handoff dots. A coral chain of 42 session dots from Session 23 to Session 71. Each session dot has a small fan: its handoff and the plans, reports and specs it used. 15 grey stars for the work folders, the biggest being chat-redesign (151) and wave-plan-sec2 (71). A blue memory cluster of 38 around MEMORY, tied to the sessions it mentions. "Vibe Map" in the middle holding it together.
- Tip: for a calm view, type `path:"Founder/Map" OR path:"Founder/Memory" OR file:session` in the graph filter. That hides the roughly 350 sub-agent work files and shows only the spine.
- Clicking any session dot and opening "local graph" shows that session's neighbourhood.

## Other things noticed (not part of the fix)
- Inbox/, People/, Product/ are empty. The capture rule in memory (feedback_vault_capture.md) saves thoughts to Inbox, but nothing is there. Either nothing was captured or it was never used.
- Founder/Vibe.md is 4 weeks stale (IU-only wording, "pricing never discussed", latest wrap S52). The memory notes are the real source of truth now. After the memory symlink, Vibe.md could become 10 lines that link to MEMORY and Vibe Map.
- memory/reference_obsidian_vault.md still says the journal symlink points at vibe/public/journal. Stale since S68.
- "Claude outputs/" holds 12 resume files (docx/pdf). Useful for the portfolio idea Franky mentioned. Not notes, not in the graph.
- handoffs/ also has 305 png, 113 json, 29 html. Hidden from the graph because "Attachments" is off. Leave it off.
- The vault has no backup (no git, Sync not set up). Handoffs and memory are safe elsewhere, but Daily/ and the 3 Founder notes exist only in ~/vault.

## Files written by this research (scratchpad only)
analyze.py, analyze2.py, refs.py, simulate.py, graph.json, edges.json, obsidian.md in /private/tmp/claude-501/-Users-franciscocazares-vibe/3f2b2faf-e272-43a9-b45e-25788db6edb8/scratchpad/s72prep/
Nothing in ~/vault, ~/vibe, ~/.claude or ~/vibe-marketing was changed.
