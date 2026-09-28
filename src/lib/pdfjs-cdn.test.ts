import { test } from "node:test";
import assert from "node:assert/strict";

// Node's type stripping needs the ".ts" on disk; tsc refuses a literal ".ts"
// import (TS5097) and next build type-checks this file. A variable specifier
// keeps both happy, the display-mode.test.ts pattern.
const specifier = "./pdfjs-cdn.ts";
const { pdfDocumentParams } = (await import(specifier)) as typeof import("./pdfjs-cdn");

const PAGE = "https://www.connectvibe.app/profile/someone";

test("eval is switched off for a freshly uploaded file (data: URL)", () => {
  // "%PDF" in base64.
  const params = pdfDocumentParams("data:application/pdf;base64,JVBERg==", PAGE);
  assert.equal(params.isEvalSupported, false);
  assert.equal(params.url, undefined);
  assert.deepEqual(Array.from(params.data ?? []), [0x25, 0x50, 0x44, 0x46]);
});

test("eval is switched off for a signed or linked URL", () => {
  const params = pdfDocumentParams("https://example.supabase.co/storage/v1/object/sign/r.pdf?t=1", PAGE);
  assert.equal(params.isEvalSupported, false);
  assert.equal(params.data, undefined);
  assert.equal(params.url, "https://example.supabase.co/storage/v1/object/sign/r.pdf?t=1");
});

test("a relative path is made absolute against the page, not the worker", () => {
  const params = pdfDocumentParams("/api/resume/abc/resume.pdf", PAGE);
  assert.equal(params.url, "https://www.connectvibe.app/api/resume/abc/resume.pdf");
  assert.equal(params.isEvalSupported, false);
});

test("a data: URL with no comma decodes to empty bytes, still with eval off", () => {
  const params = pdfDocumentParams("data:application/pdf;base64", PAGE);
  assert.equal(params.data?.length, 0);
  assert.equal(params.isEvalSupported, false);
});
