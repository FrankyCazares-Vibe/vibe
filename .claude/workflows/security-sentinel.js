export const meta = {
  name: 'security-sentinel',
  description: 'Adversarial security + privacy + legal + cost audit of the Vibe app; verified findings synthesized into a sectioned, shareable report',
  whenToUse: 'Before launches or after big changes: read-only audit of code, DB policies, config, deps across 11 attacker lenses plus legal + monetary risk.',
  phases: [
    { title: 'Recon', detail: 'inventory routes, data, paid services, user populations' },
    { title: 'Hunt', detail: '11 attacker lenses over code, DB policies, config, deps' },
    { title: 'Verify', detail: 'adversarially confirm each Medium+ finding against current code' },
    { title: 'Report', detail: 'synthesize verified findings into reader-ready sections' },
  ],
}

const DATE = (args && args.date) || 'today'
const SITE = (args && args.site) || 'https://www.connectvibe.app'

const ROE = `RULES OF ENGAGEMENT (follow exactly):
- This is an AUTHORIZED audit of the OWNER'S OWN app. Repo is at the current working directory; live site is ${SITE}.
- READ-ONLY. Never modify a file. Never run a state-changing or destructive command. Never write to the database.
- Static analysis is the core method: read source, migrations, and config; follow imports. You MAY run read-only shell (cat/sed/grep/find, npm audit, git log) and read-only Supabase MCP SQL (pg_policies, information_schema, table grants) loaded via ToolSearch (select:mcp__supabase__execute_sql,mcp__supabase__get_advisors,mcp__supabase__list_tables).
- You MAY issue a FEW safe, read-only HTTP GETs to the public site to confirm a header or that an endpoint returns 401/404. Do NOT attempt real exploits, do NOT log in, do NOT submit forms or POST, do NOT send more than a handful of requests, do NOT flood anything.
- A prior hardening pass (Session 51, migration supabase/migrations/20260903100000_security_hardening.sql) already fixed many issues. Assess the CURRENT state: confirm what is still exploitable, catch what that pass missed, and note anything newly introduced. Be honest about current_status.`

const STACK = `Stack: Next.js 16 App Router + Supabase (Postgres + Auth + Storage) + Cloudflare R2 (video/media) + Resend (email) + Sentry, on Vercel. The Supabase ANON key ships to the browser, so RLS policies and column grants — not route handlers — are the real trust boundary. createSupabaseServerClient() = anon key + cookie session (RLS applies); createSupabaseServiceClient() = service role (BYPASSES RLS, must self-authorize in code). API routes: src/app/api/**. RLS + grants: supabase/migrations/**. Static prototypes that render live /api data: public/html/**.`

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low', 'Info'] },
          surface: { type: 'string' },
          description: { type: 'string' },
          attack_scenario: { type: 'string' },
          impact: { type: 'string' },
          current_status: { type: 'string', enum: ['confirmed_current', 'likely_fixed', 'needs_live_test', 'uncertain'] },
          evidence: { type: 'string' },
          recommendation: { type: 'string' },
        },
        required: ['slug', 'title', 'severity', 'surface', 'description', 'attack_scenario', 'impact', 'current_status', 'recommendation'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['confirmed_current', 'already_fixed', 'false_positive', 'needs_live_test', 'uncertain'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    corrected_severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low', 'Info'] },
    rationale: { type: 'string' },
    evidence_checked: { type: 'string' },
  },
  required: ['verdict', 'confidence', 'corrected_severity', 'rationale'],
}

const INVENTORY_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    api_surface: { type: 'array', items: { type: 'string' } },
    data_collected: { type: 'array', items: { type: 'string' } },
    sensitive_data: { type: 'array', items: { type: 'string' } },
    paid_services: { type: 'array', items: { type: 'string' } },
    third_parties: { type: 'array', items: { type: 'string' } },
    user_populations: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary'],
}

const DIMENSIONS = [
  { key: 'auth', title: 'Authentication & session', focus: 'login / signup / password-reset / .edu school-email verification / logout / JWT & cookie handling / account takeover / user + email enumeration. Files: src/app/auth/**, src/app/api/auth/**, src/lib/auth/**, src/lib/supabase/{server,browser,middleware,service,env}.ts, middleware.ts. Check assumptions about Supabase auth config (email confirmation on/off, password policy) and whether verification tokens are single-use and session-bound.' },
  { key: 'authz', title: 'Authorization, IDOR & data isolation (RLS)', focus: "can user A read or modify user B's data; org owner/admin/member/mod role escalation; service-role routes that skip re-authorization after bypassing RLS; direct-object-reference on thread/message/post/org/channel/event ids. Files: src/app/api/me/**, src/app/api/orgs/**, src/app/api/admin/**, src/app/api/posts/**, src/app/api/users/**. Pull live RLS via the supabase MCP (pg_policies) and confirm the Session-51 policies + column grants actually hold (users, orgs, org_members, channels, channel_members, messages)." },
  { key: 'injection', title: 'Injection: SQL/PostgREST/SSRF/redirect/path', focus: 'PostgREST .or()/.filter()/.ilike() built from user input; .rpc() with user input; SSRF via server-side fetch or 307 redirect of a user-controlled URL; open redirect via next/redirect params; path traversal in R2 object keys or server file reads; ICS/email header injection. Files: src/app/api/**, src/lib/pgrest.ts, src/lib/r2.ts, events ics routes, org asset + posts/[id]/media routes, auth callback + login-next handling.' },
  { key: 'xss', title: 'XSS: stored / DOM / reflected', focus: 'user-controlled data rendered unescaped. React dangerouslySetInnerHTML; static prototypes public/html/**/*.{html,js} innerHTML/insertAdjacentHTML sinks fed by /api responses; linkifier / mention / hashtag anchor building; javascript: or data: URLs reaching href/src; banner_gradient or other style-attribute injection. Confirm Session-51 escaping holds and hunt for missed sinks; note which page is highest-risk (attacker content rendered to other users).' },
  { key: 'dataexp', title: 'Data exposure & enumeration', focus: 'PII shown to the wrong audience; anonymous/service-role endpoints that over-return; OG/generateMetadata leaks; column over-selection; resume PDFs in a public Storage bucket with client-only redaction; handle/email/user-id enumeration; profile-view and notification data leakage. Files: src/app/api/users/**, src/app/api/orgs/[slug]/profile, src/app/{profile,posts,orgs}/**/page.tsx, src/lib/profile/**, Storage bucket + policies via supabase MCP.' },
  { key: 'abuse', title: 'Abuse, rate-limiting, DoS & monetary cost', focus: 'endpoints that spend money or can be flooded: Resend email (password reset, .edu verify, notifications), R2 upload + egress, Supabase egress + unbounded row growth, uncapped pagination / expensive queries, heartbeat, view/like/repost inflation, notification + mention spam, mass-follow. Assess whether src/lib/rate-limit.ts covers every money-spending and abuse path, and estimate a realistic worst-case cost for an attacker with one free account. Files: src/lib/rate-limit.ts, src/app/api/** (all POSTs), src/lib/resend*.ts, src/lib/r2.ts.' },
  { key: 'uploads', title: 'File upload & storage', focus: 'R2 presigned PUT/GET and Supabase Storage: content-type allowlist, size caps (is ContentLength actually enforced on the signed PUT?), object-key construction and traversal / cross-user or cross-org prefixes, ability to overwrite another user\'s object, public vs private buckets, MIME sniffing, and SVG/HTML upload leading to stored XSS when served. Files: src/app/api/me/*upload*/**, src/app/api/orgs/[slug]/upload-url, asset/[kind] routes, src/lib/r2.ts, Storage buckets + policies via supabase MCP.' },
  { key: 'client', title: 'Client-side & secrets in bundle', focus: 'secrets leaking into the browser bundle — only NEXT_PUBLIC_* belongs client-side; SUPABASE_SERVICE_ROLE_KEY, R2 keys, RESEND_API_KEY, SCHOOL_EMAIL_VERIFY_SECRET must stay server-only. Check for "use client" files importing service/r2/resend/service-role, process.env reads in client components, trust of localStorage, missing CSP, postMessage, and unsafe client-side redirects. Files: src/lib/supabase/{browser,env}.ts, next.config.ts; grep client components for server env usage.' },
  { key: 'deps', title: 'Dependencies & supply chain', focus: 'known-vulnerable or outdated packages, risky transitive deps, Next.js version currency, and whether any flagged CVE is actually reachable in THIS app. Run `npm audit` (read-only) and reason about real exploitability, not just the raw count. Files: package.json, package-lock.json.' },
  { key: 'legal', title: 'Legal & compliance', focus: "This is a college social network (pilot: IU Indianapolis) collecting student identity, resumes/work history, private DMs, and possibly minors (17-year-old first-years). Assess, at a founder-actionable level (NOT formal legal advice — flag where a lawyer is needed): privacy policy & terms presence and whether they match actual data practices (src/app/legal/**); FERPA exposure; COPPA / minors handling and age gating; GDPR/CCPA data-subject rights (access, deletion, export) and whether account deletion actually purges DB + R2 + Storage (src/app/api/me/route.ts DELETE); email consent & CAN-SPAM (unsubscribe in Resend templates); content moderation & user-safety duties (do report/block/mute exist and work?); third-party data-sharing disclosure (Supabase, R2, Vercel, Resend, Sentry — is PII sent to Sentry?); cookie/consent; and impersonation / IP (the prior 'Maya Chen' profile-unfurl issue). Files: src/app/legal/**, src/app/api/me/route.ts, reports/block/mute routes, src/lib/resend*.ts + email templates." },
  { key: 'infra', title: 'Infrastructure, config & headers', focus: 'security headers + CSP, CORS, cookie flags (Secure/HttpOnly/SameSite), middleware coverage and bypass, env & secret handling + rotation posture, admin bootstrap (is_platform_admin), verbose error / stack leakage, PII in logs, and Sentry PII scrubbing. Files: next.config.ts, middleware.ts, src/lib/supabase/**, src/lib/sentry-config.ts + instrumentation, .env.example, health routes.' },
]

const finderPrompt = (d, inv) => `You are a senior offensive-security engineer running ONE lens of an authorized audit. Think like an attacker; write for the defender.

${ROE}

${STACK}

ASSET INVENTORY (from recon, trimmed): ${inv}

YOUR LENS: ${d.title}
${d.focus}

Method: read the named files and follow their imports; query DB policies/grants where relevant; reason about the exact request an attacker would send. For each real weakness give a concrete attack_scenario (the actual steps or HTTP calls) and a specific impact (what data, harm, or dollar cost results). Favour a handful of well-evidenced findings over many shallow ones — aim for the 3-8 that matter most for this lens. Put file:line references or policy/grant names in "evidence". Set current_status='confirmed_current' only when you verified it in the CURRENT code, 'likely_fixed' if the code shows it was addressed, 'needs_live_test' if only a live request could settle it, 'uncertain' otherwise. Return via the schema; empty findings array if this lens is genuinely clean.`

const verifyPrompt = (f) => `You are an ADVERSARIAL verifier on an authorized audit of the app in the current working directory. A finder reported the issue below. Read the ACTUAL current code / policies it cites and decide whether it is real RIGHT NOW.

${ROE}

FINDING
title: ${f.title}
claimed severity: ${f.severity}
surface: ${f.surface}
description: ${f.description}
attack_scenario: ${f.attack_scenario}
claimed evidence: ${f.evidence || 'n/a'}

Open the cited files/policies yourself (a prior hardening pass may already have fixed it). Verdicts: 'already_fixed' if current code closes it; 'false_positive' if the code never supported the claim; 'confirmed_current' if it is genuinely exploitable now; 'needs_live_test' if only a live request could confirm; 'uncertain' if you cannot tell from static review. Set corrected_severity to what you would actually rate it (downgrade hype, upgrade if worse). Be skeptical and demand evidence.`

// ---- Recon ---------------------------------------------------------------
phase('Recon')
const invRes = await agent(
  `You are doing recon for an authorized security + privacy + cost audit of the app in the current working directory (live at ${SITE}).\n\n${ROE}\n\n${STACK}\n\nProduce a compact inventory the other auditors and the final report will rely on: the API surface (route groups under src/app/api), what data the product collects, which of that is sensitive/PII (identity, .edu email, resumes, DMs, location, etc.), the paid/external services it depends on (Supabase, Cloudflare R2, Resend, Vercel, Sentry) and roughly what each one bills for, the third parties that receive user data, and the user populations (note that the pilot campus is IU Indianapolis and some first-year students may be minors). Read package.json, src/app/api structure, supabase/migrations for the data model, src/lib/**, .env.example, and src/app/legal/**. Keep each array to the most important items. Return via the schema.`,
  { label: 'recon:inventory', phase: 'Recon', schema: INVENTORY_SCHEMA, agentType: 'general-purpose' },
)
const inventory = invRes || { summary: '(recon unavailable)' }
const invStr = JSON.stringify(inventory).slice(0, 2600)
log(`Recon done. Hunting across ${DIMENSIONS.length} attacker lenses.`)

// ---- Hunt + Verify (pipeline, no barrier) --------------------------------
phase('Hunt')
const verifyOne = (f, dkey) => {
  if (!['Critical', 'High', 'Medium'].includes(f.severity)) {
    return Promise.resolve({ ...f, dimension: dkey, verdict: 'unverified_low', confidence: 'n/a', corrected_severity: f.severity })
  }
  return agent(verifyPrompt(f), { label: `verify:${dkey}:${f.slug}`, phase: 'Verify', schema: VERDICT_SCHEMA, agentType: 'general-purpose' })
    .then((v) => v
      ? { ...f, dimension: dkey, verdict: v.verdict, confidence: v.confidence, corrected_severity: v.corrected_severity, verify_rationale: v.rationale }
      : { ...f, dimension: dkey, verdict: 'uncertain', confidence: 'low', corrected_severity: f.severity })
}

const perDim = await pipeline(
  DIMENSIONS,
  (d) => agent(finderPrompt(d, invStr), { label: `hunt:${d.key}`, phase: 'Hunt', schema: FINDING_SCHEMA, agentType: 'general-purpose' }),
  (res, d) => (res && res.findings && res.findings.length)
    ? parallel(res.findings.map((f) => () => verifyOne(f, d.key)))
    : [],
)

const verified = perDim.filter(Boolean).flat().filter(Boolean)
const isLive = (v) => ['confirmed_current', 'needs_live_test', 'uncertain', 'unverified_low'].includes(v)
const live = verified.filter((f) => isLive(f.verdict))
const counts = {
  total: verified.length,
  live: live.length,
  confirmed: verified.filter((f) => f.verdict === 'confirmed_current').length,
  needsLive: verified.filter((f) => f.verdict === 'needs_live_test').length,
  fixed: verified.filter((f) => f.verdict === 'already_fixed').length,
  falsePos: verified.filter((f) => f.verdict === 'false_positive').length,
}
log(`Verified ${verified.length} findings — ${counts.confirmed} confirmed, ${counts.needsLive} need live test, ${counts.fixed} already fixed, ${counts.falsePos} rejected.`)

const sevRank = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 }
const sevOf = (f) => f.corrected_severity || f.severity
const compact = (f) => ({ title: f.title, severity: sevOf(f), status: f.verdict, surface: f.surface, description: f.description, attack: f.attack_scenario, impact: f.impact, fix: f.recommendation, evidence: f.evidence || '' })

// ---- Report --------------------------------------------------------------
phase('Report')
const SECTIONS = [
  { key: 'A', title: 'Authentication & Session Security', dims: ['auth'] },
  { key: 'B', title: 'Authorization & Data Isolation', dims: ['authz'] },
  { key: 'C', title: 'Injection, XSS & Input Handling', dims: ['injection', 'xss', 'client'] },
  { key: 'D', title: 'Data Privacy & Exposure', dims: ['dataexp'] },
  { key: 'E', title: 'Abuse, Rate-Limiting & Cost / Monetary Risk', dims: ['abuse', 'uploads'] },
  { key: 'F', title: 'Legal & Compliance', dims: ['legal'] },
  { key: 'G', title: 'Infrastructure, Config & Dependencies', dims: ['infra', 'deps'] },
]

const sectionFindings = (s) => live.filter((f) => s.dims.includes(f.dimension)).sort((a, b) => (sevRank[sevOf(a)] ?? 9) - (sevRank[sevOf(b)] ?? 9))

const sectionPrompt = (s) => {
  const fs = sectionFindings(s).map(compact)
  const scope = DIMENSIONS.filter((d) => s.dims.includes(d.key)).map((d) => `- ${d.title}: ${d.focus}`).join('\n')
  return `You are writing ONE section of a security + risk report for the founder of Vibe (a college social network).

WHO READS THIS. Franky, the founder. He is smart, he writes every line of the code himself, and he has asked explicitly to have these reports explained non-technically so he can fully understand them. He also shares them with two cofounders who do not code at all. The same document is later handed to the engineer who fixes the findings. So write every finding in two layers, always in this order: a plain-English layer a non-coder understands completely on its own, then the technical detail underneath for whoever does the work. Never satisfy the plain layer by deleting the technical detail.

PLAIN-ENGLISH CONTRACT (absolute in the plain layer, the default everywhere else):
- No unexplained jargon. These words are BANNED unless you gloss them in plain words in the same sentence, the first time they appear in your output: API, endpoint, route, field, payload, contract, RLS, row-level security, policy, grant, service role, 401, 403, 404, 307, cache, header, OG, OpenGraph, proxy, middleware, iframe, localStorage, component, prop, hydration, bundle, key, bucket, migration, schema, XSS, cross-site scripting, CSP, Content-Security-Policy, CSRF, SSRF, open redirect, injection, token, JWT, sanitize, escape, presigned. In the plain layer, prefer dropping the word entirely over glossing it — a gloss is the fallback, not the goal. A gloss is words a parent could follow, e.g. "a Content-Security-Policy (a browser rule listing which code is allowed to run on your pages)".
- Prefer what a STUDENT experiences over what the code does. "A stranger could read the private messages between two students" beats "channel_members is missing a row-level policy".
- Say why it matters in human terms: trust, safety, someone's first impression of Vibe, whether they come back, money leaving the company's account, a complaint a regulator would act on.
- Concrete over abstract. Never stop at "security risk", "attack surface" or "suboptimal" — say what the person on the other end actually sees, loses, or pays.
- Calm and specific. No drama, no scare language, no filler. Short sentences.
- Severity words (Critical / High / Medium / Low) stay, but never lean on the label to carry the seriousness. A reader who ignores the label entirely must still grasp the stakes from your plain sentences alone.

SECTION: ${s.title}

SCOPE THAT WAS EXAMINED:
${scope}

VERIFIED FINDINGS FOR THIS SECTION (JSON; already filtered to still-relevant items; status tells you if it is confirmed now vs needs a live test):
${JSON.stringify(fs).slice(0, 9000)}

Write the section body in GitHub-flavoured markdown. Start with 2-3 sentences of plain-English framing: what this area covers, said in everyday words ("this is about who can see whose messages"), and the overall state. Then one subsection per finding as:
### [SEVERITY] Short title  — <status in plain words>
**In plain terms:** Two or three sentences that a cofounder who does not code can read on their own and fully understand. Zero unexplained jargon — this paragraph obeys the banned-word list with no exceptions. Say what could actually happen to a student on Vibe, or to the company, in this order: what someone could do, who it lands on, and why that matters (trust, safety, privacy, money, whether people come back). Open with the consequence, never with the mechanism. This paragraph must stand alone: a reader who stops here, and who ignores the severity label, still has the whole point.
**What it is:** ...  **How an attacker uses it:** ...  **Impact:** ...  **What to do:** ...  **Where:** <file/route/policy>
The four fields after "In plain terms" are for the engineer who will fix this, so keep them precise and technical — exact names, exact steps, no dumbing down. They will repeat what the plain paragraph already said; that is correct, not redundant. Do not move technical detail up into the plain paragraph, and do not drop it to save space.
Order findings hardest-first (Critical → Low). If there are NO findings, say so in one line and briefly note what was checked and why it looks sound, in words a non-coder follows. Do NOT invent findings beyond the JSON. Output ONLY the markdown body — no top-level heading (the assembler adds "## ${s.title}"), no preamble, no sign-off.`
}

const execInput = JSON.stringify(live.map((f) => ({ area: f.dimension, title: f.title, severity: sevOf(f), status: f.verdict, impact: f.impact })).sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9))).slice(0, 9000)

const execPrompt = `You are writing the EXECUTIVE SUMMARY of a security + privacy + cost risk report for the founder of Vibe (a live college social network at ${SITE}) and the two cofounders he shares it with, neither of whom writes code. This summary is the part most likely to be read on its own, so every sentence in it must be understandable by someone who has never heard of row-level security or cross-site scripting.

PLAIN-ENGLISH CONTRACT (governs every sentence here):
- No unexplained jargon. These words are BANNED unless you gloss them in plain words in the same sentence, the first time they appear in your output: API, endpoint, route, field, payload, contract, RLS, row-level security, policy, grant, service role, 401, 403, 404, 307, cache, header, OG, OpenGraph, proxy, middleware, iframe, localStorage, component, prop, hydration, bundle, key, bucket, migration, schema, XSS, cross-site scripting, CSP, Content-Security-Policy, CSRF, SSRF, open redirect, injection, token, JWT, sanitize, escape, presigned. Prefer dropping the word entirely over glossing it. A gloss is words a parent could follow, e.g. "a Content-Security-Policy (a browser rule listing which code is allowed to run on your pages)".
- Prefer what a STUDENT experiences over what the code does, and say why it matters in human terms: trust, safety, privacy, money leaving the company's account, whether students come back.
- Concrete over abstract. Never stop at "security risk" or "attack surface" — say what the person on the other end actually sees, loses, or pays.
- Calm and specific. No drama, no scare language, no filler. Short sentences.
- Severity words (Critical / High / Medium / Low) stay, but a reader who ignores every label must still grasp the stakes from your plain sentences alone.

Inventory: ${JSON.stringify(inventory).slice(0, 1500)}
All still-relevant verified findings (JSON): ${execInput}
Counts: ${JSON.stringify(counts)}

Write, in GitHub-flavoured markdown, ONLY the body (no top-level heading — the assembler adds "## Executive Summary"):
1) Two or three short paragraphs, written so a reader who has never heard of row-level security or cross-site scripting understands every sentence. Cover: what was looked at, named as places and questions rather than systems ("who can read whose messages", "what happens to the files students upload", "what the app costs if someone abuses it"); how it was done (reading the code, the database's own access rules, the settings, and the outside packages, with a second reviewer trying to knock every finding down — nobody attacked the live site, because real students' data and private messages are on it, so anything only a live attempt could settle is marked as needing a test on a copy of the site); and the honest overall state — say plainly whether a student using Vibe today is exposed to anything serious, credit the hardening pass that just landed, and name what real risk is left. If a technical term is genuinely unavoidable here, gloss it in the same sentence.
2) A "Risk register" markdown table: columns  | # | Risk | Area | Severity | Status | One-line impact |  — one row per finding, hardest-first. Keep each cell short; never use a raw "|" inside a cell. The "Risk" cell may name the mechanism. The "One-line impact" cell may NOT: it must be a plain consequence a non-technical reader feels immediately, in the shape "someone could do X to Y" — for example "a student could read another student's private messages", "anyone with the link could download a student's un-redacted resume", "one free account could run up your storage bill overnight", "an outsider could pass as a verified IU student". Never a mechanism ("missing row-level policy on channel_members"), never a restatement of the severity ("high risk"), never a vague noun phrase ("data exposure").
3) A "Top things to do now" numbered list (max 6) of the highest-leverage actions. Each is one line and names two things: what to do, and — in plain words — the risk that disappears once it is done.
No preamble, no sign-off.`

const roadmapPrompt = `You are writing the REMEDIATION ROADMAP for a founder acting on a security + risk report for Vibe. From the verified findings below, produce a phased, do-this-next plan. He writes all the code himself and shares this list with two cofounders who do not code, so every bullet has to read as a plain outcome as well as a task. Avoid jargon; if a technical term is unavoidable, gloss it in plain words in the same breath (e.g. "a live pentest — paying someone to attack a copy of the site on purpose"). No drama, no filler, short sentences.

Findings (JSON): ${JSON.stringify(live.map(compact)).slice(0, 9000)}
Counts: ${JSON.stringify(counts)}

Output ONLY markdown body (assembler adds "## Remediation Roadmap"). Group actions into four subsections: "### Immediate (this week)", "### Short term (this month)", "### Ongoing / process", "### Needs a specialist" (e.g. a lawyer for compliance items, or a live pentest against a staging deploy). Each action is one bullet with three parts, in this exact order: (a) the fix, specific enough to act on without re-reading the whole report; (b) in parentheses, a rough owner + effort tag like (code, ~1h) / (Supabase dashboard, 5 min) / (lawyer) / (staging pentest); (c) after an em dash, ONE plain sentence naming the risk that goes away when it is done, written for a reader who does not code — e.g. "— after this, a stranger with a link can no longer download a student's resume", "— after this, one account can no longer flood every student's notifications". Part (c) is required on every bullet without exception; no bullet may end at the effort tag, and "— reduces risk" does not count. Order within each group hardest-first.`

const [execMd, roadmapMd, ...sectionMds] = await parallel([
  () => agent(execPrompt, { label: 'exec-summary', phase: 'Report' }),
  () => agent(roadmapPrompt, { label: 'remediation-roadmap', phase: 'Report' }),
  ...SECTIONS.map((s) => () => agent(sectionPrompt(s), { label: `write:${s.key}`, phase: 'Report' })),
])

// ---- Assemble ------------------------------------------------------------
const cell = (x) => String(x == null ? '' : x).replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim()
const liveSorted = [...live].sort((a, b) => (sevRank[sevOf(a)] ?? 9) - (sevRank[sevOf(b)] ?? 9))
const apxRows = liveSorted.map((f, i) => `| ${i + 1} | ${cell(f.title)} | ${cell(f.dimension)} | ${cell(sevOf(f))} | ${cell(f.verdict)} | ${cell((f.surface || '').slice(0, 60))} |`).join('\n')

const sectionBlocks = SECTIONS.map((s, i) => `## ${s.title}\n\n${(sectionMds[i] || '_(section writer produced no output)_').trim()}`).join('\n\n---\n\n')

const markdown = `# Vibe — Security, Privacy & Risk Report

**Prepared:** ${DATE}  |  **Target:** ${SITE}  |  **Method:** authorized, read-only adversarial audit (${DIMENSIONS.length} attacker lenses, each finding independently verified against current code)

> **Scope & rules of engagement.** This was a READ-ONLY audit: static analysis of the codebase, database (RLS policies + grants), configuration, and dependencies, plus a handful of safe read-only requests to the live site. It did NOT run live exploits against production, because production holds real student data and private messages. Findings marked "needs live test" should be confirmed against a staging / preview deploy, not production.
>
> **Not legal advice.** The Legal & Compliance section flags risk areas in plain terms so you can prioritize; items marked as needing a specialist should go to a qualified lawyer.

**At a glance:** ${counts.live} still-relevant findings (${counts.confirmed} confirmed in current code, ${counts.needsLive} need a live test). During verification, ${counts.fixed} candidate issues were found already fixed and ${counts.falsePos} were rejected as false positives, and are not carried below.

---

## Executive Summary

${(execMd || '_(no executive summary produced)_').trim()}

---

${sectionBlocks}

---

## Remediation Roadmap

${(roadmapMd || '_(no roadmap produced)_').trim()}

---

## Appendix A — All findings (register)

| # | Finding | Area | Severity | Status | Where |
|---|---------|------|----------|--------|-------|
${apxRows || '| — | (none) | | | | |'}

## Appendix B — Method & coverage

- **Lenses run (${DIMENSIONS.length}):** ${DIMENSIONS.map((d) => d.title).join('; ')}.
- **Verification:** every Medium-or-higher finding was re-checked by an independent adversarial agent that read the current code before the finding was kept; already-fixed and false-positive items were dropped.
- **Not covered by this run:** live/dynamic exploitation, authenticated multi-account fuzzing, and load/DoS testing — all of which require a staging deploy. Social-engineering and physical security are out of scope.
- **Inventory basis:** ${cell(inventory.summary)}
`

return { markdown, counts, liveCount: live.length }
