const SNAPSHOT_KEYS = [
  "role",
  "seniority",
  "locationSnap",
  "availability",
  "preferred",
  "topSkills",
] as const;

/** Sanitize recruiter card fields from profile.html `user.snapshot`. */
export function sanitizeRecruiterSnapshot(
  input: unknown,
): Record<string, string> | undefined {
  if (input === undefined) return undefined;
  if (input === null) return {};
  if (typeof input !== "object" || Array.isArray(input)) return undefined;
  const o = input as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of SNAPSHOT_KEYS) {
    if (!(k in o)) continue;
    const v = o[k];
    if (v === null || v === undefined) {
      out[k] = "";
      continue;
    }
    if (typeof v !== "string") return undefined;
    out[k] = v.trim().slice(0, 4000);
  }
  return out;
}
