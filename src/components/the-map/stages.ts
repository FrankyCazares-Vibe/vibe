export type Stage = {
  n: number;
  star: string;
  name: string;
  /** SVG viewBox coordinates inside 0..900 x 0..500 */
  pos: { x: number; y: number };
  /** Default star radius before highlight scaling */
  baseRadius: number;
  time: string;
  goal: string;
  build: string[];
  team: string[];
  proof: string;
  kills: string;
  cost: string;
  quote: string;
};

export const stages: Stage[] = [
  {
    n: 1,
    star: "Sulafat",
    name: "build",
    pos: { x: 270, y: 510 },
    baseRadius: 5,
    time: "now → 6 weeks",
    goal: 'Ship a prototype that one real student can use end-to-end and say "this is cool."',
    build: [
      "Wire per-page persistence so every page reads from localStorage (mostly done)",
      "Lock the design system — stop re-styling components",
      "Cut anything not in v1 — Otto v1 frontend stays, Otto OAuth waits",
      "Clean up empty states and the new-user onboarding path",
      "Deploy to Vercel so it has a real URL we can share",
    ],
    team: [
      "Franky — finishing build with Claude Code, owning roadmap",
      "James — drafting the cold-pitch one-liner + 60-sec demo script",
      "Rylan — auditing IU campus channels, listing 50 testable students",
    ],
    proof:
      "One IU student opens our URL on their phone, signs up, posts a Vibe, and sends it to a friend without us asking.",
    kills:
      "Adding Otto v2 backend or DMs-with-attachments before this is done. Scope creep is the silent killer.",
    cost: "$0. Claude Max + Vercel free tier.",
    quote: "every journey starts with a first star.",
  },
  {
    n: 2,
    star: "Sheliak",
    name: "validate",
    pos: { x: 550, y: 460 },
    baseRadius: 5,
    time: "weeks 6 → 12",
    goal: "Get 5–10 real IU students using Vibe. Watch how they actually behave.",
    build: [
      "Add real auth (Supabase free tier) replacing localStorage-only flow",
      "Persist data per-user so testers keep their stuff across devices",
      "In-app feedback button → straight to our inbox",
      "First Otto v1 frontend pass: corner ring, slide-out panel, post-publish flow",
      "Per-school campus content — IU first, others get a friendly empty state",
    ],
    team: [
      "Franky — fixing what testers break, not adding features",
      "James — running 30-min interviews after each test, capturing notes verbatim",
      "Rylan — recruiting + onboarding the 10 testers (he knows the right people)",
    ],
    proof:
      "3 of 10 testers come back without being reminded. Retention beats signups.",
    kills:
      "Building features they didn't ask for. Listening to what they say instead of watching what they do.",
    cost: "~$0–25/mo. Supabase + Vercel free tiers cover this stage.",
    quote: "the second star tells you the first wasn't a fluke.",
  },
  {
    n: 3,
    star: "Delta Lyrae",
    name: "wedge",
    pos: { x: 245, y: 270 },
    baseRadius: 5,
    time: "months 3 → 5",
    goal: "Own one IU community completely. Be undeniable in that pocket.",
    build: [
      "Pick the wedge — Luddy School (CS/design) or Entrepreneurship program",
      "Build whatever that group specifically asks for",
      "Add the first real differentiator — leaning toward Vibes (60-sec video profiles)",
      ".edu verification fully real (no more mocked clicked-link)",
      "Don't broaden. Depth wins here, not breadth.",
    ],
    team: [
      "Franky — shipping fast based on real usage data, not gut",
      "James — pitching IU profs, Director of Entrepreneurship, club presidents",
      "Rylan — guerrilla campus marketing, posters, class talks, org-by-org rollout",
    ],
    proof:
      "100 verified students from the wedge. 30%+ DAU. Word-of-mouth confirmed — students inviting each other unprompted.",
    kills:
      'Going broad too early. Trying to be "IU Vibe" before being "Luddy Vibe."',
    cost: "~$50–200/mo.",
    quote: "depth, not breadth — own one star completely.",
  },
  {
    n: 4,
    star: "Zeta Lyrae",
    name: "expand",
    pos: { x: 455, y: 195 },
    baseRadius: 5,
    time: "months 5 → 9",
    goal: "Take over IU. Become the default place IU students live online.",
    build: [
      "Open Vibe to all of IU, not just the wedge",
      "Onboard student orgs as accounts (CS Club, Venture Club, design orgs)",
      "Get one IU department to officially endorse — even informally counts",
      "Otto v1 fully cross-platform — start with LinkedIn deep-link drafting",
      "First press: IU student paper, local startup blogs",
    ],
    team: [
      "Franky — start delegating UI build to Claude more, focus on direction",
      "James — partnerships with career services, entrepreneurship office, student gov",
      "Rylan — running growth as a real function, referral mechanics, launch weeks",
      "Optional: bring in one part-time technical contractor",
    ],
    proof:
      "1,000 IU students. Director of Entrepreneurship references Vibe in a meeting we're not in.",
    kills:
      "Burning out solo. Not delegating. Building Otto's full backend before IU is locked.",
    cost: "~$200–600/mo.",
    quote: "this is where momentum becomes inevitable.",
  },
  {
    n: 5,
    star: "Epsilon Lyrae",
    name: "raise",
    pos: { x: 380, y: 75 },
    baseRadius: 6,
    time: "months 9 → 14",
    goal: "Use IU traction to raise a real seed round.",
    build: [
      "Hit metrics: 2,000+ MAU at IU, 40%+ weekly retention",
      "Build the data room — usage stats, retention cohorts, NPS, growth trajectory",
      "Apply to: Y Combinator, On Deck, Z Fellows, IU's own entrepreneurship grants",
      "Pitch angels through the IU alumni network — Director of Entrepreneurship is the unlock",
      "Target raise: $250k–750k pre-seed",
    ],
    team: [
      "Franky — full-time founder/CEO. This is the moment to go all-in.",
      "James — owns business + comms. Co-founder territory if commitment holds.",
      "Rylan — co-founder or first hire as Head of Growth.",
      "First real hire post-funding: a senior engineer.",
    ],
    proof: "Term sheet signed. Money in the bank. Real runway.",
    kills: "Raising before the metrics are there. Diluting too early.",
    cost: "Funded by the raise.",
    quote: "the brightest stars get noticed. ours just got noticed.",
  },
  {
    n: 6,
    star: "VEGA",
    name: "scale",
    pos: { x: 560, y: 95 },
    baseRadius: 11,
    time: "year 2+",
    goal: "Multi-campus rollout. Otto v2 full agent. The next big thing.",
    build: [
      "Roll out campus by campus — use campus resources and intros to land Purdue and other Big Ten schools, then nationwide",
      "Otto v2 — full agent with real OAuth + cross-posting, voice training, recruiter intel",
      "B2B side — recruiter accounts, paid tier for hiring managers and career services",
      "Mobile app — React Native or native, after web is locked",
      "Series A in back half of year 2 if metrics support it",
    ],
    team: [
      "Franky — CEO, fundraising and vision",
      "James — depending on equity discussion, COO or BD lead",
      "Rylan — VP Growth or CMO",
      "Hires: 2–3 engineers, head of design, head of campus partnerships",
    ],
    proof:
      "10+ universities live. $1M+ ARR or active path to it. Recruiters paying. The story writes itself.",
    kills:
      "Premature scaling. Hiring before we need to. Losing the wedge identity.",
    cost: "Series A territory — $2M–10M raised.",
    quote: "vega — the ascending north star. where vibe is going.",
  },
];

/** Connection lines that form Lyra as a harp: parallelogram body
 *  (1-2-4-3) + two strings climbing to the top stars (3→5, 4→6)
 *  + the crown across the top (5-6). */
export const edges: [number, number][] = [
  [1, 2], // bottom of parallelogram (Sulafat → Sheliak)
  [1, 3], // left side of parallelogram (Sulafat → Delta)
  [2, 4], // right side of parallelogram (Sheliak → Zeta)
  [3, 4], // top of parallelogram (Delta → Zeta)
  [3, 5], // left string (Delta → Epsilon)
  [4, 6], // right string (Zeta → Vega)
  [5, 6], // crown of the harp (Epsilon → Vega)
];

/** Determines whether a line is "behind" the traveler (visited path). */
export function isEdgeVisited(
  edge: [number, number],
  currentStage: number
): boolean {
  return edge[0] <= currentStage && edge[1] <= currentStage;
}
