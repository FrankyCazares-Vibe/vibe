# Gate on release-s74 at fe40634 (RELEASE_WITH_PRIVACY)

All run in the release worktree. No `.env.local`, no `.env*` file at all in the worktree except `.env.example`.
No dev server was started. Logs are next to this file.

| Check | Result | Log |
|---|---|---|
| Dependencies | package.json and package-lock.json are byte-identical to main's; node_modules cloned with `cp -cR` (573 entries). No `npm ci`. | |
| `npm run typecheck` | exit 0 | gate-typecheck.log |
| `npm test` | 2,146 tests, 2,146 pass, 0 fail, 0 skipped (143 test files) | gate-test.log |
| `npx eslint` on all 180 code files the release changes vs main | exit 1: 2 errors, 13 warnings in 5 files, ALL already on main (same rule, same count per file, only line numbers moved). Nothing new from the merge. | gate-eslint.log, gate-eslint.json |
| `npm run build` | exit 0, Next 16.3.4 Turbopack, "Compiled successfully", 129 static pages; no env values were needed | gate-build.log |
| `node scripts/check-pwa.mjs` (no server) | the 15 disk checks of the proxy matcher pass (incl. the two new skips for .avif and .mp4); its 10 network checks could not run (needs a server; not started on purpose) | gate-check-pwa.log |

## The test number

- main: 124 test files, 1,839 tests (the baseline both handoffs name).
- landing-night: 136 files, 1,925 tests (+86). chat-desktop: 131 files, 2,060 tests (+221). privacy-v2 adds none.
- Union = 1,839 + 86 + 221 = 2,146, and the two branches changed no test file in common.
- Release: 143 files (every file of both branches is there), 2,146 tests. Exactly the union.

## The lint problems (all older than this release)

Linted the same five files on main (read-only, from the main checkout) to compare:

| File | Release | main | Branch that touched it |
|---|---|---|---|
| src/components/mobile/MessagesMobile.tsx | 2 errors (react-hooks/immutability :682, set-state-in-effect :735) | the same 2 errors (:681, :734) | chat-desktop |
| src/app/campus/campus-home.tsx | 6 warnings | the same 6 | chat-desktop |
| public/html/_miniMessenger.js | 4 warnings | the same 4 | chat-desktop |
| src/app/account/suspended/suspended-actions.tsx | 2 warnings | the same 2 | landing-night |
| src/app/layout.tsx | 1 warning | the same 1 | landing-night |

The other 175 files are clean. The task asked for eslint on "every file a conflict touched and every file both
branches changed": that set is only `.env.example`, which eslint does not read, so I linted every changed code file.

## Not run

- No browser, no server, no real phone.

## The commit without privacy (5f3b8b0) was gated too

Checked out detached in the same worktree, then the worktree was put back on release-s74 (fe40634):
typecheck exit 0; `npm test` 2,146 / 2,146; `npm run build` exit 0 (129 static pages). Logs: gate-nopriv-*.log.
eslint and check-pwa were not repeated there (privacy-v2's 8 files lint clean on fe40634 and touch nothing else).
Afterwards `npm run build` was run once more on fe40634 (exit 0, gate-build-final.log), so the `.next` folder
left in the worktree matches the branch head.

main's own count was run too (`npm test` in the main checkout, read-only): 1,839 / 1,839.
