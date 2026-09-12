import Link from "next/link";
import type { ReactNode } from "react";

import { isSafeRelativePath } from "@/lib/auth/login-next";
import { getEntitlement } from "@/lib/premium/require-plus";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * /plus — what Vibe+ is, what it costs, and the fact that you cannot buy it
 * yet.
 *
 * Design: handoffs/2026-09-12-design-paywall-monetization.md §7 Phase 0.5.
 * Decisions: handoffs/2026-09-12-decisions.md §2 and §4.
 *
 * No payment code exists in this wave, so this page COLLECTS NOTHING and
 * PROMISES NOTHING IT CANNOT DO. There is no Subscribe button, no email
 * capture, no card field, no "notify me" that writes to a table nobody
 * reads. A button that does nothing is the same lie as a paywall over free
 * data — it just fails a step later. When checkout exists, it lands here.
 *
 * Server component on purpose: the only dynamic thing is the reader's own
 * entitlement, read server-side, so there is nothing to fetch from the
 * client and no locked state that could flash unlocked first.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vibe+ · Vibe",
  description: "What Vibe+ will include, what it costs, and when you can buy it.",
};

const PRICE_MONTHLY = "$3.99";
const PRICE_YEARLY = "$24.99";

const PAGE_BG =
  "radial-gradient(120% 80% at 0% 0%, rgba(255,222,180,0.45) 0%, rgba(255,222,180,0) 60%), " +
  "radial-gradient(110% 80% at 100% 100%, rgba(255,200,170,0.35) 0%, rgba(255,200,170,0) 60%), " +
  "linear-gradient(180deg, #FAF7F2 0%, #F4EDE2 100%)";

const SANS = "DM Sans, sans-serif";
const SERIF = "Fraunces, serif";
const CORAL = "#FF5C35";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 34 }}>
      <h2
        style={{
          fontFamily: SERIF,
          fontSize: 21,
          fontWeight: 800,
          color: "#1C1C1E",
          letterSpacing: "-0.01em",
          margin: "0 0 10px",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 7 }}>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default async function PlusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // `?next=` comes from the failure-copy action ("See Vibe+"), so it is
  // attacker-influenced, and it becomes the "← Back" href below. Use the one
  // open-redirect gate the app already shares with every other `next`-style
  // param (login, auth callback, terms, onboarding) rather than a second,
  // weaker copy: a hand-rolled `startsWith("/") && !startsWith("//")` still
  // admits `/\evil.com`, which browsers resolve to https://evil.com/ because
  // a backslash is a slash in a special scheme. isSafeRelativePath rejects
  // that, plus whitespace and control characters, and re-checks with the URL
  // parser that the path really stays on this origin.
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const back = isSafeRelativePath(rawNext) ? rawNext : null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed-out readers get the same page minus the plan line — this is a
  // public explanation of a price, not a gated surface.
  const entitlement = user ? await getEntitlement(user.id) : null;

  let planLine: string;
  if (!entitlement) {
    planLine = "Sign in to see which plan you're on.";
  } else if (entitlement.plus) {
    planLine =
      entitlement.source === "comp"
        ? "You have Vibe+ on a complimentary account."
        : "You have Vibe+.";
  } else if (!entitlement.checked) {
    // The read failed. Saying "you're on the free plan" would be asserting
    // something we did not manage to look up.
    planLine = "Couldn't check your Vibe+ status just now.";
  } else {
    planLine = "You're on the free plan — which is every account, today.";
  }

  return (
    <main style={{ minHeight: "100vh", background: PAGE_BG, padding: "48px 24px 80px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p style={{ marginBottom: 24 }}>
          <Link
            href={back ?? "/campus"}
            style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: "#5C5853", textDecoration: "none" }}
          >
            ← Back
          </Link>
        </p>

        <header style={{ marginBottom: 22 }}>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#C84A20",
              marginBottom: 6,
            }}
          >
            Vibe+
          </div>
          <h1
            style={{
              fontFamily: SERIF,
              fontSize: "clamp(30px, 4vw, 42px)",
              fontWeight: 900,
              color: "#1C1C1E",
              letterSpacing: "-0.02em",
              margin: "0 0 8px",
              lineHeight: 1.1,
            }}
          >
            See who&apos;s looking.
          </h1>
          <p style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.6, color: "#5C5853", margin: 0 }}>
            Vibe shows everyone how many people viewed their profile and their
            posts. Vibe+ is how you find out <em>who</em>.
          </p>
        </header>

        {/* The honest headline. Nothing on this page can take money, and the
            reader learns that before they read the price, not after. */}
        <div
          style={{
            border: `1px solid ${CORAL}`,
            background: "rgba(255,92,53,0.07)",
            borderRadius: 16,
            padding: "16px 18px",
            fontFamily: SANS,
            fontSize: 14.5,
            lineHeight: 1.6,
            color: "#2A2620",
          }}
        >
          <strong style={{ fontWeight: 700 }}>You can&apos;t buy this yet.</strong>{" "}
          Payments aren&apos;t built. There is no checkout on this page and
          nowhere to enter a card — this is the price and the feature list,
          published early so the free tier can stop pretending. When Vibe+ goes
          on sale, it goes on sale here.
        </div>

        <p
          style={{
            fontFamily: SANS,
            fontSize: 13.5,
            color: "#5C5853",
            margin: "12px 2px 0",
          }}
        >
          {planLine}
        </p>

        <article style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.7, color: "#2A2620" }}>
          <Section title="The price">
            <p style={{ margin: "0 0 8px" }}>
              <strong style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 900, color: "#1C1C1E" }}>
                {PRICE_MONTHLY}
              </strong>{" "}
              a month, or{" "}
              <strong style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 900, color: "#1C1C1E" }}>
                {PRICE_YEARLY}
              </strong>{" "}
              a year.
            </p>
            <p style={{ margin: 0, color: "#5C5853", fontSize: 14 }}>
              One subscription, one tier. No add-ons to buy separately, and no
              trial — the free tier is the trial, and the counts on it are free
              for good.
            </p>
          </Section>

          <Section title="What Vibe+ will unlock">
            <p style={{ margin: "0 0 10px", color: "#5C5853", fontSize: 14 }}>
              Three things the database already keeps private from everyone,
              including from us on the free tier:
            </p>
            <List
              items={[
                <>
                  <strong>Who viewed your profile.</strong> You already see how
                  many. Vibe+ puts names to the number.
                </>,
                <>
                  <strong>Who viewed each of your posts.</strong> Most networks
                  throw this away. Vibe keeps it, and nobody can read it today.
                </>,
                <>
                  <strong>Who saved your posts.</strong> The quietest signal
                  there is, and usually the most useful one.
                </>,
                <>
                  <strong>More ways to make your profile yours</strong> — more
                  covers, an accent colour, and a mark next to your handle.
                  Still being built; nothing here is charged for until it
                  exists.
                </>,
              ]}
            />
          </Section>

          <Section title="What stays free, always">
            <List
              items={[
                <>
                  <strong>Every count.</strong> Profile views, post views,
                  likes, comments, followers. Counts are public on Vibe; we are
                  not going to sell you your own follower number.
                </>,
                <>
                  <strong>Likes, comments and who follows whom.</strong> Any
                  signed-in student can already read those, so charging for
                  them would be a paywall over an open door.
                </>,
                <>Messages, posting, events, orgs and the campus map.</>,
                <>
                  <strong>Blocking, muting and reporting.</strong> Safety is
                  never a paid feature.
                </>,
                <>School verification, and deleting your account.</>,
              ]}
            />
          </Section>

          <Section title="What Vibe+ will never include">
            <p style={{ margin: "0 0 10px", color: "#5C5853", fontSize: 14 }}>
              This is where paid tiers on other apps go wrong, so it is written
              down before there is money on the table:
            </p>
            <List
              items={[
                <>
                  <strong>No hiding that you viewed someone.</strong> Paying
                  does not make you invisible to the exact feature you are
                  paying to use.
                </>,
                <>No anonymous posting, and no seeing who blocked you.</>,
                <>
                  Nothing that makes a paying student harder to hold accountable
                  to everyone else.
                </>,
              ]}
            />
          </Section>

          <Section title="Why the names disappeared">
            <p style={{ margin: 0 }}>
              Until today, Vibe showed every account the names of the people who
              viewed their profile, with a caption saying that would become a
              paid feature soon. That was the least honest arrangement
              available: the paid feature, given away, labelled as not-yet-paid.
              So the names are behind the lock now, before there is anything to
              buy, and the counts — which were always the free part — are
              untouched and exact.
            </p>
          </Section>
        </article>

        <p style={{ marginTop: 40, fontFamily: SANS, fontSize: 13, color: "#8A8580" }}>
          <Link href="/legal/terms" style={{ color: "#5C5853", fontWeight: 700, textDecoration: "none" }}>
            Terms of Service
          </Link>
          <span style={{ margin: "0 8px" }}>·</span>
          <Link href="/legal/privacy" style={{ color: "#5C5853", fontWeight: 700, textDecoration: "none" }}>
            Privacy Policy
          </Link>
          <span style={{ margin: "0 8px" }}>·</span>
          <a
            href="mailto:hello@connectvibe.app"
            style={{ color: "#5C5853", fontWeight: 700, textDecoration: "none" }}
          >
            Questions
          </a>
        </p>
      </div>
    </main>
  );
}
