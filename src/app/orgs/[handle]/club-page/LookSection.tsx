"use client";

/**
 * Edit page's Look section and Name field (Oct 22, 2026, Franky: "the
 * picker in the Edit page on phone and computer, and the Name field"),
 * built to the boards LookDesktop and LookPhone
 * (handoffs/2026-10-22-club-tools-arc/PLAN-4.md K2). EditPageModal
 * (admin-actions.tsx) holds the draft and saves it; look-section.ts is the
 * pure half.
 *
 * - Photo and Cover: today's "Change photo" and "Change cover", moved here
 *   beside the picture they change. A hidden club has neither (the officer
 *   bar never offered them there), but it keeps Background: that only
 *   paints its own page.
 * - Background: what the picker offers from the one list (`pickerBackdrops`,
 *   src/lib/orgs/backdrops.ts), as one radio group: one Tab stop, arrows,
 *   Home and End. The one that is on has a ring and a check, never colour
 *   alone; its name sits under the group.
 * - The club page behind repaints as you pick (`useBackdropPreview`). On a
 *   phone the sheet covers it, so a preview card at the top shows the cover,
 *   logo, name and @handle on the chosen background.
 *
 * Its classes are globals.css "The Edit page's Look section"; colours are
 * theme tokens, which read as Night inside the dialog's vibe-night-island.
 */
import { type CSSProperties, type Ref, useCallback, useEffect, useId, useRef, useState } from "react";

import { type Backdrop, DEFAULT_BACKDROP, backdropFor } from "@/lib/orgs/backdrops";

import { NAME_MAX, backdropName, radioStep } from "./look-section";

/**
 * Repaints the club page behind while Edit page is open. The page's <main>
 * paints `var(--club-backdrop)` and carries `data-club-backdrop` (page.tsx);
 * whatever it held when Edit page opened goes back when it closes without a
 * save (Cancel, ×, Escape, a tap outside, a picture upload that closes it).
 * Call the returned `keep` after a save: the new background stays until the
 * refreshed page paints the same one itself.
 */
export function useBackdropPreview(css: string): () => void {
  const original = useRef<{ el: HTMLElement; value: string } | null>(null);
  const kept = useRef(false);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>("[data-club-backdrop]");
    if (!el) return;
    if (original.current?.el !== el) {
      original.current = { el, value: el.style.getPropertyValue("--club-backdrop") };
    }
    el.style.setProperty("--club-backdrop", css);
  }, [css]);

  useEffect(
    () => () => {
      const o = original.current;
      if (!o || kept.current || !o.el.isConnected) return;
      if (o.value) o.el.style.setProperty("--club-backdrop", o.value);
      else o.el.style.removeProperty("--club-backdrop");
    },
    [],
  );

  return useCallback(() => {
    kept.current = true;
  }, []);
}

type AssetKind = "logo" | "banner";

export function LookSection({
  phone,
  name,
  handle,
  description,
  logoUrl,
  bannerUrl,
  offered,
  value,
  onChange,
  onChangeAsset,
  error,
}: {
  phone: boolean;
  /** The draft name and description, for the phone's preview card. */
  name: string;
  handle: string;
  description: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  offered: readonly Backdrop[];
  /** The picked key (look-section.ts `openingBackdrop` when it opens). */
  value: string;
  onChange: (key: Backdrop["key"]) => void;
  /** Left out on a hidden club: no photo or cover there. */
  onChangeAsset?: (kind: AssetKind) => void;
  /** The route's refusal of the background, shown under the picker. */
  error: string | null;
}) {
  const titleId = useId();
  const current = backdropFor(value);
  return (
    <section aria-labelledby={titleId} className="vibe-look" data-phone={phone ? "" : undefined}>
      {phone ? (
        <h3 id={titleId} className="vibe-look-eyebrow">
          Look
        </h3>
      ) : (
        <div>
          <h3 id={titleId} className="vibe-look-title">
            Look
          </h3>
          <p className="vibe-look-lede">
            {onChangeAsset
              ? "Photo, cover and background. The page on the left changes as you pick."
              : "Your page's background. The page on the left changes as you pick."}
          </p>
        </div>
      )}

      {phone ? (
        <LookPreview
          css={current.css}
          label={current.label}
          name={name}
          handle={handle}
          description={description}
          logoUrl={logoUrl}
          bannerUrl={bannerUrl}
        />
      ) : null}

      {onChangeAsset ? (
        <AssetRows phone={phone} name={name} logoUrl={logoUrl} bannerUrl={bannerUrl} onChangeAsset={onChangeAsset} />
      ) : null}

      <BackgroundPicker phone={phone} offered={offered} value={value} onChange={onChange} error={error} />
    </section>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}

/** The club's logo as the header draws it (ClubHeader.tsx): the picture, or initials on coral into violet. */
function logoPaint(logoUrl: string | null): CSSProperties {
  return {
    background: logoUrl ? `url("${logoUrl}") center/cover` : "linear-gradient(135deg, #FF5C35 0%, #7B5FE0 100%)",
  };
}

/** The cover as the page draws it (ClubCover): the 3:1 picture, or the soft glass. */
function coverPaint(bannerUrl: string | null): CSSProperties {
  return {
    background: bannerUrl
      ? `url("${bannerUrl}") center/cover`
      : "linear-gradient(135deg, rgba(var(--scrim-rgb),0.12) 0%, rgba(var(--scrim-rgb),0.04) 100%)",
  };
}

/**
 * Photo and Cover. A computer gets the board's two rows (the picture, what
 * it is, a pill); a phone gets one grouped list with a chevron on each row.
 */
function AssetRows({
  phone,
  name,
  logoUrl,
  bannerUrl,
  onChangeAsset,
}: {
  phone: boolean;
  name: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  onChangeAsset: (kind: AssetKind) => void;
}) {
  const logoInitials = logoUrl ? null : initials(name);
  if (phone) {
    return (
      <div className="vibe-look-list">
        <button type="button" className="vibe-look-row" onClick={() => onChangeAsset("logo")}>
          <span aria-hidden className="vibe-look-row-thumb">
            <span className="vibe-look-mini-logo" style={logoPaint(logoUrl)}>
              {logoInitials}
            </span>
          </span>
          <span className="vibe-look-row-label">Change photo</span>
          <span className="vibe-look-row-sub">Square</span>
          <ChevronGlyph />
        </button>
        <span aria-hidden className="vibe-look-row-rule" />
        <button type="button" className="vibe-look-row" onClick={() => onChangeAsset("banner")}>
          <span aria-hidden className="vibe-look-row-thumb">
            <span className="vibe-look-mini-cover" style={coverPaint(bannerUrl)} />
          </span>
          <span className="vibe-look-row-label">Change cover</span>
          <span className="vibe-look-row-sub">Wide, 3 to 1</span>
          <ChevronGlyph />
        </button>
      </div>
    );
  }
  return (
    <div className="vibe-look-assets">
      <div className="vibe-look-asset">
        <span aria-hidden className="vibe-look-asset-logo" style={logoPaint(logoUrl)}>
          {logoInitials}
        </span>
        <span className="vibe-look-asset-text">
          <span className="vibe-look-asset-title">Photo</span>
          <span className="vibe-look-asset-sub">Your club&apos;s logo</span>
        </span>
        <button type="button" className="vibe-look-pill vibe-press" onClick={() => onChangeAsset("logo")}>
          Change photo
        </button>
      </div>
      <div className="vibe-look-asset">
        <span aria-hidden className="vibe-look-asset-cover" style={coverPaint(bannerUrl)} />
        <span className="vibe-look-asset-text">
          <span className="vibe-look-asset-title">Cover</span>
          <span className="vibe-look-asset-sub">Crops to 3:1</span>
        </span>
        <button type="button" className="vibe-look-pill vibe-press" onClick={() => onChangeAsset("banner")}>
          Change cover
        </button>
      </div>
    </div>
  );
}

/**
 * The backgrounds as one radio group, moved through like
 * EventVisibilityField (campus-home.tsx): the one that is on is the Tab
 * stop (the first, when the stored key isn't offered), and an arrow both
 * picks and focuses. Each swatch is the gradient itself, 44px or more.
 */
function BackgroundPicker({
  phone,
  offered,
  value,
  onChange,
  error,
}: {
  phone: boolean;
  offered: readonly Backdrop[];
  value: string;
  onChange: (key: Backdrop["key"]) => void;
  error: string | null;
}) {
  const labelId = useId();
  const helpId = useId();
  const errorId = useId();
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());
  const errorRef = useRef<HTMLDivElement | null>(null);
  const at = offered.findIndex((b) => b.key === value);
  const line = backdropName(backdropFor(value), DEFAULT_BACKDROP);

  // A refusal arrives after Save, often with the picker scrolled out of
  // sight above: bring its line into view (no smooth scroll to switch off).
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const to = radioStep(e.key, at, offered.length);
    if (to === null) return;
    e.preventDefault();
    const next = offered[to];
    onChange(next.key);
    buttons.current.get(next.key)?.focus();
  };

  return (
    <div className="vibe-look-background">
      <div id={labelId} className="vibe-look-label">
        Background
      </div>
      <div id={helpId} className="vibe-look-help">
        {phone
          ? "Dark in Light and Night, so words stay easy to read."
          : "Everyone sees it behind your page, in Light and Night."}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={error ? `${helpId} ${errorId}` : helpId}
        onKeyDown={onKeyDown}
        className="vibe-look-grid"
      >
        {offered.map((b, i) => {
          const on = b.key === value;
          return (
            <button
              key={b.key}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={backdropName(b, DEFAULT_BACKDROP).spoken}
              tabIndex={on || (at < 0 && i === 0) ? 0 : -1}
              className="vibe-look-swatch vibe-press"
              ref={(el) => {
                buttons.current.set(b.key, el);
              }}
              onClick={() => onChange(b.key)}
            >
              <span aria-hidden className="vibe-look-ring" />
              <span aria-hidden className="vibe-look-face" style={{ background: b.css }} />
              {phone ? null : (
                <span aria-hidden className="vibe-look-swatch-name">
                  {b.label}
                </span>
              )}
              <span aria-hidden className="vibe-look-check">
                <CheckGlyph />
              </span>
            </button>
          );
        })}
      </div>
      {/* Keyed, so the name fades in again each time another is picked. */}
      <div key={value} className="vibe-look-chosen">
        <span className="vibe-look-chosen-name">{line.name}</span>
        {line.tag ? <span className="vibe-look-chosen-tag">{`· ${line.tag}`}</span> : null}
      </div>
      {error ? (
        <div ref={errorRef} id={errorId} role="alert" className="vibe-look-error">
          {error}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The phone's preview card: the cover strip, the logo, the name and @handle
 * on the chosen background, as the top of the page would show them. The
 * new background fades in over the last one (opacity only).
 */
function LookPreview({
  css,
  label,
  name,
  handle,
  description,
  logoUrl,
  bannerUrl,
}: {
  css: string;
  label: string;
  name: string;
  handle: string;
  description: string;
  logoUrl: string | null;
  bannerUrl: string | null;
}) {
  // The last background stays under the new one while it fades in.
  const [paint, setPaint] = useState({ under: css, over: css, turn: 0 });
  if (paint.over !== css) setPaint({ under: paint.over, over: css, turn: paint.turn + 1 });
  const shownName = name.trim();
  const blurb = description.trim();
  return (
    <div className="vibe-look-preview" role="img" aria-label={`Preview: ${shownName || "your club"} on ${label}`}>
      <span aria-hidden className="vibe-look-preview-paint" style={{ background: paint.under }} />
      <span aria-hidden key={paint.turn} className="vibe-look-preview-paint vibe-look-fade" style={{ background: paint.over }} />
      <span aria-hidden className="vibe-look-preview-cover" style={coverPaint(bannerUrl)}>
        <span className="vibe-look-preview-tag">Preview</span>
      </span>
      <span aria-hidden className="vibe-look-preview-logo" style={logoPaint(logoUrl)}>
        {logoUrl ? null : initials(shownName)}
      </span>
      <span aria-hidden className="vibe-look-preview-id">
        <span className="vibe-look-preview-name">{shownName || " "}</span>
        <span className="vibe-look-preview-handle">@{handle}</span>
      </span>
      {blurb ? (
        <span aria-hidden className="vibe-look-preview-blurb">
          {blurb}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The second part of Edit page. On a computer the board's serif "About";
 * on a phone the same small capitals as "Look".
 */
export function AboutHeading({ phone }: { phone: boolean }) {
  return (
    <div className="vibe-look-about" data-phone={phone ? "" : undefined}>
      <span aria-hidden className="vibe-look-rule" />
      {phone ? (
        <h3 className="vibe-look-eyebrow">About</h3>
      ) : (
        <>
          <h3 className="vibe-look-about-title">About</h3>
          <p className="vibe-look-help">Name, description, links, when you meet…</p>
        </>
      )}
    </div>
  );
}

/**
 * The club's name, the first field of About (renaming was only in the old
 * desktop window). 2 to 50 characters, the count beside the label as on the
 * board; the route's word filter answers inline here, never as a banner.
 */
export function NameField({
  value,
  onChange,
  error,
  inputRef,
}: {
  value: string;
  onChange: (next: string) => void;
  error: string | null;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const inputId = useId();
  const countId = useId();
  const errorId = useId();
  return (
    <div className="vibe-look-field">
      <div className="vibe-look-field-row">
        <label htmlFor={inputId} className="vibe-look-field-label">
          Name
        </label>
        <span id={countId} className="vibe-look-count">{`${value.length}/${NAME_MAX}`}</span>
      </div>
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        value={value}
        maxLength={NAME_MAX}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        enterKeyHint="next"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${countId} ${errorId}` : countId}
        className="vibe-look-input"
      />
      {/* An alert, so it is heard: Save focuses the field before this line
          renders, so the field's description alone would come too late. */}
      {error ? (
        <div id={errorId} role="alert" className="vibe-look-error">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function ChevronGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="vibe-look-chevron">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
