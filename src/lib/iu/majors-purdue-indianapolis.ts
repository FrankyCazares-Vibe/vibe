// Purdue University in Indianapolis — undergraduate schools + majors.
// Data only; routing lives in majors.ts (majorsForCampus / schoolForMajorIn).
//
// SOURCE: https://www.purdue.edu/indianapolis/undergraduate-majors/
// (fetched 2026-09-15; 21 majors, names copied as the page spells them).
//
// UNCERTAINTY — the majors page does NOT say which college owns each major.
// The grouping below is the best reading of Purdue's other pages:
//   - College of Engineering: the page advertises "direct admission to
//     engineering"; the six *Engineering majors are filed here (assumed).
//   - Purdue Polytechnic: polytechnic.purdue.edu/purdue-in-indianapolis lists
//     Computer (and) Information Technology, Construction Management
//     Technology, Cybersecurity, Interior Architecture and Themed
//     Entertainment Design (confirmed). Multidisciplinary Technology is
//     assumed Polytechnic.
//   - College of Science: purdue.edu/science/purdue-indianapolis covers
//     Computer Science, Artificial Intelligence, Actuarial Science and Data
//     Science (confirmed). Integrated Science and Business — Applied
//     Statistics is assumed Science.
//   - Daniels School of Business: Business Analytics and Information
//     Management (assumed). Integrated Business and Engineering is run jointly
//     by Daniels and Engineering; filed under Daniels.
//   - Health and Human Sciences: Hospitality and Tourism Management (HHS's
//     White Lodging school; the Indianapolis major starts Fall 2026).
//   - Exploratory Pre-medicine and Health belongs to Purdue's Exploratory
//     Studies program, not a college.
// Re-check against the page before the Purdue flip.
//
// Ids are prefixed "purdue-" so they never collide with IU school ids on
// the shared Indianapolis map, where both taxonomies draw halos together.
// Colors are picked to stay distinct from IU's halos; adjust freely.

import type { IuSchool } from "./majors";

export const PURDUE_INDIANAPOLIS_SCHOOLS: IuSchool[] = [
  { id: "purdue-engineering",  label: "College of Engineering",               shortLabel: "Engineering", color: "#B8860B" },
  { id: "purdue-polytechnic",  label: "Purdue Polytechnic Institute",         shortLabel: "Polytechnic", color: "#EAB308" },
  { id: "purdue-science",      label: "College of Science",                   shortLabel: "Science",     color: "#65A30D" },
  { id: "purdue-business",     label: "Daniels School of Business",           shortLabel: "Daniels",     color: "#D946EF" },
  { id: "purdue-hhs",          label: "College of Health and Human Sciences", shortLabel: "HHS",         color: "#9A3412" },
  { id: "purdue-exploratory",  label: "Exploratory Studies",                  shortLabel: "Exploratory", color: "#64748B" },
];

// Display name (as shown in pickers and stored on the profile) → school id.
// Lookups lowercase + trim, so casing of a saved major doesn't matter.
export const PURDUE_INDIANAPOLIS_MAJOR_TO_SCHOOL: Record<string, string> = {
  // College of Engineering
  "Biomedical Engineering": "purdue-engineering",
  "Computer Engineering": "purdue-engineering",
  "Electrical Engineering": "purdue-engineering",
  "Industrial Engineering": "purdue-engineering",
  "Mechanical Engineering": "purdue-engineering",
  "Motorsports Engineering": "purdue-engineering",
  // Purdue Polytechnic Institute
  "Computer and Information Technology": "purdue-polytechnic",
  "Construction Management": "purdue-polytechnic",
  "Cybersecurity": "purdue-polytechnic",
  "Interior Architecture": "purdue-polytechnic",
  "Multidisciplinary Technology": "purdue-polytechnic",
  "Themed Entertainment Design": "purdue-polytechnic",
  // College of Science
  "Actuarial Science": "purdue-science",
  "Artificial Intelligence": "purdue-science",
  "Computer Science": "purdue-science",
  "Data Science": "purdue-science",
  "Integrated Science and Business: Applied Statistics": "purdue-science",
  // Daniels School of Business
  "Business Analytics and Information Management": "purdue-business",
  "Integrated Business and Engineering": "purdue-business",
  // College of Health and Human Sciences
  "Hospitality and Tourism Management": "purdue-hhs",
  // Exploratory Studies
  "Exploratory Pre-medicine and Health": "purdue-exploratory",
};

// Lookup-only aliases (never shown in a picker): legacy IU Indianapolis
// Engineering & Technology spellings that students saved before the 2024
// split moved those programs to Purdue, so their map halo still lands on the
// nearest Purdue school. Lowercase keys.
export const PURDUE_INDIANAPOLIS_LOOKUP_ALIASES: Record<string, string> = {
  "mechanical engineering technology": "purdue-polytechnic",
  "electrical engineering technology": "purdue-polytechnic",
  "construction management technology": "purdue-polytechnic",
  "computer information technology": "purdue-polytechnic",
  "artificial intelligence (science)": "purdue-science",
};
