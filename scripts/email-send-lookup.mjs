#!/usr/bin/env node
// Did we try to email this address, and what did the provider say? (E1a)
//
//   printf 'someone@iu.edu\n' | SCHOOL_EMAIL_VERIFY_SECRET_FILE="$SCRATCH/sevs" \
//     node --experimental-strip-types scripts/email-send-lookup.mjs
//
// Reads ONE address from stdin (prompts "Address: " when stdin is a terminal)
// and prints its recipient_domain, its recipient_hash, and three read-only
// queries over public.email_sends with the hash filled in. Paste a query into
// the read-only Supabase MCP (execute_sql). The address never goes into SQL.
//
// PRIVACY: the address is never an argument (it would sit in shell history),
// never printed back, and never sent anywhere. This script does not connect
// to any database or network.
//
// THE SECRET: the hash is keyed by SCHOOL_EMAIL_VERIFY_SECRET, so a lookup
// against production needs the PRODUCTION value (Vercel), which may differ
// from .env.local. Put that one value, alone, in a scratch file, point
// SCHOOL_EMAIL_VERIFY_SECRET_FILE at it, and delete the file afterwards
// (ruling M15). Never type the value on the command line: shell history
// keeps it, and the same secret signs school-verification links
// (school-email-token.ts). Never export it from a shell profile either.
// SCHOOL_EMAIL_VERIFY_SECRET=<value> still works, for a local test value.
//
// The hash and domain come from src/lib/email/send-log-core.ts, the same
// functions the writer uses, so the two can never disagree.

import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { createInterface } from "node:readline";

function fail(code, ...lines) {
  for (const line of lines) console.error(line);
  process.exit(code);
}

if (process.argv.length > 2) {
  fail(2, "Pipe or type the address on stdin so it stays out of shell history.");
}

// The secret comes from SCHOOL_EMAIL_VERIFY_SECRET_FILE (the production route)
// or SCHOOL_EMAIL_VERIFY_SECRET (a local value), never both: a stray value in
// one would silently hash with the wrong key and read as "we never tried".
function readSecret() {
  const inline = process.env.SCHOOL_EMAIL_VERIFY_SECRET ?? "";
  const file = process.env.SCHOOL_EMAIL_VERIFY_SECRET_FILE ?? "";
  if (inline && file) {
    fail(1, "Set SCHOOL_EMAIL_VERIFY_SECRET or SCHOOL_EMAIL_VERIFY_SECRET_FILE, not both.");
  }
  if (!file) return inline.trim();
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    fail(1, `Could not read SCHOOL_EMAIL_VERIFY_SECRET_FILE (${file}).`);
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 1) {
    fail(1, "SCHOOL_EMAIL_VERIFY_SECRET_FILE must hold only the secret, on one line.");
  }
  // A single dotenv line (SCHOOL_EMAIL_VERIFY_SECRET="...") works too.
  const dotenv = /^(?:export\s+)?SCHOOL_EMAIL_VERIFY_SECRET\s*=\s*(.*)$/.exec(lines[0]);
  const value = dotenv ? dotenv[1].trim().replace(/^(["'])(.*)\1$/, "$2") : lines[0];
  return value.trim();
}

const secret = readSecret();
if (secret.length < 16) {
  fail(
    1,
    "Set SCHOOL_EMAIL_VERIFY_SECRET to the value the target environment uses (production: the Vercel value).",
    "For production, put the value alone in a scratch file, run with SCHOOL_EMAIL_VERIFY_SECRET_FILE=<that file>, and delete the file afterwards.",
  );
}

// The core imports "../auth/school-email-domains" extensionless (what Next
// and tsc expect). Node's type stripping adds no extensions, so retry a
// failed relative specifier with ".ts", as the unit tests do.
if (typeof nodeModule.registerHooks !== "function") {
  console.error("This script needs Node >= 22.15 (module.registerHooks).");
  process.exit(1);
}
nodeModule.registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const core = await import(
  new URL("../src/lib/email/send-log-core.ts", import.meta.url).href
);

async function readFirstLine() {
  if (process.stdin.isTTY) process.stderr.write("Address: ");
  const rl = createInterface({ input: process.stdin, terminal: false });
  for await (const line of rl) {
    rl.close();
    return line;
  }
  return "";
}

const address = (await readFirstLine()).trim();
if (!address.includes("@")) {
  console.error("No address read from stdin. Pipe or type one address, then press Enter.");
  process.exit(2);
}

const domain = core.recipientDomain(address);
const hash = core.recipientHash(address, secret);
if (!hash) {
  console.error("Could not compute the hash. Check SCHOOL_EMAIL_VERIFY_SECRET.");
  process.exit(1);
}

const COLUMNS = `SELECT to_char(created_at AT TIME ZONE 'America/Indiana/Indianapolis', 'YYYY-MM-DD HH24:MI:SS') AS at_et,
       kind, recipient_domain, ok, http_status, error_code, error_message,
       provider_message_id, left(user_id::text, 8) AS user8
  FROM public.email_sends`;

console.log(`recipient_domain: ${domain}`);
console.log(`recipient_hash: ${hash}`);
console.log(`
-- Q1 · this address: every attempt, newest first
${COLUMNS}
 WHERE recipient_hash = '${hash}'
 ORDER BY created_at DESC LIMIT 20;

-- How to read Q1:
--   No rows: we never tried. The request stopped at validation, a limiter or
--     the "linked to another account" 409, or the log insert failed (Vercel
--     logs then show "[email-send-log] insert failed").
--   ok = t with a provider_message_id: Resend accepted it. Paste the id into
--     Resend -> Emails for delivered, bounced or suppressed. Microsoft 365
--     quarantine is invisible to both us and Resend.
--   ok = f: error_code and http_status are what Resend said, e.g.
--     daily_quota_exceeded 429, validation_error 422, rate_limit_exceeded 429.
--     application_error with no status is the network; exception is our
--     env/config. error_message is redacted provider text.

-- Q2 · one account (the first 8 characters of its user id, from any other read)
${COLUMNS}
 WHERE left(user_id::text, 8) = '<id8>'
 ORDER BY created_at DESC LIMIT 20;

-- Q3 · the last 24 hours at a glance
SELECT kind, ok, error_code, http_status, count(*) AS n, max(created_at) AS newest
  FROM public.email_sends WHERE created_at > now() - interval '24 hours'
 GROUP BY 1, 2, 3, 4 ORDER BY n DESC;`);
