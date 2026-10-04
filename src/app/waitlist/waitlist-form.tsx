"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SCHOOL_DOMAINS_HEADLINE_LABEL } from "@/lib/auth/school-email-domains";
import { vibeRequest } from "@/lib/feedback/request";
import {
  parseWaitlistForm,
  WAITLIST_LIMITS,
  WAITLIST_YEAR_OPTIONS,
  type WaitlistFormInput,
} from "@/lib/waitlist/form";
import { WAITLIST_RETENTION_DAYS, type WaitlistSubmitResponse } from "@/lib/waitlist/types";

import { WaitlistDone } from "./waitlist-done";

type Field = keyof WaitlistFormInput | "form";
type Problem = { field: Field; error: string };

type Values = {
  email: string;
  name: string;
  /** "pick" until they choose; "" is "Prefer not to say". */
  year: string;
  major: string;
  clubs: string;
  isOfficer: boolean;
  officerClub: string;
  wish: string;
  consentAge: boolean;
  consentInvite: boolean;
  consentNews: boolean;
  website: string;
};

const FIELDS: readonly Field[] = [
  "email", "name", "classYear", "major", "clubs", "isOfficer", "officerClub", "wish",
  "consentAge", "consentInvite", "consentNews", "source", "website",
];

/**
 * The waitlist form (founder decision 3): school email, name, year, major,
 * clubs, one optional line, "I run a club", the consents, a hidden honeypot
 * and the page's `?src=` tag. It checks with the same parser the route uses
 * (src/lib/waitlist/form.ts) before posting, so a person sees a problem at
 * once and the route still refuses anything the page let through.
 */
export function WaitlistForm({ source, officer }: { source: string | null; officer: boolean }) {
  const [v, setV] = useState<Values>({
    email: "", name: "", year: "pick", major: "", clubs: "", isOfficer: officer, officerClub: "",
    wish: "", consentAge: false, consentInvite: false, consentNews: false, website: "",
  });
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const [focusAsk, setFocusAsk] = useState<{ field: Field; n: number } | null>(null);

  // The cursor follows the problem: to the field it names, or the button.
  useEffect(() => {
    if (!focusAsk) return;
    const el = form.current?.querySelector<HTMLElement>(`[name="${focusAsk.field}"]`)
      ?? form.current?.querySelector<HTMLElement>('[type="submit"]');
    el?.focus();
  }, [focusAsk]);

  // After a submit the heading of the new view takes focus.
  useEffect(() => {
    if (sentTo) document.getElementById("vwl-done-title")?.focus();
  }, [sentTo]);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
    setProblem((p) => (p && (p.field === key || (key === "year" && p.field === "classYear")) ? null : p));
  }

  function fail(field: Field, error: string) {
    setProblem({ field, error });
    setFocusAsk((prev) => ({ field, n: (prev?.n ?? 0) + 1 }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const body: WaitlistFormInput = {
      email: v.email,
      name: v.name,
      classYear: v.year === "pick" || v.year === "" ? null : Number(v.year),
      major: v.major,
      clubs: v.clubs,
      isOfficer: v.isOfficer,
      officerClub: v.isOfficer ? v.officerClub : "",
      wish: v.wish,
      consentAge: v.consentAge,
      consentInvite: v.consentInvite,
      consentNews: v.consentNews,
      ...(source ? { source } : {}),
      website: v.website,
    };
    const checked = parseWaitlistForm(body);
    if (!checked.ok) return fail(checked.field, checked.error);
    setBusy(true);
    setProblem(null);
    const r = await vibeRequest<WaitlistSubmitResponse>("/api/waitlist", {
      method: "POST",
      json: body,
      failure: "Couldn't add you to the waitlist. Try again in a minute.",
      quiet: true,
    });
    setBusy(false);
    if (r.ok) {
      setSentTo(checked.value.email);
      window.scrollTo({ top: 0 });
      return;
    }
    // A 400 names the field and says what to fix, in the parser's words.
    const field = r.status === 400 && r.field && (FIELDS as readonly string[]).includes(r.field) ? (r.field as Field) : "form";
    // The route's own sentence for input (400) and for "not available" (503).
    fail(field, (r.status === 400 || r.status === 503) && r.error ? r.error : r.message);
  }

  if (sentTo) return <WaitlistDone email={sentTo} onStartOver={() => setSentTo(null)} />;

  const err = (field: Field) => (problem?.field === field ? problem.error : null);
  const errProps = (field: Field) =>
    problem?.field === field ? { "aria-invalid": true as const, "aria-describedby": `vwl-err-${field}` } : {};
  const errLine = (field: Field) =>
    err(field) ? <span id={`vwl-err-${field}`} className="vwl-error" role="alert">{err(field)}</span> : null;

  return (
    <section className="vln-panel" aria-labelledby="vwl-title">
      <header className="vln-panel-head">
        <b>01</b>
        <span>{officer ? "For clubs" : "The waitlist"}</span>
        <em><span>IU · Purdue</span></em>
      </header>
      {/* Draft words for Franky. */}
      <h1 id="vwl-title">{officer ? "Bring your club." : "Join the waitlist."}</h1>
      <p>
        {officer
          ? "Club officers go first. Leave your school email and a few answers, and we’ll set up your club’s page with you before your members arrive."
          : "Vibe is opening in waves. Leave your school email and a few answers, and we’ll send you an access code when it’s your turn."}
      </p>

      <form ref={form} className="vwl-form" onSubmit={onSubmit} noValidate>
        <label className="vwl-field">
          <span className="vwl-label">School email <small>{SCHOOL_DOMAINS_HEADLINE_LABEL}</small></span>
          <input name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
            maxLength={WAITLIST_LIMITS.email} placeholder="you@iu.edu" value={v.email}
            onChange={(e) => set("email", e.target.value)} className="vwl-input" {...errProps("email")} />
          {errLine("email")}
        </label>
        <div className="vwl-row">
          <label className="vwl-field">
            <span className="vwl-label">Name</span>
            <input name="name" type="text" autoComplete="given-name" maxLength={WAITLIST_LIMITS.name} value={v.name}
              onChange={(e) => set("name", e.target.value)} className="vwl-input" {...errProps("name")} />
            {errLine("name")}
          </label>
          <label className="vwl-field">
            <span className="vwl-label">Year <small>optional</small></span>
            <select name="classYear" value={v.year} onChange={(e) => set("year", e.target.value)} className="vwl-input" {...errProps("classYear")}>
              <option value="pick" disabled>Pick one</option>
              {WAITLIST_YEAR_OPTIONS.map((o) => <option key={o.value || "none"} value={o.value}>{o.label}</option>)}
            </select>
            {errLine("classYear")}
          </label>
        </div>
        <label className="vwl-field">
          <span className="vwl-label">Major <small>optional</small></span>
          <input name="major" type="text" maxLength={WAITLIST_LIMITS.major} value={v.major}
            onChange={(e) => set("major", e.target.value)} className="vwl-input" {...errProps("major")} />
          {errLine("major")}
        </label>
        <label className="vwl-field">
          <span className="vwl-label">Clubs you’re in <small>optional</small></span>
          <input name="clubs" type="text" maxLength={WAITLIST_LIMITS.clubs} placeholder="Chess Club, Dance Marathon" value={v.clubs}
            onChange={(e) => set("clubs", e.target.value)} className="vwl-input" {...errProps("clubs")} />
          {errLine("clubs")}
        </label>

        <label className="vwl-check">
          <input name="isOfficer" type="checkbox" checked={v.isOfficer} onChange={(e) => set("isOfficer", e.target.checked)} />
          <span>I run a club <small>or help run one. Officers go first.</small></span>
        </label>
        {v.isOfficer ? (
          <div className="vwl-officer">
            <label className="vwl-field">
              <span className="vwl-label">Which club? <small>optional</small></span>
              <input name="officerClub" type="text" maxLength={WAITLIST_LIMITS.officerClub} value={v.officerClub}
                onChange={(e) => set("officerClub", e.target.value)} className="vwl-input" {...errProps("officerClub")} />
              {errLine("officerClub")}
            </label>
          </div>
        ) : null}

        <label className="vwl-field">
          <span className="vwl-label">What would you want from Vibe? <small>optional</small></span>
          <input name="wish" type="text" maxLength={WAITLIST_LIMITS.wish} placeholder="One line is plenty" value={v.wish}
            onChange={(e) => set("wish", e.target.value)} className="vwl-input" {...errProps("wish")} />
          {errLine("wish")}
        </label>

        {/* The short notice. The full one is section 11 of the Privacy Policy
            (/legal/privacy#waitlist): keep the days and the providers the same in both. */}
        <p className="vwl-notice">
          We collect your school email, your name and the answers above to confirm your spot, choose who gets in
          each wave and email you when it’s your turn. Supabase stores them, Vercel runs the site and Resend sends
          our emails. {`We keep your answers for up to ${WAITLIST_RETENTION_DAYS} days.`} Every email we send has a
          link to take you off the list sooner, which deletes your answers.{" "}
          <Link href="/legal/privacy#waitlist" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>
        </p>
        <div className="vwl-consents">
          <label className="vwl-check">
            <input name="consentAge" type="checkbox" checked={v.consentAge} onChange={(e) => set("consentAge", e.target.checked)} {...errProps("consentAge")} />
            <span>I’m 18 or older and a current student.</span>
          </label>
          {errLine("consentAge")}
          <label className="vwl-check">
            <input name="consentInvite" type="checkbox" checked={v.consentInvite} onChange={(e) => set("consentInvite", e.target.checked)} {...errProps("consentInvite")} />
            <span>Email me when it’s my turn.</span>
          </label>
          {errLine("consentInvite")}
          <label className="vwl-check">
            <input name="consentNews" type="checkbox" checked={v.consentNews} onChange={(e) => set("consentNews", e.target.checked)} />
            <span>Also send me Vibe news. <small>Optional.</small></span>
          </label>
        </div>

        <div className="vwl-hp" aria-hidden="true">
          <label>
            Website
            <input name="website" type="text" tabIndex={-1} autoComplete="off" value={v.website} onChange={(e) => set("website", e.target.value)} />
          </label>
        </div>

        {errLine("form")}
        <button type="submit" className="vln-btn" disabled={busy}>
          {busy ? "Joining…" : "Join the waitlist"}
        </button>
      </form>

      <div className="vwl-more">
        <p>
          Got an access code? <Link href="/auth/signup" className="vwl-quiet">Create your account</Link>
        </p>
        <p>
          Already have an account? <Link href="/auth/login" className="vwl-quiet">Log in</Link>
        </p>
      </div>
    </section>
  );
}
