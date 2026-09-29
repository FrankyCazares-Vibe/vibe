/**
 * Is `chat_v2` on for this person? The one question routes and screens ask
 * (handoffs/chat-redesign/wave-1-contracts.md section 2):
 *
 *   enabled AND (everyone OR a listed user OR a member of a listed club)
 *
 * The first three parts are env reads (flag.ts, pure). The last is one
 * `org_members` read with the service role: the viewer's own client could
 * not see a hidden club's roster, and the answer must not depend on what RLS
 * shows them.
 *
 * FAILS CLOSED: a read error, a missing service key or a thrown network
 * error answers `false` and logs once per server instance. Nobody gets the
 * new chat on a guess. The read is not cached: someone who joins or leaves a
 * listed club gets the new answer on their next request.
 *
 * A list entry that cannot count (a star inside a list of people, a club
 * entry that is not an id) is ignored, and said once in the log, so a
 * mistyped id or a launch-day "<ids>,*" does not fail in silence.
 *
 * What the flag gates, and what it does not, is in the contract. A gated
 * route answers 404 `not_found` when this says false.
 */

import "server-only";

import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

import { chatV2ClubIds, chatV2Enabled, chatV2Everyone, chatV2ListedUser } from "./flag";

/** Any uuid Postgres accepts. Looser than `isUuid` (pgrest.ts), which refuses the local seed's ids. */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let loggedReadFailure = false;

function logReadFailureOnce(what: unknown): void {
  if (loggedReadFailure) return;
  loggedReadFailure = true;
  console.error("[chat/flag] the club check failed; chat_v2 reads as off for club members until it works", what);
}

/** The code and message of a Supabase error, never the whole object (it can carry the query). */
function errorSummary(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const { code, message } = error as { code?: unknown; message?: unknown };
  return [code, message].filter((part) => typeof part === "string" && part !== "").join(" ") || "unknown error";
}

let checkedLists = false;

/**
 * Two mistakes in the lists that would otherwise pass in silence, said once
 * per server instance, the first time someone asks with the switch on.
 * Neither changes the answer: the odd entry stays ignored (flag.ts). The
 * values themselves are never logged.
 */
function warnOddListsOnce(): void {
  if (checkedLists) return;
  checkedLists = true;
  const entries = (raw: string | undefined) =>
    (raw ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry !== "");
  if (entries(process.env.CHAT_V2_ALLOWLIST).includes("*") && !chatV2Everyone(process.env)) {
    console.warn(
      "[chat/flag] CHAT_V2_ALLOWLIST has a star inside a list; the star must be the whole value, so it is ignored",
    );
  }
  if (entries(process.env.CHAT_V2_CLUBS).some((entry) => !UUID_SHAPE.test(entry))) {
    console.warn("[chat/flag] CHAT_V2_CLUBS has an entry that is not an id; it is ignored");
  }
}

export async function chatV2For(userId: string): Promise<boolean> {
  if (!chatV2Enabled(process.env)) return false;
  warnOddListsOnce();
  const id = typeof userId === "string" ? userId.trim().toLowerCase() : "";
  if (!id) return false;
  if (chatV2Everyone(process.env)) return true;
  if (chatV2ListedUser(id, process.env)) return true;

  const clubIds = chatV2ClubIds(process.env);
  if (clubIds.length === 0) return false;
  // `user_id` is a uuid column: anything else would fail the read, not miss.
  if (!UUID_SHAPE.test(id)) return false;

  if (!isSupabaseServiceConfigured()) {
    logReadFailureOnce("SUPABASE_SERVICE_ROLE_KEY is not set");
    return false;
  }
  try {
    const { data, error } = await createSupabaseServiceClient()
      .from("org_members")
      .select("org_id")
      .eq("user_id", id)
      .in("org_id", clubIds)
      .limit(1);
    if (error) {
      logReadFailureOnce(errorSummary(error));
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    logReadFailureOnce(err instanceof Error ? err.message : "the read threw");
    return false;
  }
}
