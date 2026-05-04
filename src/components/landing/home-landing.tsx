"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";

import { getAppShellHomeHref } from "@/lib/feature-flags";

declare global {
  interface Window {
    vibePersist?: { seedDemoData?: () => void };
  }
}

function loadPersistenceScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.vibePersist?.seedDemoData) {
      resolve();
      return;
    }
    const existing = document.querySelector(
      'script[src="/html/_persistence.js"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = "/html/_persistence.js";
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("persistence load failed"));
    document.head.appendChild(s);
  });
}

export function HomeLanding() {
  const curRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cur = curRef.current;
    const ring = ringRef.current;
    if (!cur || !ring) return;
    const cursorEl = cur;
    const ringEl = ring;

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let rx = mx;
    let ry = my;
    let raf = 0;

    cursorEl.style.transform = `translate(${mx - 4}px, ${my - 4}px)`;
    ringEl.style.transform = `translate(${Math.round(rx)}px, ${Math.round(ry)}px)`;

    function onMove(e: MouseEvent) {
      mx = e.clientX;
      my = e.clientY;
      cursorEl.style.transform = `translate(${mx - 4}px, ${my - 4}px)`;
    }

    function tick() {
      rx += (mx - rx - 14) * 0.28;
      ry += (my - ry - 14) * 0.28;
      ringEl.style.transform = `translate(${Math.round(rx)}px, ${Math.round(ry)}px)`;
      raf = requestAnimationFrame(tick);
    }

    const HOVER = "a, button";
    function onOver(e: MouseEvent) {
      if ((e.target as Element | null)?.closest(HOVER)) {
        cursorEl.classList.add("hover");
        ringEl.classList.add("hover");
      }
    }
    function onOut(e: MouseEvent) {
      if ((e.target as Element | null)?.closest(HOVER)) {
        cursorEl.classList.remove("hover");
        ringEl.classList.remove("hover");
      }
    }

    function onDown() {
      cursorEl.classList.add("clicking");
    }
    function onUp() {
      cursorEl.classList.remove("clicking");
    }

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
    };
  }, []);

  const enterDemo = useCallback(async () => {
    try {
      await loadPersistenceScript();
      window.vibePersist?.seedDemoData?.();
    } catch {
      /* still send them into the shell */
    }
    window.location.href = getAppShellHomeHref();
  }, []);

  return (
    <div
      className="relative min-h-screen selection:bg-[#FF5C35]/25"
      style={{
        background: "#FAF7F2",
        color: "#1C1C1E",
        cursor: "none",
        overflow: "hidden",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        ref={curRef}
        className="vibe-home-cursor vibe-home-cursor--core"
      />
      <div
        ref={ringRef}
        className="vibe-home-cursor vibe-home-cursor--ring"
      />

      <div
        className="grid min-h-screen"
        style={{
          gridTemplateRows: "auto 1fr auto",
          padding: "28px 40px",
        }}
      >
        <header className="flex items-center justify-between">
          <span
            className="text-2xl font-black tracking-tight"
            style={{ fontFamily: "'Fraunces', serif" }}
          >
            vibe<span style={{ color: "#FF5C35" }}>.</span>
          </span>
          <span
            className="text-[11px] font-bold uppercase tracking-[0.15em]"
            style={{ color: "#8A8580" }}
          >
            Prototype
          </span>
        </header>

        <main className="flex flex-col items-center justify-center px-6 text-center">
          <div
            className="mb-7 inline-flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "#FF5C35" }}
          >
            <span
              className="inline-block h-px w-[22px]"
              style={{ background: "#FF5C35" }}
            />
            Welcome
            <span
              className="inline-block h-px w-[22px]"
              style={{ background: "#FF5C35" }}
            />
          </div>
          <h1
            className="mb-6 max-w-[900px] font-black leading-[0.98] tracking-[-3px]"
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: "clamp(48px, 7vw, 88px)",
            }}
          >
            The network where your{" "}
            <em className="not-italic" style={{ color: "#FF5C35" }}>
              AI agent
            </em>{" "}
            lives.
          </h1>
          <p
            className="mb-12 max-w-[540px] text-[19px] italic leading-relaxed"
            style={{
              fontFamily: "'Fraunces', serif",
              color: "#8A8580",
            }}
          >
            Your campus, your career, one profile.
          </p>

          <div className="mb-9 flex flex-wrap items-center justify-center gap-3.5">
            <button
              type="button"
              className="inline-flex items-center gap-2.5 rounded-full border border-solid px-[30px] py-4 text-sm font-semibold transition-all duration-150"
              style={{
                background: "#1C1C1E",
                color: "white",
                borderColor: "#1C1C1E",
                cursor: "none",
              }}
              onMouseEnter={(e) => {
                const t = e.currentTarget;
                t.style.background = "#FF5C35";
                t.style.borderColor = "#FF5C35";
                t.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                const t = e.currentTarget;
                t.style.background = "#1C1C1E";
                t.style.borderColor = "#1C1C1E";
                t.style.transform = "";
              }}
              onClick={enterDemo}
            >
              View demo site
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
                →
              </span>
            </button>

            <Link
              href="/auth/signup"
              prefetch
              className="inline-flex items-center gap-2.5 rounded-full border border-solid px-[30px] py-4 text-sm font-semibold transition-all duration-150 no-underline"
              style={{
                background: "white",
                color: "#1C1C1E",
                borderColor: "rgba(28,28,30,.08)",
                cursor: "none",
              }}
              onMouseEnter={(e) => {
                const t = e.currentTarget;
                t.style.borderColor = "#1C1C1E";
                t.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                const t = e.currentTarget;
                t.style.borderColor = "rgba(28,28,30,.08)";
                t.style.transform = "";
              }}
            >
              Create your profile
            </Link>
          </div>

          <p
            className="max-w-[480px] text-xs leading-relaxed"
            style={{ color: "#8A8580" }}
          >
            <strong style={{ color: "#1C1C1E" }}>View demo site</strong> loads
            the prototype.{" "}
            <strong style={{ color: "#1C1C1E" }}>Create your profile</strong>{" "}
            goes to <strong>sign up</strong> (your login email). Confirm that
            inbox first; then verify your <strong>.edu</strong> school email, then
            meet Otto to fill your profile.
          </p>
        </main>

        <div
          className="fixed bottom-7 right-8 flex items-center gap-2.5 text-[13px] italic"
          style={{
            fontFamily: "'Fraunces', serif",
            color: "#8A8580",
          }}
        >
          <span className="relative flex h-[18px] w-[18px] items-center justify-center">
            <span
              className="absolute inset-0 rounded-full border"
              style={{
                borderColor: "rgba(255,92,53,.4)",
                animation: "vibe-home-otto-ring 2.6s ease-out infinite",
              }}
            />
            <span
              className="relative rounded-full"
              style={{
                width: 8,
                height: 8,
                background: "#FF5C35",
                boxShadow: "0 0 10px rgba(255,92,53,.6)",
                animation: "vibe-home-otto-breathe 2.6s ease-in-out infinite",
              }}
            />
          </span>
          <span>otto · idle</span>
        </div>

        <footer className="flex items-center justify-between text-[11px] text-[#8A8580]">
          <span>vibe · prototype</span>
          <span>early access</span>
        </footer>
      </div>
    </div>
  );
}
