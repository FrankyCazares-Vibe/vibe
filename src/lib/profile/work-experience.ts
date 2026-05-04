export type WorkExperienceRow = {
  title: string;
  company: string;
  dates: string;
  location: string;
  description: string;
  logo_url?: string | null;
};

/** Normalize + cap items from API / onboarding / profile sync. */
export function sanitizeWorkExperience(input: unknown): WorkExperienceRow[] {
  if (!Array.isArray(input)) return [];
  const out: WorkExperienceRow[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim().slice(0, 200) : "";
    const company = typeof o.company === "string" ? o.company.trim().slice(0, 200) : "";
    if (!title && !company) continue;
    const dates = typeof o.dates === "string" ? o.dates.trim().slice(0, 120) : "";
    const location = typeof o.location === "string" ? o.location.trim().slice(0, 200) : "";
    const description =
      typeof o.description === "string" ? o.description.trim().slice(0, 4000) : "";
    let logo_url: string | null = null;
    if ("logoUrl" in o && o.logoUrl != null && o.logoUrl !== "") {
      const s = typeof o.logoUrl === "string" ? o.logoUrl.trim() : "";
      if (s.startsWith("data:")) {
        // Logos must be uploaded separately; skip embedded payloads.
        logo_url = null;
      } else if (s) {
        try {
          const u = new URL(s);
          if (u.protocol === "https:" || u.protocol === "http:") {
            logo_url = s.slice(0, 2048);
          }
        } catch {
          logo_url = null;
        }
      }
    } else if ("logo_url" in o && typeof o.logo_url === "string" && o.logo_url.trim()) {
      try {
        const u = new URL(o.logo_url.trim());
        if (u.protocol === "https:" || u.protocol === "http:") {
          logo_url = o.logo_url.trim().slice(0, 2048);
        }
      } catch {
        logo_url = null;
      }
    }
    out.push({ title, company, dates, location, description, logo_url });
    if (out.length >= 15) break;
  }
  return out;
}

/** Shape stored in DB (logo_url) → profile.html (logoUrl). */
export function workExperienceForVibeHtml(rows: WorkExperienceRow[]): Array<{
  title: string;
  company: string;
  dates: string;
  location: string;
  description: string;
  logoUrl: string;
}> {
  return rows.map((w) => ({
    title: w.title,
    company: w.company,
    dates: w.dates,
    location: w.location,
    description: w.description,
    logoUrl: w.logo_url ?? "",
  }));
}
