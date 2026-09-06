export const TERMS_VERSION = "2026-05-07";
export const MIN_AGE = 18;
export const TERMS_METADATA_KEYS = { version: "terms_version", age: "age_attested" } as const;

/** The three service-role-only consent columns on `public.users`. */
export const CONSENT_COLUMNS = "terms_version, terms_accepted_at, age_attested_at";

export type ConsentRow = {
  terms_version?: string | null;
  terms_accepted_at?: string | null;
  age_attested_at?: string | null;
};

/**
 * A consent record only counts when ALL of it is present: an agreement
 * timestamp, an 18+ attestation timestamp, and the version agreed to being
 * the CURRENT Terms. A row missing the age stamp (crafted signup metadata),
 * or carrying a forged / stale version, is treated as no consent and is sent
 * through the /auth/terms interstitial — which also gives re-consent for free
 * whenever TERMS_VERSION changes.
 */
export function hasRecordedConsent(row: ConsentRow | null | undefined): boolean {
  return Boolean(
    row?.terms_accepted_at && row?.age_attested_at && row?.terms_version === TERMS_VERSION,
  );
}
