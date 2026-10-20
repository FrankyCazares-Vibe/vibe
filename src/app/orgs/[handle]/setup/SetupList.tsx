"use client";

/**
 * The six rows of a club's setup list (the club's view, wave 1; R2_Setup,
 * column 4). Each: a dot (filled coral when done, an empty ring when not),
 * the step, a grey line under it, and for a step not done its one button.
 * A button either opens one of the club page's own dialogs (the logo and
 * cover upload, the event form) or opens the step's panel under its row.
 */
import dynamic from "next/dynamic";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";

import { MembersLinkPanel } from "@/components/orgs/MembersLinkPanel";
import { lineStyle, panelStyle, pillStyle, quietStyle } from "@/components/orgs/club-tool-styles";
import type { SetupStep, SetupStepId } from "@/lib/club-links/setup-steps";
import { toast } from "@/lib/feedback/toast";

import { UploadAssetModal } from "../admin-actions";
import type { SetupClub } from "./SetupScreen";
import { AboutForm, OfficersPanel, WhoCanJoinPanel } from "./StepPanels";

type EventModalProps = ComponentProps<typeof import("@/app/campus/campus-home").CreateEventModal>;

/**
 * The event form lives in campus-home (13k lines): fetched on the first
 * "Add", never with this page. If the file can't arrive (no signal, a new
 * build), the tap says so instead of breaking the page.
 */
const CreateEventModal = dynamic<EventModalProps>(
  () =>
    import("@/app/campus/campus-home")
      .then((mod) => mod.CreateEventModal)
      .catch(() => EventFormFailed),
  { ssr: false },
);

function EventFormFailed({ onClose }: EventModalProps) {
  useEffect(() => {
    toast({ message: "Couldn't open the event form. Reload the page and try again.", tone: "error" });
    onClose();
  }, [onClose]);
  return null;
}

const COPY: Record<SetupStepId, { label: string; sub: string; action: string | null }> = {
  photo: { label: "Photo and cover", sub: "So people know it’s you", action: "Add" },
  about: { label: "One line about the club", sub: "What you do, in a sentence", action: null },
  who_can_join: { label: "Who can join", sub: "Open, ask first, or invite only", action: "Choose" },
  officers: { label: "Add your officers", sub: "Officers post on the Board, make events and run check-in", action: "Add" },
  first_event: { label: "Post your first event", sub: "It goes to Events and Tonight", action: "Add" },
  members_link: { label: "Share the members’ link", sub: "Your members get in and join", action: "Share" },
};

/** The steps whose button opens a panel under the row (the rest open a dialog). */
const PANEL_STEPS: ReadonlySet<SetupStepId> = new Set(["who_can_join", "officers", "members_link"]);

export function SetupList({
  club,
  role,
  steps,
  openStep,
  onToggle,
  onChanged,
}: {
  club: SetupClub;
  role: "owner" | "admin";
  steps: SetupStep[];
  openStep: SetupStepId | null;
  onToggle: (id: SetupStepId) => void;
  onChanged: () => void;
}) {
  const [asset, setAsset] = useState<"logo" | "banner" | null>(null);
  const [eventOpen, setEventOpen] = useState(false);

  // The event form is a portal on <body>, outside this page's
  // `.vibe-tabbar-page`, so the phone's tab bar would sit over its buttons:
  // hide the bar the way the composers do while it's open.
  useEffect(() => {
    if (!eventOpen) return;
    document.body.classList.add("vibe-composer-open");
    return () => document.body.classList.remove("vibe-composer-open");
  }, [eventOpen]);

  const rowFor = (step: SetupStep) => {
    const copy = COPY[step.id];
    const isOpen = openStep === step.id;
    let sub = copy.sub;
    let button: ReactNode = null;
    let panel: ReactNode = null;

    if (PANEL_STEPS.has(step.id) && (!step.done || isOpen || step.id === "members_link")) {
      // An open panel keeps its Close after its step is done (an owner making
      // several officers); the members' link stays reachable once it's made,
      // since officers come back for it.
      const label = isOpen ? "Close" : step.done ? "Show" : copy.action;
      button = (
        <button type="button" className="vibe-press" aria-expanded={isOpen} onClick={() => onToggle(step.id)} style={pillStyle}>
          {label}
        </button>
      );
    }
    if (!step.done && step.id === "photo") {
      button = (
        <button type="button" className="vibe-press" onClick={() => setAsset(club.hasLogo ? "banner" : "logo")} style={pillStyle}>
          {copy.action}
        </button>
      );
    }
    if (!step.done && step.id === "first_event") {
      if (club.verified) {
        button = (
          <button type="button" className="vibe-press" onClick={() => setEventOpen(true)} style={pillStyle}>
            {copy.action}
          </button>
        );
      } else {
        // POST /api/events refuses a club Vibe hasn't checked.
        sub = "Events open once Vibe checks your club.";
      }
    }

    if (!step.done && step.id === "about") panel = <AboutForm handle={club.handle} onDone={onChanged} />;
    if (isOpen && step.id === "who_can_join") {
      const close = () => onToggle(step.id);
      panel = (
        <WhoCanJoinPanel
          handle={club.handle}
          current={club.joinPolicy}
          onDone={() => {
            close();
            onChanged();
          }}
        />
      );
    }
    if (isOpen && step.id === "officers") {
      const close = () => onToggle(step.id);
      panel = <OfficersPanel club={club} role={role} onDone={onChanged} onClose={close} />;
    }
    if (isOpen && step.id === "members_link") {
      panel = (
        <div style={panelStyle}>
          <MembersLinkPanel handle={club.handle} clubName={club.name} onChange={onChanged} />
        </div>
      );
    }

    return (
      <li key={step.id} style={{ borderBottom: "1px solid var(--hairline)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 60, padding: "8px 0" }}>
          <Dot done={step.done} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ ...lineStyle, fontSize: 15, color: "var(--charcoal)", fontWeight: 600 }}>
              <span className="sr-only">{step.done ? "Done: " : "To do: "}</span>
              {copy.label}
            </p>
            {step.done ? null : <p style={quietStyle}>{sub}</p>}
          </div>
          {button}
        </div>
        {panel}
      </li>
    );
  };

  return (
    <>
      <ol style={{ listStyle: "none", margin: "16px 0 0", padding: 0 }}>{steps.map(rowFor)}</ol>

      {asset ? (
        <UploadAssetModal
          key={asset}
          orgHandle={club.handle}
          kind={asset}
          onClose={() => setAsset(null)}
          // Logo first, then the cover, unless the club already has one.
          onSaved={() => setAsset(asset === "logo" && !club.hasBanner ? "banner" : null)}
        />
      ) : null}

      {eventOpen ? (
        <CreateEventModal
          eligibleOrgs={[{ id: club.id, name: club.name, handle: club.handle, verified: club.verified, role }]}
          onClose={() => setEventOpen(false)}
          onCreated={() => {
            setEventOpen(false);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

function Dot({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 22,
        height: 22,
        flexShrink: 0,
        boxSizing: "border-box",
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: done ? "var(--coral)" : "transparent",
        border: `1.5px solid ${done ? "var(--coral)" : "rgba(var(--scrim-rgb),0.3)"}`,
        color: "var(--on-coral)",
      }}
    >
      {done ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      ) : null}
    </span>
  );
}
