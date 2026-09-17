"use client";

import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type JSX, type RefObject } from "react";

import { ImageCropperModal } from "@/components/ImageCropperModal";
import { toast } from "@/lib/feedback/toast";
import { PHOTO_ERROR_COPY, uploadAvatar } from "@/lib/profile/avatar-upload";

import { ONB_COPY } from "./onb-copy";
import { COLORS, fieldErrorStyle, h2Style, subIntroStyle } from "./onb-theme";

/**
 * Onboarding step 4, "put a face to the name" (wave plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §9 B12 item 10).
 *
 * Pick a photo, crop it to a circle, and it saves right away (upload, then
 * `users.avatar_url`, through `uploadAvatar`), so the step can't be left with
 * a half-saved photo. The draft's `step: 4` is what brings an iOS "Take Photo"
 * tab reload back here; the photo itself is never in the draft.
 *
 * The file input has no `capture` attribute, so iOS offers both the library
 * and the camera. Any `image/*` the browser can decode reaches the cropper
 * (HEIC included); the cropper's JPEG output is what gets checked and sent.
 *
 * Replay: the crop shows as a local `blob:` preview and nothing uploads. The
 * parent owns that URL and revokes it.
 *
 * The root is a fragment from the `h2` down. The footer (Choose / Change /
 * Continue / Skip for now) is the parent's, and it opens the picker through
 * `fileInputRef`.
 */
export function StepPhoto(p: {
  replay: boolean;
  avatarUrl: string | null;
  initial: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  error: string | null;
  onError: (m: string | null) => void;
  onUploading: (b: boolean) => void;
  onSaved: (url: string) => void;
}): JSX.Element {
  const { replay, avatarUrl, initial, fileInputRef, error, onError, onUploading, onSaved } = p;
  const copy = ONB_COPY.photo;
  const [file, setFile] = useState<File | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    if (picked.type && !picked.type.startsWith("image/")) {
      onError(PHOTO_ERROR_COPY.wrongType);
      return;
    }
    onError(null);
    setFile(picked);
  };

  const close = () => setFile(null);

  const onConfirm = async (blob: Blob) => {
    close();
    if (replay) {
      onSaved(URL.createObjectURL(blob));
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    onUploading(true);
    const r = await uploadAvatar(blob, { signal: ctrl.signal });
    onUploading(false);
    if (r.ok) {
      onSaved(r.url);
      return;
    }
    if (r.aborted) return;
    onError(r.message);
    if (r.action) toast({ message: r.message, tone: "error", action: r.action });
  };

  return (
    <>
      <h2 style={h2Style}>{copy.title}</h2>
      <p style={subIntroStyle}>{copy.otto}</p>

      <div style={circleStyle}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" style={imgStyle} />
        ) : (
          <span aria-hidden="true" style={initialStyle}>
            {initial}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" style={{ ...fieldErrorStyle, textAlign: "center", marginTop: 14 }}>
          {error}
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onClick={(e) => {
          e.currentTarget.value = "";
        }}
        onChange={onChange}
        style={{ display: "none" }}
      />

      {file && (
        <ImageCropperModal
          src={file}
          aspect={1}
          shape="circle"
          outputMaxSize={768}
          outputQuality={0.92}
          dismissOnBackdrop={false}
          onCancel={close}
          onError={(m) => {
            close();
            onError(m);
          }}
          onConfirm={(blob) => void onConfirm(blob)}
        />
      )}
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const circleStyle: CSSProperties = {
  width: 132,
  height: 132,
  borderRadius: "50%",
  overflow: "hidden",
  background: COLORS.charcoalSoft,
  border: `1px solid ${COLORS.faintBorder}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginTop: 6,
  flexShrink: 0,
};
const imgStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};
const initialStyle: CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif",
  fontSize: 52,
  fontWeight: 900,
  color: "rgba(255,255,255,.8)",
  lineHeight: 1,
};
