/**
 * Tests for the two modules of contract section 2
 * (handoffs/chat-redesign/wave-1-contracts.md):
 *   `flag.ts`    the `chat_v2` switch and its two lists
 *   `schema.ts`  "missing chat schema = feature off, never a 500"
 * and for the second switch in `flag.ts`, `chat_desktop`
 * (handoffs/chat-redesign/wave-3-desktop/contract.md section 2.4).
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
const {
  chatDesktopAnswer,
  chatDesktopEnabled,
  chatDesktopEveryone,
  chatDesktopListedUser,
  chatV2ClubIds,
  chatV2Enabled,
  chatV2Everyone,
  chatV2ListedUser,
  chatV2MayRunHere,
} = (await import(specifier)) as typeof import("./flag");

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

/** A live-site environment with the DESKTOP switch on: what its two list readers need before they answer. */
function desk(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return env({ CHAT_DESKTOP_ENABLED: "true", ...values });
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
  // The desktop switch: not from a NEXT_PUBLIC_ name, not from push, and not from the phone's switch.
  const publicOnly = env({ NEXT_PUBLIC_CHAT_DESKTOP_ENABLED: "true", NEXT_PUBLIC_CHAT_DESKTOP_ALLOWLIST: "*" });
  assert.equal(chatDesktopEnabled(publicOnly), false);
  assert.equal(chatDesktopEveryone(publicOnly), false);
  const publicSwitch = env({ NEXT_PUBLIC_CHAT_DESKTOP_ENABLED: "true", CHAT_DESKTOP_ALLOWLIST: ALICE });
  assert.equal(chatDesktopListedUser(ALICE, publicSwitch), false);
  assert.equal(chatDesktopAnswer(ALICE, true, publicOnly), false);
  assert.equal(chatDesktopEnabled(env({ PUSH_ENABLED: "true" })), false);
  assert.equal(chatDesktopEnabled(on({ CHAT_V2_ALLOWLIST: "*" })), false, "CHAT_V2_ENABLED is not the desktop switch");
  // Nor are the desktop lists read from a NEXT_PUBLIC_ name with the real switch on.
  assert.equal(chatDesktopEveryone(desk({ NEXT_PUBLIC_CHAT_DESKTOP_ALLOWLIST: "*" })), false);
  assert.equal(chatDesktopListedUser(ALICE, desk({ NEXT_PUBLIC_CHAT_DESKTOP_ALLOWLIST: ALICE })), false);
  assert.equal(chatDesktopAnswer(ALICE, true, desk({ NEXT_PUBLIC_CHAT_DESKTOP_ALLOWLIST: "*" })), false);
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
// chat_desktop: the second switch (Messages on a laptop)
// ---------------------------------------------------------------------------

test("the desktop switch is on only for exactly \"true\"", () => {
  assert.equal(chatDesktopEnabled(env({ CHAT_DESKTOP_ENABLED: "true" })), true);
  for (const value of ["TRUE", "True", "1", "yes", "on", " true", "true ", "*", "", undefined]) {
    assert.equal(chatDesktopEnabled(env({ CHAT_DESKTOP_ENABLED: value })), false, `CHAT_DESKTOP_ENABLED=${value}`);
  }
  assert.equal(chatDesktopEnabled(env({})), false);
  // Its list never turns it on by itself.
  assert.equal(chatDesktopEnabled(env({ CHAT_DESKTOP_ALLOWLIST: "*" })), false);
});

test("the desktop switch counts on the live site and in next dev, nowhere else", () => {
  const live = { CHAT_DESKTOP_ENABLED: "true", VERCEL_ENV: "production", NODE_ENV: "production" };
  assert.equal(chatDesktopEnabled(bare(live)), true);
  assert.equal(chatDesktopEnabled(bare({ CHAT_DESKTOP_ENABLED: "true", NODE_ENV: "development" })), true);
  // A Vercel Preview build runs against the production database: off, whatever the list says.
  const preview = { CHAT_DESKTOP_ENABLED: "true", VERCEL_ENV: "preview", NODE_ENV: "production" };
  assert.equal(chatDesktopEnabled(bare(preview)), false);
  assert.equal(chatDesktopEveryone(bare({ ...preview, CHAT_DESKTOP_ALLOWLIST: "*" })), false);
  assert.equal(chatDesktopListedUser(ALICE, bare({ ...preview, CHAT_DESKTOP_ALLOWLIST: ALICE })), false);
  assert.equal(chatDesktopAnswer(ALICE, true, bare({ ...preview, CHAT_DESKTOP_ALLOWLIST: "*" })), false);
  assert.equal(chatDesktopAnswer(ALICE, true, bare({ ...preview, CHAT_DESKTOP_ALLOWLIST: ALICE })), false);
  // `next start` on a laptop, a test run, an empty environment: off.
  for (const nodeEnv of ["production", "test", undefined]) {
    const here = { CHAT_DESKTOP_ENABLED: "true", NODE_ENV: nodeEnv, CHAT_DESKTOP_ALLOWLIST: "*" };
    assert.equal(chatDesktopEnabled(bare(here)), false, `NODE_ENV=${nodeEnv}`);
    assert.equal(chatDesktopEveryone(bare(here)), false, `NODE_ENV=${nodeEnv}`);
    assert.equal(chatDesktopAnswer(ALICE, true, bare(here)), false, `NODE_ENV=${nodeEnv}`);
  }
});

test("with the desktop switch off both list readers and the answer say no, whatever the list holds", () => {
  for (const off of [undefined, "", "TRUE", "1", " true", "false", "*"]) {
    const label = `CHAT_DESKTOP_ENABLED=${off}`;
    const star = env({ CHAT_DESKTOP_ENABLED: off, CHAT_DESKTOP_ALLOWLIST: "*" });
    const named = env({ CHAT_DESKTOP_ENABLED: off, CHAT_DESKTOP_ALLOWLIST: ALICE });
    assert.equal(chatDesktopEveryone(star), false, label);
    assert.equal(chatDesktopListedUser(ALICE, named), false, label);
    assert.equal(chatDesktopAnswer(ALICE, true, star), false, label);
    assert.equal(chatDesktopAnswer(ALICE, true, named), false, label);
  }
  // The same lists with the switch on, so the loop above cannot pass by accident.
  assert.equal(chatDesktopEveryone(desk({ CHAT_DESKTOP_ALLOWLIST: "*" })), true);
  assert.equal(chatDesktopListedUser(ALICE, desk({ CHAT_DESKTOP_ALLOWLIST: ALICE })), true);
  assert.equal(chatDesktopAnswer(ALICE, true, desk({ CHAT_DESKTOP_ALLOWLIST: "*" })), true);
});

test("the desktop star must be the whole value", () => {
  assert.equal(chatDesktopEveryone(desk({ CHAT_DESKTOP_ALLOWLIST: "*" })), true);
  assert.equal(chatDesktopEveryone(desk({ CHAT_DESKTOP_ALLOWLIST: "  *  " })), true);
  for (const value of [undefined, "", "   ", ",", "**", "* *", `*,${ALICE}`, `${ALICE},*`, ALICE, "all"]) {
    assert.equal(chatDesktopEveryone(desk({ CHAT_DESKTOP_ALLOWLIST: value })), false, `CHAT_DESKTOP_ALLOWLIST=${value}`);
  }
  // A star inside a list lets in the people named beside it, and nobody else.
  assert.equal(chatDesktopAnswer(ALICE, true, desk({ CHAT_DESKTOP_ALLOWLIST: `${ALICE},*` })), true);
  assert.equal(chatDesktopAnswer(BOB, true, desk({ CHAT_DESKTOP_ALLOWLIST: `${ALICE},*` })), false);
  // The phone's star is not the desktop's star.
  assert.equal(chatDesktopEveryone(desk({ CHAT_V2_ENABLED: "true", CHAT_V2_ALLOWLIST: "*" })), false);
});

test("a blank desktop list is nobody", () => {
  for (const value of [undefined, "", "   ", ",, ,"]) {
    const list = desk({ CHAT_DESKTOP_ALLOWLIST: value });
    assert.equal(chatDesktopEveryone(list), false, `CHAT_DESKTOP_ALLOWLIST=${value}`);
    assert.equal(chatDesktopListedUser(ALICE, list), false, `CHAT_DESKTOP_ALLOWLIST=${value}`);
    assert.equal(chatDesktopAnswer(ALICE, true, list), false, `CHAT_DESKTOP_ALLOWLIST=${value}`);
  }
  // Being on the phone's list does not put anyone on the desktop's.
  const phoneOnly = desk({ CHAT_V2_ENABLED: "true", CHAT_V2_ALLOWLIST: ALICE, CHAT_V2_CLUBS: SAE });
  assert.equal(chatDesktopListedUser(ALICE, phoneOnly), false);
  assert.equal(chatDesktopAnswer(ALICE, true, phoneOnly), false);
});

test("the desktop list names exactly its ids, trimmed and lower-cased", () => {
  const list = desk({ CHAT_DESKTOP_ALLOWLIST: ` ${ALICE.toUpperCase()} ,\n other-id ,` });
  assert.equal(chatDesktopListedUser(ALICE, list), true);
  assert.equal(chatDesktopListedUser(ALICE.toUpperCase(), list), true);
  assert.equal(chatDesktopListedUser(`  ${ALICE}  `, list), true);
  assert.equal(chatDesktopListedUser(BOB, list), false);
  assert.equal(chatDesktopListedUser(ALICE.slice(0, 8), list), false, "a prefix is not a match");
  assert.equal(chatDesktopListedUser(`${ALICE}0`, list), false, "a longer id is not a match");
  // The answer compares the same way.
  assert.equal(chatDesktopAnswer(`  ${ALICE.toUpperCase()}  `, true, list), true);
  assert.equal(chatDesktopAnswer(BOB, true, list), false);
});

test("an empty id and the star are never on the desktop list", () => {
  const list = desk({ CHAT_DESKTOP_ALLOWLIST: `,${ALICE},,` });
  for (const id of ["", "   ", undefined, null, 42]) {
    assert.equal(chatDesktopListedUser(id as unknown as string, list), false, `id=${id}`);
    assert.equal(chatDesktopAnswer(id as unknown as string, true, list), false, `id=${id}`);
  }
  assert.equal(chatDesktopListedUser(ALICE, desk({ CHAT_DESKTOP_ALLOWLIST: "*" })), false);
  assert.equal(chatDesktopListedUser("*", desk({ CHAT_DESKTOP_ALLOWLIST: "*" })), false);
  assert.equal(chatDesktopListedUser("*", desk({ CHAT_DESKTOP_ALLOWLIST: `*,${ALICE}` })), false);
});

test("without the phone flag the desktop answer is no, for every env", () => {
  const envs = [
    desk({ CHAT_DESKTOP_ALLOWLIST: "*" }),
    desk({ CHAT_DESKTOP_ALLOWLIST: ALICE }),
    desk({ CHAT_DESKTOP_ALLOWLIST: "*", CHAT_V2_ENABLED: "true", CHAT_V2_ALLOWLIST: "*" }),
    desk({ CHAT_DESKTOP_ALLOWLIST: ALICE, CHAT_V2_ENABLED: "true", CHAT_V2_ALLOWLIST: ALICE, CHAT_V2_CLUBS: SAE }),
    bare({ CHAT_DESKTOP_ENABLED: "true", NODE_ENV: "development", CHAT_DESKTOP_ALLOWLIST: "*" }),
    desk({}),
    env({ CHAT_DESKTOP_ALLOWLIST: "*" }),
    bare({}),
  ];
  for (const [index, values] of envs.entries()) {
    assert.equal(chatDesktopAnswer(ALICE, false, values), false, `env ${index}`);
    // Only a real `true` counts: the answer never guesses from something truthy.
    for (const odd of [undefined, null, 1, "true"]) {
      assert.equal(chatDesktopAnswer(ALICE, odd as unknown as boolean, values), false, `env ${index}, chatV2On=${odd}`);
    }
  }
});

test("the desktop answer needs the switch, a way in, and the phone flag: all three", () => {
  const star = { CHAT_DESKTOP_ALLOWLIST: "*" };
  const named = { CHAT_DESKTOP_ALLOWLIST: ALICE };
  // All three: yes, by the star and by name.
  assert.equal(chatDesktopAnswer(ALICE, true, desk(star)), true);
  assert.equal(chatDesktopAnswer(BOB, true, desk(star)), true);
  assert.equal(chatDesktopAnswer(ALICE, true, desk(named)), true);
  const dev = bare({ CHAT_DESKTOP_ENABLED: "true", NODE_ENV: "development", ...named });
  assert.equal(chatDesktopAnswer(ALICE, true, dev), true);
  // Take any one away: no.
  assert.equal(chatDesktopAnswer(ALICE, true, env(star)), false, "no switch");
  assert.equal(chatDesktopAnswer(ALICE, true, env(named)), false, "no switch");
  assert.equal(chatDesktopAnswer(BOB, true, desk(named)), false, "not listed, no star");
  assert.equal(chatDesktopAnswer(ALICE, true, desk({})), false, "no list");
  assert.equal(chatDesktopAnswer(ALICE, false, desk(star)), false, "no phone flag");
  assert.equal(chatDesktopAnswer(ALICE, false, desk(named)), false, "no phone flag");
});

test("each desktop call reads the env it is given", () => {
  const list = desk({ CHAT_DESKTOP_ALLOWLIST: ALICE });
  assert.equal(chatDesktopAnswer(ALICE, true, list), true);
  list.CHAT_DESKTOP_ALLOWLIST = BOB;
  assert.equal(chatDesktopAnswer(ALICE, true, list), false);
  assert.equal(chatDesktopAnswer(BOB, true, list), true);
  list.CHAT_DESKTOP_ENABLED = "1";
  assert.equal(chatDesktopAnswer(BOB, true, list), false);
});


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
