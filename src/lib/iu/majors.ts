// IU Indianapolis (the renamed IUPUI) school + major taxonomy.
// Single source of truth — imported by the campus map AND the profile
// editor so a typed-in major always groups into the same school halo.
//
// NOT Bloomington: Herron (art) not Eskenazi, IU School of Medicine is
// prominent, School of Science + School of Liberal Arts are split
// (Bloomington has one A&S college), Engineering & Technology is its
// own school separate from Luddy. No Jacobs — Bloomington only.

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
  // Luddy School of Informatics, Computing, and Engineering (Indy)
  "computer science": "luddy",
  "informatics": "luddy",
  "data science": "luddy",
  "cybersecurity": "luddy",
  "media arts and science": "luddy",
  "human-computer interaction": "luddy",
  // School of Engineering & Technology (Indy-specific, distinct from
  // Luddy — Indy has both)
  "mechanical engineering": "engtech",
  "mechanical engineering technology": "engtech",
  "electrical engineering": "engtech",
  "electrical engineering technology": "engtech",
  "computer engineering": "engtech",
  "biomedical engineering": "engtech",
  "construction management": "engtech",
  "motorsports engineering": "engtech",
  // Media School (Indianapolis)
  "communication": "media",
  "communication studies": "media",
  "journalism": "media",
  "cinema and media": "media",
  "game design": "media",
  "sports communication": "media",
  "media": "media",
  // School of Liberal Arts (Indy — humanities + social sciences)
  "psychology": "liberal",
  "political science": "liberal",
  "history": "liberal",
  "english": "liberal",
  "sociology": "liberal",
  "philosophy": "liberal",
  "anthropology": "liberal",
  "religious studies": "liberal",
  "world languages": "liberal",
  "americansign language": "liberal",
  "international studies": "liberal",
  "american studies": "liberal",
  "africana studies": "liberal",
  // School of Science (Indy STEM)
  "biology": "science",
  "chemistry": "science",
  "biochemistry": "science",
  "mathematics": "science",
  "math": "science",
  "physics": "science",
  "neuroscience": "science",
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

export function schoolForMajor(majorName: string): IuSchool {
  const key = majorName.trim().toLowerCase();
  const id = MAJOR_TO_SCHOOL[key] ?? "other";
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
