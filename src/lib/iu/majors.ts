// IU Indianapolis (the renamed IUPUI) school + major taxonomy, plus the
// campus-aware entry points for every curated majors list Vibe has.
// Single source of truth — imported by the campus map AND the profile
// editor so a typed-in major always groups into the same school halo.
//
// NOT Bloomington: Herron (art) not Eskenazi, IU School of Medicine is
// prominent, School of Science + School of Liberal Arts are split
// (Bloomington has one A&S college), Engineering & Technology is its
// own school separate from Luddy. No Jacobs — Bloomington only.
//
// TWO LAYERS (keep both until the last legacy importer moves):
//   1. LEGACY exports — IU_SCHOOLS, IU_SCHOOL_BY_ID, MAJOR_TO_SCHOOL,
//      schoolForMajor, IU_MAJORS_BY_SCHOOL. Shapes unchanged. This is the
//      pre-split combined Indianapolis taxonomy: it still carries the
//      Engineering & Technology school, which became Purdue's in the 2024
//      IUPUI split, so today's map halos (MapMobile, campus-home) and
//      profile pickers don't regress before they move to the new API.
//   2. CAMPUS-AWARE exports — majorsForCampus(campusId, system) and
//      schoolForMajorIn(campusId, system, major). They serve the IU
//      Indianapolis list (legacy minus Engineering & Technology), the Purdue
//      Indianapolis list (majors-purdue-indianapolis.ts) and the IU
//      Bloomington list (majors-bloomington.ts). Everywhere else → null
//      (free text). A major both universities offer (Computer Science, Data
//      Science, Cybersecurity) sits in the student's own system's list.
//
// public/html/_iu-majors.js is GENERATED from this module for the static
// pages; majors.test.ts fails when it drifts (see that file to regenerate).

import { BLOOMINGTON_MAJORS, BLOOMINGTON_SCHOOLS } from "./majors-bloomington";
import {
  PURDUE_INDIANAPOLIS_LOOKUP_ALIASES,
  PURDUE_INDIANAPOLIS_MAJOR_TO_SCHOOL,
  PURDUE_INDIANAPOLIS_SCHOOLS,
} from "./majors-purdue-indianapolis";

export type IuSchool = {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
};

export const IU_SCHOOLS: IuSchool[] = [
  { id: "kelley",    label: "Kelley · Business",          shortLabel: "Kelley",   color: "#C62828" },
  { id: "oneill",    label: "O'Neill · Public Affairs",   shortLabel: "O'Neill",  color: "#0EA5E9" },
  { id: "luddy",     label: "Luddy · Informatics",        shortLabel: "Luddy",    color: "#4A90E2" },
  { id: "engtech",   label: "Engineering & Technology",   shortLabel: "Eng+Tech", color: "#8B5CF6" },
  { id: "media",     label: "Media School",               shortLabel: "Media",    color: "#E879A6" },
  { id: "liberal",   label: "Liberal Arts",               shortLabel: "Liberal",  color: "#6FBF73" },
  { id: "science",   label: "School of Science",          shortLabel: "Science",  color: "#10B981" },
  { id: "herron",    label: "Herron · Art + Design",      shortLabel: "Herron",   color: "#F59E0B" },
  { id: "health",    label: "Fairbanks Public Health",    shortLabel: "Health",   color: "#14B8A6" },
  { id: "nursing",   label: "School of Nursing",          shortLabel: "Nursing",  color: "#06B6D4" },
  { id: "med",       label: "IU School of Medicine",      shortLabel: "Med",      color: "#DC2626" },
  { id: "education", label: "School of Education",        shortLabel: "Educ",     color: "#F97316" },
  { id: "other",     label: "Other",                      shortLabel: "Other",    color: "#9CA3AF" },
];

export const IU_SCHOOL_BY_ID = new Map(IU_SCHOOLS.map((s) => [s.id, s]));

// Lowercased + trimmed lookup so minor spelling variation in
// user-entered majors still groups them. Anything that doesn't match
// falls into "other".
export const MAJOR_TO_SCHOOL: Record<string, string> = {
  // Kelley School of Business (Indy campus)
  "business": "kelley",
  "finance": "kelley",
  "marketing": "kelley",
  "accounting": "kelley",
  "management": "kelley",
  "supply chain management": "kelley",
  "entrepreneurship": "kelley",
  "economics": "kelley",
  "business analytics": "kelley",
  // Luddy School of Informatics, Computing, and Engineering (Indy).
  // IU Indianapolis keeps its own CS / data science / cybersecurity after
  // the split; Purdue's versions live in the Purdue Indianapolis list.
  "computer science": "luddy",
  "informatics": "luddy",
  "data science": "luddy",
  "cybersecurity": "luddy",
  "media arts and science": "luddy",
  "human-computer interaction": "luddy",
  // School of Engineering & Technology (Indy-specific, distinct from
  // Luddy — Indy has both). LEGACY ONLY: these programs moved to Purdue in
  // the 2024 split, so majorsForCampus() leaves this school out of the IU
  // Indianapolis list and serves Purdue's engineering / Polytechnic majors
  // from the Purdue Indianapolis list instead.
  "mechanical engineering": "engtech",
  "mechanical engineering technology": "engtech",
  "electrical engineering": "engtech",
  "electrical engineering technology": "engtech",
  "computer engineering": "engtech",
  "biomedical engineering": "engtech",
  "construction management": "engtech",
  "motorsports engineering": "engtech",
  // Media School (Indianapolis). Unverified whether IU Indianapolis still
  // runs a Media School (plan "Not verified" list).
  "communication": "media",
  "communication studies": "media",
  "journalism": "media",
  "cinema and media": "media",
  "game design": "media",
  "sports communication": "media",
  "media": "media",
  // School of Liberal Arts (Indy — humanities + social sciences)
  "political science": "liberal",
  "history": "liberal",
  "english": "liberal",
  "sociology": "liberal",
  "philosophy": "liberal",
  "anthropology": "liberal",
  "religious studies": "liberal",
  "world languages": "liberal",
  "american sign language": "liberal",
  "international studies": "liberal",
  "american studies": "liberal",
  "africana studies": "liberal",
  // School of Science (Indy STEM). Psychology lives here at IU
  // Indianapolis (Department of Psychology, School of Science), not in
  // Liberal Arts as at most schools.
  "biology": "science",
  "chemistry": "science",
  "biochemistry": "science",
  "mathematics": "science",
  "math": "science",
  "physics": "science",
  "neuroscience": "science",
  "psychology": "science",
  "earth sciences": "science",
  "forensic and investigative sciences": "science",
  "geology": "science",
  // Herron School of Art and Design (Indy art school)
  "studio art": "herron",
  "graphic design": "herron",
  "visual communication design": "herron",
  "art history": "herron",
  "fine art": "herron",
  "ceramics": "herron",
  "printmaking": "herron",
  "sculpture": "herron",
  "photography": "herron",
  "furniture design": "herron",
  // Fairbanks School of Public Health
  "public health": "health",
  "health sciences": "health",
  "kinesiology": "health",
  "nutrition": "health",
  "exercise science": "health",
  "epidemiology": "health",
  // School of Nursing
  "nursing": "nursing",
  "rn-bsn": "nursing",
  // IU School of Medicine — undergrad-adjacent biomedical sciences
  "biomedical sciences": "med",
  "medical imaging technology": "med",
  "cytotechnology": "med",
  "radiation therapy": "med",
  // O'Neill School of Public and Environmental Affairs (Indy campus)
  "public affairs": "oneill",
  "public policy": "oneill",
  "environmental science": "oneill",
  "environmental policy": "oneill",
  "healthcare management": "oneill",
  "nonprofit management": "oneill",
  "criminal justice": "oneill",
  // School of Education
  "elementary education": "education",
  "secondary education": "education",
  "special education": "education",
  "education": "education",
};

// Lookup-only spellings: lowercased saved value → the MAJOR_TO_SCHOOL key it
// means. They are NOT picker options (IU_MAJORS_BY_SCHOOL and the campus
// lists never include them); they only keep an old saved major grouped with
// its fixed spelling. "americansign language" is the pre-fix typo that the
// old picker offered, so profiles saved from it still carry it.
const IU_LOOKUP_ALIASES = new Map<string, string>([
  ["americansign language", "american sign language"],
]);

// Own-property read, so a saved major like "constructor" can't pick up an
// Object.prototype member.
function iuSchoolIdFor(key: string): string | undefined {
  const canonical = IU_LOOKUP_ALIASES.get(key) ?? key;
  return Object.prototype.hasOwnProperty.call(MAJOR_TO_SCHOOL, canonical)
    ? MAJOR_TO_SCHOOL[canonical]
    : undefined;
}

export function schoolForMajor(majorName: string): IuSchool {
  const key = majorName.trim().toLowerCase();
  const id = iuSchoolIdFor(key) ?? "other";
  return IU_SCHOOL_BY_ID.get(id) ?? IU_SCHOOL_BY_ID.get("other")!;
}

// Title-case the lowercase keys for display in pickers. Handles the
// odd casing rules (hyphenated terms, mid-word capitals like RN-BSN).
function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w) => {
      if (w === "rn-bsn") return "RN-BSN";
      if (w === "hci") return "HCI";
      return w
        .split("-")
        .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
        .join("-");
    })
    .join(" ");
}

// Display-ready list grouped by school, for use in a <select> with
// <optgroup>s in the profile editor.
export const IU_MAJORS_BY_SCHOOL: { school: IuSchool; majors: string[] }[] =
  IU_SCHOOLS.filter((s) => s.id !== "other").map((school) => ({
    school,
    majors: Object.entries(MAJOR_TO_SCHOOL)
      .filter(([, sid]) => sid === school.id)
      .map(([major]) => titleCase(major))
      .sort((a, b) => a.localeCompare(b)),
  }));

// ── Campus-aware lists ──────────────────────────────────────────────────

/**
 * A school system. Structurally the same as `SchoolSystem` in campuses.ts
 * (plan contract C1); declared locally so this module has no dependency on
 * the campus lib.
 */
type MajorsSystem = "iu" | "purdue";

export type MajorsGroup = { school: IuSchool; majors: string[] };

/** One curated list, ready for a picker. */
export type CampusMajors = {
  /** Whose list this is, for hint copy: "IU Indianapolis" | "Purdue Indianapolis" | "IU Bloomington". */
  label: string;
  /** Options for the Department / school field, in picker order. */
  schools: string[];
  /** Every major, flat, for a datalist (sorted, except Bloomington keeps its curated order). */
  majors: string[];
  /** Majors grouped by school for <optgroup> pickers. Empty when the list has no grouping (Bloomington). */
  groups: MajorsGroup[];
};

// Campus ids from the campuses seed (plan §2.3). Only these campuses have a
// curated list; every other campus — including the shared 'fort-wayne' —
// gets free text, so this module needs no Fort Wayne id.
const INDIANAPOLIS_CAMPUS_ID = "indianapolis";
const IU_BLOOMINGTON_CAMPUS_ID = "iu-bloomington";

const OTHER_SCHOOL = IU_SCHOOL_BY_ID.get("other")!;

// Small words stay lowercase in the new lists ("Media Arts and Science").
// The legacy IU_MAJORS_BY_SCHOOL keeps its old casing so saved values still
// match it exactly.
const MINOR_WORDS = new Set(["and", "of", "in", "the", "for", "or"]);
function displayCase(s: string): string {
  return titleCase(s)
    .split(" ")
    .map((w, i) => (i > 0 && MINOR_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w))
    .join(" ");
}

function sortedUnique(list: string[]): string[] {
  return [...new Set(list)].sort((a, b) => a.localeCompare(b));
}

function buildList(label: string, groups: MajorsGroup[]): CampusMajors {
  return {
    label,
    schools: groups.map((g) => g.school.label),
    majors: sortedUnique(groups.flatMap((g) => g.majors)),
    groups,
  };
}

// IU Indianapolis today: the legacy taxonomy without Engineering & Technology.
const IU_INDIANAPOLIS_EXCLUDED = new Set(["engtech", "other"]);
const IU_INDIANAPOLIS_LIST = buildList(
  "IU Indianapolis",
  IU_SCHOOLS.filter((s) => !IU_INDIANAPOLIS_EXCLUDED.has(s.id)).map((school) => ({
    school,
    majors: sortedUnique(
      Object.entries(MAJOR_TO_SCHOOL)
        .filter(([, sid]) => sid === school.id)
        .map(([major]) => displayCase(major)),
    ),
  })),
);

const PURDUE_INDIANAPOLIS_LIST = buildList(
  "Purdue Indianapolis",
  PURDUE_INDIANAPOLIS_SCHOOLS.map((school) => ({
    school,
    majors: sortedUnique(
      Object.entries(PURDUE_INDIANAPOLIS_MAJOR_TO_SCHOOL)
        .filter(([, sid]) => sid === school.id)
        .map(([major]) => major),
    ),
  })).filter((g) => g.majors.length > 0),
);

const IU_BLOOMINGTON_LIST: CampusMajors = {
  label: "IU Bloomington",
  schools: [...BLOOMINGTON_SCHOOLS],
  majors: [...new Set(BLOOMINGTON_MAJORS)],
  groups: [],
};

// Lowercased major → school, per system, for halos. The IU lookup also
// carries IU_LOOKUP_ALIASES, resolved through the key they stand for.
const IU_INDIANAPOLIS_LOOKUP = new Map<string, IuSchool>(
  [
    ...Object.keys(MAJOR_TO_SCHOOL),
    ...IU_LOOKUP_ALIASES.keys(),
  ]
    .map((major): [string, string | undefined] => [major, iuSchoolIdFor(major)])
    .filter((entry): entry is [string, string] => entry[1] !== undefined && !IU_INDIANAPOLIS_EXCLUDED.has(entry[1]))
    .map(([major, sid]) => [major, IU_SCHOOL_BY_ID.get(sid) ?? OTHER_SCHOOL]),
);
const PURDUE_SCHOOL_BY_ID = new Map(PURDUE_INDIANAPOLIS_SCHOOLS.map((s) => [s.id, s]));
const PURDUE_INDIANAPOLIS_LOOKUP = new Map<string, IuSchool>(
  [
    ...Object.entries(PURDUE_INDIANAPOLIS_MAJOR_TO_SCHOOL),
    ...Object.entries(PURDUE_INDIANAPOLIS_LOOKUP_ALIASES),
  ].map(([major, sid]) => [
    major.trim().toLowerCase(),
    PURDUE_SCHOOL_BY_ID.get(sid) ?? OTHER_SCHOOL,
  ]),
);

function normalizeCampusId(campusId: string | null | undefined): string {
  return (campusId ?? "").trim().toLowerCase();
}

function copyList(list: CampusMajors): CampusMajors {
  return {
    label: list.label,
    schools: [...list.schools],
    majors: [...list.majors],
    groups: list.groups.map((g) => ({ school: { ...g.school }, majors: [...g.majors] })),
  };
}

/**
 * The curated majors list for a student's campus, or null when there isn't
 * one (the picker should fall back to free text).
 *
 * - indianapolis + iu     → IU Indianapolis list
 * - indianapolis + purdue → Purdue Indianapolis list
 * - iu-bloomington + iu   → IU Bloomington list
 * - anything else (other campuses, a missing system, a campus outside the
 *   system) → null
 *
 * Returns a fresh copy each call; callers may mutate it.
 */
export function majorsForCampus(
  campusId: string | null | undefined,
  system: MajorsSystem | null | undefined,
): CampusMajors | null {
  const id = normalizeCampusId(campusId);
  if (id === INDIANAPOLIS_CAMPUS_ID) {
    if (system === "iu") return copyList(IU_INDIANAPOLIS_LIST);
    if (system === "purdue") return copyList(PURDUE_INDIANAPOLIS_LIST);
    return null;
  }
  if (id === IU_BLOOMINGTON_CAMPUS_ID && system === "iu") {
    return copyList(IU_BLOOMINGTON_LIST);
  }
  return null;
}

/**
 * Map-halo school for a major, aware of campus and system — the
 * campus-aware successor to schoolForMajor().
 *
 * On the shared Indianapolis campus the student's own system's taxonomy
 * wins, then the other system's (a Purdue student who verified with
 * @iu.edu, or an old "Mechanical Engineering" saved before the split, still
 * gets a real halo). With no system, IU is tried first (every account before
 * the Purdue flip is IU). Other campuses have no school grouping → "Other".
 * Never throws; always returns a school.
 */
export function schoolForMajorIn(
  campusId: string | null | undefined,
  system: MajorsSystem | null | undefined,
  majorName: string | null | undefined,
): IuSchool {
  const key = (majorName ?? "").trim().toLowerCase();
  if (!key || normalizeCampusId(campusId) !== INDIANAPOLIS_CAMPUS_ID) return OTHER_SCHOOL;
  const order =
    system === "purdue"
      ? [PURDUE_INDIANAPOLIS_LOOKUP, IU_INDIANAPOLIS_LOOKUP]
      : [IU_INDIANAPOLIS_LOOKUP, PURDUE_INDIANAPOLIS_LOOKUP];
  for (const lookup of order) {
    const hit = lookup.get(key);
    if (hit) return hit;
  }
  return OTHER_SCHOOL;
}
