#!/usr/bin/env node
// Prints a Cookie header value for a LOCAL seed account, for curl against the local dev server.
//   node cookie.mjs blake        -> sb-127-auth-token=base64-...
// Accounts: avery (owner), blake (member), casey (mod in chat_seed_club), drew, emery (admin). LOCAL STACK ONLY.
import { execSync } from "node:child_process";
const who = (process.argv[2] || "blake").toLowerCase();
const env = Object.fromEntries(
  execSync("supabase status -o env", { cwd: "/Users/franciscocazares/vibe", encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }),
);
const url = env.API_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url || "")) { console.error("refusing: not the local stack"); process.exit(1); }
const res = await fetch(url + "/auth/v1/token?grant_type=password", {
  method: "POST",
  headers: { apikey: env.ANON_KEY, "content-type": "application/json" },
  body: JSON.stringify({ email: who + "@example.test", password: "vibe-local-1234" }),
});
if (!res.ok) { console.error("sign-in failed", res.status, await res.text()); process.exit(1); }
const session = await res.json();
const ref = new URL(url).hostname.split(".")[0];
const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
const name = "sb-" + ref + "-auth-token";
// @supabase/ssr splits long values into .0, .1 chunks of 3180 chars
const parts = [];
if (value.length <= 3180) parts.push(name + "=" + value);
else for (let i = 0, n = 0; i < value.length; i += 3180, n++) parts.push(name + "." + n + "=" + value.slice(i, i + 3180));
process.stdout.write(parts.join("; "));
