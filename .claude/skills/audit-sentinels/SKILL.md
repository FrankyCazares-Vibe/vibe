---
name: audit-sentinels
description: How to run Vibe's three audits and act on the results — security-sentinel ("can this be attacked?"), feature-sentinel ("does this still work?"), and a self-review pass over your own diff ("did I just break something?"). Use when about to run an audit or sentinel; when asked whether the app is safe, whether a feature still works, or what a change broke; before putting the app in front of testers; after a hardening pass, refactor, migration, or anything touching auth, database policies, uploads or response headers; and after finishing a batch of edits, because neither sentinel catches regressions introduced in the same session.
---

# Vibe audits: the two sentinels and the self-review

Three different questions. Picking the wrong one wastes an hour and several million tokens.

| Question | Mode | Run it when |
|---|---|---|
| Can this be attacked? | `security-sentinel` | Milestones, and after anything touching auth, RLS policies or column grants, uploads/storage, response headers, or a new external service. |
| Does this still work? | `feature-sentinel` | After a hardening pass, a refactor, a migration, or before putting the app in front of testers. Also when "it feels quiet". |
| Did *I* just break something? | review-my-own-diff | At the end of any session that changed code. **Neither sentinel catches this** — they audit the committed state as if a stranger wrote it, and a fresh regression looks like intended behaviour. |

The three are additive, not alternatives. In Session 55 the feature sentinel found two real mobile blockers *and* a separate adversarial pass over the session's own diff found nine more, five of them introduced that same day.

---

## Mode 1 — security-sentinel

```
Workflow({ scriptPath: ".claude/workflows/security-sentinel.js",
           args: { date: "2026-09-10", site: "https://www.connectvibe.app" } })
```

Recon → 11 attacker lenses (`auth`, `authz`, `injection`, `xss`, `dataexp`, `abuse`, `uploads`, `client`, `deps`, `legal`, `infra`) → adversarial verify of every Medium+ finding → 7 section writers + exec summary + remediation roadmap → assembled markdown.

- Only two args: `date`, `site`. There is no lens subset — it is all or nothing.
- Finder and verifier run as a `pipeline`, so fan-out is per-lens, not all at once.
- **Cost:** the S52 run was 41 agents, ~2.7M tokens, ~16 min.
- **Known gotcha:** synthesis agents whose prompts carry attack scenarios can be refused by cyber safeguards (exec summary and section C both were in S52). Fallback that worked: write those sections yourself in the main loop from the finding register plus `journal.jsonl`. Do not re-run the whole workflow for it.
- A finder may report a "prompt-injection attempt" that is actually the harness's own `<\system-reminder>` inside a tool result. Not an app issue; keep it in the register as not-applicable, do not chase it.

## Mode 2 — feature-sentinel

```
Workflow({ scriptPath: ".claude/workflows/feature-sentinel.js",
           args: { date: "2026-09-10", site: "https://www.connectvibe.app",
                   since: "14 days ago", authed: false,
                   lenses: ["recent-regression", "live-smoke"] } })
```

Recon → hunt lenses → **merge** (folds duplicates across lenses before verification) → verify every Blocking/Degraded finding → sectioned report.

- **`args.lenses`** (added S55) runs a subset. Keys: `hardening-fallout`, `inert-data`, `contract-drift`, `dead-ends`, `empty-state-lies`, `render-blockers`, `cross-viewport`, `write-paths`, `recent-regression`, `live-smoke`. Unknown keys are logged and ignored. **Omit it for a milestone run**; use it for a targeted re-check after a fix pass — `["recent-regression","live-smoke"]` is the cheap "did the fixes land and did they break anything" pair.
- **`args.since`** sets the git window the `recent-regression` lens and recon read. Match it to the work you are checking.
- **Cost:** full ten-lens run ≈ 60 agents, 5.5M tokens, ~30 min. The five-lens S55 subset was 27 agents, ~1.4M tokens, ~10 min. Verify fan-out scales with findings, not lenses — that is where a big run gets wide.
- Trade-off if you split lenses across several invocations to stay small: you get several reports and no cross-lens dedupe, because the merge phase needs the whole raw set. Prefer one run plus resume-on-failure; split only when the token budget is genuinely tight, and merge by hand.

## Mode 3 — review-my-own-diff

No script. You assemble it, and it is the highest-yield hour in a coding session.

1. Find the pre-session commit. The reviewers read **the actual diff**: `git diff <pre-session-sha>..HEAD` plus `git show --stat` per commit — not a description of the change.
2. Spawn **2–3 reviewers, each with a distinct lens**, each told: try to break this, you may not fix anything, report only. The S55 split that worked:
   - **State and lifecycle** over the diff line by line — initializers that never re-run, effects that never fire, deep links that only work on a fresh load. (Caught: a new empty-state card whose `<Link>` changed the URL while a `useState` initializer kept the old tab.)
   - **Failure paths** — what every new catch/retry/loading state does on 401, 403, a hang, and a warm cache. (Caught: a retry button that turned an expired session into a permanent dead end; a recovery state with no watchdog, so a request that never settled left the user with nothing to click.)
   - **Live driving** — serve `public/html` against a stubbed API and drive the real pages in a browser, including a parent page that iframes `messages.html` exactly as `MessagesSwitch` does. **Required whenever the change touches the static pages**, because they have no build step and no type checking. This reviewer proved the iframe navigation trap in S55: links inside the messages frame rendered the whole React app nested in the iframe, two left navs, address bar still on `/messages`. Nothing static could have shown that.
3. Fix in one commit, and record which findings you deliberately deferred and why.

If the reviewers die and you verify in their place with greps, `node --check`, tsc, eslint and diff reading, say so — that is a weaker guarantee than two independent lenses, and it should go in the handoff.

---

## Operational rules

**Batch size decides whether a run survives.** Five runs died to usage limits in S55. When every agent is in flight at once and the limit hits, nothing is cached and the whole run is lost. Keep concurrent fan-out to **3–5 agents with a barrier between batches**, so finished agents are journaled. This applies to any workflow you write or run alongside a sentinel; for the sentinels themselves it means: don't stack a ten-lens feature run on top of three implementation workflows.

**Always resume, never restart.**

```
Workflow({ scriptPath: ".claude/workflows/feature-sentinel.js", resumeFromRunId: "wf_xxxxxxxx-xxx" })
```

Completed agents replay from cache instantly; only what failed or changed re-runs. Used twice successfully in S55 and once in S52 (which came back from 27/34 agents failed). Restarting pays for everything again.

**Read the journal before diagnosing an empty or odd result.** Each agent's actual return value is recorded here:

```
~/.claude/projects/-Users-franciscocazares-vibe/<THIS session id>/subagents/workflows/<runId>/journal.jsonl
# the Workflow tool result prints the exact transcript dir — use that, not a remembered path
# find it: find ~/.claude/projects/-Users-franciscocazares-vibe -name journal.jsonl -newermt '-1 day'
```

The run state (args, logs, agent count, token total, status) is one level up in `.../<session-id>/workflows/<runId>.json`. Read those before assuming the script is broken.

**`args.authed` changes what a run is worth.** Without a signed-in browser session, everything behind login is *inferred from code and database state, not observed*, and findings come back `needs_authed_test`. Set up a session first (`setup-browser-cookies`) when you can — it materially raises the value of the run and is currently the single biggest gap in Vibe's audit coverage. When you could not, say so plainly in the report and to the user rather than presenting inference as observation.

**Model.** Agents inherit the session model. In S55 the session exhausted one model's budget mid-run and finished on another; a resume picked up cleanly. Switching models is not a reason to restart.

**Both sentinels are strictly read-only** — no file writes, no database writes, no POSTs to production, a few dozen GETs at most. Preserve that if you ever edit the scripts. The rules of engagement are in the `ROE` constant at the top of each file.

**The workflow returns `{ markdown, counts, liveCount }`.** It does not write a file. Saving the report is your job.

---

## Reading the output

**Trust the verify stage.** It exists because finders produce plausible-but-wrong findings. The S55 run dropped one false positive and two items that were already fixed while the run was in flight. **Never act on an unverified finding** — check `status` / `verdict` before you touch code.

**A finding marked `needs_live_test` or `needs_authed_test` is a hypothesis, not a fact.** Report it as one. "The code path suggests X; nobody has watched it happen" is the honest sentence.

**Group by root cause before fixing.** Several reported symptoms usually share one cause — in report 2, four separate "broken image" findings were one helper returning a raw R2 object key instead of the proxy URL. Fix the pattern, not the five call sites one at a time.

**Separate "bug" from "decision".** Some findings are the product working as designed and need a founder's call, not a patch. The report has a *Needs a decision, not a fix* section for exactly this — in report 2 it held the private-org page rendering to anonymous visitors, and whether Messages should keep framing app routes at all. Surface those to the user as questions; do not quietly "fix" a product decision.

**Ask the third question: does this break a design principle?** The journal's Principles section (`public/journal/vibe_journal.html`) is the reference: *Personality is professional · Show, don't list · Both sides must win · Warm, not casual · No vanity metrics · Your signal, your control*. Neither sentinel asks this. A fabricated "1.2k followers / 847 connections" violated *No vanity metrics* in production for five months and no audit caught it, because nothing was broken and nothing was exploitable.

---

## What to do afterward

1. **Save the report.** `handoffs/YYYY-MM-DD-broken-features-report-N.md` (feature) or `handoffs/YYYY-MM-DD-security-risk-report.md` (security). Write the returned `markdown` verbatim; don't paraphrase it into the chat and lose it.
2. **Fold the important findings into the handoff's pick-up list, in priority order**, keeping the report's numbering in brackets so the two documents line up (`[S54 row 16, report-2 #2]`). The report is the evidence; the handoff is the plan.
3. **Add a journal entry** (`public/journal/vibe_journal.html`, absolute path, edit it even from a worktree).
4. **Tell the user the honest headline**: what a tester would hit first, what is *not* broken, and what this run could not check.
5. **Re-check after fixing** with a lens subset — `["recent-regression","live-smoke"]` — rather than another full run.
