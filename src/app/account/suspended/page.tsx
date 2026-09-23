import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getActiveRestriction } from "@/lib/moderation/access";
import { restrictionReasonLine } from "@/lib/moderation/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { SuspendedActions } from "./suspended-actions";

export const metadata = {
  title: "Your account · Vibe",
  description: "What happened to your account, and how to reach a person about it.",
  robots: { index: false, follow: false },
};

/** The address a student writes to about a restriction (plan §5, S64). */
const SUPPORT_EMAIL = "help@connectvibe.app";

type Restriction = {
  kind: "suspension" | "ban";
  endsAt: string | null;
  reasonCode: string | null;
};

type RestrictionRow = {
  kind?: string | null;
  ends_at?: string | null;
  starts_at?: string | null;
  reason_code?: string | null;
};

/** Times students read in their own heads: Indiana, spelled out, with the zone. */
const WHEN = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Indiana/Indianapolis",
  month: "long",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

/** Started, not lifted, not run out. An end date we can't read still counts. */
function inForce(row: RestrictionRow): boolean {
  const now = Date.now();
  const startsAt = row.starts_at ? Date.parse(row.starts_at) : Number.NaN;
  if (!Number.isNaN(startsAt) && startsAt > now) return false;
  if (!row.ends_at) return true;
  const endsAt = Date.parse(row.ends_at);
  return Number.isNaN(endsAt) || endsAt > now;
}

function asRestriction(row: RestrictionRow): Restriction {
  return {
    kind: row.kind === "ban" ? "ban" : "suspension",
    endsAt: typeof row.ends_at === "string" ? row.ends_at : null,
    reasonCode: typeof row.reason_code === "string" ? row.reason_code : null,
  };
}

/** What this page has to say: the notice, the lifted-but-stuck panel, or nothing. */
type PageState =
  | { view: "restricted"; restriction: Restriction }
  | { view: "lifted" }
  | { view: "none" };

/**
 * What this student is under. The row is the truth — it is the only place the
 * reason lives — so `getActiveRestriction` answers first.
 *
 * The mirror in auth `app_metadata` is the fallback, and it is not belt and
 * braces: the proxy sends students here on the strength of that mirror alone,
 * so a page that redirected away whenever the row was unreadable — the window
 * before the moderation migration is applied, or a database blip — would bounce
 * the student between /campus and here forever. When the mirror says restricted
 * and the row can't be read, this page still renders, minus the reason.
 *
 * A ROW THAT WAS READ CLEANLY AND SAYS "FREE" IS NOT THE SAME AS AN UNREADABLE
 * ONE, and the difference is a lift whose mirror write failed
 * (`incomplete: ['app_metadata']`, src/lib/moderation/actions.ts). The proxy
 * still sends her here on the stale mirror; falling through to it would read
 * her the ban notice — "for good, there's no end date" — after a moderator has
 * let her back in, and nothing she can do from a browser clears server-side
 * `app_metadata`, so signing out and back in wouldn't shake it either. That
 * case gets its own honest panel instead of a verdict that isn't true any more.
 *
 * "Read cleanly and free" also covers the moderation tables not being there at
 * all (`getActiveRestriction` answers ok/null for a missing store), and the
 * panel is still the honest thing to show: with no tables, no gate and no
 * policy is refusing this student anything, so the mirror the proxy is holding
 * is the only part of the app that still thinks she is restricted.
 */
async function loadRestriction(userId: string, mirrored: unknown): Promise<PageState> {
  const mirror = mirrored as RestrictionRow | null | undefined;
  const mirrorInForce = Boolean(mirror && typeof mirror === "object" && inForce(mirror));

  let rowRead = false;
  try {
    const lookup = await getActiveRestriction(userId);
    if (lookup.ok && lookup.restriction) {
      return { view: "restricted", restriction: asRestriction(lookup.restriction) };
    }
    rowRead = lookup.ok;
  } catch {
    // A service client that can't be built at all (no key on this deployment).
    // The mirror below is enough to render the page, and a page that throws
    // here is a student who can't sign out or leave.
  }

  // The database says nothing is in force. If the proxy still thinks otherwise,
  // that is the stale mirror above; if it agrees, there is nothing to show.
  if (rowRead) return mirrorInForce ? { view: "lifted" } : { view: "none" };

  // The row couldn't be read at all, so the mirror is all we have.
  if (!mirrorInForce || !mirror) return { view: "none" };
  return { view: "restricted", restriction: asRestriction(mirror) };
}

/**
 * Their own handle, for the delete confirmation. The service role first,
 * because it can't be wrong; the caller's own client second, because the
 * moderation migration keeps an own-row arm on the users SELECT policy exactly
 * so `DELETE /api/me` can still read it. Neither one may throw: with no handle
 * on screen there is nothing to type back, and deleting the account is one of
 * the three things this page exists to allow.
 */
async function loadHandle(
  userId: string,
  fallback: SupabaseClient,
): Promise<string | null> {
  const read = async (client: SupabaseClient) => {
    const { data } = await client
      .from("users")
      .select("handle")
      .eq("id", userId)
      .maybeSingle();
    return typeof data?.handle === "string" ? data.handle : null;
  };
  try {
    const own = await read(createSupabaseServiceClient());
    if (own) return own;
  } catch {
    // Fall through to the caller's own client.
  }
  try {
    return await read(fallback);
  } catch {
    return null;
  }
}

/**
 * The lift landed and the proxy hasn't noticed. Says the true thing — you're
 * not restricted any more — and then says the other true thing: only we can
 * finish it.
 *
 * NO LINK TO CAMPUS. There used to be one, on the theory that the mirror is
 * re-read from GoTrue every request so following it would usually work. That
 * was wrong, and not "usually" wrong — always. The stale value IS the one
 * GoTrue stores: `updateSession` asks it for the user
 * (src/lib/supabase/middleware.ts), gets `app_metadata.restriction` back
 * verbatim, and the proxy sends the student straight back here. Nothing a
 * browser can do rewrites server-side `app_metadata`, so the link was a loop
 * with a friendly label on it. What clears it is `mirrorToAuth(..., null)`
 * running again on our side (src/lib/moderation/actions.ts), which is what the
 * address below is for.
 *
 * No Sign out and no Delete here on purpose. Neither would help (the mirror is
 * server-side, so a new session reads the same thing), and offering "delete
 * your account" to somebody a moderator has just let back in would be the
 * app's own glitch talking a student into leaving.
 */
function LiftedNotice() {
  return (
    <div className="vibe-auth-page" style={{ background: "#FAF7F2" }}>
      <div className="vibe-auth-card">
        <div className="vibe-auth-brand" aria-hidden>
          vibe<span className="vibe-auth-dot">.</span>
        </div>
        <h1 className="vibe-auth-headline vibe-auth-headline--compact">
          You&apos;re good<span className="vibe-auth-dot">.</span>
        </h1>
        <p className="vibe-auth-sub">
          Whatever was on this account has been lifted — nothing is restricted
          any more. Vibe hasn&apos;t caught up, though, and that part is on us,
          not you: the flag that decides which page you get is held on our side,
          and there&apos;s nothing you can do from here that clears it. Signing
          out and back in reads the same flag.
        </p>
        <p className="vibe-auth-sub">
          Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="vibe-auth-link">
            {SUPPORT_EMAIL}
          </a>{" "}
          and we&apos;ll clear it — it takes us a minute, and then every page
          works again.
        </p>
      </div>
    </div>
  );
}

/**
 * `/account/suspended` — the one page a suspended or banned student sees.
 *
 * Says what happened, until when, why in plain words, and how to reach a
 * person. From here they can read the Terms, sign out, or delete the account;
 * the proxy sends every other page here, so those actions have to be on this
 * page rather than behind a link to Settings.
 *
 * It can never trap anyone: signed out goes to login, and an account with
 * nothing in force (a lifted restriction, an expired suspension, a stale
 * bookmark) goes straight to campus — or, when the proxy is still holding a
 * stale mirror of a lifted restriction, reads the short panel above instead of
 * a verdict that has been withdrawn.
 */
export default async function SuspendedPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const state = await loadRestriction(user.id, user.app_metadata?.restriction);
  if (state.view === "none") redirect("/campus");
  // Rendered, never redirected: the proxy is still sending every page here, so
  // a redirect to /campus would be the loop the comment above guards against.
  if (state.view === "lifted") return <LiftedNotice />;
  const restriction = state.restriction;

  const handle = await loadHandle(user.id, supabase);

  const banned = restriction.kind === "ban";
  // Parse before formatting: `inForce` above deliberately keeps a date it
  // can't read (fail closed), and the proxy sends exactly that student here,
  // so `WHEN.format` on it would throw `Invalid time value` and 500 the one
  // page they're allowed to load. No date simply means the sentence below
  // doesn't name one.
  const endsAtMs = restriction.endsAt ? Date.parse(restriction.endsAt) : Number.NaN;
  const until = Number.isNaN(endsAtMs) ? null : WHEN.format(new Date(endsAtMs));
  // Plain words for the code the moderator picked. The private admin note is
  // never shown here — a student gets the reason, not the case file — and a
  // code this list doesn't know falls back to a sentence rather than a blank.
  // The list is shared with the restrict picker so the two can't drift:
  // src/lib/moderation/reports.ts.
  const reason = restrictionReasonLine(restriction.reasonCode);

  // The cream page colour is set here rather than inherited: every other
  // screen wearing `vibe-auth-page` sits under src/app/auth/layout.tsx, which
  // paints the background, and this page is deliberately outside /auth. The
  // class itself only lays the card out and paints the ambient wash.
  return (
    <div className="vibe-auth-page" style={{ background: "#FAF7F2" }}>
      <div className="vibe-auth-card">
        <div className="vibe-auth-brand" aria-hidden>
          vibe<span className="vibe-auth-dot">.</span>
        </div>

        <h1 className="vibe-auth-headline vibe-auth-headline--compact">
          {banned ? "Your account is closed" : "Your account is paused"}
          <span className="vibe-auth-dot">.</span>
        </h1>

        {/*
          The ban branch is a page they can come back to, and it says so.
          Franky's decision of 2026-09-22: a ban does NOT take sign-in away
          (src/lib/moderation/actions.ts sets no GoTrue ban), precisely so the
          student can sign in, read what happened, write to the appeal address
          and delete their own account and data on their own terms. What makes
          the ban stick is the restriction row keyed on their school email, so
          that address can't be verified on a new account — the sentence below
          names that, because it is the part they would otherwise discover by
          signing up again.

          No end date is named for a ban, and none is implied: "for good" is
          the honest word, and the appeal paragraph underneath is the way out.

          The school-email sentence is conditional ("if you verified") because
          this page can't tell: `getActiveRestriction` selects id, kind,
          starts_at, ends_at and reason_code, not `key_kind`, and an account
          banned before it verified anything is keyed on its personal address
          only — which nothing tests in v1. Better a sentence that is true
          either way than one that names an address they never had.

          And it says the address can't be VERIFIED again, not that it can't
          start an account, because signing up is the one thing the ban doesn't
          touch: sign-up runs from the browser straight to GoTrue with no Vibe
          route in the path (src/lib/moderation/actions.ts), so a new account
          with that address as its login works, and only school-email
          verification tests the key. A student who found that out by trying
          would be right that the notice had lied to her. What the key actually
          costs her is posting, commenting and messaging, which decision 4 puts
          behind a verified school email — so that is what the sentence names.

          THE SUSPENSION BRANCH SAYS THE HIDING TOO, and it has to: nothing in
          this wave treats a pause more gently than a closure. `user_visible()`
          and `is_restricted_now()` don't look at `kind` at all, so
          posts_select_authenticated hides her posts, users_select_authenticated
          hides her row, and /api/users/<h>/bootstrap 404s her profile for
          exactly as long as the pause lasts. "Your profile, posts and chats are
          waiting for you" was true about the DATA and false about the campus —
          an officer paused for a week reads that her profile is fine, watches
          her friends tell her it 404s, and writes to support to report a bug we
          caused on purpose. Tensed for the duration ("while it's paused",
          "comes back on its own") so it is the same promise, told straight.

          AND VIBE+ KEEPS BILLING through a pause — decision 7 stops the money
          for a ban only (src/lib/moderation/actions.ts) — while the proxy sends
          /plus and /settings here like every other page. Until this page grows
          a Manage-subscription button, a student's honest options are "delete
          the whole account" or "write to us", so the sentence names the second
          one rather than leaving her to find the charge on a card statement.
        */}
        <p className="vibe-auth-sub">
          {banned ? (
            <>
              A Vibe moderator closed this account, for good — there&apos;s no
              end date on it. Your profile, posts and comments aren&apos;t
              visible to anyone on Vibe any more, and if you verified a school
              email here, it can&apos;t be verified on another account, so a new
              account can&apos;t post, comment or message. If you had Vibe+, we
              cancel it when an account is closed, and there&apos;s no refund
              for the rest of the month — if you see another charge after this,
              write to the address below and we&apos;ll sort it. Nothing of
              yours is deleted: you can sign in and read this page whenever you
              want, and delete everything yourself below.
            </>
          ) : (
            <>
              A Vibe moderator paused your account
              {until ? (
                <>
                  {" "}
                  until <strong>{until}</strong>
                </>
              ) : null}
              . While it&apos;s paused, your profile, posts and comments
              aren&apos;t visible to anyone else on Vibe. Nothing is deleted —
              all of it comes back on its own when the pause ends. Vibe+ is the
              one thing that doesn&apos;t pause: if you have it, it keeps
              billing the whole time, so write to the address below and
              we&apos;ll stop it.
            </>
          )}
        </p>

        <p className="vibe-auth-sub">
          <strong>What happened:</strong> {reason}
        </p>

        <p className="vibe-auth-sub">
          If you think we got this wrong, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="vibe-auth-link">
            {SUPPORT_EMAIL}
          </a>{" "}
          and tell us what we missed. A person reads it. You can also read the{" "}
          <Link href="/legal/terms" className="vibe-auth-link">
            Terms
          </Link>{" "}
          and the{" "}
          <Link href="/legal/privacy" className="vibe-auth-link">
            Privacy Policy
          </Link>{" "}
          any time.
        </p>

        <SuspendedActions handle={handle} />
      </div>
    </div>
  );
}
