// Fake Supabase for the visual pass (handoffs/chat-redesign/wave-2-build/visual).
//
// Answers exactly what the server side of `/messages` asks between a request
// and the first client paint (harness-notes.md, step 1):
//   GET  /auth/v1/user                → the fixed harness user
//   POST /auth/v1/token?grant_type=…  → a fresh session (only if a refresh is ever tried)
//   GET  /rest/v1/users?select=…&id=eq.<id>
//                                     → the one `public.users` row enforceCampusAccess needs
//   anything else under /rest/v1      → [] (or {} when a single object is asked for)
// Every request is logged to stderr as `<method> <path> <status>`; a request the
// table does not know is logged with `UNMOCKED`.
//
// Run:  node fake-supabase.mjs            (FAKE_PORT, default 54321)
// The user and the session cookie the harness sends are exported by
// `harness-session.mjs` (same folder), which imports HARNESS_USER from here.

import http from "node:http";

export const PORT = Number(process.env.FAKE_PORT || 54321);
export const HARNESS_USER_ID = "11111111-1111-4111-8111-111111111111";
const NOW_ISO = new Date().toISOString();

/** The GoTrue user as `auth.getUser()` returns it (`User` of @supabase/supabase-js). */
export const HARNESS_USER = {
  id: HARNESS_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "harness@iu.edu",
  email_confirmed_at: NOW_ISO,
  phone: "",
  confirmed_at: NOW_ISO,
  last_sign_in_at: NOW_ISO,
  // No `restriction` here: src/proxy.ts `restrictionInForce` reads it and a
  // present one would send every page to /account/suspended.
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { name: "Harness Student", terms_version: "2026-05-07", age_attested: true },
  identities: [],
  created_at: NOW_ISO,
  updated_at: NOW_ISO,
  is_anonymous: false,
};

/**
 * The `public.users` row `enforceCampusAccess` reads through the service
 * role (src/lib/auth/campus-access.ts): consent complete for the CURRENT
 * `TERMS_VERSION` (src/lib/legal/terms.ts), a verified school email, and a
 * non-empty `otto_answers`. Everything else on the row is not read.
 */
export const HARNESS_USERS_ROW = {
  id: HARNESS_USER_ID,
  handle: "harness",
  name: "Harness Student",
  otto_answers: { harness: true },
  school_verified: true,
  terms_version: "2026-05-07",
  terms_accepted_at: NOW_ISO,
  age_attested_at: NOW_ISO,
};

function send(res, status, body, extra = {}) {
  const text = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "access-control-allow-origin": "*",
    ...extra,
  });
  res.end(text);
}

function wantsObject(req) {
  return String(req.headers.accept || "").includes("vnd.pgrst.object+json");
}

export function makeSession(port = PORT) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 365 * 24 * 3600;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const access_token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    iss: `http://localhost:${port}/auth/v1`,
    sub: HARNESS_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: HARNESS_USER.email,
    iat,
    exp,
    session_id: "22222222-2222-4222-8222-222222222222",
    is_anonymous: false,
  })}.harness-signature`;
  return {
    access_token,
    token_type: "bearer",
    expires_in: exp - iat,
    expires_at: exp,
    refresh_token: "harness-refresh-token",
    user: HARNESS_USER,
  };
}

export function startFakeSupabase(port = PORT) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const path = url.pathname;
    let chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      let status = 200;
      let mark = "";
      if (path === "/auth/v1/user" && req.method === "GET") {
        send(res, 200, HARNESS_USER);
      } else if (path === "/auth/v1/token" && req.method === "POST") {
        send(res, 200, makeSession(port));
      } else if (path === "/auth/v1/health") {
        send(res, 200, { name: "GoTrue", version: "harness" });
      } else if (path === "/auth/v1/logout") {
        send(res, 204, undefined);
        status = 204;
      } else if (path.startsWith("/rest/v1/")) {
        const table = path.slice("/rest/v1/".length).split("/")[0];
        if (table === "users" && req.method === "GET" && url.searchParams.get("id") === `eq.${HARNESS_USER_ID}`) {
          send(res, 200, wantsObject(req) ? HARNESS_USERS_ROW : [HARNESS_USERS_ROW]);
        } else {
          mark = " UNMOCKED";
          if (wantsObject(req)) {
            // PostgREST's "no rows" for a single-object read; maybeSingle → null.
            status = 406;
            send(res, 406, { code: "PGRST116", details: "The result contains 0 rows", hint: null, message: "JSON object requested, multiple (or no) rows returned" });
          } else {
            send(res, 200, [], { "content-range": "*/0" });
          }
        }
      } else {
        mark = " UNMOCKED";
        status = 404;
        send(res, 404, { ok: false, error: "fake-supabase: not mocked", path });
      }
      process.stderr.write(`[fake-supabase] ${req.method} ${path}${url.search} ${status}${mark}\n`);
    });
  });
  server.listen(port, "127.0.0.1", () => {
    process.stderr.write(`[fake-supabase] listening on http://localhost:${port} (user ${HARNESS_USER_ID})\n`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  startFakeSupabase();
}
