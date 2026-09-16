/**
 * Onboarding boot payload (plan 2026-09-15 §3.3 / §3.4, wave 2 B7).
 *
 * Both onboarding clients start from the same server-rendered facts, so the
 * campus screen can paint before any fetch and the profile screen can blank
 * the `handle_new_user` trigger defaults:
 *
 *   - `/onboarding` (React)  → `<OnboardingSwitch boot={…}>` → the phone tree
 *   - `/onboarding/classic`  → `<script id="onbBoot" type="application/json">`
 *
 * Pure and server-safe: no DB, no `process.env` reads of its own. The page and
 * the classic route do the service-role read and hand the row in.
 *
 * NEVER PUT THE SCHOOL EMAIL IN HERE. `users.school_email` is a private column
 * (service-role only), and the boot payload is public to anything that can read
 * the page. {@link preselectCampusId} takes the address and returns only the
 * campus id it points at, which is what the screen actually needs.
 */

import {
  campusesForSystem,
  isCampusAllowed,
  isSchoolSystem,
  isSharedCampus,
  sharedWithCopy,
  type SchoolSystem,
} from "@/lib/iu/campuses";
import { singleCampusForEmail } from "@/lib/auth/school-email-domains";
import type { OnboardingPrefill } from "@/lib/profile/onboarding-prefill";

/**
 * One radio card on the campus screen (plan §3.4 step 2). The card title is
 * `shortName`; its sub-line is `sharedWith` when the community is shared,
 * otherwise `name` (that is exactly `campusPickerSub`).
 */
export type CampusOption = {
  id: string;
  /** Full name — the sub-line for a single-system campus ("IU Bloomington"). */
  name: string;
  /** Card title ("Indianapolis", "Bloomington"). */
  shortName: string;
  city: string;
  /** Both universities call this community home. */
  shared: boolean;
  /**
   * The shared-community sub-line seen from the viewer's system ("IU
   * Indianapolis · one community with Purdue Indianapolis (formerly IUPUI)"),
   * or null for a single-system campus.
   */
  sharedWith: string | null;
  /** The admin "open" switch. Closed campuses stay selectable (plan §2.3). */
  isOpen: boolean;
};

/**
 * The allowed set for a system as picker cards, shared communities first
 * (Indianapolis, then Fort Wayne), then by sort and name — the order
 * `campusesForSystem` already guarantees. An unknown/null system (an
 * unverified student) allows nothing, so the list is empty.
 */
export function campusOptionsForSystem(
  system: SchoolSystem | null | undefined,
): CampusOption[] {
  if (!isSchoolSystem(system)) return [];
  return campusesForSystem(system).map((c) => ({
    id: c.id,
    name: c.name,
    shortName: c.shortName,
    city: c.city,
    shared: isSharedCampus(c),
    sharedWith: sharedWithCopy(c, system),
    isOpen: c.isOpen,
  }));
}

/**
 * The campus a verified school email points at on its own (@pfw.edu →
 * "fort-wayne", @pnw.edu → "purdue-northwest"), for the VISIBLE preselect the
 * student confirms with one tap (plan §2.2, §3.4 step 2). Never a silent write.
 *
 * Returns null unless the campus is also in the student's own system's allowed
 * set, so a mismatch between the address and the stamped `school_system`
 * (a re-verify mid-flight, a hand-edited row) preselects nothing instead of
 * offering a campus the DB trigger would reject.
 */
export function preselectCampusId(
  schoolEmail: unknown,
  system: SchoolSystem | null | undefined,
): string | null {
  if (typeof schoolEmail !== "string" || !schoolEmail.trim()) return null;
  if (!isSchoolSystem(system)) return null;
  const campusId = singleCampusForEmail(schoolEmail);
  return campusId && isCampusAllowed(campusId, system) ? campusId : null;
}

/**
 * What both onboarding clients boot from. Additive by design: wave-3 clients
 * read `system` / `prefill` / `singleCampusId`, and the bundles deployed today
 * ignore every field but `replay`.
 */
export type OnboardingBoot = {
  /** `?replay=1`: the flow is re-viewed, and nothing is saved (plan §3.1). */
  replay: boolean;
  /** The signed-in user's id — the localStorage draft key is scoped to it (§3.3). */
  userId: string;
  /** The verified system, or null when nothing is stamped yet. */
  system: SchoolSystem | null;
  /** Server prefill: the base layer of the restore order (§3.3). */
  prefill: OnboardingPrefill;
  /** Visible campus preselect from the email domain, else null (§3.4). */
  singleCampusId: string | null;
};

/**
 * JSON safe to drop inside `<script type="application/json">`.
 *
 * The HTML parser ends that element at the first `</script`, so a `<` inside
 * any string is escaped to `<` (a valid JSON escape, so `JSON.parse`
 * still returns the original text). `>` and `&` go too, which keeps the text
 * inert if the tag is ever read as HTML, and U+2028 / U+2029 are escaped
 * because older parsers treat them as line terminators.
 */
export function jsonForScriptTag(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** The `<script id="onbBoot">` tag the classic page reads its boot data from. */
export function onbBootScriptTag(boot: OnboardingBoot): string {
  return `<script id="onbBoot" type="application/json">${jsonForScriptTag(boot)}</script>`;
}

/**
 * Inject the boot tag into the static onboarding page, just before `</head>`
 * so it is parsed before any inline script runs. A page without a `</head>`
 * (a truncated or rewritten file) gets the tag prepended rather than silently
 * losing it — the client reads the tag defensively either way.
 */
export function injectOnbBoot(html: string, boot: OnboardingBoot): string {
  const tag = onbBootScriptTag(boot);
  const at = html.indexOf("</head>");
  if (at === -1) return `${tag}\n${html}`;
  return `${html.slice(0, at)}${tag}\n${html.slice(at)}`;
}
