/**
 * Tests for the waitlist access codes (`access-code.ts`).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/waitlist/access-code.test.ts
 *
 * The normaliser vectors and the hash vector are the same ones
 * scripts/sql/waitlist-gate-check.sql (S3) runs through
 * `public.waitlist_normalize_code` and `public.waitlist_code_hash`, so the
 * TypeScript and SQL sides can't drift apart unnoticed.
 *
 * The module has NO imports, so it loads through a dynamic import of its
 * ".ts" path (the pattern of `src/lib/auth/password-rules.test.ts`): tsc
 * refuses a literal ".ts" specifier, so it goes through a variable.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

const specifier = "./access-code.ts";
const {
  ACCESS_CODE_ALPHABET,
  ACCESS_CODE_LENGTH,
  ACCESS_CODE_METADATA_KEY,
  ACCESS_CODE_URL_PARAM,
  GATE_PROBE_METADATA_KEY,
  formatAccessCode,
  generateAccessCode,
  isUnfinishedAccessCode,
  normalizeAccessCode,
  readTypedAccessCode,
} = (await import(specifier)) as typeof import("./access-code");

const FORMAT_RE = /^VIBE-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}$/;

test("the alphabet is Crockford base32: 32 characters, no I, L, O or U", () => {
  assert.equal(ACCESS_CODE_ALPHABET.length, 32);
  assert.equal(new Set(ACCESS_CODE_ALPHABET).size, 32);
  for (const banned of ["I", "L", "O", "U"]) assert.ok(!ACCESS_CODE_ALPHABET.includes(banned));
  assert.equal(ACCESS_CODE_LENGTH, 8);
});

test("the URL parameter and metadata key are never `code`", () => {
  assert.equal(ACCESS_CODE_URL_PARAM, "access_code");
  assert.equal(ACCESS_CODE_METADATA_KEY, "access_code");
  assert.equal(GATE_PROBE_METADATA_KEY, "vibe_gate_probe");
});

test("a generated code has the VIBE-XXXX-XXXX shape and normalises back", () => {
  for (let i = 0; i < 200; i++) {
    const code = generateAccessCode();
    assert.match(code, FORMAT_RE);
    const normalized = normalizeAccessCode(code);
    assert.equal(normalized, code.replace(/^VIBE-/, "").replace("-", ""));
    assert.equal(formatAccessCode(normalized as string), code);
  }
});

test("an injected random source makes it deterministic", () => {
  const bytes = Uint8Array.from([0, 1, 2, 3, 28, 29, 30, 31]);
  assert.equal(generateAccessCode(() => bytes), "VIBE-0123-WXYZ");
  assert.equal(generateAccessCode(() => bytes), generateAccessCode(() => bytes));
});

test("every byte value maps inside the alphabet, evenly (byte & 31)", () => {
  const counts = new Map<string, number>();
  for (let b = 0; b < 256; b += 8) {
    const bytes = Uint8Array.from({ length: 8 }, (_, i) => b + i);
    const raw = (normalizeAccessCode(generateAccessCode(() => bytes)) ?? "").split("");
    assert.equal(raw.length, 8);
    for (const ch of raw) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  assert.equal(counts.size, 32);
  for (const n of counts.values()) assert.equal(n, 8);
});

test("a short random source is refused", () => {
  assert.throws(() => generateAccessCode(() => new Uint8Array(4)), /too few bytes/);
});

// The vectors shared with the SQL check (S3).
const VECTORS: [string, string | null][] = [
  ["VIBE-7KQ2-M9XD", "7KQ2M9XD"],
  ["vibe 7kq2 m9xd", "7KQ2M9XD"],
  ["7kq2-m9xd", "7KQ2M9XD"],
  ["  vibe-7KQ2-m9xd\n", "7KQ2M9XD"],
  ["VIBE-7KQ2-M9XO", "7KQ2M9X0"],
  ["vibe-ILO0-0000", "11000000"],
  ["VIBE-7KQ2-M9X", null],
  ["VIBE-7KQ2-M9XU", null],
  ["VIBE7KQ2M9XDQ", null],
  ["", null],
  ["VIBE", null],
  ["VIBE-7KQ2-M9XĐ", null],
  ["vıbe-7kq2-m9xd", null],
];

test("normalizeAccessCode: the shared vectors", () => {
  for (const [input, want] of VECTORS) {
    assert.equal(normalizeAccessCode(input), want, JSON.stringify(input));
  }
});

test("normalizeAccessCode never throws on odd input", () => {
  for (const odd of [undefined, null, 42, {}, "🙂🙂🙂🙂🙂🙂🙂🙂"] as unknown[]) {
    assert.equal(normalizeAccessCode(odd as string), null);
  }
});

// The page's own rule (not in the SQL): half a code is not a code.
const UNFINISHED = ["VIBE-7KQ2", "vibe-7kq2", "VIBE7KQ2", " vibe 7kq2 ", "VIBE", "VIBE-", "vibe-7", "VIBE-7KQ2-M9X"];

test("readTypedAccessCode: a code cut short is unfinished, not a code", () => {
  for (const input of UNFINISHED) {
    assert.equal(isUnfinishedAccessCode(input), true, JSON.stringify(input));
    assert.equal(readTypedAccessCode(input), null, JSON.stringify(input));
  }
  // The defect: the 8 characters of VIBE-7KQ2 pass the plain normaliser (and
  // the database's), the I read as 1.
  assert.equal(normalizeAccessCode("VIBE-7KQ2"), "V1BE7KQ2");
});

test("readTypedAccessCode: every full code still reads, as normalizeAccessCode reads it", () => {
  for (const [input, want] of VECTORS) {
    assert.equal(readTypedAccessCode(input), want, JSON.stringify(input));
    if (want !== null) assert.equal(isUnfinishedAccessCode(input), false, JSON.stringify(input));
  }
  const loose: [string, string][] = [
    ["vibe7kq2m9xd", "7KQ2M9XD"],
    ["VIBE 7KQ2 M9XD", "7KQ2M9XD"],
    ["7KQ2M9XD", "7KQ2M9XD"],
    ["vibe-7kq2-m9xo", "7KQ2M9X0"],
    ["vibe-ilo0-0000", "11000000"],
    // A code whose own 8 characters start V1BE: in full, or with the digit.
    ["VIBE-V1BE-7KQ2", "V1BE7KQ2"],
    ["vibe-vibe-7kq2", "V1BE7KQ2"],
    ["V1BE-7KQ2", "V1BE7KQ2"],
    ["vlbe7kq2", "V1BE7KQ2"],
  ];
  for (const [input, want] of loose) {
    assert.equal(isUnfinishedAccessCode(input), false, JSON.stringify(input));
    assert.equal(readTypedAccessCode(input), want, JSON.stringify(input));
  }
  for (let i = 0; i < 200; i++) {
    const code = generateAccessCode();
    for (const typed of [code, code.toLowerCase(), code.replace(/-/g, ""), code.toLowerCase().replace(/-/g, " "), code.slice(5)]) {
      // `generateAccessCode` never writes the letter I, so even a code that
      // starts V1BE comes back when typed without its prefix.
      assert.equal(readTypedAccessCode(typed), normalizeAccessCode(code), typed);
    }
  }
});

test("isUnfinishedAccessCode and readTypedAccessCode never throw on odd input", () => {
  for (const odd of [undefined, null, 42, {}, "", "🙂🙂🙂🙂", "vıbe-7kq2"] as unknown[]) {
    assert.equal(isUnfinishedAccessCode(odd as string), false);
    assert.equal(readTypedAccessCode(odd as string), null);
  }
});

test("the hash vector: sha256 of the 8 normalised characters, hex", () => {
  const normalized = normalizeAccessCode("VIBE-7KQ2-M9XD") as string;
  assert.equal(
    createHash("sha256").update(normalized, "utf8").digest("hex"),
    "28260557126c16ecfa20c77a89f2da7961bbe4132ee6fc5f5c506b8595f3d165",
  );
});

test("formatAccessCode splits 4 + 4 after the prefix", () => {
  assert.equal(formatAccessCode("7KQ2M9XD"), "VIBE-7KQ2-M9XD");
});
