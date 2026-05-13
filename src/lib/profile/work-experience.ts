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

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
  spring: 2, summer: 5, fall: 8, autumn: 8, winter: 11,
};

/**
 * Best-effort parse of the free-text `dates` string into a sort key
 * (ms-since-epoch of the END date — "Present" / "Current" / "Now" map
 * to Date.now() so current roles float to the top). Handles:
 *   "Jan 2024 – Present"    → now
 *   "January 2024 - Now"    → now
 *   "Summer 2024 – Fall 2024" → Sep 2024
 *   "2022 – 2024"           → end of 2024
 *   "Jun 2021 – Aug 2022"   → Aug 2022
 *   "2023"                  → Dec 2023
 *   ""                      → 0 (sorts to the bottom)
 *
 * Anything unrecognized falls back to 0 so it sinks rather than
 * randomly jumping. Stable: same string → same key.
 */
export function parseExperienceEndDateMs(raw: string): number {
  if (!raw) return 0;
  const s = raw.toLowerCase();

  // Current / present / now → "right now"
  if (/\b(present|current(?:ly)?|now|ongoing)\b/.test(s)) {
    return Date.now();
  }

  // Split on common range separators; tail = end date string. If only
  // one half, that IS the end date.
  const halves = s.split(/\s*(?:[-–—~]|to|until|through)\s*/i);
  const tail = (halves[halves.length - 1] ?? "").trim();
  if (!tail) return 0;

  // "Present"-y in the tail again (covers "2020-present" lowercase).
  if (/\b(present|current|now|ongoing)\b/.test(tail)) return Date.now();

  // <month-or-season> <year>  OR  <year> alone
  const m =
    tail.match(/\b([a-z]+)\.?\s+(\d{4})\b/) ||
    tail.match(/(\d{4})/);
  if (!m) return 0;

  if (m.length === 3) {
    const monthKey = m[1].replace(/\./g, "");
    const month = MONTHS[monthKey];
    const year = parseInt(m[2], 10);
    if (!Number.isFinite(year)) return 0;
    if (month === undefined) {
      // Year-only after a word we don't recognize ("Q4 2024", "Fall ??")
      return Date.UTC(year, 11, 31);
    }
    return Date.UTC(year, month, 28);
  }
  const year = parseInt(m[1], 10);
  if (!Number.isFinite(year)) return 0;
  return Date.UTC(year, 11, 31);
}

/**
 * Sort work experience descending by parsed end date (most recent /
 * current at top). Stable for tied keys — preserves array order so
 * future drag-to-reorder edits can override the auto-sort when dates
 * are ambiguous (same year, missing months, etc.).
 */
export function sortWorkExperienceByRecency<
  T extends { dates?: string | null },
>(rows: T[]): T[] {
  return rows
    .map((row, i) => ({ row, i, key: parseExperienceEndDateMs(row.dates ?? "") }))
    .sort((a, b) => {
      if (b.key !== a.key) return b.key - a.key;
      return a.i - b.i;
    })
    .map((e) => e.row);
}
