// The auth cookie the harness sends to `next dev`, in the shape
// @supabase/ssr 0.6 reads (harness-notes.md, step 1): the cookie is named
// `sb-<first label of the Supabase URL's hostname>-auth-token` and its value
// is `base64-` + base64url(JSON session). One chunk (the session is small).
import { makeSession, PORT } from "./fake-supabase.mjs";

export function cookieFor(supabaseUrl) {
  const label = new URL(supabaseUrl).hostname.split(".")[0];
  const name = `sb-${label}-auth-token`;
  const value = "base64-" + Buffer.from(JSON.stringify(makeSession(PORT))).toString("base64url");
  return { name, value, header: `${name}=${value}` };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const url = process.argv[2] || `http://localhost:${PORT}`;
  process.stdout.write(cookieFor(url).header + "\n");
}
