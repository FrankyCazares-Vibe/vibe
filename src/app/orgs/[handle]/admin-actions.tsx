"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ImageCropperModal } from "@/components/ImageCropperModal";
import { useHideTabBar } from "@/lib/chat/use-hide-tabbar";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import {
  AUDIENCE_HELP,
  OFFICER_FOLLOW_HELP,
  WHO_CAN_JOIN_OPTIONS,
  openToOptions,
} from "@/lib/orgs/join-copy";
import type { JoinPolicy, OrgAudience } from "@/lib/orgs/join-state";
import { MEETING_TIME_MAX, normalizeMeetingTime } from "@/lib/orgs/meeting-time";

type Link = { label: string; url: string };

/** The club's campus, for the "Open to" option that names a shared campus. */
type OpenToCampus = { name: string; shared: boolean } | null;

const MAX_DESC = 400;
const MAX_PHILANTHROPY = 500;

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "#fff",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14,
  outline: "none",
};

const buttonStyle = (variant: "primary" | "ghost" | "danger"): React.CSSProperties => ({
  padding: "8px 14px",
  borderRadius: 10,
  fontFamily: "DM Sans, sans-serif",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  border:
    variant === "primary"
      ? "1px solid rgba(255,180,150,0.45)"
      : variant === "danger"
      ? "1px solid rgba(232,77,77,0.45)"
      : "1px solid rgba(255,255,255,0.14)",
  background:
    variant === "primary"
      ? "linear-gradient(180deg, rgba(255,92,53,0.55) 0%, rgba(255,92,53,0.22) 100%)"
      : variant === "danger"
      ? "rgba(232,77,77,0.18)"
      : "rgba(255,255,255,0.06)",
  color:
    variant === "danger" ? "#FFD0CC" : "#fff",
  boxShadow:
    variant === "primary" ? "inset 0 1px 0 rgba(255,255,255,0.22)" : "none",
});

// ─── Edit page (photo, cover, description, when you meet, links, …) ──────

/** The fields the word filter can name, as the officer sees them. */
const BLOCKED_FIELD: Record<string, string> = {
  description: "The description",
  meeting_time: "When you meet",
  links: "A link's name",
  philanthropy: "Philanthropy",
  name: "The name",
};

/** Refusals whose own sentence is the clearest thing to show. */
const OWN_WORDS = new Set([
  "invalid_description",
  "meeting_time_invalid",
  "invalid_join_policy",
  "invalid_audience",
  "audience_excludes_owner",
  "org_hidden",
]);

/**
 * The club page's Edit page (wave 2; the officer bar's "Edit details",
 * renamed). "Change photo" and "Change cover" hand over to UploadAssetModal
 * through `onChangeAsset`; the opener keeps this dialog (concealed) when
 * something here was typed, so the draft survives the picture.
 * A hidden club gets neither: the officer bar never offered them there.
 */
export function EditPageModal({
  orgHandle,
  hidden,
  openToCampus,
  initialJoinPolicy,
  initialAudience,
  initialDescription,
  initialLinks,
  initialPhilanthropy,
  initialMeetingTime,
  meetingTimeReady,
  onChangeAsset,
  concealed = false,
  onClose,
}: {
  orgHandle: string;
  hidden: boolean;
  openToCampus: OpenToCampus;
  initialJoinPolicy: JoinPolicy;
  initialAudience: OrgAudience;
  initialDescription: string;
  initialLinks: Link[];
  initialPhilanthropy: string;
  initialMeetingTime: string;
  /** False when the database has no meeting_time yet: the field stays out. */
  meetingTimeReady: boolean;
  onChangeAsset?: (kind: "logo" | "banner", dirty: boolean) => void;
  concealed?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [description, setDescription] = useState(initialDescription);
  const [meetingTime, setMeetingTime] = useState(initialMeetingTime);
  const [links, setLinks] = useState<Link[]>(initialLinks);
  const [philanthropy, setPhilanthropy] = useState(initialPhilanthropy);
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>(initialJoinPolicy);
  const [audience, setAudience] = useState<OrgAudience>(initialAudience);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [meetingBad, setMeetingBad] = useState(false);
  const meetingCountId = useId();

  // Code points, as the database's char_length counts them.
  const meetingLength = [...meetingTime].length;
  const meetingOver = meetingLength > MEETING_TIME_MAX;

  const dirty =
    description !== initialDescription ||
    meetingTime !== initialMeetingTime ||
    philanthropy !== initialPhilanthropy ||
    joinPolicy !== initialJoinPolicy ||
    audience !== initialAudience ||
    JSON.stringify(links) !== JSON.stringify(initialLinks);

  const save = async () => {
    setErr(null);
    setMeetingBad(false);
    const body: Record<string, unknown> = {
      description: description.trim(),
      philanthropy: philanthropy.trim(),
      links: links
        .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
        .filter((l) => l.label && l.url),
    };
    // Only what the officer changed: narrowing the audience revokes invites
    // on the server, and a hidden club refuses any join-field change with
    // 409 `org_hidden`, so an untouched field must never ride along.
    if (!hidden && joinPolicy !== initialJoinPolicy) body.join_policy = joinPolicy;
    if (!hidden && audience !== initialAudience) body.audience = audience;
    // The same for when it meets, so a database without the column never
    // sees it (the route answers 503 to a body that carries it there).
    if (meetingTimeReady) {
      const next = normalizeMeetingTime(meetingTime);
      if (!next.ok) {
        setErr(next.message);
        setMeetingBad(true);
        return;
      }
      if (next.value !== initialMeetingTime) body.meeting_time = next.value;
    }

    setBusy(true);
    const r = await vibeRequest(`/api/orgs/${encodeURIComponent(orgHandle)}`, {
      method: "PATCH",
      json: body,
      quiet: true,
      failure: "Couldn't save the page.",
    });
    setBusy(false);
    if (!r.ok) {
      const blocked = r.code === "content_blocked" && r.field ? BLOCKED_FIELD[r.field] : undefined;
      if (r.code === "meeting_time_unavailable") {
        setErr("When you meet can't be saved yet. Try again later.");
        setMeetingBad(true);
      } else if (blocked) {
        setErr(`${blocked} includes words that aren't allowed on Vibe. Edit it and try again.`);
        if (r.field === "meeting_time") setMeetingBad(true);
      } else if (r.code && OWN_WORDS.has(r.code) && r.error) {
        setErr(r.error);
        if (r.code === "meeting_time_invalid") setMeetingBad(true);
      } else {
        setErr(r.message);
      }
      // Signed out, Terms, a restriction: the fix is a page, so the toast
      // carries the button the inline line can't.
      if (r.action) toast({ message: r.message, tone: "error", action: r.action });
      return;
    }
    router.refresh();
    onClose();
  };

  return (
    <ModalShell title="Edit page" onClose={onClose} concealed={concealed}>
      {!hidden && onChangeAsset ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          <button
            type="button"
            className="vibe-press"
            onClick={() => onChangeAsset("logo", dirty)}
            style={{ ...buttonStyle("ghost"), ...assetPillStyle }}
          >
            Change photo
          </button>
          <button
            type="button"
            className="vibe-press"
            onClick={() => onChangeAsset("banner", dirty)}
            style={{ ...buttonStyle("ghost"), ...assetPillStyle }}
          >
            Change cover
          </button>
        </div>
      ) : null}

      <FieldLabel>Description</FieldLabel>
      <textarea
        value={description}
        maxLength={MAX_DESC}
        rows={3}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What's the club about?"
        aria-label="Description"
        style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
      />
      <Hint>{`${description.length} / ${MAX_DESC}`}</Hint>

      {meetingTimeReady ? (
        <>
          <FieldLabel>When you meet</FieldLabel>
          <input
            type="text"
            value={meetingTime}
            // Room for a pasted line to show as over; the save says so.
            maxLength={MEETING_TIME_MAX * 2}
            onChange={(e) => {
              setMeetingTime(e.target.value);
              setMeetingBad(false);
            }}
            placeholder="Thursdays · 7 PM, the Lantern Room"
            aria-label="When you meet"
            aria-describedby={meetingCountId}
            aria-invalid={meetingOver || meetingBad ? true : undefined}
            enterKeyHint="done"
            style={{
              ...inputStyle,
              ...(meetingOver || meetingBad ? { border: "1px solid #FF8A7A" } : null),
            }}
          />
          <div
            id={meetingCountId}
            style={{ fontSize: 11, color: meetingOver ? "#FF8A7A" : "rgba(255,255,255,0.45)" }}
          >
            {`${meetingLength} / ${MEETING_TIME_MAX}`}
            {meetingOver ? " · Keep it to 60 characters." : " · Everyone sees it on the club page."}
          </div>
        </>
      ) : null}

      <FieldLabel>Links</FieldLabel>
      <Hint>Up to 10 — Instagram, GroupMe, website, application form, etc.</Hint>
      <LinksEditor value={links} onChange={setLinks} />

      <FieldLabel>Philanthropy</FieldLabel>
      <textarea
        value={philanthropy}
        maxLength={MAX_PHILANTHROPY}
        rows={3}
        onChange={(e) => setPhilanthropy(e.target.value)}
        placeholder="Annual fundraiser supporting Riley Children's Hospital — $40k raised in 2025."
        aria-label="Philanthropy"
        style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
      />
      <Hint>{`${philanthropy.length} / ${MAX_PHILANTHROPY}`}</Hint>

      {!hidden ? (
        <>
          <FieldLabel id="org-edit-who-can-join">Who can join</FieldLabel>
          <ChoiceGroup
            labelledBy="org-edit-who-can-join"
            value={joinPolicy}
            onChange={setJoinPolicy}
            options={WHO_CAN_JOIN_OPTIONS}
          />

          <FieldLabel id="org-edit-open-to">Open to</FieldLabel>
          <ChoiceGroup
            labelledBy="org-edit-open-to"
            value={audience}
            onChange={setAudience}
            options={openToOptions(openToCampus)}
          />
          <Hint>{AUDIENCE_HELP}</Hint>
          <Hint>{OFFICER_FOLLOW_HELP}</Hint>
        </>
      ) : null}

      {err ? <ErrorBanner text={err} /> : null}

      <ModalFooter>
        <button type="button" onClick={onClose} style={{ ...buttonStyle("ghost"), minHeight: 44 }}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          style={{ ...buttonStyle("primary"), minHeight: 44, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </ModalFooter>
    </ModalShell>
  );
}

const assetPillStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 44,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

// ─── Banner / Logo upload ────────────────────────────────────────────────

/**
 * Exported for the setup list (/orgs/<h>/setup, the club's view wave 1),
 * which opens the logo and then the cover with it. `onSaved`, when given,
 * runs instead of `onClose` after a successful save, so the caller can go
 * on to the next picture.
 */
export function UploadAssetModal({
  orgHandle,
  kind,
  onClose,
  onSaved,
}: {
  orgHandle: string;
  kind: "banner" | "logo";
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onPickFile = (f: File | null) => {
    setErr(null);
    // Hand off to the cropper before staging — confirmed crop becomes the
    // upload payload, cancel returns to the empty-file state.
    setPendingFile(f);
  };

  const onCroppedConfirm = (blob: Blob) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const cropped = new File(
      [blob],
      `${kind}-cropped.jpg`,
      { type: blob.type || "image/jpeg" },
    );
    setFile(cropped);
    setPreviewUrl(URL.createObjectURL(cropped));
    setPendingFile(null);
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      // 1) Sign a put URL for this org and asset kind.
      const signRes = await fetch(`/api/orgs/${orgHandle}/upload-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });
      const signData = await signRes.json();
      if (!signData?.ok) {
        setErr(signData?.error || "Could not start upload");
        return;
      }

      // 2) PUT the file directly to R2, with the exact Content-Type the link
      //    was signed for (the route's `contentType`, else the one declared).
      const putRes = await fetch(signData.uploadUrl, {
        method: "PUT",
        headers: { "content-type": signData.contentType ?? file.type },
        body: file,
      });
      if (!putRes.ok) {
        setErr("Upload failed");
        return;
      }

      // 3) PATCH the org row with the new object key.
      const patchKey = kind === "banner" ? "banner_url" : "logo_url";
      const patchRes = await fetch(`/api/orgs/${orgHandle}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [patchKey]: signData.objectKey }),
      });
      const patchData = await patchRes.json();
      if (!patchData?.ok) {
        setErr(patchData?.error || "Failed to attach upload");
        return;
      }

      router.refresh();
      if (onSaved) onSaved();
      else onClose();
    } catch (e) {
      console.error("[orgs admin] upload", e);
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  };

  const isBanner = kind === "banner";
  const sizeHint = isBanner ? "10MB max · drag to position, scroll to zoom" : "5MB max · square crop";
  // Banner crops at 3:1 (Twitter banner shape). Output is 2400×800 so
  // banners stay sharp on retina + wider viewports — display container is
  // ≤1100px so 2x scale needs ≥2200, plus headroom for future wider layouts.
  const cropAspect = isBanner ? 3 : 1;
  const cropOutputMax = isBanner ? 2400 : 1024;
  const cropTitle = isBanner ? "Adjust cover" : "Adjust photo";

  return (
    <ModalShell
      title={isBanner ? "Change cover" : "Change photo"}
      onClose={onClose}
    >
      <div
        style={{
          height: isBanner ? 160 : 120,
          width: "100%",
          borderRadius: 14,
          background: previewUrl
            ? `url(${previewUrl}) center/cover`
            : "linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)",
          border: "1px dashed rgba(255,255,255,0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.55)",
          fontSize: 13,
          marginBottom: 10,
        }}
      >
        {!previewUrl ? "Preview appears here" : null}
      </div>

      <label style={{ ...buttonStyle("ghost"), display: "inline-block", textAlign: "center" }}>
        {file ? "Change file" : "Pick a file"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          style={{ display: "none" }}
        />
      </label>
      <Hint>{sizeHint}</Hint>

      {err ? <ErrorBanner text={err} /> : null}

      <ModalFooter>
        <button type="button" onClick={onClose} style={buttonStyle("ghost")}>
          Cancel
        </button>
        <button
          type="button"
          onClick={upload}
          disabled={busy || !file}
          style={{ ...buttonStyle("primary"), opacity: busy || !file ? 0.6 : 1 }}
        >
          {busy ? "Uploading…" : "Save"}
        </button>
      </ModalFooter>
      {pendingFile ? (
        <ImageCropperModal
          src={pendingFile}
          aspect={cropAspect}
          shape="rect"
          outputMaxSize={cropOutputMax}
          title={cropTitle}
          onCancel={() => setPendingFile(null)}
          onConfirm={onCroppedConfirm}
        />
      ) : null}
    </ModalShell>
  );
}

// ─── New post ────────────────────────────────────────────────────────────
//
// Used to offer a post/clip toggle where "clip" uploaded a vertical video.
// Video posts are backlogged (DOCS/BACKLOG_CLIPS.md), so club posts are text
// + image only. Exported for the club page's + sheet (wave 2, PlusSheet.tsx).

export function NewPostModal({
  orgHandle,
  onClose,
}: {
  orgHandle: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onPickFile = (f: File | null) => {
    setErr(null);
    if (!f) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    // Images go through the cropper.
    if (f.type.startsWith("image/")) {
      setPendingImage(f);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const onCroppedImage = (blob: Blob) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const cropped = new File([blob], "post-cropped.jpg", {
      type: blob.type || "image/jpeg",
    });
    setFile(cropped);
    setPreviewUrl(URL.createObjectURL(cropped));
    setPendingImage(null);
  };

  const submit = async () => {
    if (!content.trim() && !file) {
      setErr("Add text or media before posting");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      let mediaUrl: string | null = null;
      if (file) {
        // 1) Sign a put URL.
        const signRes = await fetch(`/api/orgs/${orgHandle}/upload-url`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "post-image",
            contentType: file.type,
            sizeBytes: file.size,
          }),
        });
        const signData = await signRes.json();
        if (!signData?.ok) {
          setErr(signData?.error || "Could not start upload");
          return;
        }
        // 2) PUT the file, with the exact Content-Type the link was signed
        //    for (the route's `contentType`, else the one declared).
        const putRes = await fetch(signData.uploadUrl, {
          method: "PUT",
          headers: { "content-type": signData.contentType ?? file.type },
          body: file,
        });
        if (!putRes.ok) {
          setErr("Upload failed");
          return;
        }
        mediaUrl = signData.objectKey as string;
      }

      // 3) Create the post.
      const postRes = await fetch(`/api/orgs/${orgHandle}/posts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          media_url: mediaUrl,
        }),
      });
      const postData = await postRes.json();
      if (!postData?.ok) {
        setErr(postData?.error || "Failed to publish");
        return;
      }

      router.refresh();
      onClose();
    } catch (e) {
      console.error("[orgs admin] new post", e);
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Post to the page" onClose={onClose}>
      <FieldLabel>Caption</FieldLabel>
      <textarea
        value={content}
        maxLength={2000}
        rows={4}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Announce something, share a recap, drop a thread."
        style={{ ...inputStyle, resize: "vertical", minHeight: 90 }}
      />

      <FieldLabel>Image (optional)</FieldLabel>
      {previewUrl ? (
        // Background-image preview keeps the upload component dependency-free.
        <div
          style={{
            width: "100%",
            paddingTop: "56%",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.1)",
            background: `url(${previewUrl}) center/cover`,
          }}
        />
      ) : null}
      <label
        style={{
          ...buttonStyle("ghost"),
          display: "inline-block",
          textAlign: "center",
          marginTop: previewUrl ? 8 : 0,
        }}
      >
        {file ? "Change file" : "Pick image"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          style={{ display: "none" }}
        />
      </label>
      <Hint>JPG / PNG / WEBP / GIF · 15MB max</Hint>

      {err ? <ErrorBanner text={err} /> : null}

      <ModalFooter>
        <button type="button" onClick={onClose} style={buttonStyle("ghost")}>
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          style={{ ...buttonStyle("primary"), opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Publishing…" : "Publish"}
        </button>
      </ModalFooter>
      {pendingImage ? (
        <ImageCropperModal
          src={pendingImage}
          aspectChoices={[
            { label: "Square 1:1", value: 1 },
            { label: "Portrait 4:5", value: 4 / 5 },
            { label: "Landscape 16:9", value: 16 / 9 },
          ]}
          outputMaxSize={1600}
          title="Adjust post image"
          onCancel={() => setPendingImage(null)}
          onConfirm={onCroppedImage}
        />
      ) : null}
    </ModalShell>
  );
}

// ─── Shared modal scaffolding ────────────────────────────────────────────

/**
 * The officer dialogs' frame. A portal on <body> (wave 2): the club page now
 * opens these from the cover and the header row, and a `position: fixed`
 * dialog inside a transformed or blurred box would be pinned to that box
 * instead of the screen. Out there it is outside `.vibe-tabbar-page`, so it
 * hides the phone's tab bar itself (useHideTabBar), and it carries
 * `vibe-night-island` so theme tokens inside it read as Night, like the page.
 *
 * Escape closes it when it is the top dialog (the cropper over it handles
 * its own). Focus moves into the panel and goes back where it was on close,
 * one tick late so a closing vaul sheet's own focus return lands first.
 * `concealed` keeps it mounted but out of sight (and its draft intact) while
 * another dialog opens over it.
 */
function ModalShell({
  title,
  onClose,
  children,
  concealed = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  concealed?: boolean;
}) {
  useHideTabBar();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  const concealedRef = useRef(concealed);
  useEffect(() => {
    closeRef.current = onClose;
    concealedRef.current = concealed;
  });

  useEffect(() => {
    let previous: HTMLElement | null = null;
    const t = window.setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body && !panelRef.current?.contains(active)) previous = active;
      if (!concealedRef.current) panelRef.current?.focus({ preventScroll: true });
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || concealedRef.current) return;
      const open = document.querySelectorAll('[aria-modal="true"]');
      if (open[open.length - 1] !== rootRef.current) return;
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  // Back from under another dialog: focus comes back to this one.
  const wasConcealed = useRef(concealed);
  useEffect(() => {
    if (wasConcealed.current && !concealed) panelRef.current?.focus({ preventScroll: true });
    wasConcealed.current = concealed;
  }, [concealed]);

  // Only ever opened by a tap, so there is no server render to match.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={rootRef}
      className="vibe-night-island"
      onClick={(e) => {
        // A portal still bubbles React events to the page that opened it.
        e.stopPropagation();
        onClose();
      }}
      role="dialog"
      aria-modal={concealed ? undefined : "true"}
      aria-labelledby={titleId}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(8,4,16,0.62)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: concealed ? "none" : "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "min(86vh, 760px)",
          overflowY: "auto",
          padding: 24,
          borderRadius: 18,
          color: "#fff",
          fontFamily: "DM Sans, sans-serif",
          background:
            "linear-gradient(180deg, rgba(40,20,50,0.92) 0%, rgba(20,10,30,0.92) 100%)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 20px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.16)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          outline: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <h2
            id={titleId}
            style={{
              margin: 0,
              fontFamily: "Fraunces, serif",
              fontWeight: 900,
              fontSize: 20,
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </h2>
          {/* A 44px target around a 30px circle. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 44,
              height: 44,
              marginRight: -8,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              padding: 0,
              border: "none",
              borderRadius: 999,
              background: "transparent",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 30,
                height: 30,
                display: "grid",
                placeItems: "center",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ✕
            </span>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        justifyContent: "flex-end",
        marginTop: 8,
      }}
    >
      {children}
    </div>
  );
}

function FieldLabel({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <div
      id={id}
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.55)",
        marginTop: 6,
      }}
    >
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
      {children}
    </div>
  );
}

/**
 * A segmented single choice: one pill per option, label plus an optional
 * sub. A radiogroup, so a screen reader hears which one is picked.
 */
function ChoiceGroup<V extends string>({
  labelledBy,
  value,
  onChange,
  options,
}: {
  labelledBy: string;
  value: V;
  onChange: (next: V) => void;
  options: readonly { value: V; label: string; sub?: string }[];
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 6,
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "center",
              gap: 2,
              minHeight: 44,
              padding: "8px 12px",
              borderRadius: 10,
              textAlign: "left",
              fontFamily: "DM Sans, sans-serif",
              cursor: "pointer",
              color: "#fff",
              border: selected
                ? "1px solid rgba(255,180,150,0.6)"
                : "1px solid rgba(255,255,255,0.14)",
              background: selected
                ? "linear-gradient(180deg, rgba(255,92,53,0.42) 0%, rgba(255,92,53,0.16) 100%)"
                : "rgba(255,255,255,0.04)",
              boxShadow: selected ? "inset 0 1px 0 rgba(255,255,255,0.22)" : "none",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{o.label}</span>
            {o.sub ? (
              <span style={{ fontSize: 11.5, lineHeight: 1.35, color: "rgba(255,255,255,0.6)" }}>
                {o.sub}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        background: "rgba(232,77,77,0.18)",
        border: "1px solid rgba(232,77,77,0.4)",
        color: "#FFD0CC",
        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}

function LinksEditor({
  value,
  onChange,
}: {
  value: Link[];
  onChange: (v: Link[]) => void;
}) {
  const [draftLabel, setDraftLabel] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const max = 10;

  const add = () => {
    const label = draftLabel.trim().slice(0, 60);
    let url = draftUrl.trim();
    if (!label || !url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    onChange([...value, { label, url }].slice(0, max));
    setDraftLabel("");
    setDraftUrl("");
  };

  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {value.map((l, idx) => (
        <div
          key={`${l.url}-${idx}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <span
            style={{
              flexShrink: 0,
              fontSize: 13,
              fontWeight: 600,
              minWidth: 90,
            }}
          >
            {l.label}
          </span>
          <span
            style={{
              flex: 1,
              fontSize: 12,
              color: "rgba(255,255,255,0.6)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {l.url}
          </span>
          <button
            type="button"
            onClick={() => remove(idx)}
            aria-label="Remove"
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 12,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      ))}
      {value.length < max ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            placeholder="Label"
            maxLength={60}
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            style={{ ...inputStyle, flex: "0 0 36%" }}
          />
          <input
            type="text"
            placeholder="https://…"
            maxLength={400}
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="button"
            onClick={add}
            disabled={!draftLabel.trim() || !draftUrl.trim()}
            style={buttonStyle("primary")}
          >
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}
