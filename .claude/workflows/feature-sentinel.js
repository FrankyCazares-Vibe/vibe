export const meta = {
  name: 'feature-sentinel',
  description: 'Hunts for BROKEN and silently-degraded features in Vibe — things that do not throw but do not work — and reports them ranked by user impact',
  whenToUse: 'After any hardening/refactor/migration, before showing the app to testers, or when "it feels quiet". The sibling of security-sentinel: that one asks "can this be attacked?", this one asks "does this still work?"',
  phases: [
    { title: 'Recon', detail: 'inventory user-facing surfaces, entry points, and what changed recently' },
    { title: 'Hunt', detail: 'breakage lenses (all 10, or the args.lenses subset) over code, config, DB state and the live site' },
    { title: 'Merge', detail: 'fold duplicate findings reported by several lenses into one' },
    { title: 'Verify', detail: 'adversarially confirm each Blocking/Degraded finding is broken RIGHT NOW' },
    { title: 'Report', detail: 'synthesize into a founder-readable, impact-ranked report' },
  ],
}

const DATE = (args && args.date) || 'today'
const SITE = (args && args.site) || 'https://www.connectvibe.app'
const SINCE = (args && args.since) || '14 days ago'
// Set args.authed = true when the runner has a signed-in browser session
// available (see the `setup-browser-cookies` skill). Without it, live checks
// only cover anonymous surfaces and everything behind login is static-only.
const AUTHED = Boolean(args && args.authed)

const ROE = `RULES OF ENGAGEMENT (follow exactly):
- This is the OWNER'S OWN app. Repo is the current working directory; live site is ${SITE}.
- DO NOT MODIFY ANY FILE and do not commit. You are diagnosing, not fixing. A fix belongs in the report as a recommendation.
- You MAY run read-only shell (cat/sed/grep/find/git log/git diff/git show), read-only Supabase MCP SQL (ToolSearch select:mcp__supabase__execute_sql,mcp__supabase__list_tables) to inspect REAL DATA DISTRIBUTIONS, and \`npx tsc --noEmit\` / \`npx eslint\`.
- You MAY issue read-only HTTP GETs to ${SITE} and inspect response status, headers and body. Do NOT POST, do not submit forms, do not create or delete anything, do not flood (a few dozen requests total across the whole lens).
- NEVER write to the production database. NEVER run a migration. Read-only SQL only.
- ${AUTHED ? 'A signed-in browser session IS available — you may load authenticated pages in the browser and read console + network errors.' : 'No signed-in session is available. Live checks cover ANONYMOUS surfaces only; for anything behind login, reason from code + DB state and mark the finding as needing a live authenticated check.'}
- Report what is TRUE NOW. "It looks wrong in the code" is a hypothesis; prove it against current code, current DB state, or a live response before you call it broken.`

const STACK = `Stack: Next.js 16 App Router + Supabase (Postgres/Auth/Storage) + Cloudflare R2 + Resend + Sentry, on Vercel.
IMPORTANT SHAPE OF THIS CODEBASE (breakage tends to hide in these seams):
- HARD DESKTOP/MOBILE FORK. Routes like /messages, /onboarding, /profile render a *Switch* component that picks a native React component on mobile and IFRAMES A STATIC PAGE from public/html/** on desktop. A feature can be perfectly fine on one viewport and dead on the other.
- SELF-FRAMING. The app iframes its own pages (app/messages/MessagesSwitch.tsx, app/onboarding/OnboardingSwitch.tsx, resume previews in both onboarding flows). Anything that affects framing breaks these.
- STATIC PROTOTYPES ARE LIVE. public/html/*.html are real, shipped pages with inline JS (no build step, no type checking) that call /api/** and render real user data. They break silently and tsc will never tell you.
- GRANTS ARE THE BOUNDARY. The Supabase anon key is in every browser, so column grants + RLS policies (supabase/migrations/**) gate data, not route handlers. A REVOKE can break a legitimate read as easily as it blocks an attacker.
- SERVER GATES. src/lib/auth/campus-access.ts (enforceCampusAccess) and src/lib/legal/require-terms.ts gate pages and write routes; a gate that cannot be satisfied is a dead end.`

const FINDING_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['slug', 'title', 'impact_level', 'surface', 'description', 'user_symptom', 'why_it_happens', 'evidence', 'current_status', 'recommendation'],
        properties: {
          slug: { type: 'string', description: 'short-kebab-id' },
          title: { type: 'string' },
          impact_level: { type: 'string', enum: ['Blocking', 'Degraded', 'Cosmetic', 'Latent'], description: 'Blocking = the feature cannot be used. Degraded = it works but produces wrong/incomplete results. Cosmetic = looks wrong, still usable. Latent = fine today, breaks on a foreseeable condition.' },
          surface: { type: 'string', description: 'what a USER would call it: "desktop messages", "signup", "the events tab"' },
          viewport: { type: 'string', enum: ['both', 'desktop', 'mobile', 'n/a'] },
          description: { type: 'string' },
          user_symptom: { type: 'string', description: 'exactly what the user sees or fails to see — the sentence they would say' },
          why_it_happens: { type: 'string', description: 'the mechanism, in terms of the actual code/config/data' },
          evidence: { type: 'string', description: 'file:line, a live response, or a SQL result' },
          current_status: { type: 'string', enum: ['confirmed_broken', 'needs_live_test', 'needs_authed_test', 'uncertain', 'likely_fine'] },
          recommendation: { type: 'string' },
          introduced_by: { type: 'string', description: 'commit/date if you can trace it, else ""' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['verdict', 'reasoning'],
  properties: {
    verdict: { type: 'string', enum: ['confirmed_broken', 'already_fixed', 'false_positive', 'needs_live_test', 'needs_authed_test', 'uncertain'] },
    corrected_impact: { type: 'string', enum: ['Blocking', 'Degraded', 'Cosmetic', 'Latent'] },
    reasoning: { type: 'string' },
    proof: { type: 'string', description: 'what you actually read or requested to decide' },
  },
}

const INVENTORY_SCHEMA = {
  type: 'object',
  required: ['summary', 'surfaces', 'recent_changes'],
  properties: {
    summary: { type: 'string' },
    surfaces: { type: 'array', items: { type: 'string' }, description: 'user-facing surface → how it renders (react/iframe/static) → key APIs it calls' },
    recent_changes: { type: 'array', items: { type: 'string' }, description: 'notable commits in the window and what they touched' },
    entry_points: { type: 'array', items: { type: 'string' }, description: 'nav links, routes, deep links a user can actually reach' },
  },
}

const ALL_DIMENSIONS = [
  { key: 'hardening-fallout', title: 'Hardening fallout', focus: `Every defensive measure, checked against what the app LEGITIMATELY does. This lens exists because \`X-Frame-Options: DENY\` shipped in Session 51 and silently killed four self-framed screens for four days. Go through: response headers in next.config.ts (frame options, CSP if present, CORS, Permissions-Policy — does the app use any permission it denies?); every REVOKE/GRANT and RLS policy in supabase/migrations/** (does a legitimate read or write now fail? cross-check against the selects the routes actually issue); rate limits in src/lib/rate-limit.ts + callers (is a limit low enough to hit in normal use — e.g. a chatty page polling, or one user action costing several calls?); the consent gate (src/lib/legal/require-terms.ts) and campus gates; server-only guards; middleware rewrites. For EACH, name the legitimate behaviour it blocks, or say it is clean.` },
  { key: 'inert-data', title: 'Inert data and dead branches', focus: `Code that filters, ranks, gates or branches on a value that in PRODUCTION is always empty, always the same, or never written. Three real examples from this repo: /api/events filtered on users.school which nothing populated (so it fell back to showing only your own events); suggested-connections gated a whole tier on the viewer having a school (so it returned nothing for everyone); the profile badge fell back to the email domain and rendered the literal "iu.edu". METHOD: for every column/flag/env var used in a WHERE, filter, sort or if-branch that affects what a user sees, query the live DB for its actual distribution (count, distinct values, how many rows are null/empty) and say what the code does at that distribution. Also check feature flags (src/lib/feature-flags.ts) — is a surface permanently off? Read-only SQL.` },
  { key: 'contract-drift', title: 'Client/server contract drift', focus: `A caller expecting a shape the server no longer returns. Compare every client fetch against the route that answers it: field names, nesting, nullability, status codes. Include the static prototypes in public/html/** (inline JS, never type-checked — the highest-risk callers) and the mobile components in src/components/mobile/**. Look for: renamed/removed response fields still read by a client; a client reading \`d.x\` where the server now nests it; error paths that swallow a non-200 and render an empty state; a route whose params/return changed in a recent commit while one of several callers was missed. tsc will NOT catch any of this across the fetch boundary.` },
  { key: 'dead-ends', title: 'Dead ends, dead links and gate traps', focus: `Places a user can get stuck or hit nothing. Enumerate nav items, buttons, deep links and redirects; confirm each destination exists and renders. Hunt redirect loops and unsatisfiable gates (a gate that redirects to a page which redirects back; a gate whose condition no flow can ever set). Check the auth/consent/campus/onboarding gate ORDER end to end for each user state (new, unverified, no-consent, no-campus, complete) and identify any state with no forward path. Check that every "coming soon"/disabled control is intentional. Live-GET the anonymous routes to confirm status codes.` },
  { key: 'empty-state-lies', title: 'Empty states that are actually errors', focus: `The most damaging class for a pilot: a surface that renders "nothing here yet" when the truth is a failed request, a filter that matches nothing, or a permission denial. For every list/feed/rail in the app (feed, events, orgs, people rail, notifications, search, threads, bookmarks, calendar), trace what happens when its fetch 401s/403s/500s or returns [] — does the UI distinguish "empty" from "failed"? Any surface that shows the same thing for both is a finding, because it makes outages invisible. Cross-check against real DB counts: if the DB has rows but the surface would show none for a typical user, that is a confirmed break.` },
  { key: 'render-blockers', title: 'Render blockers: frames, assets, scripts, media', focus: `Things the browser refuses to load. Iframes (the app frames itself — verify each still loads, headers included); external scripts and styles (cdnjs pdf.js in src/lib/pdfjs-cdn.ts and public/html/**, Google Fonts) — are they reachable, pinned to a version that exists, and allowed by current headers?; images and media (public bucket URLs, /api/posts/[id]/media, /api/resume/[...path] and its signed-URL TTLs — does a link expire before a slow page finishes loading?); fonts; anything whose failure yields a blank region rather than an error. Live-GET the asset URLs where you can and report the status.` },
  { key: 'cross-viewport', title: 'Desktop vs mobile divergence', focus: `This codebase forks hard by viewport (src/lib/use-is-mobile.ts + *Switch components): mobile gets native React, desktop gets an iframe of a static page. For each forked surface, compare feature-by-feature: does an action available on one exist on the other? Was a recent change applied to only one branch? Do both send the same payload shape to the same API? Also check the static desktop pages for stale mirrors of TypeScript constants (they cannot import, so values are hand-copied — find any that have drifted from their source of truth).` },
  { key: 'write-paths', title: 'Writes that silently fail', focus: `Actions that appear to succeed but do not persist. For each user write (post, comment, message, RSVP, follow, block, report, profile edit, upload, org create/join, campus pick, consent), trace: does the client check the response? does it surface a failure, or optimistically render success? would an RLS/grant denial or a 403 gate show up to the user at all? Cross-check the write path's required grants against the current migrations. Flag any write whose failure is invisible, and any optimistic UI with no reconciliation.` },
  { key: 'recent-regression', title: 'Recent-change regression sweep', focus: `Run \`git log --since="${SINCE}" --oneline\` and \`git show --stat\` on each. For every commit, ask specifically: what user-visible behaviour could this have changed that its own message does not mention? Pay attention to changes in shared/global scope — headers, middleware, migrations, shared libs, _persistence.js and other files loaded by every static page. For each suspicious change, go read the consumers and decide. This lens is expected to produce the highest-confidence findings because it has a diff to anchor on.` },
  { key: 'live-smoke', title: 'Live smoke test of the running site', focus: `Actually exercise ${SITE} read-only. GET every anonymous-reachable route and asset you can enumerate; record status, redirect chain, and whether the body contains real content vs an error/empty shell. Check response headers for anything that would break rendering. Verify the marketing/landing path, the auth pages, share links (/profile/<handle>, /posts/<id>) including their OG metadata, and the legal pages. ${AUTHED ? 'With the signed-in session, also load the main authenticated surfaces in the browser and collect console errors and failed network requests — this is the single highest-signal source in the whole run.' : 'NOTE: no signed-in session, so authenticated surfaces cannot be loaded — say so explicitly in your findings rather than guessing, and mark them needs_authed_test.'} Report concrete status codes and excerpts.` },
]
// Optional lens subset: pass args.lenses = ["recent-regression","live-smoke",...] to run a targeted
// re-check (e.g. right after a fix pass) instead of all ten. Unknown keys are reported and ignored.
const WANTED = (args && Array.isArray(args.lenses) && args.lenses.length) ? args.lenses : null
const DIMENSIONS = WANTED ? ALL_DIMENSIONS.filter((d) => WANTED.includes(d.key)) : ALL_DIMENSIONS
if (WANTED) log(`lens subset: ${DIMENSIONS.map((d) => d.key).join(", ")}${WANTED.filter((k) => !ALL_DIMENSIONS.some((d) => d.key === k)).length ? " (ignored unknown: " + WANTED.filter((k) => !ALL_DIMENSIONS.some((d) => d.key === k)).join(", ") + ")" : ""}`)

const finderPrompt = (d, inv) => `You are a senior engineer doing a BREAKAGE audit of a live product. You are not looking for vulnerabilities — a sibling audit does that. You are looking for things that DO NOT WORK, especially things that fail silently: no exception, no red error, just a feature that quietly does nothing or does the wrong thing.

${ROE}

${STACK}

SURFACE INVENTORY (from recon, trimmed): ${inv}

YOUR LENS: ${d.title}
${d.focus}

Method: prove it. Read the code, query the real data distribution, or make the live request — then state what a user would actually experience. The most valuable finding in this audit is one where the app looks fine and is not. Prefer a handful of well-evidenced findings (aim for the 3-8 that matter most for this lens) over a long list of hypotheticals; if the lens is genuinely clean, return an empty findings array and say so in the evidence of nothing — do not invent problems.

For each finding: user_symptom must be the sentence the user would say ("the messages page is blank", "my events list is empty even though there are events"), and why_it_happens must name the actual mechanism with a file:line, a SQL result, or an HTTP response. Set current_status honestly — 'confirmed_broken' only when you have direct evidence it is broken right now. Return via the schema.`

const verifyPrompt = (f) => `You are an ADVERSARIAL verifier on a breakage audit. A finder claims the feature below is broken. Your job is to DISPROVE it if you can: read the actual current code, query the actual data, or make the actual request.

${ROE}

CLAIM
title: ${f.title}
impact: ${f.impact_level}
surface: ${f.surface} (${f.viewport || 'n/a'})
symptom: ${f.user_symptom}
mechanism: ${f.why_it_happens}
evidence offered: ${f.evidence || 'none'}

Common reasons a claim like this is WRONG: the finder read a stale file; another code path handles the case; the data distribution they assumed does not match production; the "empty" state is correct because there genuinely is no data; a fallback exists that they missed; the behaviour is intentional and documented.

Verdicts: 'confirmed_broken' (you independently reproduced the reasoning against current code/data/live), 'already_fixed', 'false_positive' (the code never behaved as claimed), 'needs_live_test' / 'needs_authed_test' (only a real session could settle it), 'uncertain'. Set corrected_impact to what you would actually rate it — downgrade drama, upgrade anything that blocks a core flow. Demand evidence.`

// ---- Recon ---------------------------------------------------------------
phase('Recon')
const invRes = await agent(
  `${ROE}\n\n${STACK}\n\nRECON. Build a map of the app AS A USER MEETS IT, to aim a breakage audit.\n\n1. SURFACES: every user-facing route/page. For each: how it renders (React page, *Switch fork, iframe of a static page, pure static), which viewport branch applies, and the main /api endpoints it calls.\n2. ENTRY POINTS: nav items, tab bars, buttons and deep links a user can actually reach — including the static pages under public/html/**.\n3. RECENT CHANGES: \`git log --since="${SINCE}" --oneline\` plus \`git show --stat\` for each; note anything touching shared scope (headers, middleware, migrations, shared libs, files every page loads).\n4. Note which surfaces are behind login (so later lenses know what they cannot live-test${AUTHED ? '' : ' — no signed-in session is available this run'}).\n\nBe concrete and terse; this feeds ten parallel lenses.`,
  { label: 'recon:surfaces', phase: 'Recon', schema: INVENTORY_SCHEMA, agentType: 'general-purpose' },
)
const inventory = invRes || { summary: '(recon unavailable)', surfaces: [], recent_changes: [], entry_points: [] }
const invStr = JSON.stringify(inventory).slice(0, 2800)
log(`recon: ${(inventory.surfaces || []).length} surfaces, ${(inventory.recent_changes || []).length} recent changes`)

// ---- Hunt (all lenses, barrier) -----------------------------------------
phase('Hunt')
const huntResults = await parallel(DIMENSIONS.map((d) => () =>
  agent(finderPrompt(d, invStr), { label: `hunt:${d.key}`, phase: 'Hunt', schema: FINDING_SCHEMA, agentType: 'general-purpose' })
    .then((res) => ((res && res.findings) || []).map((f) => ({ ...f, dimension: d.key })))))
const raw = huntResults.filter(Boolean).flat()
log(`hunt: ${raw.length} raw findings across ${DIMENSIONS.length} lenses`)

// ---- Merge (barrier is deliberate: dedup needs the whole set) -------------
// The first run reported the same break from several lenses — a signup
// lockout seen by hardening-fallout AND dead-ends, an onboarding iframe
// hand-off seen by three lenses, an unknown-handle 200 seen twice. Each
// duplicate then cost its own verifier. Fold them here, before verification,
// and keep the trail in `merged_from` so nothing is silently dropped.
phase('Merge')
const MERGE_SCHEMA = JSON.parse(JSON.stringify(FINDING_SCHEMA))
MERGE_SCHEMA.properties.findings.items.properties.merged_from = { type: 'array', items: { type: 'string' }, description: 'every raw slug this canonical finding absorbs, as "<lens>:<slug>"' }
MERGE_SCHEMA.properties.findings.items.properties.dimension = { type: 'string', description: 'the primary lens key' }
MERGE_SCHEMA.properties.findings.items.required.push('merged_from', 'dimension')
const trim = (f) => ({ ref: `${f.dimension}:${f.slug}`, title: f.title, impact_level: f.impact_level, surface: f.surface, viewport: f.viewport, user_symptom: (f.user_symptom || '').slice(0, 400), why_it_happens: (f.why_it_happens || '').slice(0, 500), evidence: (f.evidence || '').slice(0, 300), current_status: f.current_status, recommendation: (f.recommendation || '').slice(0, 300), introduced_by: f.introduced_by || '' })
const mergeRes = raw.length > 1
  ? await agent(`You are consolidating a breakage audit's raw findings before they are verified. ${raw.length} findings came from ${DIMENSIONS.length} independent lenses that could not see each other, so the SAME user-visible break often appears several times under different titles.

RAW FINDINGS (JSON):
${JSON.stringify(raw.map(trim)).slice(0, 60000)}

Rules:
- Merge entries that describe the SAME break: same user-facing symptom on the same surface caused by the same mechanism. Two findings that merely share a file or a lens are NOT duplicates; two that describe one bug from two angles ARE.
- For each merged group keep: the most specific user_symptom, the strongest evidence (combine file:line refs if they add up), the HIGHEST impact_level claimed, the most honest current_status (prefer a status backed by evidence), the union of viewports if they differ, and the primary lens as \`dimension\`. Write a title a founder would recognise.
- \`merged_from\` must list EVERY raw ref (format "<lens>:<slug>") the canonical finding absorbs — a singleton lists just itself. The union of all merged_from arrays must equal the full raw set: never drop a finding, never invent one.
- Preserve every field the schema requires. Return via the schema.`, { label: 'merge:dedupe', phase: 'Merge', schema: MERGE_SCHEMA, agentType: 'general-purpose' })
  : null
let canonical = (mergeRes && mergeRes.findings) || raw.map((f) => ({ ...f, merged_from: [`${f.dimension}:${f.slug}`] }))
// Safety net: if the merge lost findings, fall back to the raw set rather than under-report.
const absorbed = new Set(canonical.flatMap((f) => f.merged_from || []))
const missing = raw.filter((f) => !absorbed.has(`${f.dimension}:${f.slug}`))
if (missing.length > 0) {
  log(`merge dropped ${missing.length} finding(s) — re-adding them unmerged`)
  canonical = canonical.concat(missing.map((f) => ({ ...f, merged_from: [`${f.dimension}:${f.slug}`] })))
}
log(`merge: ${raw.length} raw → ${canonical.length} canonical (${raw.length - canonical.length} duplicates folded)`)

// ---- Verify (Blocking/Degraded only; each independently disproved) ------
phase('Verify')
const IMPACTFUL = new Set(['Blocking', 'Degraded'])
const verifyOne = (f) => {
  // Cosmetic/Latent findings are cheap to state and rarely worth a second
  // agent; verify anything that claims a user cannot do something.
  if (!IMPACTFUL.has(f.impact_level)) {
    return Promise.resolve({ ...f, verdict: f.current_status, corrected_impact: f.impact_level })
  }
  return agent(verifyPrompt(f), { label: `verify:${f.dimension}:${f.slug}`, phase: 'Verify', schema: VERDICT_SCHEMA, agentType: 'general-purpose' })
    .then((v) => (v ? { ...f, verdict: v.verdict, corrected_impact: v.corrected_impact || f.impact_level, verify_reasoning: v.reasoning, verify_proof: v.proof } : null))
}
const verifiedAll = await parallel(canonical.map((f) => () => verifyOne(f)))

const all = verifiedAll.filter(Boolean)
const isLive = (v) => ['confirmed_broken', 'needs_live_test', 'needs_authed_test', 'uncertain'].includes(v)
const live = all.filter((f) => isLive(f.verdict))
const counts = {
  total: all.length,
  live: live.length,
  confirmed: all.filter((f) => f.verdict === 'confirmed_broken').length,
  needsTest: all.filter((f) => f.verdict === 'needs_live_test' || f.verdict === 'needs_authed_test').length,
  fixed: all.filter((f) => f.verdict === 'already_fixed').length,
  falsePos: all.filter((f) => f.verdict === 'false_positive').length,
}
log(`hunt done: ${counts.live} live findings (${counts.confirmed} confirmed broken), dropped ${counts.fixed} fixed + ${counts.falsePos} false positives`)

const rank = { Blocking: 0, Degraded: 1, Cosmetic: 2, Latent: 3 }
const impactOf = (f) => f.corrected_impact || f.impact_level
const sorted = [...live].sort((a, b) => (rank[impactOf(a)] ?? 9) - (rank[impactOf(b)] ?? 9))
const compact = (f) => ({ title: f.title, impact: impactOf(f), status: f.verdict, surface: f.surface, viewport: f.viewport, symptom: f.user_symptom, why: f.why_it_happens, fix: f.recommendation, evidence: f.evidence || '', introduced_by: f.introduced_by || '' })

// ---- Report ---------------------------------------------------------------
phase('Report')
const SECTIONS = [
  { key: 'blocking', title: 'Blocking — a user cannot do this at all', pick: (f) => impactOf(f) === 'Blocking' },
  { key: 'degraded', title: 'Degraded — it works, but gives the wrong result', pick: (f) => impactOf(f) === 'Degraded' },
  { key: 'quiet', title: 'Quiet failures — outages that look like emptiness', pick: (f) => ['empty-state-lies', 'inert-data'].includes(f.dimension) && impactOf(f) !== 'Blocking' },
  { key: 'rest', title: 'Cosmetic and latent', pick: (f) => ['Cosmetic', 'Latent'].includes(impactOf(f)) && !['empty-state-lies', 'inert-data'].includes(f.dimension) },
]

const sectionPrompt = (s, items) => `You are writing one section of a BREAKAGE report for the founder of Vibe (a live college social app at ${SITE}) and the teammates they share it with. Readers are smart; only the founder writes code.

SECTION: ${s.title}

FINDINGS (JSON):
${JSON.stringify(items.map(compact), null, 1).slice(0, 12000)}

Write clean markdown. For each finding use a "### " heading that names the thing a user would name, then short paragraphs (no nested bullets): **What breaks** (the symptom, in the user's words), **Why** (the actual mechanism, naming the file or setting), **Fix** (what to change), and **Where** (evidence). Order by how much it hurts a real user. Be concrete and unhedged where the evidence is solid; say plainly when something still needs a live signed-in check. No preamble, no restating the section title, no closing summary. If there are no findings, output exactly: _Nothing found in this category._`

const execPrompt = `You are writing the EXECUTIVE SUMMARY of a breakage report for the founder of Vibe, a live college social app at ${SITE} piloting with a handful of real students.

VERIFIED FINDINGS (JSON):
${JSON.stringify(sorted.map((f) => ({ area: f.dimension, title: f.title, impact: impactOf(f), status: f.verdict, symptom: f.user_symptom, surface: f.surface })), null, 1).slice(0, 9000)}

Write 4-7 short paragraphs, no bullets, plain language:
1. The honest headline: is the product usable right now, and what is the worst thing a tester would hit?
2. The pattern, if there is one — are the breaks concentrated in a viewport, a recent change, a defensive measure, or an assumption about data that stopped being true?
3. The two or three that cost the most trust with a pilot user, and why those.
4. What is NOT broken — say so specifically; a report that only lists problems misleads.
5. What this run could not check (especially anything behind login${AUTHED ? '' : ', since no signed-in session was available'}).
No preamble. Do not restate the finding list.`

const fixOrderPrompt = `You are writing the FIX ORDER for the founder of Vibe from the breakage findings below. One person does the work.

FINDINGS (JSON):
${JSON.stringify(sorted.map(compact), null, 1).slice(0, 12000)}

Produce a short ordered plan in markdown: "Right now" (anything blocking a core flow for a real tester), "This week", "When convenient", and "Needs a decision, not a fix" (things that are working as designed but feel broken to users). For each item: one line naming it and the file or setting to change, plus how to confirm it is fixed. Group items that share a root cause into one entry — do not list the same fix five times. If something needs a signed-in check before it can even be diagnosed, say that instead of guessing.`

const [execMd, fixMd, ...sectionMds] = await parallel([
  () => agent(execPrompt, { label: 'exec-summary', phase: 'Report' }),
  () => agent(fixOrderPrompt, { label: 'fix-order', phase: 'Report' }),
  ...SECTIONS.map((s) => () => {
    const items = sorted.filter(s.pick)
    if (items.length === 0) return Promise.resolve('_Nothing found in this category._')
    return agent(sectionPrompt(s, items), { label: `write:${s.key}`, phase: 'Report' })
  }),
])

const cell = (x) => String(x == null ? '' : x).replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim()
const rows = sorted.map((f, i) => `| ${i + 1} | ${cell(f.title)} | ${cell(impactOf(f))} | ${cell(f.verdict)} | ${cell(f.surface)} | ${cell(f.viewport || '')} | ${cell(f.dimension)}${(f.merged_from || []).length > 1 ? ' (+' + ((f.merged_from || []).length - 1) + ' lenses)' : ''} |`).join('\n')
const sectionBlocks = SECTIONS.map((s, i) => `## ${s.title}\n\n${(sectionMds[i] || '_(section writer produced no output)_').trim()}`).join('\n\n---\n\n')

const markdown = `# Vibe — Broken Features Report

**Prepared:** ${DATE}  |  **Target:** ${SITE}  |  **Method:** read-only breakage audit — ${DIMENSIONS.length} lenses over code, live database state, and the running site, with every user-impacting finding independently re-checked before it was kept.

> **What this is.** The sibling of the security report. That one asks "can someone attack this?"; this one asks "does this still work?" It hunts the failures that do not throw — a feature that renders nothing, a filter on data that is always empty, a defensive header that blocks a real screen — because those are invisible to type checks, to builds, and to a security review.
>
> **Scope.** Read-only: nothing was modified, no data was written, no migration was run.${AUTHED ? ' A signed-in session was available, so authenticated surfaces were loaded live.' : ' **No signed-in session was available**, so anything behind login was assessed from code and database state only — findings marked "needs authed test" are unconfirmed and should be checked with a real account.'}

**At a glance:** ${counts.live} live findings — ${counts.confirmed} confirmed broken, ${counts.needsTest} needing a live check. Verification dropped ${counts.fixed} already fixed and ${counts.falsePos} false positives.

---

## Executive Summary

${(execMd || '_(no executive summary produced)_').trim()}

---

${sectionBlocks}

---

## Fix Order

${(fixMd || '_(no fix order produced)_').trim()}

---

## Appendix A — All findings

| # | Finding | Impact | Status | Surface | Viewport | Lens |
|---|---------|--------|--------|---------|----------|------|
${rows || '| — | (none) | | | | | |'}

## Appendix B — Method & coverage

- **Lenses (${DIMENSIONS.length}):** ${DIMENSIONS.map((d) => d.title).join('; ')}.
- **Merge:** ${raw.length} raw findings from ${DIMENSIONS.length} independent lenses were folded into ${canonical.length} canonical findings before verification (duplicates seen by several lenses count once; the trail is kept per finding).
- **Verification:** every Blocking or Degraded finding was re-checked by an independent agent instructed to disprove it; already-fixed and false-positive items were dropped before this report.
- **Impact scale:** Blocking = the feature cannot be used. Degraded = usable but wrong or incomplete. Cosmetic = looks wrong, still works. Latent = fine today, breaks on a foreseeable condition.
- **Not covered:** performance and load, real device testing, anything requiring a POST or a state change${AUTHED ? '' : ', and every authenticated surface (no session this run)'}.
- **Inventory basis:** ${cell(inventory.summary)}
`

return { markdown, counts, liveCount: live.length }
