"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ImageCropperModal } from "@/components/ImageCropperModal";
import { ClipViewerMobile } from "@/components/mobile/ClipViewerMobile";
import { PostComposerMobile } from "@/components/mobile/PostComposerMobile";
import { PostViewerMobile } from "@/components/mobile/PostViewerMobile";
import { ResumeViewerMobile } from "@/components/mobile/ResumeViewerMobile";
import { IU_MAJORS_BY_SCHOOL } from "@/lib/iu/majors";
import type { RedactionBar } from "@/lib/profile/resume-redactions";

/**
 * iOS-native mobile profile screen. Instagram-style layout: full-bleed
 * cover, avatar overlapping below, identity stack (stats / name /
 * handle / tagline / meta / vibe tags / Edit profile), Bio block, then
 * a tab strip with three panes:
 *
 *   - Posts      — feed posts as a 1:1 grid
 *   - Clips      — 9:16 short videos as a 9:14 grid with play overlay
 *   - Portfolio  — recruiter-facing pane: "Working on" (currentlyOn)
 *                  + work experience + resume / portfolio file
 *
 * Data sources:
 *   - /api/me/profile-bootstrap  → identity + work experience + resume
 *                                  (currentlyOn is not yet persisted
 *                                  server-side — Working-on shows an
 *                                  empty state until that lands)
 *   - /api/me/posts              → posts + clips (filtered by `type`)
 *
 * Identity stays in sync with desktop profile.html because both read
 * the same bootstrap shape.
 */

/**
 * Shape returned by `/api/me/profile-bootstrap` — actually the
 * `vibe_user_v1` shape from `buildVibeUserV1FromProfile`. NOT the raw
 * snake_case row. The naming is unusual (avatarPhoto / coverPhoto /
 * coverGradient / vibeTags) because this shape predates the React app
 * and was originally consumed by profile.html via localStorage. We
 * read the same shape on mobile so identity stays in sync across
 * surfaces.
 */
type VibeTag = { label?: string; color?: string };
type WorkExp = {
  title?: string;
  company?: string;
  dates?: string;
  location?: string;
  description?: string;
  logoUrl?: string;
};
type StudentVerification = { status?: string; school?: string };
type ResumeItem = { name?: string; type?: string; url?: string };
type CurrentProject = { icon?: string; text?: string };

type VibeUser = {
  name?: string | null;
  handle?: string | null;
  tagline?: string | null;
  headline?: string | null;
  avatarPhoto?: string | null;
  coverPhoto?: string | null;
  coverGradient?: string | null;
  location?: string | null;
  major?: string | null;
  year?: number | null;
  bio?: string | null;
  skills?: string[];
  vibeTags?: VibeTag[];
  studentVerification?: StudentVerification;
  workExperience?: WorkExp[];
  resumePortfolio?: ResumeItem[];
  /** "Currently working on" items — short text/icon pairs the user
   *  enters in their profile editor. Persisted to Supabase as
   *  users.current_on; this field is the camelCase mirror that the
   *  build-vibe-user-v1 builder emits. */
  currentlyOn?: CurrentProject[];
  /** Redaction bars overlaying the user's resume / portfolio.
   *  Persisted as users.resume_redactions; mirrored here as the
   *  camelCase key the build-vibe-user-v1 builder emits. */
  resumeRedactions?: RedactionBar[];
  counts?: {
    followers?: string | number;
    following?: string | number;
    connections?: string | number;
  };
  /** Set by /api/users/[handle]/bootstrap. true = this payload is for a
   *  visited user, not the signed-in viewer. */
  _isViewerMode?: boolean;
  /** Set alongside _isViewerMode. "none" | "following" | "followed_by"
   *  | "connected" | "self" — drives the Connect / Follow / Following
   *  pill state in visitor mode. */
  _viewerFollowState?: FollowState;
  /** Bootstrap short-circuit: target has blocked the viewer. Only
   *  minimal identity (name, handle, avatarPhoto) is included on the
   *  payload — everything else is intentionally omitted. */
  _blockedByTarget?: boolean;
  /** Bootstrap short-circuit: viewer has blocked the target. Same
   *  minimal payload; UI shows an Unblock button instead of the
   *  "restricted you" message. */
  _viewerHasBlocked?: boolean;
  /** Echoed alongside _blockedByTarget / _viewerHasBlocked so the
   *  Unblock button has a stable user id to call DELETE /api/me/block
   *  with, independent of handle changes. */
  id?: string;
};

type FollowState = "none" | "following" | "followed_by" | "connected" | "self";

/** Row shape from /api/me/posts. `type === "clip"` are 9:16 short videos
 *  shown in the Clips tab; everything else lands in Posts. */
type PostRow = {
  id: string;
  type?: string | null;
  content?: string | null;
  media_url?: string | null;
  media_thumbnail_url?: string | null;
  created_at?: string | null;
};

type ProfileTab = "posts" | "clips" | "portfolio";

// Fields the inline mobile editor touches. Mirrors the keys
// /api/me/profile-sync accepts; vibeTagsList is an array of plain
// strings that maps to the `interests` column on save.
type EditDraft = {
  name: string;
  tagline: string;
  bio: string;
  location: string;
  major: string;
  year: number | null;
  vibeTagsList: string[];
};

function pick<T>(...vals: (T | null | undefined)[]): T | null {
  for (const v of vals) {
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

const DEFAULT_BANNER_GRADIENT =
  "linear-gradient(135deg,#FFB8A0 0%,#C8B8FF 45%,#B8E4FF 100%)";

type Props = {
  /** Optional — when set, renders visitor mode for this handle. Omit
   *  for the signed-in user's own profile. Named `targetHandle` so it
   *  doesn't shadow the visited user's `handle` field we destructure
   *  out of `user` below. */
  targetHandle?: string;
};

export function ProfileMobile({ targetHandle }: Props = {}) {
  const isVisitor = !!targetHandle;
  const [user, setUser] = useState<VibeUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostRow[] | null>(null);
  const [tab, setTab] = useState<ProfileTab>("posts");
  /** Resume item the viewer should open. null = closed. */
  const [viewerItem, setViewerItem] = useState<ResumeItem | null>(null);
  /** Post id for the full-screen post viewer. null = closed. */
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  /** Clip id for the full-screen clip viewer. null = closed. */
  const [openClipId, setOpenClipId] = useState<string | null>(null);
  /** Visitor-mode follow state; mirrors the server value initially then
   *  flips optimistically when the user taps Connect / Follow. */
  const [followState, setFollowState] = useState<FollowState>("none");
  const [followBusy, setFollowBusy] = useState(false);
  // Owner inline-edit mode. `editMode` flips the identity stack into
  // editable controls; `draft` is the working copy that gets POSTed
  // on Save. `?edit=1` deep links into edit mode at mount (read via
  // a lazy initializer so we don't trip the React hook lint about
  // setState-in-effect). Subsequent toggles come from the pencil tap.
  const searchParams = useSearchParams();
  const [editMode, setEditMode] = useState(
    () => !isVisitor && searchParams.get("edit") === "1",
  );
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const endpoint = isVisitor
      ? `/api/users/${encodeURIComponent(targetHandle!)}/bootstrap`
      : "/api/me/profile-bootstrap";
    (async () => {
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (!data?.ok || !data.vibeUser) {
          setError("Could not load profile");
          return;
        }
        const u = data.vibeUser as VibeUser;
        setUser(u);
        if (isVisitor && u._viewerFollowState) {
          setFollowState(u._viewerFollowState);
        }
      } catch {
        if (!cancelled) setError("Could not load profile");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isVisitor, targetHandle]);

  // Posts + clips fetch — same shape both ways, just routed by `handle`.
  // Extracted to a stable callback so the composer can re-trigger it
  // after a successful publish (otherwise the user has to refresh to
  // see their new post in the grid).
  const refetchPosts = useCallback(async () => {
    const endpoint = isVisitor
      ? `/api/users/${encodeURIComponent(targetHandle!)}/posts`
      : "/api/me/posts";
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      const data = await res.json();
      if (data?.ok && Array.isArray(data.posts)) {
        setPosts(data.posts as PostRow[]);
      } else {
        setPosts([]);
      }
    } catch {
      setPosts([]);
    }
  }, [isVisitor, targetHandle]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const endpoint = isVisitor
        ? `/api/users/${encodeURIComponent(targetHandle!)}/posts`
        : "/api/me/posts";
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data?.ok && Array.isArray(data.posts)) {
          setPosts(data.posts as PostRow[]);
        } else {
          setPosts([]);
        }
      } catch {
        if (!cancelled) setPosts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isVisitor, targetHandle]);

  // Follow/unfollow toggle for visitor mode. Optimistic so the pill
  // updates instantly; reverts on server error.
  const toggleFollow = async () => {
    if (!isVisitor || !targetHandle || followBusy) return;
    const wasFollowing = followState === "following" || followState === "connected";
    const next: FollowState = wasFollowing
      ? followState === "connected"
        ? "followed_by"
        : "none"
      : followState === "followed_by"
        ? "connected"
        : "following";
    setFollowBusy(true);
    setFollowState(next);
    try {
      const r = await fetch("/api/me/follow", {
        method: wasFollowing ? "DELETE" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_handle: targetHandle }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        // Roll back.
        setFollowState(followState);
      }
    } catch {
      setFollowState(followState);
    } finally {
      setFollowBusy(false);
    }
  };

  // Seed the draft from the live user object. We DON'T sync this in an
  // effect — we just compute an "effective draft" at render time
  // (draft ?? seed-from-user) and lazy-initialize the real `draft`
  // state on the first edit input. Saves us from a setState-in-effect
  // cascade and works the same for both pencil-tap entry and the
  // `?edit=1` deep-link case.
  const seedDraftFromUser = (u: VibeUser): EditDraft => ({
    name: (u.name ?? "").toString(),
    tagline: (u.tagline ?? "").toString(),
    bio: (u.bio ?? "").toString(),
    location: (u.location ?? "").toString(),
    major: (u.major ?? "").toString(),
    year: typeof u.year === "number" ? u.year : null,
    vibeTagsList: (u.vibeTags ?? [])
      .map((t) => t?.label ?? "")
      .filter((s): s is string => !!s),
  });
  const effectiveDraft: EditDraft | null = draft ?? (user ? seedDraftFromUser(user) : null);
  const updateDraft = (patch: Partial<EditDraft>) => {
    if (!user) return;
    setDraft((prev) => ({ ...(prev ?? seedDraftFromUser(user)), ...patch }));
  };
  const enterEdit = () => {
    if (!user) return;
    setEditMode(true);
    setEditError(null);
  };

  // Composer sheet — only mounted while open so the keyboard-focus +
  // mention picker bindings run fresh on every entry. `composerOrigin`
  // captures the FAB's screen-space center at open time so the sheet
  // can grow OUT OF the button (clip-path circular reveal) and shrink
  // BACK INTO it on close.
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerOrigin, setComposerOrigin] = useState<
    { x: number; y: number } | undefined
  >(undefined);
  const composeFabRef = useRef<HTMLButtonElement | null>(null);
  const openComposer = () => {
    const r = composeFabRef.current?.getBoundingClientRect();
    if (r) {
      setComposerOrigin({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    } else {
      setComposerOrigin(undefined);
    }
    setComposerOpen(true);
  };

  // Avatar / banner upload — both run through the ImageCropperModal
  // FIRST so the user crops to the right aspect (1:1 for avatar, 3:1
  // for banner) and we get a known-high-res output. Without the
  // cropper step a small phone screenshot looked sharp on mobile
  // (~390px wide) but blurry on desktop (~1000px wide). With the
  // cropper we always upload at outputMaxSize px on the long edge.
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingKind, setUploadingKind] = useState<"avatar" | "banner" | null>(null);
  // File queued for the cropper. `kind` decides aspect + max output
  // size; the cropper produces a cropped blob, then we upload that.
  const [pendingCrop, setPendingCrop] = useState<{
    file: File;
    kind: "avatar" | "banner";
  } | null>(null);

  const uploadCroppedBlob = async (
    blob: Blob,
    kind: "avatar" | "banner",
  ) => {
    if (!user || uploadingKind) return;
    setUploadingKind(kind);
    setEditError(null);
    try {
      const filename = kind === "avatar" ? "avatar.jpg" : "banner.jpg";
      const file = new File([blob], filename, {
        type: blob.type || "image/jpeg",
      });
      const form = new FormData();
      form.set("file", file);
      form.set("kind", kind);
      const upload = await fetch("/api/me/profile-upload", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const uj = await upload.json();
      if (!upload.ok || !uj?.ok || typeof uj.url !== "string") {
        throw new Error(uj?.error ?? "Upload failed");
      }
      const fieldKey = kind === "avatar" ? "avatar_url" : "banner_url";
      const sync = await fetch("/api/me/profile-sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldKey]: uj.url }),
      });
      const sj = await sync.json();
      if (!sync.ok || !sj?.ok) {
        throw new Error(sj?.error ?? "Could not save");
      }
      // Re-fetch the bootstrap so the new URL we just wrote is the
      // one we display — confirms the column was actually written
      // (not just a successful API response), AND keeps the local
      // state in sync with whatever the server says (cache-bust falls
      // out for free since the URL itself is a fresh random-UUID path).
      const rb = await fetch("/api/me/profile-bootstrap", {
        cache: "no-store",
        credentials: "include",
      });
      const jb = await rb.json().catch(() => ({}));
      if (rb.ok && jb?.ok && jb.vibeUser) {
        const fresh = jb.vibeUser as VibeUser;
        setUser(fresh);
        // Confirm the URL we sent is the one stored. If they don't
        // match, the write didn't actually land (silent failure, RLS,
        // etc.) — surface it instead of pretending things are fine.
        const storedUrl =
          kind === "avatar" ? fresh.avatarPhoto : fresh.coverPhoto;
        if (typeof storedUrl !== "string" || !storedUrl.includes(uj.url.split("?")[0]!)) {
          throw new Error(
            `${kind === "avatar" ? "Profile photo" : "Cover photo"} didn't save. Please try again.`,
          );
        }
      } else {
        // Bootstrap fetch failed — fall back to optimistic local
        // update so we don't lose the image visually.
        setUser((prev) =>
          prev
            ? kind === "avatar"
              ? { ...prev, avatarPhoto: uj.url }
              : { ...prev, coverPhoto: uj.url }
            : prev,
        );
      }
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingKind(null);
    }
  };
  const cancelEdit = () => {
    setEditMode(false);
    setDraft(null);
    setEditError(null);
  };
  const commitEdit = async () => {
    if (savingEdit) return;
    const snapshot = draft;
    if (!snapshot) {
      // Nothing was changed — just exit edit mode without firing a POST.
      setEditMode(false);
      setEditError(null);
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      const r = await fetch("/api/me/profile-sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: snapshot.name.trim(),
          tagline: snapshot.tagline.trim(),
          bio: snapshot.bio.trim(),
          location_text: snapshot.location.trim(),
          major: snapshot.major.trim(),
          year: snapshot.year,
          // `interests` is the server-side name for vibe tags. We
          // strip empties + dedupe here so the column stays clean.
          interests: Array.from(
            new Set(
              snapshot.vibeTagsList
                .map((s) => s.trim())
                .filter((s) => s.length > 0),
            ),
          ),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        throw new Error(
          (j && j.error) ? String(j.error) : `HTTP ${r.status}`,
        );
      }
      // Re-bootstrap so all derived fields (headline, tagline fallback,
      // etc.) come back fresh. Re-use the existing fetch endpoint that
      // initial-mount uses.
      const rb = await fetch("/api/me/profile-bootstrap", {
        cache: "no-store",
        credentials: "include",
      });
      const jb = await rb.json().catch(() => ({}));
      if (rb.ok && jb?.ok && jb.vibeUser) {
        const fresh = jb.vibeUser as VibeUser;
        setUser(fresh);
        // Confirm major + year actually landed in the DB — same
        // silent-failure guard as the avatar upload. If the round-trip
        // returns something other than what we just sent, surface a
        // visible error instead of pretending all is well.
        const sentMajor = snapshot.major.trim();
        const gotMajor = (fresh.major ?? "").toString().trim();
        if (sentMajor !== gotMajor) {
          throw new Error(
            `Major didn't save (sent "${sentMajor || "(blank)"}", got "${gotMajor || "(blank)"}").`,
          );
        }
        const gotYear = typeof fresh.year === "number" ? fresh.year : null;
        if (snapshot.year !== gotYear) {
          throw new Error(
            `Year didn't save (sent ${snapshot.year ?? "(blank)"}, got ${gotYear ?? "(blank)"}).`,
          );
        }
      }
      setEditMode(false);
      setDraft(null);
    } catch (e) {
      setEditError(
        e instanceof Error ? e.message : "Could not save",
      );
    } finally {
      setSavingEdit(false);
    }
  };

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#8A8580" }}>
        {error}
      </div>
    );
  }
  if (!user) {
    return <ProfileMobileSkeleton />;
  }
  if (user._blockedByTarget || user._viewerHasBlocked) {
    return <BlockedByTargetView user={user} />;
  }

  const name = pick(user.name) ?? "You";
  const handle = pick(user.handle);
  const tagline = pick(user.tagline);
  const headline = pick(user.headline);
  const avatar = pick(user.avatarPhoto);
  const banner = pick(user.coverPhoto);
  const gradient = pick(user.coverGradient) ?? DEFAULT_BANNER_GRADIENT;
  const location = pick(user.location);
  const bio = pick(user.bio);
  const verified = user.studentVerification?.status === "verified";
  const school = pick(user.studentVerification?.school);
  const skills = (user.skills ?? []).filter(Boolean).slice(0, 6);
  const tagsFromVibeTags = (user.vibeTags ?? [])
    .map((t) => t?.label)
    .filter((s): s is string => !!s)
    .slice(0, 6);
  const workExperience = (user.workExperience ?? []).slice(0, 4);
  const counts = user.counts ?? {};
  const followers = String(counts.followers ?? "0");
  const connections = String(counts.connections ?? "0");
  const resumePortfolio = (user.resumePortfolio ?? []).filter(
    (r) => !!r?.url,
  );
  const currentProjects = (user.currentlyOn ?? []).filter(
    (p) => !!p?.text,
  );
  const resumeRedactions = user.resumeRedactions ?? [];

  const feedPosts = (posts ?? []).filter((p) => (p.type ?? "post") !== "clip");
  const clipPosts = (posts ?? []).filter((p) => p.type === "clip");

  return (
    <div style={{ minHeight: "100dvh", background: "#FAF7F2", color: "#1C1C1E" }}>
      {/* Cover — full bleed, sits under the status bar (env() pads it).
          Tappable in edit mode to upload a new banner image. */}
      <div
        style={{
          position: "relative",
          height: "calc(200px + env(safe-area-inset-top, 0px))",
          paddingTop: "env(safe-area-inset-top, 0px)",
          background: banner ? `url(${banner}) center/cover` : gradient,
        }}
      >
        {editMode && !isVisitor ? (
          <>
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              disabled={uploadingKind !== null}
              aria-label="Change cover photo"
              style={{
                position: "absolute",
                bottom: 12,
                right: 14,
                padding: "8px 14px",
                borderRadius: 999,
                background: "rgba(0,0,0,0.55)",
                border: "1px solid rgba(255,255,255,0.22)",
                color: "#fff",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 12,
                fontWeight: 700,
                cursor: uploadingKind ? "default" : "pointer",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              {uploadingKind === "banner" ? "Uploading…" : "Change cover"}
            </button>
            <div
              aria-hidden
              style={{
                position: "absolute",
                bottom: 50,
                right: 14,
                padding: "4px 10px",
                borderRadius: 999,
                background: "rgba(0,0,0,0.42)",
                color: "rgba(255,255,255,0.92)",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: "0.01em",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                whiteSpace: "nowrap",
              }}
            >
              Tip — use a 1600 × 533 (or larger) photo
            </div>
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              // Reset value on EVERY click so iOS Safari re-fires
              // onChange even when the user re-picks the same file
              // OR opens the picker a second time after a successful
              // upload. Without this, the second upload silently
              // no-ops because the input still holds the previous
              // file reference.
              onClick={(e) => {
                (e.currentTarget as HTMLInputElement).value = "";
              }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPendingCrop({ file: f, kind: "banner" });
              }}
            />
          </>
        ) : null}
        {/* Floating top-right actions — pencil + settings for owners,
            nothing for visitors (visitor CTA sits in the identity stack
            below the avatar instead so it lands closer to the name). */}
        {isVisitor ? null : (
          <div
            style={{
              position: "absolute",
              top: "calc(env(safe-area-inset-top, 0px) + 14px)",
              right: 14,
              display: "flex",
              gap: 8,
            }}
          >
            {editMode ? (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={savingEdit}
                  style={floatingActionTextStyle}
                  aria-label="Cancel"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commitEdit}
                  disabled={savingEdit}
                  style={floatingActionSaveStyle}
                  aria-label="Save profile"
                >
                  {savingEdit ? "Saving…" : "Save"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={enterEdit}
                  aria-label="Edit profile"
                  style={floatingActionStyle}
                >
                  <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden>
                    <path
                      d="M11.6 1.9l3.5 3.5-9.2 9.2H2.4v-3.5l9.2-9.2z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                      fill="none"
                    />
                    <path
                      d="M10.2 3.3l3.5 3.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <Link href="/settings" aria-label="Settings" style={floatingActionStyle}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                    <circle cx="9" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.5" />
                    <path
                      d="M9 1.5v2.2M9 14.3v2.2M16.5 9h-2.2M3.7 9H1.5M14.3 3.7l-1.55 1.55M5.25 12.75L3.7 14.3M14.3 14.3l-1.55-1.55M5.25 5.25L3.7 3.7"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {/* Identity block — overlaps the cover */}
      <div style={{ padding: "0 16px", marginTop: -44 }}>
        {/* Avatar alone on its own row so the stats can breathe below it
            instead of sitting flush against the cover. position+z-index
            lifts it above the cover's bottom-fade overlay (positioned
            descendants outrank normal-flow siblings in paint order). */}
        <div style={{ position: "relative", zIndex: 1, marginBottom: 14, width: 88 }}>
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 22,
              background: avatar
                ? `url(${avatar}) center/cover`
                : "#FFD3C2",
              border: "3px solid #FAF7F2",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Fraunces, serif",
              fontSize: 32,
              fontWeight: 800,
              color: "#1C1C1E",
              position: "relative",
            }}
          >
            {!avatar ? initialsOf(name) : null}
            {editMode && !isVisitor ? (
              <>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingKind !== null}
                  aria-label="Change profile photo"
                  style={{
                    position: "absolute",
                    bottom: -4,
                    right: -4,
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: "#FF5C35",
                    border: "2.5px solid #FAF7F2",
                    color: "#fff",
                    fontSize: 14,
                    lineHeight: 1,
                    cursor: uploadingKind ? "default" : "pointer",
                    boxShadow: "0 4px 12px rgba(255,92,53,0.32)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                >
                  {uploadingKind === "avatar" ? "…" : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                  )}
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: "none" }}
                  // See banner input above — same iOS reset quirk.
                  onClick={(e) => {
                    (e.currentTarget as HTMLInputElement).value = "";
                  }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setPendingCrop({ file: f, kind: "avatar" });
                  }}
                />
              </>
            ) : null}
          </div>
        </div>

        {/* Stats row — own line below the avatar so it's no longer kissing
            the bottom edge of the banner. Centered and capped so the two
            counts have visual weight without spreading edge-to-edge. */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-around",
            gap: 12,
            maxWidth: 260,
            marginBottom: 16,
          }}
        >
          <StatTile num={followers} label="Followers" />
          <StatTile num={connections} label="Connections" prominent />
        </div>

        {/* Name + verified — input when editing, h1 otherwise. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 2,
          }}
        >
          {editMode && effectiveDraft ? (
            <input
              value={effectiveDraft.name}
              onChange={(e) => updateDraft({ name: e.target.value.slice(0, 120) })}
              placeholder="Your name"
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 26,
                fontWeight: 900,
                letterSpacing: "-0.6px",
                lineHeight: 1.1,
                background: "transparent",
                border: "none",
                borderBottom: "1.5px solid rgba(255,92,53,0.45)",
                padding: "2px 0",
                width: "100%",
                outline: "none",
                color: "#1C1C1E",
              }}
            />
          ) : (
            <h1
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 26,
                fontWeight: 900,
                letterSpacing: "-0.6px",
                lineHeight: 1.1,
                margin: 0,
              }}
            >
              {name}
            </h1>
          )}
          {verified ? <VerifiedBadge school={school} /> : null}
        </div>

        {/* Handle — read-only on mobile for v1 (handle changes have a
            cooldown + uniqueness check; not worth duplicating the
            desktop UI here yet). */}
        {handle ? (
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#8A8580",
              marginBottom: 10,
            }}
          >
            @{handle}
          </div>
        ) : null}

        {/* Tagline */}
        {editMode && effectiveDraft ? (
          <input
            value={effectiveDraft.tagline}
            onChange={(e) => updateDraft({ tagline: e.target.value.slice(0, 500) })}
            placeholder="A short tagline — what's the headline on you?"
            style={{
              fontFamily: "Fraunces, serif",
              fontStyle: "italic",
              fontSize: 16,
              color: "#5C5853",
              lineHeight: 1.45,
              background: "transparent",
              border: "none",
              borderBottom: "1.5px solid rgba(255,92,53,0.35)",
              padding: "4px 0",
              width: "100%",
              outline: "none",
              marginBottom: 12,
              display: "block",
            }}
          />
        ) : tagline ? (
          <p
            style={{
              fontFamily: "Fraunces, serif",
              fontStyle: "italic",
              fontSize: 16,
              color: "#5C5853",
              lineHeight: 1.45,
              margin: "0 0 12px",
            }}
          >
            “{tagline}”
          </p>
        ) : null}

        {/* Meta chips — in display mode, headline (derived from major +
            year + department) and location render as compact chips.
            In edit mode, expose location + major + year as direct
            inputs so users can change them without leaving mobile. */}
        {editMode && effectiveDraft ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 14,
            }}
          >
            <input
              value={effectiveDraft.location}
              onChange={(e) => updateDraft({ location: e.target.value.slice(0, 300) })}
              placeholder="Where you're based"
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontSize: 13,
                color: "#1C1C1E",
                background: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(28,28,30,0.10)",
                borderRadius: 999,
                padding: "8px 14px",
                width: "100%",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={effectiveDraft.major}
                onChange={(e) => updateDraft({ major: e.target.value })}
                style={{
                  flex: 1,
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 13,
                  color: "#1C1C1E",
                  background: "rgba(255,255,255,0.7)",
                  border: "1px solid rgba(28,28,30,0.10)",
                  borderRadius: 999,
                  padding: "8px 14px",
                  outline: "none",
                  appearance: "none",
                  WebkitAppearance: "none",
                  // The major dropdown can hold longer labels than the
                  // year picker — let it ellipsize gracefully when the
                  // chosen major (e.g. Visual Communication Design)
                  // would otherwise wrap into the year cell.
                  textOverflow: "ellipsis",
                  minWidth: 0,
                }}
              >
                <option value="">Major</option>
                {/* If the user's saved major doesn't match any
                    onboarding option (legacy free-text from the old
                    inline editor, or a major we don't list yet),
                    surface it at the top so the select doesn't appear
                    to reset to blank. */}
                {effectiveDraft.major &&
                !IU_MAJORS_BY_SCHOOL.some((g) =>
                  g.majors.includes(effectiveDraft.major),
                ) ? (
                  <option value={effectiveDraft.major}>
                    {effectiveDraft.major}
                  </option>
                ) : null}
                {IU_MAJORS_BY_SCHOOL.map((group) => (
                  <optgroup
                    key={group.school.id}
                    label={group.school.shortLabel}
                  >
                    {group.majors.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                value={effectiveDraft.year ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  updateDraft({ year: v === "" ? null : Number(v) });
                }}
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 13,
                  color: "#1C1C1E",
                  background: "rgba(255,255,255,0.7)",
                  border: "1px solid rgba(28,28,30,0.10)",
                  borderRadius: 999,
                  padding: "8px 14px",
                  outline: "none",
                  appearance: "none",
                  WebkitAppearance: "none",
                  paddingRight: 28,
                }}
              >
                <option value="">Year</option>
                <option value="1">Year 1</option>
                <option value="2">Year 2</option>
                <option value="3">Year 3</option>
                <option value="4">Year 4</option>
                <option value="5">Year 5</option>
                <option value="6">Grad</option>
              </select>
            </div>
          </div>
        ) : (location || headline) ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 14,
            }}
          >
            {headline ? <MetaChip label={headline} icon="book" /> : null}
            {location ? <MetaChip label={location} icon="pin" /> : null}
          </div>
        ) : null}

        {/* Vibe tags — editable chip list when editMode is on. */}
        {editMode && effectiveDraft ? (
          <EditableVibeTags
            tags={effectiveDraft.vibeTagsList}
            onChange={(next) => updateDraft({ vibeTagsList: next })}
          />
        ) : [...tagsFromVibeTags, ...skills].length > 0 ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 18,
            }}
          >
            {[...tagsFromVibeTags, ...skills].slice(0, 8).map((tag) => (
              <span key={tag} style={vibeTagStyle}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {editError ? (
          <div
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              color: "#C0392B",
              background: "rgba(192,57,43,0.08)",
              border: "1px solid rgba(192,57,43,0.18)",
              borderRadius: 10,
              padding: "8px 12px",
              marginBottom: 14,
            }}
          >
            {editError}
          </div>
        ) : null}

        {/* Owner: edit affordance lives in the cover top-right.
            Visitor: Connect / Follow CTA goes here, full-width and
            prominent (the primary call-to-action on someone else's
            profile). */}
        {isVisitor ? (
          <FollowButton
            state={followState}
            busy={followBusy}
            onTap={toggleFollow}
          />
        ) : null}
      </div>

      {/* Bio — stays in the header area, above the tab strip.
          Textarea in edit mode (4000-char cap matches server). */}
      {editMode && effectiveDraft ? (
        <Section title="Bio">
          <textarea
            value={effectiveDraft.bio}
            onChange={(e) => updateDraft({ bio: e.target.value.slice(0, 4000) })}
            placeholder="What do you want people to know about you?"
            rows={4}
            style={{
              width: "100%",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 14,
              lineHeight: 1.6,
              color: "#1C1C1E",
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(28,28,30,0.10)",
              borderRadius: 12,
              padding: "10px 12px",
              outline: "none",
              resize: "vertical",
            }}
          />
        </Section>
      ) : bio ? (
        <Section title="Bio">
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#3D3D3A", margin: 0 }}>
            {bio}
          </p>
        </Section>
      ) : null}

      {/* Tab strip — Instagram-style. Posts, Clips, and a Resume tab
          aimed at recruiters (experience + portfolio + resume PDF). */}
      <ProfileTabs active={tab} onChange={setTab} />

      <div style={{ padding: "12px 16px 24px" }}>
        {tab === "posts" ? (
          <PostsGrid
            posts={feedPosts}
            loading={posts === null}
            isVisitor={isVisitor}
            ownerName={name}
            onOpenPost={setOpenPostId}
          />
        ) : tab === "clips" ? (
          <ClipsGrid
            clips={clipPosts}
            loading={posts === null}
            isVisitor={isVisitor}
            ownerName={name}
            onOpenClip={setOpenClipId}
          />
        ) : (
          <PortfolioPane
            currentProjects={currentProjects}
            workExperience={workExperience}
            resumePortfolio={resumePortfolio}
            onOpenDoc={(r) => setViewerItem(r)}
            isVisitor={isVisitor}
            ownerName={name}
          />
        )}
      </div>

      {viewerItem ? (
        <ResumeViewerMobile
          url={viewerItem.url ?? ""}
          type={viewerItem.type === "image" ? "image" : "pdf"}
          name={viewerItem.name ?? "Resume"}
          // Only doc 0 persists today (users.resume_url is a single
          // string), so the bars saved server-side all anchor to it.
          bars={resumeRedactions.filter((b) => b.docIndex === 0)}
          onClose={() => setViewerItem(null)}
        />
      ) : null}
      {openPostId ? (
        <PostViewerMobile
          postId={openPostId}
          onClose={() => setOpenPostId(null)}
          canDelete={!isVisitor}
          onDeleted={() => void refetchPosts()}
        />
      ) : null}
      {openClipId ? (
        <ClipViewerMobile
          clipId={openClipId}
          onClose={() => setOpenClipId(null)}
          canDelete={!isVisitor}
          onDeleted={() => void refetchPosts()}
        />
      ) : null}
      {pendingCrop ? (
        <ImageCropperModal
          src={pendingCrop.file}
          aspect={pendingCrop.kind === "avatar" ? 1 : 3}
          // outputMaxSize = long-edge px count of the emitted JPEG.
          // Avatar 768 covers retina display at typical 88-160px
          // rendered sizes. Banner bumped to 3200 — the desktop
          // profile cover is full-bleed (~1440-1920 CSS px on common
          // monitors, doubled to 2880-3840 on retina), so 3200 gives
          // headroom to downscale (sharp) rather than upscale (blurry)
          // on every common screen size. Cropper still caps at the
          // source image's native pixels, so screenshots / small
          // photos get the soft-output warning below.
          outputMaxSize={pendingCrop.kind === "avatar" ? 768 : 3200}
          outputQuality={pendingCrop.kind === "avatar" ? 0.92 : 0.96}
          // For banners, draw a "desktop" + "phone" outline inside the
          // crop frame so the user can see what each display actually
          // crops. Desktop banner is full-bleed (~6:1), phone banner is
          // ~2:1 — both differ from our 3:1 crop frame, so without
          // these guides users get surprised by clipping.
          safeAreaGuides={
            pendingCrop.kind === "banner"
              ? [
                  {
                    label: "Desktop",
                    containerAspect: 6,
                    color: "#FF5C35",
                  },
                  {
                    label: "Phone",
                    containerAspect: 2,
                    color: "#7C5CFC",
                  },
                ]
              : undefined
          }
          title={pendingCrop.kind === "avatar" ? "Crop profile photo" : "Crop cover photo"}
          onCancel={() => setPendingCrop(null)}
          onConfirm={(blob, info) => {
            const kind = pendingCrop.kind;
            setPendingCrop(null);
            // Soft warning: the cropper never upscales past the
            // source image's native pixels (would just add blur).
            // If the user picked a screenshot or tiny social-export
            // and the banner output ended up smaller than ~1600px on
            // the long edge, surface a hint so they know their
            // banner may look soft on desktop.
            if (kind === "banner" && info.width < 1600) {
              setEditError(
                "Heads up — that image is smaller than ideal (" +
                  info.width +
                  "px wide). It'll look sharp on phone but may look soft on the wider desktop banner. Try a higher-resolution photo if it matters.",
              );
            } else {
              setEditError(null);
            }
            void uploadCroppedBlob(blob, kind);
          }}
        />
      ) : null}

      {/* Floating compose button — own-profile only, hidden during edit
          mode so it doesn't fight the Save/Cancel pills for tap area. */}
      {!isVisitor && !editMode ? (
        <button
          ref={composeFabRef}
          type="button"
          onClick={openComposer}
          aria-label="New post"
          style={{
            position: "fixed",
            right: 18,
            // Sit above the fixed mobile tabbar (~60px tall) + its
            // safe-area padding, plus a 16px breathing gap. Otherwise
            // the FAB landed underneath the bottom nav.
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 78px)",
            width: 56,
            height: 56,
            borderRadius: 999,
            border: "none",
            background:
              "linear-gradient(135deg, #FF7A4D 0%, #FF5C35 60%, #E04A26 100%)",
            color: "#fff",
            boxShadow:
              "0 10px 24px rgba(255,92,53,0.42), 0 2px 6px rgba(0,0,0,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 90,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
            <path
              d="M11 4.5v13M4.5 11h13"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}

      {composerOpen ? (
        <PostComposerMobile
          origin={composerOrigin}
          onClose={() => setComposerOpen(false)}
          onPosted={() => {
            void refetchPosts();
            setTab("posts");
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab strip + content panes
// ---------------------------------------------------------------------------

function ProfileTabs({
  active,
  onChange,
}: {
  active: ProfileTab;
  onChange: (t: ProfileTab) => void;
}) {
  const tabs: Array<{ id: ProfileTab; label: string; icon: React.ReactNode }> = [
    { id: "posts", label: "Posts", icon: <IconGrid /> },
    { id: "clips", label: "Clips", icon: <IconClip /> },
    { id: "portfolio", label: "Portfolio", icon: <IconResume /> },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        borderTop: "1px solid rgba(28,28,30,0.08)",
        borderBottom: "1px solid rgba(28,28,30,0.08)",
        background: "#FAF7F2",
      }}
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-pressed={isActive}
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "12px 4px 10px",
              background: "transparent",
              border: "none",
              color: isActive ? "#1C1C1E" : "#8A8580",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span aria-hidden style={{ display: "inline-flex" }}>{t.icon}</span>
            {t.label}
            {isActive ? (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  bottom: -1,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 34,
                  height: 2,
                  borderRadius: 2,
                  background: "#1C1C1E",
                }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function PostsGrid({
  posts,
  loading,
  isVisitor,
  ownerName,
  onOpenPost,
}: {
  posts: PostRow[];
  loading: boolean;
  isVisitor: boolean;
  ownerName: string;
  onOpenPost: (id: string) => void;
}) {
  if (loading) return <PostFeedSkeleton />;
  if (posts.length === 0) {
    return isVisitor ? (
      <EmptyTab title="No posts yet" body={`${ownerName} hasn't posted anything yet.`} />
    ) : (
      <EmptyTab
        title="No posts yet"
        body="Share a thought, a moment, or a photo — your posts land here."
        cta={{ href: "/campus?tab=feed", label: "Open the feed →" }}
      />
    );
  }
  // Single-column card feed — Vibe is text-first, so this reads
  // "here's what they've been saying" instead of pretending every
  // post is an Instagram tile. Image posts still show their image
  // inline above the text; text posts just read as the text.
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {posts.map((p) => (
        <PostFeedCard key={p.id} post={p} onTap={() => onOpenPost(p.id)} />
      ))}
    </div>
  );
}

function PostFeedCard({
  post,
  onTap,
}: {
  post: PostRow;
  onTap: () => void;
}) {
  const thumb = post.media_thumbnail_url || post.media_url || "";
  const isImage = !!thumb;
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 14,
        borderRadius: 16,
        // Liquid-glass card — a darker warm-tinted overlay on the cream
        // backdrop. Backdrop-blur lets the page color show through but
        // the dark tint + stronger shadow gives the card real
        // separation from the page instead of blending in.
        // Light liquid-glass fill matches the desktop campus feed
        // (rgba 0.55 → 0.38 white-warm). Card edge gets a lavender
        // hairline (Vibe palette accent — #C8B8FF) instead of plain
        // charcoal, so the card has personality + ties back to the
        // brand color set. Drop shadow tints faintly lavender to
        // match.
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,253,248,0.38) 100%)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        border: "1px solid rgba(124,92,252,0.28)",
        boxShadow: [
          "inset 0 1px 0 rgba(255,255,255,0.7)",
          "0 6px 18px rgba(124,92,252,0.10)",
        ].join(", "),
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "DM Sans, sans-serif",
        color: "#1C1C1E",
      }}
    >
      {post.content ? (
        <p
          style={{
            margin: 0,
            fontSize: 14.5,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            display: "-webkit-box",
            WebkitLineClamp: 6,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {renderInlineContentInline(post.content)}
        </p>
      ) : null}
      {isImage ? (
        <div
          style={{
            borderRadius: 10,
            overflow: "hidden",
            background: `url(${thumb}) center/cover, #EFEAE2`,
            aspectRatio: "1 / 1",
            border: "1px solid rgba(28,28,30,0.06)",
          }}
        />
      ) : null}
      <div
        style={{
          fontSize: 11,
          color: "#8A8580",
          letterSpacing: "0.04em",
        }}
      >
        {post.created_at ? relTimeForCard(post.created_at) : ""}
      </div>
    </button>
  );
}

// Inline @handle / #tag linkifier for the profile post card. Renders
// non-link spans for now (the entire card is one big <button>, so
// nested links would interfere); the linkified version lives in the
// post viewer modal which has independent click targets.
function renderInlineContentInline(text: string): React.ReactNode {
  if (!text) return null;
  const re = /(^|[^A-Za-z0-9_@#])([@#][A-Za-z0-9_]{1,32})/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    const leading = m[1] ?? "";
    const token = m[2] ?? "";
    const start = m.index + leading.length;
    if (start > lastIndex)
      nodes.push(<span key={`t${key++}`}>{text.slice(lastIndex, start)}</span>);
    nodes.push(
      <span key={`tok${key++}`} style={{ color: "#FF5C35", fontWeight: 600 }}>
        {token}
      </span>,
    );
    lastIndex = start + token.length;
  }
  if (lastIndex < text.length)
    nodes.push(<span key={`t${key++}`}>{text.slice(lastIndex)}</span>);
  return nodes;
}

function relTimeForCard(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function ClipsGrid({
  clips,
  loading,
  isVisitor,
  ownerName,
  onOpenClip,
}: {
  clips: PostRow[];
  loading: boolean;
  isVisitor: boolean;
  ownerName: string;
  onOpenClip: (id: string) => void;
}) {
  if (loading) return <GridSkeleton ratio="9/14" />;
  if (clips.length === 0) {
    return isVisitor ? (
      <EmptyTab title="No clips yet" body={`${ownerName} hasn't posted any clips yet.`} />
    ) : (
      <EmptyTab
        title="No clips yet"
        body="Clips are short, 9:16 video moments. Post one from the campus feed to get started."
      />
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 4,
      }}
    >
      {clips.map((p) => (
        <PostThumb
          key={p.id}
          post={p}
          ratio="9/14"
          overlay="play"
          onTap={() => onOpenClip(p.id)}
        />
      ))}
    </div>
  );
}

function PostThumb({
  post,
  ratio,
  overlay,
  onTap,
}: {
  post: PostRow;
  ratio: string;
  overlay?: "play";
  onTap?: () => void;
}) {
  const thumb = post.media_thumbnail_url || post.media_url || "";
  // Text-only posts (no media) get a different tile entirely — cream
  // surface with the actual content readable, not a fake-thumbnail
  // gradient pretending there's an image. Keeps the grid layout but
  // text posts read as text, not as Instagram tiles.
  const isTextOnly = !thumb;
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        position: "relative",
        aspectRatio: ratio,
        borderRadius: 6,
        overflow: "hidden",
        background: isTextOnly
          ? "linear-gradient(180deg,#FFFCF6 0%,#F5F0E5 100%)"
          : `url(${thumb}) center/cover`,
        border: isTextOnly ? "1px solid rgba(28,28,30,0.06)" : "none",
        boxShadow: isTextOnly ? "inset 0 1px 0 rgba(255,255,255,0.6)" : "none",
        padding: 0,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {isTextOnly ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: 10,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            color: "#1C1C1E",
            fontFamily: "DM Sans, sans-serif",
          }}
        >
          {/* Subtle quote glyph in the top-left so the tile reads as
              "a thought" rather than an empty card. */}
          <div
            aria-hidden
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 22,
              lineHeight: 1,
              color: "rgba(255,92,53,0.55)",
              fontWeight: 900,
            }}
          >
            &ldquo;
          </div>
          <div
            style={{
              fontSize: 11,
              lineHeight: 1.35,
              fontWeight: 500,
              color: "#1C1C1E",
              display: "-webkit-box",
              WebkitLineClamp: 5,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              flex: 1,
              marginTop: 4,
            }}
          >
            {(post.content ?? "").trim() || "Post"}
          </div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#8A8580",
              marginTop: 6,
            }}
          >
            Text
          </div>
        </div>
      ) : null}
      {overlay === "play" ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.55)",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor">
            <path d="M1.5 1L8 4.5 1.5 8z" />
          </svg>
        </span>
      ) : null}
    </button>
  );
}

function PortfolioPane({
  currentProjects,
  workExperience,
  resumePortfolio,
  onOpenDoc,
  isVisitor,
  ownerName,
}: {
  currentProjects: CurrentProject[];
  workExperience: WorkExp[];
  resumePortfolio: ResumeItem[];
  onOpenDoc: (r: ResumeItem) => void;
  isVisitor: boolean;
  ownerName: string;
}) {
  const allEmpty =
    currentProjects.length === 0 &&
    workExperience.length === 0 &&
    resumePortfolio.length === 0;
  if (allEmpty) {
    if (isVisitor) {
      return (
        <EmptyTab
          title="Nothing here yet"
          body={`${ownerName} hasn't added projects, experience, or a resume yet.`}
        />
      );
    }
    return (
      <EmptyTab
        title="Nothing for recruiters yet"
        body="Show what you're working on, where you've worked, or upload a resume — recruiters land here when they vet candidates."
        cta={{ href: "/profile?edit=1", label: "Edit profile →" }}
      />
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Visitors only see subsections that have content — empty
          subsections with owner-instruction copy ("Add roles…") would
          be confusing on someone else's profile. */}
      {currentProjects.length > 0 || !isVisitor ? (
        <PortfolioSubsection title="Working on">
          {currentProjects.length === 0 ? (
            <SubsectionEmpty body="Show what you're building, learning, or planning. Adds context for recruiters and connections." />
          ) : (
            <ul style={projectListStyle}>
              {currentProjects.map((p, i) => (
                <li key={`${p.text}-${i}`} style={projectItemStyle}>
                  <span style={projectIconStyle} aria-hidden>
                    {p.icon || "✦"}
                  </span>
                  <span style={{ fontSize: 14, lineHeight: 1.4 }}>{p.text}</span>
                </li>
              ))}
            </ul>
          )}
        </PortfolioSubsection>
      ) : null}

      {workExperience.length > 0 || !isVisitor ? (
      <PortfolioSubsection title="Experience">
        {workExperience.length === 0 ? (
          <SubsectionEmpty body="Add roles, internships, and side gigs from your profile editor." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {workExperience.map((w, i) => (
              <div key={`${w.title}-${i}`} style={{ display: "flex", gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: w.logoUrl
                      ? `url(${w.logoUrl}) center/cover`
                      : "#FAF7F2",
                    border: "1px solid rgba(28,28,30,0.08)",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {w.title ?? "—"}
                  </div>
                  <div style={{ fontSize: 12, color: "#8A8580" }}>
                    {[w.company, w.dates, w.location]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {w.description ? (
                    <div
                      style={{
                        fontSize: 13,
                        color: "#5C5853",
                        marginTop: 4,
                        lineHeight: 1.5,
                      }}
                    >
                      {w.description}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </PortfolioSubsection>
      ) : null}

      {resumePortfolio.length > 0 || !isVisitor ? (
      <PortfolioSubsection title="Resume">
        {resumePortfolio.length === 0 ? (
          <SubsectionEmpty body="Upload a PDF or portfolio image to give recruiters a quick reference document." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {resumePortfolio.map((r, i) => (
              <button
                key={`${r.url}-${i}`}
                type="button"
                onClick={() => onOpenDoc(r)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  background: "#fff",
                  border: "1px solid rgba(28,28,30,0.08)",
                  borderRadius: 14,
                  color: "#1C1C1E",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(255,92,53,0.10)",
                    color: "#FF5C35",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                  aria-hidden
                >
                  <IconResume />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {r.name ?? "Resume"}
                  </div>
                  <div style={{ fontSize: 12, color: "#8A8580" }}>
                    {(r.type ?? "file").toUpperCase()} · tap to open in viewer
                  </div>
                </div>
                <span
                  aria-hidden
                  style={{
                    color: "#8A8580",
                    fontSize: 18,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  ›
                </span>
              </button>
            ))}
          </div>
        )}
      </PortfolioSubsection>
      ) : null}
    </div>
  );
}

function PortfolioSubsection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: "-0.2px",
          marginBottom: 10,
          color: "#1C1C1E",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function SubsectionEmpty({ body }: { body: string }) {
  return (
    <p
      style={{
        fontSize: 13,
        color: "#8A8580",
        margin: 0,
        lineHeight: 1.5,
        padding: "12px 14px",
        background: "rgba(255,253,248,0.7)",
        border: "1px dashed rgba(28,28,30,0.12)",
        borderRadius: 12,
      }}
    >
      {body}
    </p>
  );
}

const projectListStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const projectItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 14px",
  background: "#FAF7F2",
  border: "1px solid rgba(28,28,30,0.06)",
  borderRadius: 12,
  color: "#3D3D3A",
};
const projectIconStyle: React.CSSProperties = {
  fontSize: 16,
  flexShrink: 0,
};

function PostFeedSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            padding: 14,
            borderRadius: 16,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,253,248,0.38) 100%)",
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
            border: "1px solid rgba(124,92,252,0.28)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.7), 0 6px 18px rgba(124,92,252,0.10)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ height: 12, borderRadius: 6, background: "rgba(28,28,30,0.06)", width: "85%" }} />
          <div style={{ height: 12, borderRadius: 6, background: "rgba(28,28,30,0.06)", width: "60%" }} />
          <div style={{ height: 10, borderRadius: 6, background: "rgba(28,28,30,0.04)", width: 60, marginTop: 4 }} />
        </div>
      ))}
    </div>
  );
}

function GridSkeleton({ ratio = "1/1" }: { ratio?: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 4,
      }}
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            aspectRatio: ratio,
            background: "rgba(28,28,30,0.06)",
            borderRadius: 6,
          }}
        />
      ))}
    </div>
  );
}

function EmptyTab({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div
      style={{
        padding: "32px 18px",
        textAlign: "center",
        background: "rgba(255,253,248,0.65)",
        border: "1px dashed rgba(28,28,30,0.14)",
        borderRadius: 18,
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: 16,
          color: "#1C1C1E",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <p style={{ fontSize: 13, color: "#8A8580", margin: 0, lineHeight: 1.5 }}>
        {body}
      </p>
      {cta ? (
        <Link
          href={cta.href}
          style={{
            display: "inline-block",
            marginTop: 14,
            padding: "9px 16px",
            borderRadius: 999,
            background: "#FF5C35",
            color: "#fff",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}

// Tab strip icons — small, monochrome, 16px so they sit cleanly above text.
function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="4" height="4" stroke="currentColor" strokeWidth="1.3" />
      <rect x="10.5" y="1.5" width="4" height="4" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1.5" y="10.5" width="4" height="4" stroke="currentColor" strokeWidth="1.3" />
      <rect x="10.5" y="10.5" width="4" height="4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function IconClip() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3" y="1.5" width="10" height="13" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.5 5.5L10 8l-3.5 2.5z" fill="currentColor" />
    </svg>
  );
}
function IconResume() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="4" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------

function FollowButton({
  state,
  busy,
  onTap,
}: {
  state: FollowState;
  busy: boolean;
  onTap: () => void;
}) {
  const isFollowing = state === "following" || state === "connected";
  const label =
    state === "connected"
      ? "Connected"
      : state === "following"
        ? "Following"
        : state === "followed_by"
          ? "Follow back"
          : "Connect";
  const filled = !isFollowing;
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={busy}
      style={{
        display: "block",
        width: "100%",
        textAlign: "center",
        padding: "11px 16px",
        borderRadius: 14,
        background: filled
          ? state === "followed_by"
            ? "#FF5C35"
            : "#1C1C1E"
          : "rgba(255,255,255,0.7)",
        color: filled ? "#fff" : "#1C1C1E",
        border: filled
          ? "1px solid rgba(0,0,0,0.06)"
          : "1px solid rgba(28,28,30,0.18)",
        fontFamily: "DM Sans, sans-serif",
        fontWeight: 700,
        fontSize: 14,
        marginBottom: 22,
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.65 : 1,
        boxShadow: filled
          ? "0 4px 14px rgba(0,0,0,0.12)"
          : "inset 0 1px 0 rgba(255,255,255,0.6)",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {isFollowing ? `${label} ✓` : label}
    </button>
  );
}

function BlockedByTargetView({ user }: { user: VibeUser }) {
  const name = pick(user.name) ?? "This user";
  const handle = pick(user.handle);
  const avatar = pick(user.avatarPhoto);
  const viewerHasBlocked = !!user._viewerHasBlocked;
  const firstName = ((name as string) || "").split(/\s+/)[0] || "them";
  const initials = ((name as string) || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const heading = viewerHasBlocked
    ? `You blocked ${firstName}`
    : "Profile unavailable";
  const bodyText = viewerHasBlocked
    ? "Unblock to see their content. You won’t be reconnected — you’ll need to Connect again."
    : "This account has restricted you. You can’t see their profile or message them.";
  const [busy, setBusy] = useState(false);
  const onUnblock = async () => {
    if (!user.id || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/me/block", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: user.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        setBusy(false);
        return;
      }
      // Reload so the visitor view re-runs cleanly with the full profile.
      window.location.reload();
    } catch {
      setBusy(false);
    }
  };
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#FAF7F2",
        color: "#1C1C1E",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 32px",
        textAlign: "center",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: "50%",
          background: avatar
            ? `url(${avatar}) center/cover, #F0EBE3`
            : "#F0EBE3",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 18,
          overflow: "hidden",
          fontFamily: "Fraunces, serif",
          fontSize: 34,
          color: "#8A8580",
          filter: avatar ? "grayscale(.6)" : undefined,
          opacity: avatar ? 0.85 : 1,
        }}
      >
        {avatar ? null : initials || "?"}
      </div>
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 24,
          color: "#1C1C1E",
          marginBottom: 2,
        }}
      >
        {name}
      </div>
      {handle ? (
        <div style={{ fontSize: 13, color: "#8A8580", marginBottom: 28 }}>
          @{handle}
        </div>
      ) : (
        <div style={{ marginBottom: 28 }} />
      )}
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 18,
          color: "#1C1C1E",
          marginBottom: 6,
        }}
      >
        {heading}
      </div>
      <p
        style={{
          fontSize: 14,
          color: "#8A8580",
          lineHeight: 1.55,
          marginBottom: 28,
          maxWidth: 320,
        }}
      >
        {bodyText}
      </p>
      {viewerHasBlocked ? (
        <button
          type="button"
          onClick={onUnblock}
          disabled={busy}
          style={{
            display: "inline-block",
            padding: "11px 24px",
            borderRadius: 100,
            background: "#1C1C1E",
            color: "white",
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          Unblock {firstName}
        </button>
      ) : (
        <Link
          href="/network"
          style={{
            display: "inline-block",
            padding: "10px 20px",
            borderRadius: 100,
            background: "#1C1C1E",
            color: "white",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          ← Back
        </Link>
      )}
    </div>
  );
}

function StatTile({
  num,
  label,
  prominent,
}: {
  num: string;
  label: string;
  prominent?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        minWidth: 56,
      }}
    >
      <span
        style={{
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: prominent ? 22 : 20,
          color: prominent ? "#FF5C35" : "#1C1C1E",
          lineHeight: 1,
        }}
      >
        {num}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#8A8580",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function VerifiedBadge({ school }: { school?: string | null }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        background: "linear-gradient(135deg, #FFF0F0, #FFE5DB)",
        border: "1px solid rgba(153,0,0,0.18)",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        color: "#990000",
      }}
    >
      🎓 <strong style={{ color: "#1C1C1E", fontWeight: 700 }}>{school ?? "Student"}</strong>
    </span>
  );
}

function MetaChip({ label, icon }: { label: string; icon?: "pin" | "book" | "cal" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 10px",
        background: "#fff",
        border: "1px solid rgba(28,28,30,0.08)",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: "#5C5853",
      }}
    >
      {icon === "pin" ? "📍" : icon === "book" ? "📚" : icon === "cal" ? "🗓" : null}
      {label}
    </span>
  );
}

const floatingActionStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 999,
  background: "rgba(0,0,0,0.32)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.18)",
  cursor: "pointer",
  padding: 0,
};

// Cover-overlay Save / Cancel pills shown in edit mode. Both use the
// same dark-glass treatment as the floating circular actions so the
// transition reads consistent, just with text instead of an icon.
const floatingActionTextStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.42)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  color: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(255,255,255,0.18)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
const floatingActionSaveStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 999,
  background: "#FF5C35",
  color: "#fff",
  border: "1px solid rgba(255,92,53,0.55)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 4px 14px rgba(255,92,53,0.35)",
};

const vibeTagStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "5px 12px",
  borderRadius: 999,
  background: "#FFF0EC",
  color: "#FF5C35",
};

// Tag list editor — chip with × per tag + an "add" input at the end.
// Enter or comma submits the input. Empty input + backspace removes
// the trailing tag (familiar from Twitter-style tag pickers).
function EditableVibeTags({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
}) {
  const [pending, setPending] = useState("");
  const commit = () => {
    const t = pending.trim();
    if (!t) return;
    if (tags.includes(t)) {
      setPending("");
      return;
    }
    if (tags.length >= 40) {
      setPending("");
      return;
    }
    onChange([...tags, t.slice(0, 80)]);
    setPending("");
  };
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginBottom: 18,
        background: "rgba(255,255,255,0.55)",
        border: "1px solid rgba(28,28,30,0.10)",
        borderRadius: 12,
        padding: 8,
      }}
    >
      {tags.map((tag, i) => (
        <span key={`${tag}-${i}`} style={{ ...vibeTagStyle, display: "inline-flex", alignItems: "center", gap: 6 }}>
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((_, j) => j !== i))}
            aria-label={`Remove ${tag}`}
            style={{
              width: 16,
              height: 16,
              borderRadius: 999,
              background: "rgba(255,92,53,0.18)",
              color: "#FF5C35",
              border: "none",
              fontSize: 12,
              lineHeight: 1,
              cursor: "pointer",
              padding: 0,
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={pending}
        onChange={(e) => setPending(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && pending.length === 0 && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={tags.length === 0 ? "Add vibe tags…" : "+ tag"}
        style={{
          flex: 1,
          minWidth: 90,
          border: "none",
          outline: "none",
          background: "transparent",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 13,
          color: "#1C1C1E",
          padding: "4px 6px",
        }}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        margin: "16px",
        padding: "18px 16px",
        background: "#fff",
        borderRadius: 18,
        border: "1px solid rgba(28,28,30,0.06)",
        boxShadow: "0 4px 18px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 16,
          fontWeight: 800,
          letterSpacing: "-0.2px",
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function ProfileMobileSkeleton() {
  return (
    <div style={{ minHeight: "100dvh", background: "#FAF7F2" }}>
      <div
        style={{
          height: "calc(200px + env(safe-area-inset-top, 0px))",
          background: DEFAULT_BANNER_GRADIENT,
          opacity: 0.55,
        }}
      />
      <div style={{ padding: 16, marginTop: -36 }}>
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: 22,
            background: "rgba(28,28,30,0.08)",
            border: "3px solid #FAF7F2",
          }}
        />
        <div
          style={{
            width: 160,
            height: 28,
            background: "rgba(28,28,30,0.08)",
            borderRadius: 8,
            marginTop: 14,
          }}
        />
        <div
          style={{
            width: 100,
            height: 14,
            background: "rgba(28,28,30,0.06)",
            borderRadius: 6,
            marginTop: 10,
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

