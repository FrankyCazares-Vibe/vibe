"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { DeskClub, DeskModel } from "@/lib/otto/desk";

import { DeskClubMark } from "./desk/DeskDraft";

/**
 * "Acting as" on the computer desk (Wave 2A, Nov 10, 2026). The clubs come
 * from the desk model itself (`desk.clubs`, the clubs the person owns or is
 * an officer of), plus "You" for their own desk (`?club=me`). Picking one
 * reads the desk again for it. It shows only for people who run a club.
 *
 * A small menu under the chip, not the phone's sheet (ClubSwitcherSheet
 * moves the phone's Profile tab and opens /profile; this changes only the
 * desk, and the URL keeps the pick).
 */

const ROLE: Record<DeskClub["role"], string> = { owner: "Owner", officer: "Officer" };

/** The tick on the row you act as now (a shape, so the pick never rests on a fill alone). */
function Tick({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <svg className="dk-ico odc-as-tick" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function OttoDeskActingAs({
  desk,
  busy,
  onPick,
}: {
  desk: DeskModel;
  busy: boolean;
  onPick: (club: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (desk.clubs.length === 0) return null;
  const now = desk.actingAs;

  const pick = (club: string) => {
    setOpen(false);
    const same = club === "me" ? now === null : now?.handle === club;
    if (!same) onPick(club);
  };

  return (
    <div className="odc-as" ref={wrap}>
      <button
        type="button"
        className="dk-btn odc-as-btn"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        aria-busy={busy || undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {now ? <DeskClubMark club={now} /> : null}
        <span>
          Acting as <b>{now ? now.name : "You"}</b>
        </span>
        <svg className="dk-ico odc-as-chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div id={menuId} className="tx-host dk-card odc-as-menu" role="group" aria-label="Act as">
          <i className="tx tx-paper" aria-hidden="true" />
          <button type="button" className="odc-as-row" aria-pressed={now === null} onClick={() => pick("me")}>
            <span className="dk-club odc-as-you" aria-hidden="true">
              <svg className="dk-ico" viewBox="0 0 24 24" focusable="false">
                <circle cx="12" cy="8" r="4" />
                <path d="M4.5 20.5c1.4-3.9 4.3-5.8 7.5-5.8s6.1 1.9 7.5 5.8" />
              </svg>
            </span>
            <span className="odc-as-tx">
              <b>You</b>
              <span>Your own desk</span>
            </span>
            <Tick on={now === null} />
          </button>
          {desk.clubs.map((c) => (
            <button
              key={c.orgId}
              type="button"
              className="odc-as-row"
              aria-pressed={now?.orgId === c.orgId}
              onClick={() => pick(c.handle)}
            >
              <DeskClubMark club={c} />
              <span className="odc-as-tx">
                <b>{c.name}</b>
                <span>{ROLE[c.role]}</span>
              </span>
              <Tick on={now?.orgId === c.orgId} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
