-- Allow the new "cream" backdrop preset on orgs. The original CHECK
-- constraint (added in 20260507100000) didn't include it, so picks
-- from the org Settings backdrop swatch were silently dropped at the
-- API + DB layer. Drop + recreate the constraint with cream added.

ALTER TABLE public.orgs DROP CONSTRAINT IF EXISTS orgs_backdrop_preset_check;
ALTER TABLE public.orgs ADD CONSTRAINT orgs_backdrop_preset_check
  CHECK (backdrop_preset IN ('cream','sand-purple','ember','deep-violet','forest','midnight'));
