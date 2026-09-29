/**
 * Tests for the two modules of contract section 2
 * (handoffs/chat-redesign/wave-1-contracts.md):
 *   `flag.ts`    the `chat_v2` switch and its two lists
 *   `schema.ts`  "missing chat schema = feature off, never a 500"
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/chat/flag.test.ts
 *
 * Neither file has imports, so each loads through a dynamic import of its
 * ".ts" path. The specifier goes through a variable because tsc refuses a
 * literal ".ts" specifier (the push/config.test.ts pattern).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./flag.ts";
const { chatV2ClubIds, chatV2Enabled, chatV2Everyone, chatV2ListedUser, chatV2MayRunHere } = (await import(
  specifier
)) as typeof import("./flag");

const schemaSpecifier = "./schema.ts";
const { isMissingChatSchema, warnMissingChatSchemaOnce } = (await import(
  schemaSpecifier
)) as typeof import("./schema");

/** A fake environment on the live site, the one place besides `next dev` where the switch counts. */
function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { VERCEL_ENV: "production", ...values } as unknown as NodeJS.ProcessEnv;
}

/** A fake environment with nothing added: for the tests about WHERE the switch counts. */
function bare(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

/** The same, with the switch on: what every list reader needs before it answers. */
function on(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return env({ CHAT_V2_ENABLED: "true", ...values });
}

const ALICE = "df5ab44e-0000-4000-8000-000000000001";
const BOB = "0b0b0b0b-0000-4000-8000-000000000002";
const SAE = "5ae5ae5a-0000-4000-8000-00000000000a";
const SALSA = "5a15a5a1-0000-4000-8000-00000000000b";

// ---------------------------------------------------------------------------
// The switch
// ---------------------------------------------------------------------------

test("the switch is on only for exactly \"true\"", () => {
  assert.equal(chatV2Enabled(env({ CHAT_V2_ENABLED: "true" })), true);
  for (const value of ["TRUE", "True", "1", "yes", "on", " true", "true ", "*", "", undefined]) {
    assert.equal(chatV2Enabled(env({ CHAT_V2_ENABLED: value })), false, `CHAT_V2_ENABLED=${value}`);
  }
  assert.equal(chatV2Enabled(env({})), false);
});

test("the switch counts on the live site and in next dev, nowhere else", () => {
  assert.equal(chatV2MayRunHere(bare({ VERCEL_ENV: "production" })), true);
  assert.equal(chatV2MayRunHere(bare({ NODE_ENV: "development" })), true);
  assert.equal(chatV2Enabled(bare({ CHAT_V2_ENABLED: "true", VERCEL_ENV: "production", NODE_ENV: "production" })), true);
  assert.equal(chatV2Enabled(bare({ CHAT_V2_ENABLED: "true", NODE_ENV: "development" })), true);
  // A Vercel Preview build runs against the production database: off, whatever the lists say.
  const preview = { CHAT_V2_ENABLED: "true", VERCEL_ENV: "preview", NODE_ENV: "production", CHAT_V2_ALLOWLIST: "*" };
  assert.equal(chatV2MayRunHere(bare(preview)), false);
  assert.equal(chatV2Enabled(bare(preview)), false);
  assert.equal(chatV2Everyone(bare(preview)), false);
  assert.equal(chatV2ListedUser(ALICE, bare({ ...preview, CHAT_V2_ALLOWLIST: ALICE })), false);
  assert.deepEqual(chatV2ClubIds(bare({ ...preview, CHAT_V2_CLUBS: SAE })), []);
  // `next start` on a laptop, a test run, an empty environment: off.
  assert.equal(chatV2Enabled(bare({ CHAT_V2_ENABLED: "true", NODE_ENV: "production" })), false);
  assert.equal(chatV2Enabled(bare({ CHAT_V2_ENABLED: "true", NODE_ENV: "test" })), false);
  assert.equal(chatV2Enabled(bare({ CHAT_V2_ENABLED: "true" })), false);
});

test("the lists never turn the switch on by themselves", () => {
  assert.equal(chatV2Enabled(env({ CHAT_V2_ALLOWLIST: "*", CHAT_V2_CLUBS: SAE })), false);
});

test("with the switch off every list reader answers no, whatever the lists hold", () => {
  const lists = { CHAT_V2_ALLOWLIST: "*", CHAT_V2_CLUBS: SAE };
  const named = { CHAT_V2_ALLOWLIST: ALICE, CHAT_V2_CLUBS: `${SAE},${SALSA}` };
  for (const off of [undefined, "", "TRUE", "1", " true", "false", "*"]) {
    const label = `CHAT_V2_ENABLED=${off}`;
    assert.equal(chatV2Everyone(env({ CHAT_V2_ENABLED: off, ...lists })), false, label);
    assert.equal(chatV2ListedUser(ALICE, env({ CHAT_V2_ENABLED: off, ...named })), false, label);
    assert.deepEqual(chatV2ClubIds(env({ CHAT_V2_ENABLED: off, ...lists })), [], label);
    assert.deepEqual(chatV2ClubIds(env({ CHAT_V2_ENABLED: off, ...named })), [], label);
  }
  // The same lists with the switch on, so the loop above cannot pass by accident.
  assert.equal(chatV2Everyone(on(lists)), true);
  assert.equal(chatV2ListedUser(ALICE, on(named)), true);
  assert.deepEqual(chatV2ClubIds(on(named)), [SAE, SALSA]);
});

test("the switch is not read from a NEXT_PUBLIC_ or push variable", () => {
  assert.equal(chatV2Enabled(env({ NEXT_PUBLIC_CHAT_V2_ENABLED: "true" })), false);
  assert.equal(chatV2Enabled(env({ PUSH_ENABLED: "true" })), false);
});

// ---------------------------------------------------------------------------
// Everyone
// ---------------------------------------------------------------------------

test("\"*\" is everyone, with or without spaces around it", () => {
  assert.equal(chatV2Everyone(on({ CHAT_V2_ALLOWLIST: "*" })), true);
  assert.equal(chatV2Everyone(on({ CHAT_V2_ALLOWLIST: "  *  " })), true);
});

test("anything but a lone \"*\" is not everyone", () => {
  for (const value of [undefined, "", "   ", ",", "**", "* *", `*,${ALICE}`, `${ALICE},*`, ALICE, "all"]) {
    assert.equal(chatV2Everyone(on({ CHAT_V2_ALLOWLIST: value })), false, `CHAT_V2_ALLOWLIST=${value}`);
  }
});

test("a star in the clubs list is not everyone", () => {
  assert.equal(chatV2Everyone(on({ CHAT_V2_CLUBS: "*" })), false);
});

// ---------------------------------------------------------------------------
// A listed person
// ---------------------------------------------------------------------------

test("an unset or blank allow-list is nobody", () => {
  assert.equal(chatV2ListedUser(ALICE, on({})), false);
  assert.equal(chatV2ListedUser(ALICE, on({ CHAT_V2_ALLOWLIST: "" })), false);
  assert.equal(chatV2ListedUser(ALICE, on({ CHAT_V2_ALLOWLIST: "   " })), false);
  assert.equal(chatV2ListedUser(ALICE, on({ CHAT_V2_ALLOWLIST: ",, ," })), false);
});

test("a comma list names exactly its ids, ignoring spaces and case", () => {
  const list = on({ CHAT_V2_ALLOWLIST: ` ${ALICE.toUpperCase()} ,\n other-id ,` });
  assert.equal(chatV2ListedUser(ALICE, list), true);
  assert.equal(chatV2ListedUser(ALICE.toUpperCase(), list), true);
  assert.equal(chatV2ListedUser(`  ${ALICE}  `, list), true);
  assert.equal(chatV2ListedUser(BOB, list), false);
  assert.equal(chatV2ListedUser(ALICE.slice(0, 8), list), false, "a prefix is not a match");
  assert.equal(chatV2ListedUser(`${ALICE}0`, list), false, "a longer id is not a match");
});

test("an empty id is never listed, even against an empty entry", () => {
  const list = on({ CHAT_V2_ALLOWLIST: `,${ALICE},,` });
  assert.equal(chatV2ListedUser("", list), false);
  assert.equal(chatV2ListedUser("   ", list), false);
  assert.equal(chatV2ListedUser(undefined as unknown as string, list), false);
  assert.equal(chatV2ListedUser(null as unknown as string, list), false);
  assert.equal(chatV2ListedUser(42 as unknown as string, list), false);
});

test("the star is not a name", () => {
  assert.equal(chatV2ListedUser(ALICE, on({ CHAT_V2_ALLOWLIST: "*" })), false);
  assert.equal(chatV2ListedUser("*", on({ CHAT_V2_ALLOWLIST: "*" })), false);
  assert.equal(chatV2ListedUser(ALICE, on({ CHAT_V2_ALLOWLIST: `*,${ALICE}` })), true);
});

test("a person is not listed by the clubs list, nor a club by the people list", () => {
  assert.equal(chatV2ListedUser(ALICE, on({ CHAT_V2_CLUBS: ALICE })), false);
  assert.deepEqual(chatV2ClubIds(on({ CHAT_V2_ALLOWLIST: SAE })), []);
});

// ---------------------------------------------------------------------------
// The listed clubs
// ---------------------------------------------------------------------------

test("an unset or blank clubs list is no club", () => {
  assert.deepEqual(chatV2ClubIds(on({})), []);
  assert.deepEqual(chatV2ClubIds(on({ CHAT_V2_CLUBS: "" })), []);
  assert.deepEqual(chatV2ClubIds(on({ CHAT_V2_CLUBS: "  " })), []);
  assert.deepEqual(chatV2ClubIds(on({ CHAT_V2_CLUBS: " , ,," })), []);
});

test("club ids come back trimmed, lower-case, once each, in the order written", () => {
  const list = on({ CHAT_V2_CLUBS: ` ${SALSA.toUpperCase()} ,${SAE},\t${SALSA} , ` });
  assert.deepEqual(chatV2ClubIds(list), [SALSA, SAE]);
});

test("an entry that is not an id is left out, the ids beside it stay", () => {
  assert.deepEqual(chatV2ClubIds(on({ CHAT_V2_CLUBS: "*" })), []);
  assert.deepEqual(chatV2ClubIds(on({ CHAT_V2_CLUBS: `sae, ${SAE}, *, ${SAE.slice(0, 35)}` })), [SAE]);
  assert.deepEqual(chatV2ClubIds(on({ CHAT_V2_CLUBS: `${SAE} ${SALSA}` })), [], "a space is not a comma");
});

test("each call reads the env it is given", () => {
  const list = on({ CHAT_V2_CLUBS: SAE });
  assert.deepEqual(chatV2ClubIds(list), [SAE]);
  list.CHAT_V2_CLUBS = SALSA;
  assert.deepEqual(chatV2ClubIds(list), [SALSA]);
});

// ---------------------------------------------------------------------------
// schema.ts: a database without the chat migration
// ---------------------------------------------------------------------------

const MISSING_CODES = ["42P01", "42703", "PGRST204", "PGRST205", "PGRST202", "42883"];

test("the six codes of the contract mean the chat schema is missing", () => {
  for (const code of MISSING_CODES) {
    assert.equal(isMissingChatSchema({ code, message: "" }), true, code);
    assert.equal(isMissingChatSchema({ code }), true, `${code}, no message`);
    assert.equal(isMissingChatSchema({ code: code.toLowerCase(), message: "x" }), true, `${code} in lower case`);
    assert.equal(isMissingChatSchema({ code: ` ${code} `, message: "x" }), true, `${code} with spaces`);
  }
});

test("any other code is a real failure", () => {
  // RLS refusal, unique, foreign key, check, bad uuid, raise, no rows, a bad embed, a timeout.
  for (const code of ["42501", "23505", "23503", "23514", "22P02", "P0001", "PGRST116", "PGRST200", "57014"]) {
    assert.equal(isMissingChatSchema({ code, message: "something failed" }), false, code);
  }
});

test("an error with a code is judged by the code, never by its words", () => {
  // Postgres quotes the caller's own text in 22P02, so the words prove nothing.
  const echoes = [
    { code: "22P02", message: 'invalid input syntax for type uuid: "column does not exist"' },
    { code: "22P02", message: 'invalid input syntax for type uuid: "function does not exist"' },
    { code: "P0001", message: "relation does not exist" },
    { code: "3F000", message: 'schema "chat" does not exist, relation unknown' },
    { code: "42704", message: 'type "room_kind" does not exist for column kind' },
    { code: "42501", message: "Could not find the table 'public.chat_polls' in the schema cache" },
    { code: "23514", message: "Could not find the 'kind' column of 'messages' in the schema cache" },
  ];
  for (const error of echoes) {
    assert.equal(isMissingChatSchema(error), false, `${error.code} ${error.message}`);
  }
});

test("without a code the message is read, and must name the thing and say it is missing", () => {
  const missing = [
    'relation "public.chat_polls" does not exist',
    "column channels.kind does not exist",
    "function public.can_post_org_channel(uuid, uuid, uuid) does not exist",
    "Could not find the table 'public.chat_polls' in the schema cache",
    "Could not find the function public.chat_repair_club(p_org) in the schema cache",
    "Could not find the 'thread_root_id' column of 'messages' in the schema cache",
  ];
  for (const message of missing) {
    assert.equal(isMissingChatSchema({ message }), true, message);
    assert.equal(isMissingChatSchema({ code: "", message }), true, `blank code: ${message}`);
    assert.equal(isMissingChatSchema({ code: "  ", message }), true, `spaces for a code: ${message}`);
    assert.equal(isMissingChatSchema({ code: null, message }), true, `null code: ${message}`);
    assert.equal(isMissingChatSchema({ code: 42703, message: message.toUpperCase() }), true, `a number for a code`);
  }
  const real = [
    "",
    "new row violates row-level security policy for table \"messages\"",
    "null value in column \"content\" violates not-null constraint",
    "duplicate key value violates unique constraint",
    "the user does not exist",
    "fetch failed",
  ];
  for (const message of real) {
    assert.equal(isMissingChatSchema({ message }), false, message);
  }
});

test("what is not an error object is not a missing schema", () => {
  for (const value of [null, undefined, "", "42P01", 42703, true, [], {}, { code: undefined, message: undefined }]) {
    assert.equal(isMissingChatSchema(value), false, JSON.stringify(value) ?? String(value));
  }
  assert.equal(isMissingChatSchema(new Error("relation does not exist")), true, "an Error carries a message");
});

test("the missing-schema warning is said once per caller", () => {
  const said: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    said.push(args.map(String).join(" "));
  };
  try {
    warnMissingChatSchemaOnce("flag-test/thread-read");
    warnMissingChatSchemaOnce("flag-test/thread-read");
    warnMissingChatSchemaOnce("flag-test/thread-read");
    warnMissingChatSchemaOnce("flag-test/send");
    warnMissingChatSchemaOnce("flag-test/send");
  } finally {
    console.warn = original;
  }
  assert.equal(said.length, 2);
  assert.ok(said[0].startsWith("[flag-test/thread-read] "));
  assert.ok(said[1].startsWith("[flag-test/send] "));
});
