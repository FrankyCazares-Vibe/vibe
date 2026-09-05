/**
 * Campus email allowlist — pure helpers, no server-only imports.
 *
 * The pilot campus is IU Indianapolis; students use @iu.edu, @iupui.edu and
 * subdomains such as @mail.iu.edu. Operators can widen or swap the list with
 * SCHOOL_EMAIL_DOMAINS (comma-separated). That env var is server-only, so a
 * client bundle importing this module only ever sees the default list — the
 * API routes are the authority.
 */

export const DEFAULT_SCHOOL_EMAIL_DOMAINS: readonly string[] = [
  "iu.edu",
  "iupui.edu",
];

/** ASCII hostname: dot-separated labels of [a-z0-9-], no leading/trailing hyphen. */
const ASCII_HOST_RE =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

/**
 * Parse a comma-separated allowlist: trim, lowercase, strip leading "@" / "."
 * / "*" and trailing dots, drop empties and duplicates. An empty result falls
 * back to the default so a missing or blank env var never locks everyone out.
 */
export function parseSchoolEmailDomains(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const domain = part
      .trim()
      .toLowerCase()
      .replace(/^[@.*]+/, "")
      .replace(/\.+$/, "");
    if (domain) seen.add(domain);
  }
  return seen.size > 0 ? [...seen] : [...DEFAULT_SCHOOL_EMAIL_DOMAINS];
}

/** Allowed campus domains from SCHOOL_EMAIL_DOMAINS (default: iu.edu, iupui.edu). */
export function schoolEmailDomains(): string[] {
  return parseSchoolEmailDomains(process.env.SCHOOL_EMAIL_DOMAINS);
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

/** True when the host is an allowed domain or a subdomain of one. */
export function isSchoolEmail(
  email: string,
  domains: readonly string[] = schoolEmailDomains(),
): boolean {
  const host = schoolEmailHost(email);
  if (!host) return false;
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
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

/** "@iu.edu or @iupui.edu" — user-facing list that follows the env allowlist. */
export function schoolEmailDomainsLabel(
  domains: readonly string[] = schoolEmailDomains(),
): string {
  const items = domains.map((d) => `@${d}`);
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}
