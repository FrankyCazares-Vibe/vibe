-- Session 53 / A4: Terms acceptance + age attestation record.
--
-- Why: the S52 security/legal risk report found that signup captured no
-- consent at all — no "I agree" record for the Terms of Service / Privacy
-- Policy and no age gate, even though the Terms (effective May 7, 2026)
-- require users to be at least 18. Nothing in the schema could answer
-- "when did this user agree, and to which version?".
--
-- What: three service-role-only columns on public.users —
--   terms_version     text         the Terms version string accepted
--                                  (the Terms effective date, "2026-05-07")
--   terms_accepted_at timestamptz  when the user agreed
--   age_attested_at   timestamptz  when the user attested to being 18+
--
-- They are written two ways:
--   1. At signup: the client passes { terms_version, age_attested: true } in
--      signUp options.data, which lands in auth.users.raw_user_meta_data.
--      handle_new_user() below copies them onto the public.users row.
--   2. For existing users (and anyone whose metadata was missing): POST
--      /api/me/accept-terms stamps all three with the service role after the
--      /auth/terms interstitial. Server entry pages redirect users whose
--      terms_accepted_at IS NULL to that interstitial.
--
-- A consent record only counts when all three are set AND terms_version is
-- the current one (src/lib/legal/terms.ts hasRecordedConsent) — a partial or
-- stale record routes the user back through the interstitial.
--
-- Grants: deliberately NOT added to the authenticated SELECT / UPDATE column
-- lists from 20260903100000 — like `email`, these are read and written only
-- through the service role. A user must not be able to backdate or forge
-- their own consent record via PostgREST. Grants, not routes, are the
-- boundary.
--
-- DEPLOY ORDER: safe to apply BEFORE the code deploys. The previous build
-- never selects these columns, the new trigger only adds nullable columns
-- to the INSERT, and existing rows simply stay NULL until the user sees the
-- interstitial once (that one-time prompt is the intended consent capture,
-- not a bug).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS age_attested_at timestamptz;

-- ---------------------------------------------------------------------------
-- handle_new_user(): identical to 20260430190000 plus the consent columns.
-- Keeps SECURITY DEFINER + SET search_path = public. Reads the signup
-- metadata and stamps ALL THREE consent columns only when BOTH hold:
--   * terms_version looks like a Terms effective date (YYYY-MM-DD), and
--   * age_attested = 'true'.
-- Otherwise every consent column stays NULL and the /auth/terms interstitial
-- catches the account. Stamping from terms_version alone would let a crafted
-- signUp({ data: { terms_version } }) pass every gate with no 18+ attestation
-- on record, and accepting any non-empty string would let the row claim a
-- nonexistent version. The app additionally requires terms_version to equal
-- the CURRENT version (hasRecordedConsent), so a stale one re-prompts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  base_email text;
  derived_handle text;
  meta_terms_version text;
  meta_age_attested text;
  consent_ok boolean;
BEGIN
  base_email := COALESCE(NEW.email, '');
  derived_handle := 'u' || REPLACE(NEW.id::text, '-', '');
  meta_terms_version := NULLIF(
    BTRIM(COALESCE(NEW.raw_user_meta_data ->> 'terms_version', '')),
    ''
  );
  meta_age_attested := NEW.raw_user_meta_data ->> 'age_attested';
  consent_ok := COALESCE(meta_terms_version ~ '^\d{4}-\d{2}-\d{2}$'
    , false) AND meta_age_attested = 'true';

  INSERT INTO public.users (
    id,
    email,
    handle,
    name,
    terms_version,
    terms_accepted_at,
    age_attested_at
  )
  VALUES (
    NEW.id,
    base_email,
    derived_handle,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      split_part(base_email, '@', 1),
      'Member'
    ),
    CASE WHEN consent_ok THEN meta_terms_version ELSE NULL END,
    CASE WHEN consent_ok THEN now() ELSE NULL END,
    CASE WHEN consent_ok THEN now() ELSE NULL END
  );

  RETURN NEW;
END;
$$;

-- Re-state the EXECUTE boundary from 20260903100000 (CREATE OR REPLACE keeps
-- existing ACLs, but restating it makes this file self-contained and safe if
-- the function is ever recreated from scratch).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
