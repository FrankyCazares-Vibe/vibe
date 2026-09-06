-- Session 53 / A4 fix pass (F2): append-only consent history.
--
-- Why: 20260906100000 records consent as three columns on public.users
-- (terms_version / terms_accepted_at / age_attested_at). That is a single
-- mutable slot — when the Terms version bumps and the user re-accepts, the
-- interstitial overwrites the original record, and "user X agreed to
-- version V on date D" is no longer provable for the version that was in
-- force when they signed up or posted. An append-only ledger keeps every
-- acceptance, so re-consent adds a row instead of erasing history.
--
-- What: public.terms_acceptances — one row per acceptance event:
--   user_id        who agreed (FK -> public.users)
--   terms_version  the Terms version string accepted ("2026-05-07")
--   accepted_at    when
--   age_attested   the 18+ attestation given alongside (always true today;
--                  kept as a column so the record is self-describing)
--   source         'signup'       — stamped by handle_new_user() from the
--                                   signUp metadata (same validation as the
--                                   users columns: YYYY-MM-DD version AND
--                                   age_attested = 'true'), or
--                  'interstitial' — written by POST /api/me/accept-terms
--                                   with the service role before it stamps
--                                   the users row.
--
-- Access: service-role only. RLS is enabled with NO policies and ALL
-- privileges are revoked from anon / authenticated, so a user can neither
-- read nor forge nor delete their own consent history via PostgREST. The
-- trigger insert runs as the SECURITY DEFINER owner (postgres), which is not
-- subject to these grants. Grants, not routes, are the boundary.
--
-- Retention: ON DELETE CASCADE — when the account row is deleted the
-- history goes with it. That is the privacy-safe default (no consent
-- records outliving the user they describe); counsel to confirm whether a
-- detached retention copy is required, in which case this FK becomes
-- ON DELETE SET NULL plus a snapshot column.
--
-- DEPLOY ORDER: safe to apply BEFORE the code deploys. It only adds a new
-- table and makes the signup trigger write one extra row; the previous
-- build never references the table. The interstitial insert (D3) lands with
-- the deploy and starts writing rows from then on — earlier acceptances on
-- users.* are not back-filled here (their original accepted_at is still on
-- the users row until the next re-consent).

CREATE TABLE IF NOT EXISTS public.terms_acceptances (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  terms_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  age_attested boolean NOT NULL,
  source text NOT NULL CHECK (source IN ('signup', 'interstitial'))
);

CREATE INDEX IF NOT EXISTS terms_acceptances_user_id_accepted_at_idx
  ON public.terms_acceptances (user_id, accepted_at DESC);

-- Service-role only: RLS on with no policies, and no table privileges for
-- the PostgREST roles. (service_role bypasses RLS; postgres owns the table.)
ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.terms_acceptances FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.terms_acceptances_id_seq FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- handle_new_user(): identical to 20260906100000 plus one statement — when
-- the signup metadata passes the consent validation (consent_ok), append a
-- 'signup' row to terms_acceptances alongside stamping the users columns.
-- Keeps SECURITY DEFINER + SET search_path = public.
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

  -- F2: append-only history row for the signup acceptance. Inserted after
  -- the users row so the FK is satisfied.
  IF consent_ok THEN
    INSERT INTO public.terms_acceptances (
      user_id,
      terms_version,
      accepted_at,
      age_attested,
      source
    )
    VALUES (
      NEW.id,
      meta_terms_version,
      now(),
      true,
      'signup'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Re-state the EXECUTE boundary from 20260903100000 (CREATE OR REPLACE keeps
-- existing ACLs, but restating it makes this file self-contained and safe if
-- the function is ever recreated from scratch).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
