"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ImageCropperModal } from "@/components/ImageCropperModal";
import { OrgInviteSheet } from "@/components/orgs/OrgInviteSheet";
import {
  AUDIENCE_HELP,
  OFFICER_FOLLOW_HELP,
  WHO_CAN_JOIN_OPTIONS,
  openToOptions,
} from "@/lib/orgs/join-copy";
import type { JoinPolicy, OrgAudience } from "@/lib/orgs/join-state";

type Link = { label: string; url: string };

/** The club's campus, for the "Open to" option that names a shared campus. */
type OpenToCampus = { name: string; shared: boolean } | null;

/** Same breakpoint as the org page's phone layout (`globals.css` `.vibe-org-header`). */
const PHONE_QUERY = "(max-width: 720px)";

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

/**
 * The officer bar on the org page. The page renders it for owners and admins
 * only (`isSettingsOfficer`), which is also who may invite (critic C2) and
 * change who can join.
 *
 * A hidden club keeps "Edit details" and nothing else (plan §7 F6): it is out
 * of every list and nobody new can join it, so inviting, new posts and the
 * join fields would all be doors to nowhere (the invite POST, the posts route
 * and the PATCH's join fields refuse `org_hidden` anyway). Banner and Logo go
 * too, by the same plan line, although the PATCH still accepts `banner_url` /
 * `logo_url` on a hidden club — restoring them is a one-line change here if
 * hidden-club officers should keep them.
 */
export function OrgProfileAdminBar({
  orgHandle,
  orgName,
  joinPolicy,
  audience,
  hidden,
  openToCampus,
  initialDescription,
  initialLinks,
  initialPhilanthropy,
}: {
  orgHandle: string;
  orgName: string;
  joinPolicy: JoinPolicy;
  audience: OrgAudience;
  hidden: boolean;
  openToCampus: OpenToCampus;
  initialDescription: string;
  initialLinks: Link[];
  initialPhilanthropy: string;
}) {
  const [openModal, setOpenModal] = useState<
    null | "invite" | "edit" | "banner" | "logo" | "post"
  >(null);
  // Picked when the sheet opens, never during render: `window` doesn't exist
  // on the server, and a rotated phone gets the right shape on the next open.
  const [invitePresentation, setInvitePresentation] = useState<"sheet" | "modal">("modal");

  const buttons: { key: Exclude<typeof openModal, null>; label: string; icon: React.ReactNode }[] =
    hidden
      ? [{ key: "edit", label: "Edit details", icon: <PencilIcon /> }]
      : [
          { key: "invite", label: "Invite people", icon: <PersonPlusIcon /> },
          { key: "banner", label: "Banner", icon: <BannerIcon /> },
          { key: "logo", label: "Logo", icon: <LogoIcon /> },
          { key: "edit", label: "Edit details", icon: <PencilIcon /> },
          { key: "post", label: "New post", icon: <PlusIcon /> },
        ];

  const open = (key: Exclude<typeof openModal, null>) => {
    if (key === "invite") {
      setInvitePresentation(window.matchMedia(PHONE_QUERY).matches ? "sheet" : "modal");
    }
    setOpenModal(key);
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          padding: "10px 14px",
          borderRadius: 14,
          background:
            "linear-gradient(180deg, rgba(255,180,150,0.18) 0%, rgba(255,180,150,0.04) 100%)",
          border: "1px solid rgba(255,180,150,0.32)",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "rgba(255,200,170,0.95)",
            marginRight: "auto",
          }}
        >
          {hidden ? "Hidden org" : "Officer tools"}
        </span>
        {buttons.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => open(b.key)}
            style={{
              ...buttonStyle("ghost"),
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {b.icon}
            {b.label}
          </button>
        ))}
      </div>

      {openModal === "invite" && !hidden ? (
        <OrgInviteSheet
          handle={orgHandle}
          orgName={orgName}
          audience={audience}
          presentation={invitePresentation}
          onClose={() => setOpenModal(null)}
        />
      ) : null}

      {openModal === "edit" ? (
        <EditDetailsModal
          orgHandle={orgHandle}
          hidden={hidden}
          openToCampus={openToCampus}
          initialJoinPolicy={joinPolicy}
          initialAudience={audience}
          initialDescription={initialDescription}
          initialLinks={initialLinks}
          initialPhilanthropy={initialPhilanthropy}
          onClose={() => setOpenModal(null)}
        />
      ) : null}

      {openModal === "banner" || openModal === "logo" ? (
        <UploadAssetModal
          orgHandle={orgHandle}
          kind={openModal}
          onClose={() => setOpenModal(null)}
        />
      ) : null}

      {openModal === "post" ? (
        <NewPostModal
          orgHandle={orgHandle}
          onClose={() => setOpenModal(null)}
        />
      ) : null}
    </>
  );
}

// ─── Edit details (description, links, philanthropy, who can join) ────────

function EditDetailsModal({
  orgHandle,
  hidden,
  openToCampus,
  initialJoinPolicy,
  initialAudience,
  initialDescription,
  initialLinks,
  initialPhilanthropy,
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
  onClose: () => void;
}) {
  const router = useRouter();
  const [description, setDescription] = useState(initialDescription);
  const [links, setLinks] = useState<Link[]>(initialLinks);
  const [philanthropy, setPhilanthropy] = useState(initialPhilanthropy);
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>(initialJoinPolicy);
  const [audience, setAudience] = useState<OrgAudience>(initialAudience);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
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
      const res = await fetch(`/api/orgs/${orgHandle}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data?.ok) {
        setErr(data?.error || "Failed to save");
        return;
      }
      router.refresh();
      onClose();
    } catch (e) {
      console.error("[orgs admin] edit details", e);
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Edit details" onClose={onClose}>
      <FieldLabel>Description</FieldLabel>
      <textarea
        value={description}
        maxLength={MAX_DESC}
        rows={3}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What's this org about?"
        style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
      />
      <Hint>{`${description.length} / ${MAX_DESC}`}</Hint>

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
        <button type="button" onClick={onClose} style={buttonStyle("ghost")}>
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          style={{ ...buttonStyle("primary"), opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </ModalFooter>
    </ModalShell>
  );
}

// ─── Banner / Logo upload ────────────────────────────────────────────────

function UploadAssetModal({
  orgHandle,
  kind,
  onClose,
}: {
  orgHandle: string;
  kind: "banner" | "logo";
  onClose: () => void;
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

      // 2) PUT the file directly to R2.
      const putRes = await fetch(signData.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
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
      onClose();
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
  const cropTitle = isBanner ? "Adjust banner" : "Adjust logo";

  return (
    <ModalShell
      title={isBanner ? "Change banner" : "Change logo"}
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
// Clips are backlogged (DOCS/BACKLOG_CLIPS.md), so org posts are now text
// + image only.

function NewPostModal({
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
        // 2) PUT the file.
        const putRes = await fetch(signData.uploadUrl, {
          method: "PUT",
          headers: { "content-type": file.type },
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
    <ModalShell title="Post as the org" onClose={onClose}>
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

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(8,4,16,0.62)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
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
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
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

// ─── Tiny inline icons ───────────────────────────────────────────────────

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.5 1.5l3 3-9 9H2.5v-3l9-9zM10 3l3 3"
      />
    </svg>
  );
}

function BannerIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M2 11l3-3 2 2 3-3 4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LogoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="8" cy="8" r="2.5" fill="currentColor" />
    </svg>
  );
}

function PersonPlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
      <circle
        cx="6"
        cy="5"
        r="2.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M1.5 14c0-2.5 2-4.25 4.5-4.25S10.5 11.5 10.5 14M13 5.5v4M11 7.5h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M8 3v10M3 8h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
