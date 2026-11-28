/**
 * How long a school-email code works: one number for the server (the code's
 * window, school-email-token.ts) and the words the pages and the email say.
 * No server-only imports, so the school-email page can read it too.
 *
 * Nov 28, 2026: from 30 minutes to 6 hours. Measured that week: since the
 * code-only email began (Oct 8), every code sent to a school inbox went unused
 * (0 of 3), personal inboxes used theirs within 70 seconds (3 of 3), and
 * Franky saw school emails land about 30 minutes late. With a 30-minute
 * window a late email could arrive with a dead code, and "Send again" only
 * queued another slow one.
 *
 * The code is checked for this window and the one before, so it works for at
 * least SCHOOL_CODE_WINDOW_SEC and at most twice that, and a resend inside a
 * window repeats the same code (a late first email and its resend agree).
 * Guessing is bounded per account by the confirm route's limiter (5 tries a
 * quarter hour), and only two codes are ever live, so the odds of a guess do
 * not change with the window's length.
 */
export const SCHOOL_CODE_WINDOW_SEC = 6 * 60 * 60;

/** The window in words, for "It works for at least …". */
export const SCHOOL_CODE_LIFE_WORDS = "6 hours";
