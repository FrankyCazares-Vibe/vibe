// Shared composer helpers — used by the desktop FeedComposer in
// /campus and the mobile PostComposerMobile sheet. Both surfaces share
// the same publish APIs, so the upload + classification math lives here.

export type VideoMode = "clip" | "post-video";

export type CapturedFrame = {
  blob: Blob | null;
  duration: number | null;
  width: number | null;
  height: number | null;
};

/**
 * Pull the first frame of a video as a square JPEG blob via canvas.
 * Best-effort: if metadata never resolves or the format isn't decodable
 * in the browser, we resolve with all-nulls and the caller falls back to
 * publishing without a poster (grid renders a gradient).
 */
export function capturePosterFrame(file: File): Promise<CapturedFrame> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "metadata";
    v.playsInline = true;
    let done = false;
    const finish = (
      blob: Blob | null,
      duration: number | null,
      width: number | null = null,
      height: number | null = null,
    ) => {
      if (done) return;
      done = true;
      try {
        URL.revokeObjectURL(url);
      } catch {}
      resolve({ blob, duration, width, height });
    };
    v.onloadedmetadata = () => {
      const dur = Number.isFinite(v.duration) ? v.duration : null;
      try {
        v.currentTime = Math.min(0.1, (dur || 1) - 0.05);
      } catch {
        finish(null, dur, v.videoWidth || null, v.videoHeight || null);
      }
    };
    v.onseeked = () => {
      const w = v.videoWidth || 720;
      const h = v.videoHeight || 720;
      try {
        const c = document.createElement("canvas");
        const side = Math.min(w, h);
        c.width = c.height = Math.min(720, side);
        const ctx = c.getContext("2d");
        if (!ctx) {
          finish(null, Number.isFinite(v.duration) ? v.duration : null, w, h);
          return;
        }
        const sx = (w - side) / 2;
        const sy = (h - side) / 2;
        ctx.drawImage(v, sx, sy, side, side, 0, 0, c.width, c.height);
        c.toBlob(
          (b) => finish(b, Number.isFinite(v.duration) ? v.duration : null, w, h),
          "image/jpeg",
          0.82,
        );
      } catch {
        finish(null, Number.isFinite(v.duration) ? v.duration : null, w, h);
      }
    };
    v.onerror = () => finish(null, null);
    setTimeout(() => finish(null, null), 8000);
    v.src = url;
  });
}

/**
 * Pull all #hashtags out of post body, normalized to lowercase,
 * deduped, capped at 10. Matches what the publish APIs accept.
 */
export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[A-Za-z0-9_]{1,32}/g);
  if (!matches) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const t = m.replace(/^#+/, "").toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * Classify a video into "clip" (vertical short-form, ≤120s) vs
 * "post-video" (horizontal/square or longer). Falls back to "clip" if
 * dimensions or duration aren't known.
 */
export function classifyVideo(
  width: number | null,
  height: number | null,
  duration: number | null,
): VideoMode {
  const w = width ?? 0;
  const h = height ?? 0;
  const dur = duration ?? 0;
  const isVertical = h > 0 && w > 0 && h > w * 1.05;
  const isShort = dur > 0 && dur <= 120;
  return isVertical && isShort ? "clip" : "post-video";
}

/**
 * Idempotently load /html/_mentionPicker.js (which exposes
 * window.vibeBindMentionPicker) and bind it to a textarea so @ + #
 * suggestions appear in a typeahead. Returns a cleanup-no-op.
 */
export function bindMentionPicker(ta: HTMLTextAreaElement): void {
  const w = window as unknown as {
    vibeBindMentionPicker?: (ta: HTMLTextAreaElement) => void;
  };
  if (w.vibeBindMentionPicker) {
    w.vibeBindMentionPicker(ta);
    return;
  }
  const existing = document.querySelector<HTMLScriptElement>(
    "script[data-vibe-mention-picker]",
  );
  const onLoad = () => {
    if (w.vibeBindMentionPicker) w.vibeBindMentionPicker(ta);
  };
  if (existing) {
    existing.addEventListener("load", onLoad, { once: true });
    return;
  }
  const s = document.createElement("script");
  s.src = "/html/_mentionPicker.js";
  s.async = true;
  s.dataset.vibeMentionPicker = "1";
  s.addEventListener("load", onLoad, { once: true });
  document.head.appendChild(s);
}
