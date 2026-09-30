# Review A1 (profile privacy) — lens: does it actually close the findings? (bypass hunt)

Reviewer started 2026-09-27. Read-only: no repo edits, local DB probes only inside ROLLBACK transactions.

## Progress log
- read plan.md, waveA-build.md, approach-A1.md, notes-A1.md
- read diffs: hidden-fields.ts, bootstrap, resume proxy, users/[handle]/posts, posts/[id]/page.tsx, profile/[handle]/page.tsx, migration 20260928160000
- grep: only /api/resume signs résumé keys; no wildcard users selects in src; four columns named only in owner routes, bootstrap, profile page (service), reports (service bio)
- LOCAL probes as drew (unverified, authenticated; rolled back) with the revoke applied: whole-row ref, to_jsonb(u), WHERE bio ilike oracle, ORDER BY skills, UPDATE own ... RETURNING current_on, SET current_on=current_on, UPDATE WHERE current_on oracle, SELECT *, UPDATE work_order_manual RETURNING work_experience, resume_url, profile_layout -> all 42501. pg_stats rows for the four: 0 (filtered by column privilege). Public header columns still select (7 rows).
- local catalog: no view over users, no function returning users rowtype, no definer fn with users.* / row_to_json; no publications; storage policy only profiles_select_own; resumes bucket private. reports table service-role only, POST /api/me/reports returns {ok} only (snapshot bio not echoed).
- work_order_manual still authenticated=rw (boolean; trivial) — note only.
- PROD catalog (read-only MCP): users not in any publication; no pg_graphql ext; no view over users; no fn returning users rowtype; no definer fn with users.*/to_jsonb(u). Grants match LIVE STATE in the header. Résumés: 4 rows, 0 http/public-bucket URLs, all 40 pdf/resume objects in private `resumes` bucket -> proxy is the only door.
- getActiveRestriction reads with the service role (fail -> ok:false), so proxy/bootstrap/grid/metadata restriction checks can't be RLS-blinded.
- search routes filter on name/handle only (no hidden-skills oracle); no Otto/suggested/invite route selects the four.
- node --test hidden-fields + build-vibe-user-v1 + profile-layout: 30/30 pass. tsc --noEmit -p .: clean.
- proxy.ts: a suspended/banned viewer keeps every GET under /api (only writes are refused), and a ban does not clear school_verified -> a banned student still passes the new résumé gate (not in #5 or product call 4; question for Franky).

## Verdict per finding (attacker lens)
- #3 hidden widgets: CLOSED. Bootstrap blanks before the build (no tagline-from-bio leak), sends hidden [] to every non-owner incl. admins; proxy 404s a hidden résumé to non-owners only; revoke closes PostgREST for the four (every oblique read probed -> 42501). No other route, view, RPC, publication or search reads the four for a non-owner.
- #5 résumé: CLOSED. Bootstrap hands keys only to verified viewers of unrestricted owners; proxy re-checks all three on every request (service-role reads, errors -> 500). Old keys can't be replayed after a hide or a ban.
- #6 signed-out grid: CLOSED. Restriction 404 (same text as unknown), org_id is null, removed_at is null; signed-in block read now fails closed.
- #7 post previews: CLOSED for metadata (removed/draft/hidden-club/missing-club/restricted/unknown author -> generic). Body existence check still unfiltered for signed-in viewers (documented deviation) -> shouldFix.
- #2b profile previews: CLOSED. Restricted = unknown-handle metadata and 404 body (self/admin excepted); hidden bio left out of og:description.
- Product calls 1, 3, 4: implemented in the right direction (moderators get the visitor view; no admin résumé exception; public club posts keep previews).

## mustFix
- none found under this lens.

## shouldFix
1. posts/[id]/page.tsx body existence check (service role, no status/removed filter): a signed-in student holding a UUID gets 200 for a draft, removed, hidden-club or restricted-author post and 404 for none (existence oracle). Satisfy both #7 and the author's removal notice with `.eq("status","published").or(\`removed_at.is.null,user_id.eq.${user.id}\`)` (user.id is a validated session uuid). Low: needs the UUID.
2. Banned/suspended VIEWER still downloads résumés (GETs stay open in src/proxy.ts; a ban leaves school_verified true). Ask Franky; if yes, add `viewerRestricted` to resumeVisibleToViewer and one getActiveRestriction(viewer) read in the proxy and in the bootstrap résumé branch.
3. users.work_order_manual is still authenticated=rw (SELECT). It reveals "has reordered experience" for a hidden experience widget; only service-role code reads it. Add it to the revoke list (keep the UPDATE).
4. Bootstrap fallback select (layoutRead=false) withholds only the résumé; bio/skills/experience/working-on ship even if hidden. Dead path today (both optional columns are live). Cheap hardening: on that path blank all hideable widgets for non-owners.
5. Orchestrator note: plan.md's wave B rows still name 20260928150000 (B2) and 20260928160000 (B4), now taken by A5b and A1. Renumber wave B.

## Re-check after the usage-limit pause (2026-09-28)
- A1 files unchanged since this review (mtimes 23:25-23:30 Sep 27). Verdicts above stand.
- Local grants re-read: authenticated/anon hold no SELECT on bio/skills/work_experience/current_on; no table-wide SELECT; current_on UPDATE kept. As drew (authenticated, rolled back): `select bio`, `where skills is not null`, `jsonb_agg(u)` all 42501; header columns still select (7 rows).
- Résumé proxy derives the owner from the key's first segment and requires the owner row to reference the key, so a student pointing their own resume_url at someone else's key gains nothing.
- Leftover column grants are REFERENCES only (needs a unique index + DDL; not reachable through PostgREST). Note only.
- node --test hidden-fields + build-vibe-user-v1: 21/21 pass.
