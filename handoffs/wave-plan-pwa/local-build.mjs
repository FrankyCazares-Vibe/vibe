// Build with the LOCAL stack's env so prerendering never reads production.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const env = { ...process.env };
for (const line of readFileSync(".env.development.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(env.NEXT_PUBLIC_SUPABASE_URL || "")) { console.error("NOT LOCAL"); process.exit(2); }
env.SENTRY_AUTH_TOKEN = "";
env.NEXT_TELEMETRY_DISABLED = "1";
const r = spawnSync("npx", ["next", "build"], { env, stdio: "inherit" });
process.exit(r.status ?? 1);
