/**
 * Code ships before the migration (handoffs/chat-redesign/wave-1-contracts.md
 * sections 2 and 3.10): the branch is merged after migration A is applied,
 * but local databases, a Vercel Preview and a rollback all run the new code
 * on a database without the new columns, tables and functions. There,
 * "missing chat schema" must read as "feature off, today's behaviour", never
 * a 500. Section 3.10 says what each changed route answers then.
 *
 * No imports, so every chat module (and `node --test`) can load it; its
 * tests are in flag.test.ts. Same idiom as `isMissingPushSchema` in
 * src/lib/push/config.ts, with two more codes: chat ADDS COLUMNS to tables
 * that already exist (`channels.kind`, `messages.thread_root_id`, ...), so a
 * missing column is the expected pre-migration state here, not a fault.
 *
 *   42P01     Postgres: the table does not exist
 *   42703     Postgres: the column does not exist
 *   PGRST204  PostgREST: the column is not in its schema cache (insert / update)
 *   PGRST205  PostgREST: the table is not in its schema cache
 *   PGRST202  PostgREST: the function is not in its schema cache
 *   42883     Postgres: the function does not exist
 */

const MISSING_SCHEMA_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205", "PGRST202", "42883"]);

/**
 * True when a Supabase / Postgres error says a chat table, column or function
 * is not in this database yet.
 *
 * THE CODE DECIDES. An error that carries a code is judged by the code alone
 * and its message is never read: Postgres repeats the caller's own text in
 * some messages (22P02 quotes the bad value), so a request could otherwise
 * make a real failure read as "schema missing", and section 3.10 answers
 * "allowed" at the send gate then.
 *
 * The message is read only when there is no code at all (a driver that drops
 * it). It asks for both the kind of thing and "does not exist" (or
 * PostgREST's "could not find the ..."), so an ordinary failure that merely
 * mentions a column is not mistaken for a missing one.
 */
export function isMissingChatSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === "string" && code.trim() !== "") {
    return MISSING_SCHEMA_CODES.has(code.trim().toUpperCase());
  }
  const text = typeof message === "string" ? message.toLowerCase() : "";
  if (
    text.includes("could not find the table") ||
    text.includes("could not find the function") ||
    (text.includes("could not find the") && text.includes("column"))
  ) {
    return true;
  }
  return (
    (text.includes("relation") || text.includes("function") || text.includes("column")) &&
    text.includes("does not exist")
  );
}

const warnedMissingSchema = new Set<string>();

/**
 * Say "chat schema missing" once per server instance per caller, not on every
 * message read. `tag` is the caller's log tag.
 */
export function warnMissingChatSchemaOnce(tag: string): void {
  if (warnedMissingSchema.has(tag)) return;
  warnedMissingSchema.add(tag);
  console.warn(
    `[${tag}] the chat rooms migration isn't in this database yet; answering with today's behaviour until it runs`,
  );
}
