/**
 * Every word the phone onboarding says (wave plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §8 B12S item 1,
 * with critic `wave-plan-sections/critic-W3.md` M7).
 *
 * ONE TABLE, THREE READERS. The phone steps (`OnboardingMobile.tsx` and the
 * `Step*.tsx` files next to this one) render these strings, and the static
 * desktop page (`public/html/onboarding.html`, B13) carries a character-for-
 * character copy whose `JSON.stringify` a parity script compares with this
 * one. So a string changes HERE first, and the curly quotes, dashes, ellipses,
 * arrows, ✓ and ✗ are part of the strings, not decoration.
 *
 * Club button, chip, meta and disclosure words are NOT here: they come from
 * `ORG_COPY` in `src/lib/orgs/join-copy.ts`, the one table every club surface
 * shares. Photo upload errors come from `PHOTO_ERROR_COPY` in
 * `src/lib/profile/avatar-upload.ts`.
 *
 * `people.group*` labels are duplicated in `src/lib/onboarding/social-steps.ts`
 * (a lib must not import a component folder); `social-steps.test.ts` asserts
 * the two stay equal.
 *
 * No imports, so node tests load it under plain type stripping.
 */

/** `Object.freeze`, all the way down, so no importer can edit the shared table. */
function freezeDeep<T extends object>(value: T): T {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object") freezeDeep(child as object);
  }
  return Object.freeze(value);
}

export const ONB_COPY = freezeDeep({
  header: {
    back: "Back",
    progress: "{n} of 6",
    skip: "Skip",
    replay: "REPLAY MODE",
  },
  hello: {
    intro:
      "“think of me as your campus compass. i'll point you to what's loud, what's tonight, and who's on your wavelength — your guide while you build out your home on vibe.”",
    note: "about two minutes: your campus, your profile, a photo, then your people",
    cta: "Let's go →",
  },
  campus: {
    title: "which campus is yours?",
    ottoIu:
      "“your school email says IU. pick your campus. Indianapolis is shared with Purdue students.”",
    ottoPurdue:
      "“your school email says Purdue. pick your campus. Indianapolis is shared with IU students.”",
    note: "Your school email shows you're at {system}. You can move to another {system} campus later in Settings.",
    fromEmailTag: "from your school email",
    notOpen: "not open yet",
    required: "Pick your campus to continue.",
    invalid: "Pick one of your university's campuses.",
    purdueLink: "Purdue student with an IU email? Verify your @purdue.edu instead",
    switchLabel: "Your @purdue.edu email",
    switchPlaceholder: "you@purdue.edu",
    switchSend: "Send code",
    switchSending: "Sending…",
    switchWrongDomain: "Use your @purdue.edu address.",
    switchSent: "Check your school inbox.",
    switchCodeLabel: "8-digit code",
    switchVerify: "Verify",
    switchVerifying: "Verifying…",
    switchDone: "You're verified as a Purdue student.",
    switchCancel: "Never mind",
    continue: "Continue →",
    saving: "Saving…",
  },
  profile: {
    title: "let's pin down your profile",
    sub: "“same fields as your Vibe profile. name and handle are the must-haves. a photo is next.”",
    labels: {
      name: "Name (required)",
      handle: "Handle (required)",
      bio: "Bio (optional)",
      major: "Major (optional)",
      department: "Department / school (optional)",
      year: "Year (optional)",
      interests: "Interests & projects (optional)",
      skills: "Skills (optional)",
      lookingFor: "What are you here for? (optional)",
    },
    majorHintList: "From the {label} list, or type your own",
    majorHintFree: "Type your major",
    handleChecking: "checking…",
    handleAvailable: "✓ available",
    handleTaken: "✗ taken",
    handleReason: "✗ {reason}",
    handleFormat: "✗ 3–20 letters, numbers or _",
    handleUnchecked: "couldn't check. we'll check when you continue",
    errors: {
      nameRequired: "Add your name. It's how people recognize you.",
      handleRequired: "Pick a handle so friends can find you.",
      handleInvalid: "3–20 letters, numbers or _.",
      handleTaken: "That handle is taken. Try another.",
      handleReserved: "That handle is reserved.",
    },
    changeLater: "you can change anything later",
    continue: "Continue →",
    saving: "Saving…",
  },
  photo: {
    title: "put a face to the name",
    otto: "“people follow faces. add a photo so classmates know it's you. swap it any time.”",
    choose: "Choose a photo",
    skip: "Skip for now",
    uploading: "Uploading…",
    change: "Change photo",
    continue: "Continue →",
  },
  clubs: {
    title: "Follow clubs",
    sub: "Their posts show up in your feed. You can join the ones that let you.",
    search: "Search clubs by name",
    sparse:
      "Clubs are just getting started at {campus}. Follow the ones you like — posts land in your feed.",
    sparseNoCampus:
      "Clubs are just getting started here. Follow the ones you like — posts land in your feed.",
    emptyTitle: "no clubs here yet",
    emptyBody:
      "“you could be the first. clubs can be started from vibe on a computer, and they'll show up for everyone at {campus}.”",
    // Critic M7: the no-campus fallback, so nobody invents a literal later.
    emptyBodyNoCampus:
      "“you could be the first. clubs can be started from vibe on a computer, and they'll show up for everyone here.”",
    loadFailed: "Couldn't load clubs.",
    continue: "Continue →",
    skipForNow: "Skip for now",
  },
  people: {
    title: "follow a few people",
    ottoShared:
      "“students at {campus}, IU and Purdue both. follow a few and their posts rise to the top of your feed.”",
    ottoSingle: "“students at {campus}. follow a few and their posts rise to the top of your feed.”",
    ottoNoCampus: "“students on vibe. follow a few and their posts rise to the top of your feed.”",
    groupClubs: "From your clubs",
    groupCampus: "At {campus}",
    groupCampusFallback: "On your campus",
    groupMajor: "Same major",
    groupSystem: "Elsewhere at {system}",
    groupMore: "More people on Vibe",
    follow: "Follow",
    following: "Following ✓",
    sparse:
      "“it's early here. only a few people have joined so far. bring a friend and you'll have someone to follow.”",
    emptyTitle: "no one to follow yet",
    emptyBody: "“you're one of the first at {campus}. share vibe with a friend and they'll show up here.”",
    emptyBodyNoCampus: "“you're one of the first here. share vibe with a friend and they'll show up here.”",
    share: "Share Vibe",
    copied: "Link copied.",
    loadFailed: "Couldn't load people.",
    followFailed: "Couldn't follow this person.",
    unfollowFailed: "Couldn't unfollow this person.",
    finish: "Finish →",
    finishing: "Saving…",
    finishFailed: "Couldn't finish setting up.",
  },
  skip: {
    title: "Skip the rest?",
    bodySaved:
      "Everything you've added so far is saved. You can finish your profile any time from your profile page.",
    bodyIdentity: "Add a name and handle first. It's how people find you.",
    keepGoing: "Keep going",
    skipAnyway: "Skip anyway",
    skipping: "Skipping…",
    saveAndSkip: "Save & skip",
    saving: "Saving…",
    failed: "Couldn't skip onboarding.",
  },
} as const);

/**
 * Fills every `{campus}` in `t` with `campus`, in one pass (a campus name is
 * never re-scanned, and a `$` in it is literal). A null or blank campus
 * returns `fallback` untouched: callers pass the matching `…NoCampus` string,
 * so a student with no campus never reads "at ." or "at {campus}".
 */
export function fillCampus(t: string, campus: string | null, fallback: string): string {
  const name = typeof campus === "string" ? campus.trim() : "";
  if (!name) return fallback;
  return t.replace(/\{campus\}/g, () => name);
}
