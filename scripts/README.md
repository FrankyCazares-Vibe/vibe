# scripts/

Maintenance and one-off scripts. None of them run as part of the build or a deploy.
Each file starts with a long comment that is the real manual: read it before running anything.

"Local only" below means the script refuses a database that is not on this machine, or says in its header never to run it on production.

## Node scripts

| Script | What it does | Writes? | Where it may run |
|---|---|---|---|
| `local-seed.mjs` | Seeds the local Supabase stack with test accounts, clubs, posts and events. Re-runnable. Prints the accounts when it finishes | Yes | Local only (refuses any host but `127.0.0.1` / `localhost`) |
| `demo-seed.mjs` | Seeds the invented cast used for landing screenshots and the demo film. Sits next to `local-seed.mjs` | Yes | Local only |
| `seed-review-accounts.mjs` | Creates or repairs the two accounts the app-store reviewers sign in with. Dry run unless `--apply` | With `--apply` | Local stack by default. Production needs two extra flags and a founder's say-so; read its header first |
| `check-pwa.mjs` | Pass/fail list for the installable app: service worker, offline page, manifest, and that the proxy matcher still works. Anonymous GETs only | No | Local or the live site |
| `gen-pwa-icons.mjs` | Renders the app icons in `public/icons/` from the vector logo | Files in the repo | Local |
| `stripe-setup.mjs` | Creates the Vibe+ product, prices and portal settings in a Stripe sandbox. `--check` only reads. A live key needs `--live --yes` | In Stripe | Sandbox by default |
| `waitlist-gate-e2e.mjs` | Runs the sign-up gate end to end through the local Supabase Auth | Yes | Local only |
| `email-send-lookup.mjs` | Turns one email address (typed on stdin, never an argument) into the hash used by the email send log, and prints read-only queries. Connects to nothing | No | Anywhere |
| `count-exif-uploads.mjs` | Counts uploaded photos that still carry metadata. `--apply` re-encodes them | With `--apply` | Local only |
| `migrate-resumes-to-private.mjs` | The one-time move of resumes from the public bucket to the private one. Kept for the record. Dry run by default | With flags | Reads `.env.local`; read its header first |
| `sync-vibe-hub.sh` | Copies some files to a folder on one founder's Desktop. Not useful to anyone else | Local files | That Mac |

## Folders

| Folder | What is in it |
|---|---|
| `sql/` | SQL checks for specific migrations (chat rooms, cards, pins, the waitlist gate) and two read-only counts. Most are local only, write and roll back test rows, and refuse a non-local connection. Each file's first lines say which kind it is and give the exact command |
| `pwa/` | `sw-killswitch.js`: the emergency replacement for `public/sw.js`. It is not served from here. The drill is in its header |
| `demo-video/` | The recorder for the landing page's demo film. Local only. See `demo-video/README.md` |

## Rules for a new script

- If it writes to a database, make it refuse anything that is not the local stack, the way `local-seed.mjs` does.
- Default to a dry run. Make writing an explicit flag.
- Never take a person's email, a key or a token as a command-line argument; it would sit in shell history.
- Print counts, not people's records.
- Put the manual in the header comment and add a row to the table above.
