-- Session 53 / A4 fix pass (F1): consent becomes a DB-level write boundary.
--
-- Why: every content-creating API route now calls requireTermsAccepted(),
-- but the S53 adversarial review pointed out that "grants, not routes, are
-- the boundary" — an authenticated session can still INSERT posts,
-- comments, reposts, events, channels and messages (and UPDATE its own
-- posts) straight through PostgREST with its own JWT, skipping every route
-- gate. So the same consent check is AND-ed into the WITH CHECK of each
-- content-write policy: no recorded consent, no content written, whichever
-- door you use.
--
-- What:
--   * public.has_recorded_consent(): SECURITY DEFINER helper that reads the
--     service-role-only consent columns on public.users for auth.uid(). It is
--     needed precisely because `authenticated` has no SELECT grant on those
--     columns (20260906100000) — the policies could not read them directly.
--     It returns a bare boolean and takes no arguments, so it leaks nothing
--     beyond "is the caller consented", and it is only executable by
--     `authenticated` (anon never passes the underlying policies anyway).
--   * ALTER POLICY ... WITH CHECK ((<existing expression>) AND
--     public.has_recorded_consent()) on the eight content-write policies.
--     ALTER POLICY replaces the whole expression, so each existing predicate
--     is restated verbatim from pg_policies (verified live 2026-09-06) and
--     the consent term appended. posts_update_own keeps its USING clause
--     unchanged (a user can still SELECT-for-update / see their own rows);
--     only the WITH CHECK gains the predicate.
--
-- Predicate semantics: "any recorded consent" (terms_accepted_at and
-- age_attested_at both non-NULL), deliberately NOT "current version". The
-- app layer (src/lib/legal/terms.ts hasRecordedConsent) additionally requires
-- terms_version to equal the current TERMS_VERSION, so a Terms bump
-- re-prompts through the interstitial but never turns the DB layer into a
-- hard block while the re-consent rolls out.
--
-- Deliberately untouched: users_update_self (heartbeat / last_active_at must
-- keep working for pre-consent users so the interstitial itself works),
-- rsvps, reports, personal_events, otto_reminders — those remain
-- route-gated only.
--
-- DEPLOY ORDER: apply AFTER the S53 A4 code deploy is live. Legacy users
-- have NULL consent columns until they pass the /auth/terms interstitial,
-- which only exists in the new build. Applying this first would make every
-- such user's post / comment / message INSERT fail with an RLS violation
-- with no way to fix it. Once the interstitial is live, a blocked write can
-- only happen for a user who has not yet accepted, and the app already
-- routes them to the interstitial before they get that far.

-- ---------------------------------------------------------------------------
-- Helper: does the calling user have a recorded consent?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_recorded_consent ()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.terms_accepted_at IS NOT NULL
      AND u.age_attested_at IS NOT NULL
  )
$$;

REVOKE ALL ON FUNCTION public.has_recorded_consent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_recorded_consent() TO authenticated;

-- ---------------------------------------------------------------------------
-- Content-write policies: existing predicate (verbatim) AND consent.
-- ---------------------------------------------------------------------------

-- posts
ALTER POLICY posts_insert_authenticated ON public.posts
  WITH CHECK (
    (auth.uid() = user_id)
    AND public.has_recorded_consent()
  );

ALTER POLICY posts_update_own ON public.posts
  USING (auth.uid() = user_id)
  WITH CHECK (
    (auth.uid() = user_id)
    AND public.has_recorded_consent()
  );

-- post_comments
ALTER POLICY post_comments_insert_own ON public.post_comments
  WITH CHECK (
    (auth.uid() = user_id)
    AND public.has_recorded_consent()
  );

-- post_reposts
ALTER POLICY post_reposts_insert_own ON public.post_reposts
  WITH CHECK (
    (auth.uid() = user_id)
    AND public.has_recorded_consent()
  );

-- events
ALTER POLICY events_insert_authenticated ON public.events
  WITH CHECK (
    (auth.uid() = creator_id)
    AND public.has_recorded_consent()
  );

-- channels
ALTER POLICY channels_insert_authenticated ON public.channels
  WITH CHECK (
    ((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text])))
    AND public.has_recorded_consent()
  );

-- messages (DM / group channels)
ALTER POLICY messages_insert_member ON public.messages
  WITH CHECK (
    ((auth.uid() = user_id) AND (EXISTS (
      SELECT 1
      FROM (channel_members cm
        JOIN channels c ON ((c.id = cm.channel_id)))
      WHERE ((cm.channel_id = messages.channel_id) AND (cm.user_id = auth.uid()) AND (c.org_id IS NULL))
    )))
    AND public.has_recorded_consent()
  );

-- messages (org channels)
ALTER POLICY messages_insert_org_member ON public.messages
  WITH CHECK (
    ((auth.uid() = user_id) AND (EXISTS (
      SELECT 1
      FROM channels c
      WHERE ((c.id = messages.channel_id) AND (c.org_id IS NOT NULL) AND can_view_org_channel(c.id, auth.uid()))
    )))
    AND public.has_recorded_consent()
  );
