import { Badge } from "@/components/ui/badge";
import { OttoOrb } from "@/components/the-map/OttoOrb";
import LyraConstellation from "@/components/the-map/LyraConstellation";

export const metadata = {
  title: "The Map · Vibe",
  description:
    "Where we are, what's built, what's next. For Franky, James, & Rylan.",
};

export default function TheMap() {
  return (
    <main style={{ background: "#FAF7F2", color: "#1C1C1E", minHeight: "100vh" }}>
      <Hero />
      <Thesis />
      <PullQuote />
      <Built />
      <OttoHighlight />
      <Team />
      <Work />
      <Research />
      <LyraConstellation />
      <Closing />
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Shared primitives                             */
/* -------------------------------------------------------------------------- */

const SECTION_PAD = "96px 24px";
const MAX_W = 1080;

const fontDisplay = "Fraunces, serif";
const fontBody = "DM Sans, sans-serif";

function Eyebrow({
  children,
  color = "#8A8580",
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <div
      style={{
        fontFamily: fontBody,
        fontSize: 12,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  italic,
  body,
  align = "center",
}: {
  eyebrow: string;
  title: React.ReactNode;
  italic?: string;
  body?: string;
  align?: "center" | "left";
}) {
  return (
    <div style={{ textAlign: align, marginBottom: 56 }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        style={{
          fontFamily: fontDisplay,
          fontWeight: 700,
          fontSize: "clamp(32px, 5vw, 56px)",
          lineHeight: 1.1,
          letterSpacing: "-0.025em",
          margin: 0,
          maxWidth: align === "center" ? 760 : undefined,
          marginInline: align === "center" ? "auto" : undefined,
        }}
      >
        {title}{" "}
        {italic ? (
          <span style={{ fontStyle: "italic", color: "#FF5C35" }}>
            {italic}
          </span>
        ) : null}
      </h2>
      {body ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 17,
            lineHeight: 1.55,
            color: "#8A8580",
            margin: "20px auto 0",
            maxWidth: align === "center" ? 620 : 720,
          }}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}

function VibeCard({
  children,
  style,
  dark = false,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  dark?: boolean;
}) {
  return (
    <div
      style={{
        background: dark ? "#131830" : "#fff",
        border: dark
          ? "1px solid rgba(255,229,219,0.08)"
          : "1px solid rgba(28,28,30,0.08)",
        borderRadius: 16,
        padding: 28,
        boxShadow: dark ? "none" : "0 4px 24px rgba(0,0,0,0.04)",
        color: dark ? "#FAF7F2" : "#1C1C1E",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Hero                                    */
/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section
      style={{
        background:
          "radial-gradient(ellipse at 50% 20%, #131830 0%, #0A0E1F 60%, #0A0E1F 100%)",
        color: "#FAF7F2",
        padding: "128px 24px 104px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        <Eyebrow color="rgba(255,229,219,0.55)">
          For Franky, James, &amp; Rylan · April 2026
        </Eyebrow>
        <h1
          style={{
            fontFamily: fontDisplay,
            fontWeight: 900,
            fontSize: "clamp(56px, 9vw, 120px)",
            lineHeight: 1.02,
            letterSpacing: "-0.04em",
            margin: 0,
          }}
        >
          This is the
          <br />
          map of{" "}
          <span style={{ fontStyle: "italic", color: "#FF5C35" }}>vibe.</span>
        </h1>
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 19,
            lineHeight: 1.5,
            color: "rgba(255,229,219,0.78)",
            maxWidth: 640,
            margin: "32px auto 0",
          }}
        >
          Where we are. What&apos;s built. What&apos;s next. And exactly what we
          each need to do to make this real.
        </p>
        <div
          style={{
            marginTop: 56,
            display: "flex",
            flexWrap: "wrap",
            gap: "12px 32px",
            justifyContent: "center",
            fontFamily: fontBody,
            fontSize: 14,
            color: "rgba(255,229,219,0.55)",
          }}
        >
          <span>9 pages built</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>26 sessions</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>17,000+ lines</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>$0 cost so far</span>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Thesis                                   */
/* -------------------------------------------------------------------------- */

const THESIS_CARDS = [
  {
    label: "the thesis",
    italic: "Show how you think and work, not how your résumé reads.",
    body: "LinkedIn won the professional network because nothing else exists. It hasn't won because it's good. It was built for 40-year-olds with 20 years of experience.",
  },
  {
    label: "the gap",
    italic: "Students juggle five tools. None of them connect.",
    body: "Canvas, Handshake, GroupMe, Discord, LinkedIn — nothing knows your campus, nothing shows your personality.",
  },
  {
    label: "the wedge",
    italic: "Start at one university. Be undeniable there. Then expand.",
    body: "Indiana University. The Director of Entrepreneurship is in our corner. .edu verified sign-up unlocks Campus.",
  },
  {
    label: "the defensibility",
    italic: "Otto. Your AI agent that lives on your network.",
    body: "You write a post on Vibe. Otto drafts versions for LinkedIn, Instagram, X. Once Otto knows your voice, leaving means losing him.",
  },
];

function Thesis() {
  return (
    <section style={{ padding: SECTION_PAD }}>
      <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        <SectionHeader
          eyebrow="why vibe"
          title="The four ideas this whole thing"
          italic="rests on."
          align="center"
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          {THESIS_CARDS.map((c) => (
            <VibeCard key={c.label}>
              <Eyebrow>{c.label}</Eyebrow>
              <p
                style={{
                  fontFamily: fontDisplay,
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: 20,
                  lineHeight: 1.3,
                  color: "#1C1C1E",
                  margin: 0,
                }}
              >
                {c.italic}
              </p>
              <p
                style={{
                  fontFamily: fontBody,
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: "#8A8580",
                  marginTop: 16,
                }}
              >
                {c.body}
              </p>
            </VibeCard>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Pull quote                                  */
/* -------------------------------------------------------------------------- */

function PullQuote() {
  return (
    <section style={{ padding: "64px 24px 96px" }}>
      <div
        style={{
          maxWidth: 800,
          margin: "0 auto",
          textAlign: "center",
          borderTop: "1px solid rgba(28,28,30,0.08)",
          borderBottom: "1px solid rgba(28,28,30,0.08)",
          padding: "56px 0",
        }}
      >
        <p
          style={{
            fontFamily: fontDisplay,
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: "clamp(24px, 3.4vw, 36px)",
            lineHeight: 1.3,
            color: "#1C1C1E",
            margin: 0,
          }}
        >
          &ldquo;Don&apos;t make Vibe more professional. Make it unmistakably
          useful{" "}
          <span style={{ color: "#FF5C35" }}>to professionals.</span>&rdquo;
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                What's built                                */
/* -------------------------------------------------------------------------- */

const BUILT_PAGES = [
  { name: "Landing page", body: "Clean entry with two paths." },
  { name: "Onboarding flow", body: "Multi-step sign-up with persistence." },
  {
    name: "The Feed",
    body: "Vibe of the Day, posts, reactions, threaded comments, composer, Vibes strip.",
  },
  {
    name: "The Profile",
    body: "Inline-editable, recruiter view toggle, pinned posts. Biggest page in the app.",
  },
  {
    name: "Network",
    body: "Connections / Following / Followers with mutual badges.",
  },
  {
    name: "Campus Hub",
    body: "Five sections (feed, jobs, events, orgs, chat). IU branded. Gates behind .edu.",
  },
  {
    name: "Opportunities",
    body: "Job board with match %, recruiter mode, filter pills, slide-out detail.",
  },
  {
    name: "Messages",
    body: "Three-column DMs with thread list, requests, Vibe sharing.",
  },
  {
    name: "Otto Agent Tab",
    body: "Five sub-tabs (Today, Metrics, Insights, Customize, Platforms).",
  },
];

function Built() {
  return (
    <section style={{ padding: SECTION_PAD, background: "#fff" }}>
      <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        <SectionHeader
          eyebrow="what's built"
          title="Nine real pages."
          italic="All shipped."
          body="Every page below works in the prototype. Persistence, real interactions, recruiter modes, the whole thing. This is what Franky and Claude built in 26 sessions."
          align="center"
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {BUILT_PAGES.map((p, i) => (
            <VibeCard
              key={p.name}
              style={{ background: "#FAF7F2", padding: 24 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    fontFamily: fontBody,
                    fontWeight: 600,
                    fontSize: 12,
                    color: "#8A8580",
                    letterSpacing: "0.04em",
                  }}
                >
                  0{i + 1}
                </div>
                <Badge
                  className="rounded-full"
                  style={{
                    background: "rgba(46,204,113,0.12)",
                    color: "#1f8e4f",
                    border: "1px solid rgba(46,204,113,0.25)",
                    fontFamily: fontBody,
                    textTransform: "lowercase",
                  }}
                >
                  shipped
                </Badge>
              </div>
              <h3
                style={{
                  fontFamily: fontDisplay,
                  fontWeight: 700,
                  fontSize: 22,
                  lineHeight: 1.2,
                  letterSpacing: "-0.01em",
                  color: "#1C1C1E",
                  margin: 0,
                }}
              >
                {p.name}
              </h3>
              <p
                style={{
                  fontFamily: fontBody,
                  fontSize: 14.5,
                  lineHeight: 1.55,
                  color: "#8A8580",
                  marginTop: 10,
                }}
              >
                {p.body}
              </p>
            </VibeCard>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Otto highlight                              */
/* -------------------------------------------------------------------------- */

function OttoHighlight() {
  return (
    <section
      style={{
        background:
          "linear-gradient(180deg, #0A0E1F 0%, #131830 100%)",
        padding: "120px 24px",
        color: "#FAF7F2",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "minmax(180px, 280px) 1fr",
          gap: 64,
          alignItems: "center",
        }}
        className="otto-highlight-grid"
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          <OttoOrb size={220} />
        </div>
        <div>
          <Eyebrow color="rgba(255,229,219,0.55)">the moat</Eyebrow>
          <h2
            style={{
              fontFamily: fontDisplay,
              fontWeight: 700,
              fontSize: "clamp(32px, 5vw, 56px)",
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              margin: 0,
            }}
          >
            Meet{" "}
            <span style={{ fontStyle: "italic", color: "#FF5C35" }}>
              Otto.
            </span>
          </h2>
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 18,
              lineHeight: 1.6,
              color: "rgba(255,229,219,0.78)",
              marginTop: 24,
              maxWidth: 560,
            }}
          >
            Your AI agent that lives on your network. You write a post on Vibe.
            Otto drafts the LinkedIn version, the Instagram caption, the tweet.
            He learns your voice. He watches recruiter activity for you. He
            gets sharper every week you use him.
          </p>
          <p
            style={{
              fontFamily: fontDisplay,
              fontStyle: "italic",
              fontSize: 20,
              lineHeight: 1.4,
              color: "#FFD08A",
              marginTop: 24,
              maxWidth: 560,
            }}
          >
            Once Otto knows your voice, leaving Vibe means losing him.
          </p>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Team                                    */
/* -------------------------------------------------------------------------- */

const TEAM = [
  {
    initial: "F",
    color: "#FF5C35",
    name: "Franky",
    role: "Founder · Product · Build",
    body: "Driving end-to-end with Claude Code. Has been with this since concept v0. Built the entire 9-page prototype.",
  },
  {
    initial: "J",
    color: "#7C5CFC",
    name: "James",
    role: "Co-founder · Pitch · BD",
    body: "Sounding board since session 1. Best at translating product into language that lands. Strong at framing the why.",
  },
  {
    initial: "R",
    color: "#2ECC71",
    name: "Rylan",
    role: "Co-founder · Growth · Marketing",
    body: "IU junior. Built and sold real social media pages. Asked the question that birthed Otto.",
  },
];

function Team() {
  return (
    <section style={{ padding: SECTION_PAD }}>
      <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        <SectionHeader
          eyebrow="the crew"
          title="Three people."
          italic="One bet."
          align="center"
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          {TEAM.map((m) => (
            <VibeCard key={m.name} style={{ textAlign: "center", padding: 32 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: m.color,
                  margin: "0 auto 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontFamily: fontDisplay,
                  fontWeight: 700,
                  fontSize: 28,
                  letterSpacing: "-0.02em",
                  boxShadow: `0 8px 24px ${m.color}33`,
                }}
              >
                {m.initial}
              </div>
              <h3
                style={{
                  fontFamily: fontDisplay,
                  fontWeight: 700,
                  fontSize: 24,
                  margin: 0,
                  letterSpacing: "-0.02em",
                }}
              >
                {m.name}
              </h3>
              <div
                style={{
                  fontFamily: fontBody,
                  fontSize: 13,
                  letterSpacing: "0.04em",
                  color: "#8A8580",
                  marginTop: 6,
                  textTransform: "lowercase",
                }}
              >
                {m.role}
              </div>
              <p
                style={{
                  fontFamily: fontBody,
                  fontSize: 14.5,
                  lineHeight: 1.6,
                  color: "#1C1C1E",
                  marginTop: 18,
                }}
              >
                {m.body}
              </p>
            </VibeCard>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Work distribution                             */
/* -------------------------------------------------------------------------- */

const JAMES_TASKS = [
  {
    title: "Write the cold-pitch one-liner",
    path: "PITCH/one_liner.txt",
  },
  { title: "Draft the 60-second demo script", path: null },
  {
    title:
      "IU Director follow-up plan (recap template, thank-you, next ask)",
    path: "IU MEETING/",
  },
  {
    title:
      "Co-founder agreement (informal, in writing — equity, roles, decisions)",
    path: null,
  },
  {
    title: "User-feedback session protocol — 30-min interview script",
    path: "RESEARCH/user-feedback/",
  },
];

const RYLAN_TASKS = [
  { title: "IU campus channel audit — every distribution channel mapped" },
  { title: "List of 50 IU testers with names + contact" },
  { title: "Org partnership shortlist (5 IU orgs, with contacts)" },
  { title: "Launch-week playbook — Day 1 to Day 7 rollout" },
  { title: "Growth-loop concept doc — what makes Vibe grow?" },
];

function TaskColumn({
  who,
  color,
  tasks,
}: {
  who: string;
  color: string;
  tasks: { title: string; path?: string | null }[];
}) {
  return (
    <VibeCard style={{ padding: 32 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: color,
            boxShadow: `0 0 12px ${color}66`,
          }}
        />
        <h3
          style={{
            fontFamily: fontDisplay,
            fontWeight: 700,
            fontSize: 24,
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          {who}&apos;s next 5
        </h3>
      </div>
      <ol
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {tasks.map((t, i) => (
          <li
            key={t.title}
            style={{
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
              paddingBottom: 14,
              borderBottom:
                i === tasks.length - 1
                  ? "none"
                  : "1px solid rgba(28,28,30,0.06)",
            }}
          >
            <span
              style={{
                fontFamily: fontDisplay,
                fontWeight: 700,
                fontSize: 18,
                color,
                minWidth: 24,
                lineHeight: 1.4,
              }}
            >
              0{i + 1}
            </span>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: fontBody,
                  fontSize: 15.5,
                  lineHeight: 1.5,
                  color: "#1C1C1E",
                }}
              >
                {t.title}
              </div>
              {t.path ? (
                <code
                  style={{
                    display: "inline-block",
                    marginTop: 6,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 12,
                    color: "#8A8580",
                    background: "rgba(28,28,30,0.04)",
                    padding: "2px 8px",
                    borderRadius: 4,
                  }}
                >
                  {t.path}
                </code>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </VibeCard>
  );
}

function Work() {
  return (
    <section style={{ padding: SECTION_PAD, background: "#fff" }}>
      <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        <SectionHeader
          eyebrow="who does what"
          title="Five concrete tasks"
          italic="each."
          body="None of this is theoretical. Pick yours, ship them, then we ship the next five."
          align="center"
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 20,
          }}
        >
          <TaskColumn who="James" color="#7C5CFC" tasks={JAMES_TASKS} />
          <TaskColumn who="Rylan" color="#2ECC71" tasks={RYLAN_TASKS} />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Research                                  */
/* -------------------------------------------------------------------------- */

type Owner = "James" | "Rylan" | "Both";

const RESEARCH: { title: string; body: string; owner: Owner }[] = [
  {
    title: "LinkedIn deep-dive",
    body: "3 to copy, 3 to never do. Specific UX moves and policies — what works, what's tone-deaf for students.",
    owner: "James",
  },
  {
    title: "Handshake teardown",
    body: "5 IU students who use it. Why they hate it. Where it fails them.",
    owner: "Rylan",
  },
  {
    title: "Buffer / Hootsuite pricing",
    body: "Comparison table, conversion thresholds. What students would pay for in Otto.",
    owner: "Both",
  },
  {
    title: "Failed student networks",
    body: "Post-mortems on 3 dead competitors. What killed them. What we'd do differently.",
    owner: "James",
  },
  {
    title: "Where IU students post",
    body: "Instagram, GroupMe, BeReal, Yik-Yak — what's now and what's next.",
    owner: "Rylan",
  },
  {
    title: "AI agent landscape",
    body: "10 AI social tools. Where Otto's specific angle lives.",
    owner: "Both",
  },
  {
    title: "10 IU student interviews",
    body: "30 minutes each. Verbatim notes. Don't paraphrase.",
    owner: "Rylan",
  },
  {
    title: "Investor research — pre-seed map",
    body: "20 funders we'd want to pitch. Check size, stage, college focus.",
    owner: "James",
  },
  {
    title: "Inspiration board",
    body: "25 screenshots of products we admire. Pattern-spot what we're trying to be.",
    owner: "Both",
  },
];

function ownerStyle(owner: Owner) {
  if (owner === "James")
    return {
      background: "rgba(124,92,252,0.10)",
      color: "#5b3fd9",
      border: "1px solid rgba(124,92,252,0.25)",
    };
  if (owner === "Rylan")
    return {
      background: "rgba(46,204,113,0.10)",
      color: "#1f8e4f",
      border: "1px solid rgba(46,204,113,0.25)",
    };
  return {
    background: "rgba(255,92,53,0.10)",
    color: "#c54323",
    border: "1px solid rgba(255,92,53,0.25)",
  };
}

function Research() {
  return (
    <section style={{ padding: SECTION_PAD }}>
      <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        <SectionHeader
          eyebrow="research"
          title="Nine asks before"
          italic="we ship more."
          body="Each card has an owner. Each one earns a real artifact in the repo. No hand-wavy 'we should research X' — these are deliverables."
          align="center"
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {RESEARCH.map((r) => (
            <VibeCard key={r.title} style={{ padding: 24 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginBottom: 14,
                }}
              >
                <Badge
                  className="rounded-full"
                  style={{
                    ...ownerStyle(r.owner),
                    fontFamily: fontBody,
                    textTransform: "lowercase",
                  }}
                >
                  {r.owner.toLowerCase()}
                </Badge>
              </div>
              <h3
                style={{
                  fontFamily: fontDisplay,
                  fontWeight: 700,
                  fontSize: 19,
                  lineHeight: 1.25,
                  letterSpacing: "-0.01em",
                  color: "#1C1C1E",
                  margin: 0,
                }}
              >
                {r.title}
              </h3>
              <p
                style={{
                  fontFamily: fontBody,
                  fontSize: 14.5,
                  lineHeight: 1.55,
                  color: "#8A8580",
                  marginTop: 10,
                }}
              >
                {r.body}
              </p>
            </VibeCard>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Closing                                  */
/* -------------------------------------------------------------------------- */

function Closing() {
  return (
    <section style={{ padding: "128px 24px", background: "#FAF7F2" }}>
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontFamily: fontDisplay,
            fontWeight: 900,
            fontSize: "clamp(40px, 6vw, 72px)",
            lineHeight: 1.05,
            letterSpacing: "-0.035em",
            margin: 0,
          }}
        >
          This is the moment to{" "}
          <span style={{ fontStyle: "italic", color: "#FF5C35" }}>commit.</span>
        </h2>
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 18,
            lineHeight: 1.65,
            color: "#1C1C1E",
            marginTop: 28,
          }}
        >
          Vibe is real enough now that it&apos;s bigger than any one of us. The
          product needs Franky. The pitch needs James. The growth needs Rylan.
          None of us alone can take this where it&apos;s going. Together, we
          actually can.
        </p>
        <div style={{ marginTop: 48 }}>
          <a
            href="/journal/vibe_journal.html"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              borderRadius: 999,
              border: "1px solid rgba(28,28,30,0.12)",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              letterSpacing: "0.04em",
              color: "#1C1C1E",
              textDecoration: "none",
              background: "rgba(255,255,255,0.6)",
              transition: "all 200ms ease",
            }}
          >
            companion: the product journal
            <span style={{ fontSize: 16, lineHeight: 1, color: "#FF5C35" }}>
              ›
            </span>
          </a>
        </div>
        <div
          style={{
            marginTop: 40,
            paddingTop: 32,
            borderTop: "1px solid rgba(28,28,30,0.08)",
            fontFamily: fontDisplay,
            fontStyle: "italic",
            fontSize: 16,
            color: "#8A8580",
          }}
        >
          vibe. · founding crew · april 2026
        </div>
      </div>
    </section>
  );
}
