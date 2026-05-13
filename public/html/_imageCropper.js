// Vanilla-JS image cropper for the legacy HTML pages (profile / messages).
// Exposes window.openImageCropper(file, opts) -> Promise<Blob | null>.
// Resolves with a JPEG blob on Save, null on Cancel.
//
// Mirrors src/components/ImageCropperModal.tsx for visual + UX parity but
// without React. Keep both files in sync when changing crop math.

(function () {
  if (window.openImageCropper) return;

  const VIEWPORT_MAX = 540;

  // Inject styles once.
  if (!document.getElementById("vibe-cropper-styles")) {
    const css = `
      .vc-back { position: fixed; inset: 0; background: rgba(0,0,0,0.55);
        backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        z-index: 11000; display: flex; align-items: center; justify-content: center;
        padding: 20px; font-family: 'DM Sans', system-ui, sans-serif; }
      .vc-modal { width: 100%; max-width: 620px; background: #fff; border-radius: 18px;
        padding: 18px; box-shadow: 0 24px 80px rgba(0,0,0,0.4);
        display: flex; flex-direction: column; gap: 14px; }
      .vc-title { font-family: 'Fraunces', serif; font-weight: 800; font-size: 18px; color: #1C1C1E; }
      .vc-stage { position: relative; margin: 0 auto; background: #000; overflow: hidden;
        border-radius: 12px; touch-action: none; user-select: none; cursor: grab; }
      .vc-stage.grabbing { cursor: grabbing; }
      .vc-img { position: absolute; left: 0; top: 0; max-width: none; pointer-events: none; }
      .vc-zoom { display: flex; align-items: center; gap: 10px; }
      .vc-zoom-label { font-size: 11px; font-weight: 700; color: #8A8580;
        letter-spacing: 0.4px; text-transform: uppercase; }
      .vc-zoom-slider { flex: 1; accent-color: #FF5C35; }
      .vc-actions { display: flex; justify-content: flex-end; gap: 8px; }
      .vc-btn { padding: 8px 14px; border-radius: 999px; font-family: inherit;
        font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid rgba(28,28,30,0.12);
        background: transparent; color: #1C1C1E; }
      .vc-btn-primary { padding: 8px 18px; border: none; background: #FF5C35; color: #fff;
        box-shadow: 0 4px 14px rgba(255,92,53,0.32); }
      .vc-btn[disabled] { opacity: 0.5; cursor: default; box-shadow: none; }
    `;
    const tag = document.createElement("style");
    tag.id = "vibe-cropper-styles";
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  /**
   * options:
   *   aspect: number (width / height) — default 1
   *   outputMaxSize: number — default 1600
   *   title: string — default "Adjust image"
   *   shape: 'rect' | 'circle' — default 'rect'
   *   outputType: 'image/jpeg' | 'image/png' | 'image/webp' — default 'image/jpeg'
   *   outputQuality: number 0..1 — default 0.92
   *   safeAreaGuides: Array<{label, containerAspect, color}> — optional;
   *     draws dashed outlines inside the crop frame for each destination
   *     surface (e.g. desktop banner 6:1, phone banner 2:1).
   */
  window.openImageCropper = function openImageCropper(file, opts) {
    opts = opts || {};
    const aspect = opts.aspect || 1;
    const outputMaxSize = opts.outputMaxSize || 1600;
    const title = opts.title || "Adjust image";
    const shape = opts.shape || "rect";
    const outputType = opts.outputType || "image/jpeg";
    const outputQuality = typeof opts.outputQuality === "number" ? opts.outputQuality : 0.92;
    const safeAreaGuides = Array.isArray(opts.safeAreaGuides) ? opts.safeAreaGuides : [];

    // Viewport sized from aspect.
    const vw = aspect >= 1 ? VIEWPORT_MAX : VIEWPORT_MAX * aspect;
    const vh = aspect >= 1 ? VIEWPORT_MAX / aspect : VIEWPORT_MAX;

    return new Promise((resolve) => {
      // Backdrop + modal markup.
      const backdrop = document.createElement("div");
      backdrop.className = "vc-back";
      backdrop.innerHTML =
        '<div class="vc-modal" role="dialog" aria-modal="true">' +
        '  <div class="vc-title"></div>' +
        '  <div class="vc-stage">' +
        '    <img class="vc-img" alt="" draggable="false">' +
        "  </div>" +
        '  <div class="vc-zoom">' +
        '    <span class="vc-zoom-label">Zoom</span>' +
        '    <input type="range" class="vc-zoom-slider" min="0" max="1" step="0.001" value="0">' +
        "  </div>" +
        '  <div class="vc-actions">' +
        '    <button type="button" class="vc-btn vc-cancel">Cancel</button>' +
        '    <button type="button" class="vc-btn vc-btn-primary vc-save" disabled>Save</button>' +
        "  </div>" +
        "</div>";

      backdrop.querySelector(".vc-title").textContent = title;
      const stage = backdrop.querySelector(".vc-stage");
      const img = backdrop.querySelector(".vc-img");
      const slider = backdrop.querySelector(".vc-zoom-slider");
      const cancelBtn = backdrop.querySelector(".vc-cancel");
      const saveBtn = backdrop.querySelector(".vc-save");

      stage.style.width = vw + "px";
      stage.style.height = vh + "px";
      if (shape === "circle") stage.style.borderRadius = "50%";

      // Optional safe-area outlines — drawn after the <img> so they
      // float above it. Skipped for circle shape (avatar) since circular
      // avatars get center-cover'd the same on every surface.
      if (safeAreaGuides.length && shape !== "circle") {
        for (let i = 0; i < safeAreaGuides.length; i++) {
          const g = safeAreaGuides[i];
          let widthPct = 1;
          let heightPct = 1;
          if (g.containerAspect > aspect) {
            heightPct = aspect / g.containerAspect;
          } else if (g.containerAspect < aspect) {
            widthPct = g.containerAspect / aspect;
          }
          const leftPct = (1 - widthPct) / 2;
          const topPct = (1 - heightPct) / 2;
          const guide = document.createElement("div");
          guide.setAttribute("aria-hidden", "true");
          guide.style.position = "absolute";
          guide.style.left = leftPct * 100 + "%";
          guide.style.top = topPct * 100 + "%";
          guide.style.width = widthPct * 100 + "%";
          guide.style.height = heightPct * 100 + "%";
          guide.style.border = "1.5px dashed " + g.color;
          guide.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.35) inset";
          guide.style.pointerEvents = "none";
          guide.style.borderRadius = "2px";
          const chip = document.createElement("span");
          chip.textContent = g.label;
          chip.style.position = "absolute";
          chip.style.top = "4px";
          chip.style.left = "4px";
          chip.style.background = g.color;
          chip.style.color = "#fff";
          chip.style.fontFamily = "'DM Sans', sans-serif";
          chip.style.fontSize = "9px";
          chip.style.fontWeight = "800";
          chip.style.letterSpacing = "0.04em";
          chip.style.textTransform = "uppercase";
          chip.style.padding = "2px 6px";
          chip.style.borderRadius = "999px";
          chip.style.whiteSpace = "nowrap";
          chip.style.lineHeight = "1";
          guide.appendChild(chip);
          stage.appendChild(guide);
        }
      }

      // Object URL for the picked file.
      const url = URL.createObjectURL(file);
      img.src = url;

      let imgW = 0;
      let imgH = 0;
      let scale = 1;
      let minScale = 1;
      let maxScale = 1;
      let pos = { x: 0, y: 0 };
      let dragOrigin = null;

      function applyTransform() {
        img.style.left = pos.x + "px";
        img.style.top = pos.y + "px";
        img.style.width = imgW * scale + "px";
        img.style.height = imgH * scale + "px";
      }

      function fitImage() {
        // "Cover" — image must fully fill the viewport. Pick the larger ratio.
        minScale = Math.max(vw / imgW, vh / imgH);
        maxScale = minScale * 4;
        scale = minScale;
        const dispW = imgW * scale;
        const dispH = imgH * scale;
        pos = { x: (vw - dispW) / 2, y: (vh - dispH) / 2 };
        slider.value = "0";
        applyTransform();
      }

      img.onload = function () {
        imgW = img.naturalWidth;
        imgH = img.naturalHeight;
        fitImage();
        saveBtn.disabled = false;
      };
      img.onerror = function () {
        // Fail silently — close and resolve null so the caller can recover.
        cleanup(null);
      };

      function clampPos(p, scl) {
        const dispW = imgW * scl;
        const dispH = imgH * scl;
        return {
          x: clamp(p.x, Math.min(vw - dispW, 0), 0),
          y: clamp(p.y, Math.min(vh - dispH, 0), 0),
        };
      }

      stage.addEventListener("pointerdown", function (e) {
        dragOrigin = { px: e.clientX, py: e.clientY, sx: pos.x, sy: pos.y };
        stage.classList.add("grabbing");
        try { stage.setPointerCapture(e.pointerId); } catch (_) {}
      });
      stage.addEventListener("pointermove", function (e) {
        if (!dragOrigin) return;
        pos = clampPos(
          {
            x: dragOrigin.sx + (e.clientX - dragOrigin.px),
            y: dragOrigin.sy + (e.clientY - dragOrigin.py),
          },
          scale,
        );
        applyTransform();
      });
      function endDrag(e) {
        dragOrigin = null;
        stage.classList.remove("grabbing");
        try { stage.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      stage.addEventListener("pointerup", endDrag);
      stage.addEventListener("pointercancel", endDrag);

      slider.addEventListener("input", function () {
        const v = parseFloat(slider.value);
        const newScale = minScale + (maxScale - minScale) * v;
        const cx = vw / 2;
        const cy = vh / 2;
        const ratio = newScale / scale;
        pos = clampPos(
          { x: cx - (cx - pos.x) * ratio, y: cy - (cy - pos.y) * ratio },
          newScale,
        );
        scale = newScale;
        applyTransform();
      });

      stage.addEventListener("wheel", function (e) {
        e.preventDefault();
        const next = clamp(scale * (1 + -e.deltaY * 0.001), minScale, maxScale);
        if (next === scale) return;
        const rect = stage.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const ratio = next / scale;
        pos = clampPos(
          { x: cx - (cx - pos.x) * ratio, y: cy - (cy - pos.y) * ratio },
          next,
        );
        scale = next;
        slider.value = String((next - minScale) / (maxScale - minScale || 1));
        applyTransform();
      }, { passive: false });

      // Click-outside closes (cancel).
      backdrop.addEventListener("click", function (e) {
        if (e.target === backdrop) cleanup(null);
      });
      cancelBtn.addEventListener("click", function () { cleanup(null); });

      saveBtn.addEventListener("click", async function () {
        if (!imgW || !imgH) return;
        saveBtn.disabled = true;
        cancelBtn.disabled = true;
        saveBtn.textContent = "Saving…";
        try {
          const blob = await renderCrop();
          cleanup(blob);
        } catch (_e) {
          cleanup(null);
        }
      });

      function renderCrop() {
        return new Promise(function (resolve, reject) {
          const srcX = -pos.x / scale;
          const srcY = -pos.y / scale;
          const srcW = vw / scale;
          const srcH = vh / scale;

          // Size output off the chosen outputMaxSize (cap at the source
          // image's native pixels — never upscale). Sizing off the
          // on-screen viewport caps output at ~540px and looks terrible
          // on retina, hence this fix.
          const viewportLongest = Math.max(vw, vh);
          const srcLongest = Math.max(srcW, srcH);
          const outLongest = Math.min(outputMaxSize, srcLongest);
          const outScale = outLongest / viewportLongest;
          const outW = Math.round(vw * outScale);
          const outH = Math.round(vh * outScale);

          const canvas = document.createElement("canvas");
          canvas.width = outW;
          canvas.height = outH;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("canvas not supported"));
            return;
          }
          // Use the existing in-DOM img (already loaded) to avoid a re-fetch.
          ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
          canvas.toBlob(
            function (b) { b ? resolve(b) : reject(new Error("encode failed")); },
            outputType,
            outputQuality,
          );
        });
      }

      function cleanup(result) {
        try { URL.revokeObjectURL(url); } catch (_) {}
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        document.body.style.overflow = prevOverflow;
        resolve(result);
      }

      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.body.appendChild(backdrop);
    });
  };
})();
