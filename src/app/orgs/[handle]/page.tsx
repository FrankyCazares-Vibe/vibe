import { notFound } from "next/navigation";
import Link from "next/link";

import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { postMediaProxyUrl } from "@/lib/post-media-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { OrgProfileAdminBar } from "./admin-actions";
import { OrgProfileJoinButton } from "./join-button";

type Params = { params: Promise<{ handle: string }> };

const BACKDROP_PRESETS: Record<string, string> = {
  "sand-purple":
    "radial-gradient(120% 80% at 0% 0%, rgba(123,95,224,0.55) 0%, rgba(123,95,224,0) 55%), " +
    "radial-gradient(110% 90% at 100% 100%, rgba(255,92,53,0.5) 0%, rgba(255,92,53,0) 55%), " +
    "linear-gradient(180deg, #1B1530 0%, #241B40 50%, #2E1F35 100%)",
  ember:
    "radial-gradient(120% 90% at 10% 0%, rgba(255,92,53,0.55) 0%, rgba(255,92,53,0) 55%), " +
    "linear-gradient(180deg, #1A0F12 0%, #2A1418 55%, #1F0E12 100%)",
  "deep-violet":
    "radial-gradient(120% 80% at 0% 0%, rgba(120,90,220,0.6) 0%, rgba(120,90,220,0) 55%), " +
    "linear-gradient(180deg, #15102A 0%, #1F1640 60%, #15102A 100%)",
  forest:
    "radial-gradient(120% 90% at 10% 0%, rgba(70,160,110,0.5) 0%, rgba(70,160,110,0) 55%), " +
    "linear-gradient(180deg, #0D1A14 0%, #14241B 60%, #0D1A14 100%)",
  midnight:
    "radial-gradient(120% 80% at 30% 10%, rgba(40,80,180,0.4) 0%, rgba(40,80,180,0) 60%), " +
    "linear-gradient(180deg, #0A0E1A 0%, #14182A 60%, #0A0E1A 100%)",
};

const DORMANT_MS = 60 * 24 * 60 * 60 * 1000;

type OrgProfile = {
  id: string;
  handle: string;
  name: string;
  description: string;
  logo_url: string | null;
  banner_url: string | null;
  is_public: boolean;
  verified: boolean;
  backdrop_preset: string;
  links: Array<{ label: string; url: string }> | null;
  philanthropy: string;
  last_activity_at: string | null;
  member_count: number;
  dormant: boolean;
};

type PostRow = {
  id: string;
  type: "post" | "clip";
  content: string;
  media_url: string | null;
  media_thumbnail_url: string | null;
  created_at: string;
  user: { id: string; handle: string; name: string; avatar_url: string | null } | null;
};

export async function generateMetadata({ params }: Params) {
  const { handle } = await params;
  const service = createSupabaseServiceClient();
  const { data: org } = await service
    .from("orgs")
    .select("name, description, is_public")
    .eq("handle", handle)
    .maybeSingle();
  if (!org) return { title: "Not found · Vibe" };
  return {
    title: `${org.name} · Vibe`,
    description:
      org.description?.slice(0, 200) ||
      (org.is_public ? "An org on Vibe." : "A private org on Vibe."),
  };
}

export default async function OrgProfilePage({ params }: Params) {
  const { handle } = await params;
  const service = createSupabaseServiceClient();

  const { data: orgRaw } = await service
    .from("orgs")
    .select(
      "id, handle, name, description, logo_url, banner_url, is_public, backdrop_preset, verified, links, philanthropy, last_activity_at, created_at"
    )
    .eq("handle", handle)
    .maybeSingle();
  if (!orgRaw) notFound();

  const { count: memberCount } = await service
    .from("org_members")
    .select("user_id", { count: "exact", head: true })
    .eq("org_id", orgRaw.id);

  const lastMs = orgRaw.last_activity_at ? Date.parse(orgRaw.last_activity_at) : null;
  // Server-rendered per request; intentional Date.now() read.
  const nowMs = Date.now(); // eslint-disable-line react-hooks/purity
  const dormant =
    !orgRaw.verified && lastMs !== null && nowMs - lastMs > DORMANT_MS;

  const orgHandle = orgRaw.handle as string;
  const org: OrgProfile = {
    id: orgRaw.id as string,
    handle: orgHandle,
    name: orgRaw.name as string,
    description: (orgRaw.description as string) ?? "",
    logo_url: orgAssetProxyUrl(orgHandle, orgRaw.logo_url as string | null, "logo"),
    banner_url: orgAssetProxyUrl(
      orgHandle,
      orgRaw.banner_url as string | null,
      "banner",
    ),
    is_public: !!orgRaw.is_public,
    verified: !!orgRaw.verified,
    backdrop_preset: (orgRaw.backdrop_preset as string) ?? "sand-purple",
    links: Array.isArray(orgRaw.links)
      ? (orgRaw.links as Array<{ label: string; url: string }>)
      : [],
    philanthropy: (orgRaw.philanthropy as string) ?? "",
    last_activity_at: (orgRaw.last_activity_at as string | null) ?? null,
    member_count: memberCount ?? 0,
    dormant,
  };

  // Viewer relationship.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let viewerRole: string | null = null;
  let pendingRequest = false;
  if (user) {
    const { data: m } = await service
      .from("org_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .maybeSingle();
    viewerRole = (m?.role as string | undefined) ?? null;
    if (!viewerRole) {
      const { data: r } = await service
        .from("org_join_requests")
        .select("id")
        .eq("org_id", org.id)
        .eq("user_id", user.id)
        .eq("status", "pending")
        .maybeSingle();
      pendingRequest = !!r;
    }
  }

  // Recent posts + clips. Always fetched (even for private orgs) — the
  // public profile is meant to give visitors the context they need to
  // decide whether to request access. Channel content stays gated by RLS.
  const { data: postsData } = await service
    .from("posts")
    .select(
      "id, type, content, media_url, media_thumbnail_url, created_at, user:user_id(id, handle, name, avatar_url)"
    )
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(24);
  const allPostRows = ((postsData || []) as unknown as PostRow[]).map((p) => ({
    ...p,
    media_url: postMediaProxyUrl(p.id, p.media_url, "media"),
    media_thumbnail_url: postMediaProxyUrl(p.id, p.media_thumbnail_url, "thumbnail"),
  }));
  const posts: PostRow[] = allPostRows.filter((p) => p.type === "post").slice(0, 12);
  const clips: PostRow[] = allPostRows.filter((p) => p.type === "clip").slice(0, 12);

  const backdrop =
    BACKDROP_PRESETS[org.backdrop_preset] ?? BACKDROP_PRESETS["sand-purple"];

  return (
    <main
      style={{
        minHeight: "100vh",
        background: backdrop,
        backgroundAttachment: "fixed",
        color: "#fff",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 64px" }}>
        <TopNav signedIn={!!user} />

        {viewerRole === "owner" || viewerRole === "admin" ? (
          <OrgProfileAdminBar
            orgHandle={org.handle}
            initialDescription={org.description}
            initialLinks={org.links ?? []}
            initialPhilanthropy={org.philanthropy}
          />
        ) : null}

        <Banner org={org} />
        <Header org={org}>
          <OrgProfileJoinButton
            orgHandle={org.handle}
            isPublic={org.is_public}
            initialRole={viewerRole}
            initialPending={pendingRequest}
            signedIn={!!user}
          />
        </Header>

        {/* Private orgs gate channel content, not the public profile.
            Description, posts, clips, links, and philanthropy all show so a
            visitor can decide whether to request access. */}
        {!org.is_public ? <PrivateOrgNotice /> : null}
        {org.description ? <Description text={org.description} /> : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
            gap: 24,
            marginTop: 24,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
            {clips.length > 0 ? <ClipsSection clips={clips} /> : null}
            {posts.length > 0 ? <PostsSection posts={posts} org={org} /> : null}
            {clips.length === 0 && posts.length === 0 ? <EmptyContent /> : null}
          </div>

          <aside
            style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}
          >
            {org.links && org.links.length > 0 ? <LinksSection links={org.links} /> : null}
            {org.philanthropy ? <PhilanthropySection text={org.philanthropy} /> : null}
            <FactsSection org={org} />
          </aside>
        </div>
      </div>
    </main>
  );
}

function TopNav({ signedIn }: { signedIn: boolean }) {
  return (
    <nav
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "20px 0",
        fontSize: 13,
      }}
    >
      {/* Vibe logo with orange dot — matches the LeftNav treatment. */}
      <Link
        href="/"
        style={{
          color: "#fff",
          textDecoration: "none",
          fontFamily: "Fraunces, serif",
          fontWeight: 900,
          letterSpacing: "-0.02em",
          fontSize: 22,
        }}
      >
        vibe<span style={{ color: "#FF5C35" }}>.</span>
      </Link>
      {signedIn ? (
        <Link
          href="/campus?tab=orgs"
          style={{
            color: "rgba(255,255,255,0.95)",
            textDecoration: "none",
            padding: "8px 16px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.08)",
            fontWeight: 600,
            fontSize: 13,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          ← Return to Organizations
        </Link>
      ) : (
        <Link
          href="/auth/login"
          style={{
            color: "rgba(255,255,255,0.85)",
            textDecoration: "none",
            padding: "6px 14px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            fontWeight: 600,
          }}
        >
          Sign in
        </Link>
      )}
    </nav>
  );
}

function Banner({ org }: { org: OrgProfile }) {
  return (
    <div
      style={{
        position: "relative",
        // Stays inside the 1100px content container — feels visually
        // anchored with the rest of the page rather than bleeding wide.
        width: "100%",
        // 3:1 aspect — Twitter banner shape. Auto-scales with width so
        // the rendered aspect always matches what the user cropped at.
        aspectRatio: "3 / 1",
        overflow: "hidden",
        marginTop: 12,
        borderRadius: 22,
        background: org.banner_url
          ? `url(${org.banner_url}) center/cover`
          : "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 12px 40px rgba(0,0,0,0.4)",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </div>
  );
}

function Header({
  org,
  children,
}: {
  org: OrgProfile;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 16,
        marginTop: 18,
        padding: "0 16px 16px",
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: 20,
          background: org.logo_url
            ? `url(${org.logo_url}) center/cover`
            : "linear-gradient(135deg, #FF5C35 0%, #7B5FE0 100%)",
          border: "1px solid rgba(255,255,255,0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Fraunces, serif",
          fontWeight: 900,
          fontSize: 32,
          color: "#fff",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.3), 0 12px 32px rgba(0,0,0,0.45)",
          flexShrink: 0,
        }}
      >
        {!org.logo_url
          ? org.name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((s) => s[0])
              .join("")
              .toUpperCase()
          : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1
            style={{
              margin: 0,
              fontFamily: "Fraunces, serif",
              fontSize: "clamp(28px, 4vw, 38px)",
              fontWeight: 900,
              letterSpacing: "-1px",
            }}
          >
            {org.name}
          </h1>
          {org.verified ? <VerifiedBadge /> : null}
          {!org.is_public ? <Chip color="#9B7BFF">Private</Chip> : <Chip color="#9DD8FF">Public</Chip>}
          {org.dormant ? <Chip color="#E84D4D">Dormant</Chip> : null}
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 14,
            color: "rgba(255,255,255,0.7)",
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span>@{org.handle}</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>
            {org.member_count} {org.member_count === 1 ? "member" : "members"}
          </span>
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function VerifiedBadge() {
  return (
    <span
      title="Verified by Vibe"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "#FFE8A8",
        background: "rgba(240,200,74,0.18)",
        border: "1px solid rgba(240,200,74,0.45)",
      }}
    >
      <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
        <path
          fill="currentColor"
          d="M8 .5l1.7 1.7L12 1.5l.5 2.3 2.3.5-.7 2.3 1.7 1.7-1.7 1.7.7 2.3-2.3.5-.5 2.3-2.3-.7L8 15.5l-1.7-1.7-2.3.7-.5-2.3-2.3-.5.7-2.3L.2 8l1.7-1.7-.7-2.3 2.3-.5.5-2.3L6.3 2.2 8 .5zm-.6 9.7 4-4-1-1L7.5 8 6 6.5l-1 1L7.5 10z"
        />
      </svg>
      Verified
    </span>
  );
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  const tint = color
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((c) => parseInt(c, 16))
    .join(",");
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color,
        background: `rgba(${tint},0.18)`,
        border: `1px solid rgba(${tint},0.4)`,
      }}
    >
      {children}
    </span>
  );
}

function Description({ text }: { text: string }) {
  return (
    <section
      style={{
        marginTop: 16,
        padding: "16px 18px",
        borderRadius: 16,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16)",
        fontSize: 15,
        lineHeight: 1.6,
        color: "rgba(255,255,255,0.92)",
      }}
    >
      {text}
    </section>
  );
}

function PrivateOrgNotice() {
  return (
    <div
      style={{
        marginTop: 16,
        padding: "10px 14px",
        borderRadius: 12,
        background:
          "linear-gradient(180deg, rgba(155,123,255,0.18) 0%, rgba(155,123,255,0.06) 100%)",
        border: "1px solid rgba(155,123,255,0.32)",
        color: "rgba(255,255,255,0.88)",
        fontSize: 13,
        lineHeight: 1.5,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          background: "rgba(155,123,255,0.2)",
          border: "1px solid rgba(155,123,255,0.45)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#C9B8FF",
          flexShrink: 0,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
          <path
            fill="currentColor"
            d="M8 1a3 3 0 0 0-3 3v2H4.25A1.25 1.25 0 0 0 3 7.25v6.5C3 14.44 3.56 15 4.25 15h7.5c.69 0 1.25-.56 1.25-1.25v-6.5C13 6.56 12.44 6 11.75 6H11V4a3 3 0 0 0-3-3zm0 1.5A1.5 1.5 0 0 1 9.5 4v2h-3V4A1.5 1.5 0 0 1 8 2.5z"
          />
        </svg>
      </span>
      <div>
        <strong style={{ color: "#fff" }}>This community is private.</strong>{" "}
        Profile is public — request access above to see the channels and join
        the chat.
      </div>
    </div>
  );
}

function ClipsSection({ clips }: { clips: PostRow[] }) {
  return (
    <SectionCard title="Recent clips">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: 8,
        }}
      >
        {clips.map((c) => (
          <div
            key={c.id}
            style={{
              aspectRatio: "9 / 16",
              borderRadius: 10,
              background: c.media_thumbnail_url
                ? `url(${c.media_thumbnail_url}) center/cover`
                : "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.1)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.55) 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 8,
                bottom: 6,
                fontSize: 11,
                color: "#fff",
                opacity: 0.85,
              }}
            >
              {c.user?.handle ? `@${c.user.handle}` : null}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function PostsSection({ posts, org }: { posts: PostRow[]; org: OrgProfile }) {
  const orgInitials = org.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  return (
    <SectionCard title="Recent posts">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {posts.map((p) => (
          <article
            key={p.id}
            style={{
              padding: 14,
              borderRadius: 12,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* Posts on the org page belong to the org, not the admin who
                hit publish. Surface the org's identity here; we still
                surface the admin in fine print after the org name. */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: org.logo_url
                    ? `url(${org.logo_url}) center/cover`
                    : "linear-gradient(135deg, #FF5C35 0%, #7B5FE0 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Fraunces, serif",
                  fontWeight: 800,
                  fontSize: 12,
                  color: "#fff",
                  flexShrink: 0,
                  border: "1px solid rgba(255,255,255,0.18)",
                }}
              >
                {!org.logo_url ? orgInitials : null}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                  {org.name}
                </div>
                {p.user?.handle ? (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                    posted by @{p.user.handle}
                  </div>
                ) : null}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                {fmtDate(p.created_at)}
              </div>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
              }}
            >
              {p.content}
            </p>
            {p.media_url ? (
              <img
                src={p.media_url}
                alt=""
                style={{
                  display: "block",
                  width: "100%",
                  height: "auto",
                  marginTop: 12,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              />
            ) : null}
          </article>
        ))}
      </div>
    </SectionCard>
  );
}

function EmptyContent() {
  return (
    <SectionCard title="Recent activity">
      <div
        style={{
          padding: 28,
          textAlign: "center",
          color: "rgba(255,255,255,0.55)",
          fontSize: 14,
        }}
      >
        Nothing posted to the org yet.
      </div>
    </SectionCard>
  );
}

function LinksSection({ links }: { links: Array<{ label: string; url: string }> }) {
  return (
    <SectionCard title="Links">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {links.map((l) => (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#fff",
              textDecoration: "none",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span style={{ fontWeight: 600 }}>{l.label}</span>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>↗</span>
          </a>
        ))}
      </div>
    </SectionCard>
  );
}

function PhilanthropySection({ text }: { text: string }) {
  return (
    <SectionCard title="Philanthropy">
      <p
        style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.55,
          color: "rgba(255,255,255,0.85)",
          whiteSpace: "pre-wrap",
        }}
      >
        {text}
      </p>
    </SectionCard>
  );
}

function FactsSection({ org }: { org: OrgProfile }) {
  return (
    <SectionCard title="About">
      <Fact label="Members" value={String(org.member_count)} />
      <Fact label="Visibility" value={org.is_public ? "Public" : "Private"} />
      <Fact
        label="Status"
        value={org.verified ? "Verified" : org.dormant ? "Dormant" : "Community"}
      />
      <Fact
        label="Last activity"
        value={
          org.last_activity_at ? fmtDate(org.last_activity_at) : "—"
        }
      />
    </SectionCard>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        fontSize: 13,
      }}
    >
      <span style={{ color: "rgba(255,255,255,0.55)" }}>{label}</span>
      <span style={{ color: "#fff" }}>{value}</span>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        padding: 16,
        borderRadius: 16,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.55)",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}
