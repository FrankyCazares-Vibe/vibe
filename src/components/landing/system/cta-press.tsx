"use client";

import { useEffect, useRef } from "react";

/**
 * The buttons' press (Nov 25, 2026, "the sun rises": campaigns/2026-11-landing-revamp/buttons-motion/DECISION.md in
 * vibe-marketing). A press is a beat that plays to its end however short the tap, so a phone sees the whole idea:
 * - pointerdown: the pill presses in (.is-down, at least 100 ms) and the body sets (.is-set: it falls back into its
 *   place, lands with the drop's bounce, and the landing shows in its line; sign-up's lands with one ink ring).
 * - a touch has no hover, so it first hops the body up (.is-hop, --hopt) and then sets it, a little faster (.is-quick,
 *   --qfall), lit on the first frame.
 * - the beat lasts --fall plus the longer of --land and --beat (system.css), and ends after the release.
 * - pointercancel (a touch that becomes a scroll) before the landing: no bounce, no ring, the body goes back in
 *   200 ms (.is-cancel). After the landing it lets the beat finish, so nothing snaps.
 * - Enter on a focused button plays it too. Its keyup ends it wherever focus has gone (Shift+Enter opens a window, a
 *   mailto hands focus to the mail app), and so does the window losing focus or the page being hidden, so no press is
 *   ever left held.
 * Every change is a class on the link, so the movement stays on CSS transitions; with reduced motion it is only
 * fades. Without this script, :active plays a simpler press (system.css reads data-press on the root). It never
 * touches the full stop's glyph or data-here (coral-drop.tsx) or .fys-cta-echo (key-echo.tsx).
 */
const SEL = ".fys-cta, .fys-fine a";
const BEAT = ["is-down", "is-hop", "is-set", "is-quick", "is-cancel"];
type Beat = { down: boolean; end: number; landAt: number; t: number; up: number; since: number };

export function CtaPress() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = marker.current?.closest<HTMLElement>(".fys-root");
    if (!root) return;
    root.dataset.press = "";
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const beats = new Map<HTMLElement, Beat>(), byPointer = new Map<number, HTMLElement>();
    // a time from system.css, in ms: the build's minifier writes some of them in seconds (".13s")
    const num = (a: HTMLElement, name: string) => {
      const v = getComputedStyle(a).getPropertyValue(name).trim(), n = parseFloat(v) || 0;
      return v.endsWith("ms") ? n : v.endsWith("s") ? n * 1000 : n;
    };
    const clear = (b: Beat) => { window.clearTimeout(b.t); window.clearTimeout(b.up); };

    const press = (a: HTMLElement, hop: boolean) => {
      const old = beats.get(a);
      if (old) clear(old);
      const b: Beat = { down: true, end: 0, landAt: 0, t: 0, up: 0, since: performance.now() };
      beats.set(a, b);
      // a new beat restarts the landing
      if (a.classList.contains("is-set")) { a.classList.remove(...BEAT); void a.offsetWidth; }
      else a.classList.remove("is-cancel");
      a.classList.add("is-down");
      const set = () => {
        if (beats.get(a) !== b) return;   // a newer beat on this button took over
        a.classList.remove("is-hop");
        a.classList.add("is-set");
        if (hop) a.classList.add("is-quick");
        const fall = still.matches ? 0 : num(a, "--fall");
        b.landAt = performance.now() + fall;
        b.end = still.matches ? b.landAt : b.landAt + Math.max(num(a, "--land"), num(a, "--beat"));
      };
      if (hop && !still.matches) { a.classList.add("is-hop"); b.t = window.setTimeout(set, num(a, "--hopt")); }
      else set();
    };
    const finish = (a: HTMLElement, b: Beat) => {
      if (beats.get(a) !== b || b.down) return;
      const left = b.end ? b.end - performance.now() : 16;
      if (left > 0) { b.t = window.setTimeout(() => finish(a, b), left); return; }
      a.classList.remove(...BEAT);
      beats.delete(a);
    };
    const release = (a: HTMLElement, cancel: boolean) => {
      const b = beats.get(a);
      if (!b || !b.down) return;
      b.down = false;
      // the pill stays in for at least 100 ms, so a quick tap still shows it
      b.up = window.setTimeout(() => { if (beats.get(a) === b && !b.down) a.classList.remove("is-down"); }, Math.max(0, 100 - (performance.now() - b.since)));
      if (cancel && (!b.landAt || performance.now() < b.landAt)) {
        // not landed yet: no bounce, no ring, the body goes back the short way
        clear(b);
        a.classList.remove("is-down", "is-hop", "is-set", "is-quick");
        a.classList.add("is-cancel");
        b.t = window.setTimeout(() => { if (beats.get(a) === b) { a.classList.remove("is-cancel"); beats.delete(a); } }, 360);
        return;
      }
      finish(a, b);
    };

    const onDown = (e: PointerEvent) => {
      const a = (e.target as Element | null)?.closest?.<HTMLElement>(SEL);
      if (!a || !root.contains(a) || !e.isPrimary || e.button !== 0) return;
      byPointer.set(e.pointerId, a);
      press(a, e.pointerType !== "mouse");
    };
    const onUp = (cancel: boolean) => (e: PointerEvent) => {
      const a = byPointer.get(e.pointerId);
      if (!a) return;
      byPointer.delete(e.pointerId);
      release(a, cancel);
    };
    const onPointerUp = onUp(false), onPointerCancel = onUp(true);
    const onOut = (e: PointerEvent) => {
      const a = byPointer.get(e.pointerId);
      if (a && e.pointerType === "mouse" && !a.contains(e.relatedTarget as Node | null)) { byPointer.delete(e.pointerId); release(a, true); }
    };
    let keyed: HTMLElement | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat) return;
      const a = document.activeElement as HTMLElement | null;
      if (a?.matches(SEL) && root.contains(a)) { keyed = a; press(a, !a.matches(":focus-visible")); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !keyed) return;
      const a = keyed;
      keyed = null;
      release(a, false);
    };
    // the window lost focus or the page was hidden mid-press: the key or button may never come up here
    const letGo = () => {
      keyed = null;
      byPointer.clear();
      beats.forEach((b, a) => { if (b.down) release(a, false); });
    };
    const onHidden = () => { if (document.hidden) letGo(); };

    document.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    document.addEventListener("pointerout", onOut, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", letGo);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      document.removeEventListener("pointerout", onOut, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", letGo);
      document.removeEventListener("visibilitychange", onHidden);
      beats.forEach((b, a) => { clear(b); a.classList.remove(...BEAT); });
      beats.clear();
      byPointer.clear();
      delete root.dataset.press;
    };
  }, []);
  return <span ref={marker} hidden />;
}
