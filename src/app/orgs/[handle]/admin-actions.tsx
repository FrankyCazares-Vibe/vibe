"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Link = { label: string; url: string };

const MAX_DESC = 400;
const MAX_PHILANTHROPY = 1000;

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

export function OrgProfileAdminBar({
  orgHandle,
  initialDescription,
  initialLinks,
  initialPhilanthropy,
}: {
  orgHandle: string;
  initialDescription: string;
  initialLinks: Link[];
  initialPhilanthropy: string;
}) {
  const [openModal, setOpenModal] = useState<
    null | "edit" | "banner" | "logo" | "post"
  >(null);

  const buttons: { key: typeof openModal; label: string; icon: React.ReactNode }[] = [
    { key: "banner", label: "Banner", icon: <BannerIcon /> },
    { key: "logo", label: "Logo", icon: <LogoIcon /> },
    { key: "edit", label: "Edit details", icon: <PencilIcon /> },
    { key: "post", label: "New post", icon: <PlusIcon /> },
  ];

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
          Owner / admin tools
        </span>
        {buttons.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setOpenModal(b.key)}
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

      {openModal === "edit" ? (
        <EditDetailsModal
          orgHandle={orgHandle}
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

// ─── Edit details (description, links, philanthropy) ──────────────────────

function EditDetailsModal({
  orgHandle,
  initialDescription,
  initialLinks,
  initialPhilanthropy,
  onClose,
}: {
  orgHandle: string;
  initialDescription: string;
  initialLinks: Link[];
  initialPhilanthropy: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [description, setDescription] = useState(initialDescription);
  const [links, setLinks] = useState<Link[]>(initialLinks);
  const [philanthropy, setPhilanthropy] = useState(initialPhilanthropy);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/orgs/${orgHandle}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          philanthropy: philanthropy.trim(),
          links: links
            .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
            .filter((l) => l.label && l.url),
        }),
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onPickFile = (f: File | null) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
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
  const sizeHint = isBanner ? "10MB max · 16:9 looks best" : "5MB max · square";

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
    </ModalShell>
  );
}

// ─── New post / clip ─────────────────────────────────────────────────────

function NewPostModal({
  orgHandle,
  onClose,
}: {
  orgHandle: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<"post" | "clip">("post");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onPickFile = (f: File | null) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  };

  const submit = async () => {
    if (!content.trim() && !file) {
      setErr("Add text or media before posting");
      return;
    }
    if (type === "clip" && !file) {
      setErr("Clip needs a video upload");
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
            kind: type === "clip" ? "post-video" : "post-image",
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
          type,
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

  const accept =
    type === "clip"
      ? "video/mp4,video/quicktime,video/webm"
      : "image/png,image/jpeg,image/webp,image/gif";

  return (
    <ModalShell title="Post as the org" onClose={onClose}>
      {/* Post / Clip toggle */}
      <div style={{ display: "flex", gap: 6 }}>
        {(["post", "clip"] as const).map((opt) => {
          const on = type === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => {
                setType(opt);
                onPickFile(null);
              }}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 10,
                border: on
                  ? "1px solid rgba(255,180,150,0.55)"
                  : "1px solid rgba(255,255,255,0.12)",
                background: on
                  ? "linear-gradient(180deg, rgba(255,92,53,0.32) 0%, rgba(255,92,53,0.14) 100%)"
                  : "rgba(255,255,255,0.04)",
                color: "#fff",
                fontFamily: "DM Sans, sans-serif",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>

      <FieldLabel>Caption</FieldLabel>
      <textarea
        value={content}
        maxLength={2000}
        rows={4}
        onChange={(e) => setContent(e.target.value)}
        placeholder={
          type === "clip"
            ? "Caption your clip…"
            : "Announce something, share a recap, drop a thread."
        }
        style={{ ...inputStyle, resize: "vertical", minHeight: 90 }}
      />

      <FieldLabel>{type === "clip" ? "Video" : "Image (optional)"}</FieldLabel>
      {previewUrl && type === "clip" ? (
        <video
          src={previewUrl}
          controls
          style={{
            width: "100%",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.1)",
            maxHeight: 360,
            background: "#000",
          }}
        />
      ) : previewUrl ? (
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
        {file ? "Change file" : type === "clip" ? "Pick video" : "Pick image"}
        <input
          type="file"
          accept={accept}
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          style={{ display: "none" }}
        />
      </label>
      <Hint>
        {type === "clip"
          ? "MP4 / MOV / WEBM · 200MB max"
          : "JPG / PNG / WEBP / GIF · 15MB max"}
      </Hint>

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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
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
