/**
 * The SQLSTATE → route-code table of migration B
 * (handoffs/chat-redesign/wave-2-contracts.md 3.2), as the one function the
 * two card routes share (4.1.12, 4.3.11). Every RPC raises with one of these
 * codes; this turns the error into the refusal the route sends.
 *
 * | SQLSTATE | answer |
 * |---|---|
 * | `P0C21` | `postRefusal(room, null, role)`'s code with `POST_REFUSAL_STATUS` (403) |
 * | `P0C22` | 400 `invalid_card`, the body carries `field` |
 * | `P0C23` | 404 `event_not_found` |
 * | `P0C24` | 404 `not_found` |
 * | `P0C25` | 409 `poll_closed` |
 * | `P0C26` | 409 `slot_full` |
 * | a missing function (`isMissingChatSchema`) | 404 `not_found` (3.10) |
 * | anything else | 503 `try_again`, logged with the SQLSTATE |
 *
 * PURE but for the log line: `room-rules.ts`, `schema.ts` and `types.ts`
 * are its imports, so `node --test` loads it (its test lives under
 * `src/lib/chat/cards/`, where `npm test`'s glob reaches; a path with
 * `[id]` in it is read as a glob and never runs).
 */

import { postRefusal } from "@/lib/chat/room-rules";
import { isMissingChatSchema, warnMissingChatSchemaOnce } from "@/lib/chat/schema";
import {
  refusalBody,
  type ClubRole,
  type InvalidCardRefusal,
  type PostRefusalCode,
  type Refusal,
  type Room,
} from "@/lib/chat/types";

/**
 * The status each send refusal answers with (wave-1 contract 6.2, and wave
 * 3's `room_posters_only`): the same five rows as `messages/route.ts:64-71`,
 * which a route file cannot export.
 */
export const POST_REFUSAL_STATUS: Readonly<Record<PostRefusalCode, number>> = Object.freeze({
  board_officers_only: 403,
  board_post_missing: 409,
  thread_root_not_allowed: 400,
  room_closed: 403,
  room_posters_only: 403,
});

/** What a Supabase RPC call hands back as its error. */
export type RpcError = { code?: unknown; message?: unknown } | null | undefined;

export type RpcRefusal = { status: number; body: Refusal | InvalidCardRefusal };

export type RpcRefusalOpts = {
  /** The room the card is in (`roomOf`), for `P0C21`'s code. */
  room: Room | null;
  /** The caller's role in the club, read only for `P0C21`. */
  roleOf: () => Promise<ClubRole | null>;
  /** The `field` a `P0C22` carries. */
  invalidField: string;
  /** The route's log tag. */
  log: string;
};

export async function rpcRefusal(error: RpcError, opts: RpcRefusalOpts): Promise<RpcRefusal> {
  const code = typeof error?.code === "string" ? error.code.trim().toUpperCase() : "";
  switch (code) {
    case "P0C21": {
      const refused = postRefusal(opts.room, null, await opts.roleOf());
      return { status: POST_REFUSAL_STATUS[refused], body: refusalBody(refused) };
    }
    case "P0C22":
      return { status: 400, body: { ...refusalBody("invalid_card"), field: opts.invalidField } };
    case "P0C23":
      return { status: 404, body: refusalBody("event_not_found") };
    case "P0C24":
      return { status: 404, body: refusalBody("not_found") };
    case "P0C25":
      return { status: 409, body: refusalBody("poll_closed") };
    case "P0C26":
      return { status: 409, body: refusalBody("slot_full") };
    default:
      break;
  }
  if (isMissingChatSchema(error)) {
    warnMissingChatSchemaOnce(opts.log);
    return { status: 404, body: refusalBody("not_found") };
  }
  const message = typeof error?.message === "string" ? error.message : "";
  console.error(`[${opts.log}] rpc failed`, code || "(no code)", message);
  return { status: 503, body: refusalBody("try_again") };
}
