/**
 * School email allowlist — pure helpers, no server-only imports.
 *
 * WHAT THE EMAIL PROVES (plan 2026-09-15 §2.2, contract C2): the school
 * SYSTEM, IU or Purdue, never the campus. Every IU campus uses @iu.edu;
 * Purdue West Lafayette and Purdue Indianapolis share @purdue.edu. Only
 * @pfw.edu and @pnw.edu point at one campus, and that is a visible preselect
 * the student confirms, never a silent write.
 *
 * THE CODE MAP IS THE CEILING. `SYSTEM_DOMAINS` (+ subdomains) is everything
 * Vibe will ever accept, and Purdue's half stays off until
 * `PURDUE_SIGNUPS_ENABLED` flips in a one-line launch commit (§5.5 step 6).
 * Operators may NARROW the list with SCHOOL_EMAIL_DOMAINS (comma-separated),
 * but never widen it: an entry outside the enabled code map is dropped, so
 * the env var can't bring back @iupui.edu or switch Purdue on (critic C2).
 * That env var is server-only, so a client bundle importing this module only
 * ever sees the code list — the API routes are the authority.
 *
 * RETIRED IU DOMAINS (@iupui.edu, @indiana.edu, …) stopped delivering mail
 * when IU unified on @iu.edu, so a code sent there never arrives. They are
 * always rejected, with copy that points the student to @iu.edu.
 */

import type { SchoolSystem } from "../iu/campuses";
import {
  allowedCampusId,
  isCampusAllowed,
  isSchoolSystem,
  legacyLabel,
  SCHOOL_SYSTEMS,
} from "../iu/campuses";

/**
 * Purdue signups are off until launch. Flipping this to `true` is the whole
 * Purdue launch commit (plan §5.5 step 6): the allowlist, the user-facing
 * domain label and the server copy all follow it. While it is `false`, no
 * server copy mentions Purdue (critic B4).
 */
export const PURDUE_SIGNUPS_ENABLED = false;

/** Per-call override of {@link PURDUE_SIGNUPS_ENABLED} (tests, previews). */
export type SchoolDomainOptions = { purdueEnabled?: boolean };

/**
 * Domain → system code map. A domain also matches its subdomains
 * (`mail.iu.edu` → iu). The first entry of each list is the one user-facing
 * copy names.
 */
export const SYSTEM_DOMAINS: Readonly<Record<SchoolSystem, readonly string[]>> =
  Object.freeze({
    iu: Object.freeze(["iu.edu"]),
    purdue: Object.freeze(["purdue.edu", "pfw.edu", "pnw.edu"]),
  });

/**
 * IU domains retired in favour of @iu.edu (IU IT, effective Jan 1 2026).
 * Mail to them no longer delivers, so they are rejected even if an operator
 * lists one in SCHOOL_EMAIL_DOMAINS.
 */
export const RETIRED_IU_DOMAINS: readonly string[] = Object.freeze([
  "iupui.edu",
  "indiana.edu",
  "iuk.edu",
  "iupuc.edu",
  "ius.edu",
  "iun.edu",
  "iusb.edu",
  "iue.edu",
  "iufw.edu",
]);

/**
 * Domains that point at exactly one campus community (plan §2.2): the campus
 * screen preselects it visibly and the student confirms. Ids are resolved
 * through the campus lib, so an id it doesn't know yields no preselect.
 */
const SINGLE_CAMPUS_DOMAINS: readonly (readonly [domain: string, campusId: string, system: SchoolSystem])[] = [
  ["pfw.edu", "fort-wayne", "purdue"], // shared Fort Wayne community (Franky, Q4)
  ["pnw.edu", "purdue-northwest", "purdue"],
];

function purdueOn(opts?: SchoolDomainOptions): boolean {
  return opts?.purdueEnabled ?? PURDUE_SIGNUPS_ENABLED;
}

/** True when `host` is `domain` or a subdomain of it. */
function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Systems whose students can verify right now, in display order. */
export function enabledSchoolSystems(opts?: SchoolDomainOptions): SchoolSystem[] {
  return SCHOOL_SYSTEMS.filter((s) => s !== "purdue" || purdueOn(opts));
}

/** The code ceiling: every domain of every enabled system. */
export function codeSchoolEmailDomains(opts?: SchoolDomainOptions): string[] {
  return enabledSchoolSystems(opts).flatMap((s) => [...SYSTEM_DOMAINS[s]]);
}

/**
 * The code allowlist as shipped (no env narrowing): `["iu.edu"]` while Purdue
 * signups are off. Kept under its S53 name for existing importers.
 */
export const DEFAULT_SCHOOL_EMAIL_DOMAINS: readonly string[] = Object.freeze(
  codeSchoolEmailDomains(),
);

/** ASCII hostname: dot-separated labels of [a-z0-9-], no leading/trailing hyphen. */
const ASCII_HOST_RE =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

/**
 * Parse a comma-separated allowlist: trim, lowercase, strip leading "@" / "."
 * / "*" and trailing dots, drop empties and duplicates, then NARROW: keep only
 * entries equal to, or a subdomain of, an enabled code domain. An empty
 * result falls back to the code list, so a missing, blank or all-invalid env
 * var never locks everyone out (and never widens past the code map either).
 */
export function parseSchoolEmailDomains(
  raw: string | null | undefined,
  opts?: SchoolDomainOptions,
): string[] {
  const ceiling = codeSchoolEmailDomains(opts);
  const seen = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const domain = part
      .trim()
      .toLowerCase()
      .replace(/^[@.*]+/, "")
      .replace(/\.+$/, "");
    if (domain && ceiling.some((c) => hostMatches(domain, c))) seen.add(domain);
  }
  return seen.size > 0 ? [...seen] : ceiling;
}

/** Allowed school domains: the code map, narrowed by SCHOOL_EMAIL_DOMAINS. */
export function schoolEmailDomains(opts?: SchoolDomainOptions): string[] {
  return parseSchoolEmailDomains(process.env.SCHOOL_EMAIL_DOMAINS, opts);
}

/**
 * Lowercased ASCII host of `email` (trailing dot stripped), or null when the
 * address is malformed: not exactly one "@", empty local part, non-ASCII or
 * punycode (`xn--`) host.
 */
export function schoolEmailHost(email: string): string | null {
  const parts = email.trim().split("@");
  if (parts.length !== 2) return null;
  const [local, rawHost] = parts;
  if (!local) return null;
  const host = rawHost.toLowerCase().replace(/\.$/, "");
  if (!host || !ASCII_HOST_RE.test(host)) return null;
  if (host.split(".").some((label) => label.startsWith("xn--"))) return null;
  return host;
}

/**
 * The retired IU domain an address uses ("a@mail.iupui.edu" → "iupui.edu"),
 * or null. Takes an email address, not a bare domain.
 */
export function retiredIuDomainFor(email: string): string | null {
  const host = schoolEmailHost(email);
  if (!host) return null;
  return RETIRED_IU_DOMAINS.find((d) => hostMatches(host, d)) ?? null;
}

/** True when the address is on a retired IU domain or one of its subdomains. */
export function isRetiredIuDomain(email: string): boolean {
  return retiredIuDomainFor(email) !== null;
}

/**
 * True when the host is an allowed domain or a subdomain of one. A retired IU
 * domain is never a school email, whatever list is passed.
 */
export function isSchoolEmail(
  email: string,
  domains: readonly string[] = schoolEmailDomains(),
): boolean {
  const host = schoolEmailHost(email);
  if (!host) return false;
  if (isRetiredIuDomain(email)) return false;
  return domains.some((d) => hostMatches(host, d));
}

/**
 * The system an address belongs to, from the CODE map only (subdomains
 * included). Null for malformed and retired addresses, for unknown domains,
 * and for Purdue domains while Purdue signups are off (override with
 * `{ purdueEnabled: true }`).
 *
 * This ignores SCHOOL_EMAIL_DOMAINS. To decide whether to accept an address,
 * use {@link allowedSchoolSystemForEmail} or {@link schoolEmailRejection}.
 */
export function schoolSystemForEmail(
  email: string,
  opts?: SchoolDomainOptions,
): SchoolSystem | null {
  const host = schoolEmailHost(email);
  if (!host || isRetiredIuDomain(email)) return null;
  for (const s of enabledSchoolSystems(opts)) {
    if (SYSTEM_DOMAINS[s].some((d) => hostMatches(host, d))) return s;
  }
  return null;
}

/**
 * The system for an address Vibe accepts right now (code map, Purdue flag and
 * env narrowing all applied), or null when it isn't accepted.
 */
export function allowedSchoolSystemForEmail(
  email: string,
  opts?: SchoolDomainOptions,
): SchoolSystem | null {
  if (!isSchoolEmail(email, schoolEmailDomains(opts))) return null;
  return schoolSystemForEmail(email, opts);
}

/**
 * The campus id an address points at on its own ("a@pfw.edu" → "fort-wayne",
 * "a@pnw.edu" → "purdue-northwest"), else null. Only a visible preselect on
 * the campus screen; never store it without the student confirming. Not
 * gated on the Purdue flag: allowlisting happens at verification.
 */
export function singleCampusForEmail(email: string): string | null {
  const host = schoolEmailHost(email);
  if (!host) return null;
  for (const [domain, campusId, system] of SINGLE_CAMPUS_DOMAINS) {
    if (hostMatches(host, domain)) return allowedCampusId(campusId, system);
  }
  return null;
}

function joinDomainLabel(domains: readonly string[]): string {
  const items = domains.map((d) => `@${d}`);
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}

/**
 * User-facing domain hint, flag-aware: "@iu.edu" while Purdue signups are
 * off, "@iu.edu or @purdue.edu" once on (each system's headline domain).
 * Follows env narrowing: a headline domain the env var removed is dropped,
 * and if none remain the narrowed list itself is shown.
 *
 * Passing an explicit domain list keeps the S53 behaviour: those domains,
 * joined ("@a.edu or @b.edu").
 */
export function schoolEmailDomainsLabel(
  domainsOrOpts?: readonly string[] | SchoolDomainOptions,
): string {
  if (Array.isArray(domainsOrOpts)) return joinDomainLabel(domainsOrOpts);
  const opts = domainsOrOpts as SchoolDomainOptions | undefined;
  const allowed = schoolEmailDomains(opts);
  const headline = enabledSchoolSystems(opts)
    .map((s) => SYSTEM_DOMAINS[s][0])
    .filter((d) => allowed.some((a) => hostMatches(d, a)));
  return joinDomainLabel(headline.length > 0 ? headline : allowed);
}

/**
 * Canonical form for storage and matching: trimmed, lowercased, trailing host
 * dot removed. Null when malformed (same rules as `schoolEmailHost`).
 */
export function normalizeSchoolEmail(email: string): string | null {
  const host = schoolEmailHost(email);
  if (!host) return null;
  const local = email.trim().split("@")[0].toLowerCase();
  return `${local}@${host}`;
}

export type SchoolEmailRejection = {
  code: "retired_domain" | "domain_not_allowed";
  error: string;
};

/**
 * Why an address can't be verified, with the student-facing copy, or null
 * when it's accepted. `context` picks the wording: "request" (typing the
 * address) or "verify" (a code or link minted before the allowlist changed).
 *
 * Copy (plan §3.5, critic B4 — no "Purdue" while the flag is off):
 * - @iupui.edu: "IU retired @iupui.edu addresses on Jan 1, 2026. Use your
 *   @iu.edu address." Other retired domains get the same without the date.
 * - request, Purdue off: "Use your school email (@iu.edu)."
 * - request, Purdue on: "Use your IU or Purdue school email."
 */
export function schoolEmailRejection(
  email: string,
  opts?: SchoolDomainOptions & {
    context?: "request" | "verify";
    domains?: readonly string[];
  },
): SchoolEmailRejection | null {
  const retired = retiredIuDomainFor(email);
  if (retired) {
    const when = retired === "iupui.edu" ? " on Jan 1, 2026" : "";
    return {
      code: "retired_domain",
      error: `IU retired @${retired} addresses${when}. Use your @iu.edu address.`,
    };
  }

  const domains = opts?.domains ?? schoolEmailDomains(opts);
  if (isSchoolEmail(email, domains) && schoolSystemForEmail(email, opts)) {
    return null;
  }

  const purdue = purdueOn(opts);
  const label = schoolEmailDomainsLabel(opts);
  const error =
    opts?.context === "verify"
      ? purdue
        ? "That address isn't an IU or Purdue school email. Request a new code with your school email."
        : `That address isn't an IU school email (${label}). Request a new code with your school email.`
      : purdue
        ? "Use your IU or Purdue school email."
        : `Use your school email (${label}).`;
  return { code: "domain_not_allowed", error };
}

/** The users columns {@link schoolSystemPatch} reads. */
export type SchoolSystemRow = {
  school_system?: unknown;
  campus_id?: unknown;
};

/**
 * The system fields to write alongside `school_email` / `school_verified`.
 * `campus_set_at` is deliberately never part of it (critic B3).
 */
export type SchoolSystemPatch = {
  school_system: SchoolSystem;
  /** Present (null) only when the campus has to be cleared. */
  campus_id?: null;
  /** Legacy label dual-write (plan §5.5), present only on a system change. */
  school?: string;
};

/**
 * Pure decision behind school-email-apply: what a verification for `next`
 * does to the row's system and campus.
 *
 * - Same system (a re-verify, or a new address at the same university), or a
 *   first stamp with no campus: stamp the system, touch nothing else.
 * - SYSTEM CHANGE (Franky Q1: a Purdue Indianapolis student who verified with
 *   @iu.edu re-verifies with @purdue.edu):
 *   - the campus is KEPT when it also belongs to the new system (the shared
 *     Indianapolis and Fort Wayne communities);
 *   - otherwise it's CLEARED (`campus_id: null`), which the DB trigger
 *     `users_campus_in_system` would demand anyway. A campus id the campus
 *     lib doesn't know counts as "not in the new system".
 *   - `school` is re-derived for the new system ("Purdue Indianapolis", or ""
 *     once cleared), so legacy label readers don't show the old university.
 * - `campus_set_at` is NEVER cleared (critic B3): bouncing between an @iu.edu
 *   and a @purdue.edu address must not reset the 30-day campus clock.
 */
export function schoolSystemPatch(
  current: SchoolSystemRow | null | undefined,
  next: SchoolSystem,
): SchoolSystemPatch {
  const rawSystem = current?.school_system;
  const rawCampus = current?.campus_id;
  const prev = isSchoolSystem(rawSystem) ? rawSystem : null;
  const campus =
    typeof rawCampus === "string" && rawCampus.trim() ? rawCampus : null;

  const patch: SchoolSystemPatch = { school_system: next };
  if (prev === next || (prev === null && campus === null)) return patch;

  const keep = campus !== null && isCampusAllowed(campus, next);
  if (campus !== null && !keep) patch.campus_id = null;
  if (prev !== null) patch.school = legacyLabel(keep ? campus : null, next);
  return patch;
}
