/**
 * Canonical site origin for auth redirect URLs (email links, callbacks).
 * Prefer NEXT_PUBLIC_SITE_URL in production.
 *
 * Guards against env mistakes (e.g. value literally "NEXT_PUBLIC_SITE_URL"),
 * so email templates never emit broken links.
 */
export function getSiteUrl(): string {
  const explicit = sanitizeExplicitOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (explicit) {
    return explicit;
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.startsWith("http") ? vercel : `https://${vercel}`;
    return host.replace(/\/$/, "");
  }

  return "http://localhost:3000";
}

function sanitizeExplicitOrigin(raw: string | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;

  if (isPlaceholderSiteUrl(t)) {
    return null;
  }

  let origin = t.replace(/\/$/, "");
  if (!/^https?:\/\//i.test(origin)) {
    if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i.test(origin)) {
      origin = `https://${origin}`;
    } else {
      return null;
    }
  }

  origin = origin.replace(/\/$/, "");
  if (isPlaceholderSiteUrl(origin)) {
    return null;
  }

  return origin;
}

function isPlaceholderSiteUrl(value: string): boolean {
  const normalized = value
    .trim()
    .replace(/^\[+/, "")
    .replace(/\]+$/, "")
    .trim()
    .toLowerCase();
  if (normalized === "next_public_site_url") {
    return true;
  }
  const v = value.trim().toLowerCase();
  if (v.includes("your-deployment.vercel.app")) {
    return true;
  }
  if (v.includes("yourdomain") || v.includes("your-site")) {
    return true;
  }
  return false;
}
