"use client";

/**
 * "What's the vibe tonight?" on the phone's Feed (Oct 19 2026, board P2_Card):
 * one card above the rolling strip that names tonight's #1 and opens the
 * Tonight sheet. #1 is the school's featured pick, else the school event on
 * now or next, else a club event; never by popularity (tonight-view.ts).
 * Contract: handoffs/2026-10-19-tonight-build/CONTRACT.md §6.2.
 *
 * Nothing while loading and nothing when nothing is on tonight: no
 * placeholder, the same rule as the strip, so the feed never shows an empty
 * box. Tickets and Watch on ESPN+ live in the sheet only.
 */
import { useId } from "react";

import { MembersOnlyChip } from "@/components/events/MembersOnlyChip";
import { isMembersOnly, MEMBERS_ONLY_COPY } from "@/components/events/members-only";
import { Reveal } from "@/lib/motion/Reveal";

import { ClubSwatch, IconChevron, ItemTitle, ReasonLabel, SchoolTag } from "./TonightBits";
import { cardSpoken, TONIGHT_COPY } from "./tonight-view";
import type { TonightCardProps, TonightLead } from "./types";
import { useTonightView } from "./use-tonight-view";

import "./tonight-phone.css";

/**
 * The card's fourth line after the bold time: an event's end (" to 8:00 PM",
 * " to midnight"), the place, and a club's public count (5 and up only,
 * already floored in tonight-view). A game's tail (" tip-off") is the
 * sheet's: here the line stays short so it fits on one line.
 */
function cardWhenRest(lead: TonightLead): string {
  const isGame = lead.kind === "school" && lead.ev.kind === "game";
  const parts = [lead.text.place, lead.kind === "club" ? lead.text.count : ""].filter(Boolean);
  return (isGame ? "" : lead.text.timeTail) + parts.map((p) => ` · ${p}`).join("");
}

export function TonightCard({ school, clubs, onOpen }: TonightCardProps) {
  const titleId = useId();
  // Called here, not in CampusMobile, so the minute tick re-renders only this
  // card (contract §5.4).
  const view = useTonightView(school, clubs);
  if (!view || !view.lead) return null;
  const lead = view.lead;
  // Members only (Oct 22, 2026): a club #1 its club keeps to members. Only
  // members get it in the list at all; the chip says it isn't public, and
  // the button's label says it too, since the lines below are hidden.
  const membersOnly = lead.kind === "club" && isMembersOnly(lead.ev);
  const spoken = membersOnly ? `${cardSpoken(view)} ${MEMBERS_ONLY_COPY.spoken}` : cardSpoken(view);

  return (
    <Reveal>
      <section className="tonight-card" aria-labelledby={titleId}>
        <button
          type="button"
          className="tonight-card-hit tonight-focus vibe-press"
          aria-haspopup="dialog"
          aria-label={spoken}
          onClick={onOpen}
        />
        {/* (1) the question and the day, with why #1 leads at the right.
            The button's label already says the whole card, so the lines
            below are hidden from screen readers (no reading it twice). The
            h2 stays, for heading navigation and the section's name. */}
        <div className="tonight-card-top">
          <h2 id={titleId} className="tonight-card-h">
            {`${TONIGHT_COPY.title} · ${view.dayLabel}`}
          </h2>
          <span className="tonight-card-reason" aria-hidden="true">
            <ReasonLabel reason={lead.reason} />
          </span>
        </div>
        <div className="tonight-card-body" aria-hidden="true">
          {/* (2) the title, "IU Indy vs UT Martin" for a game. */}
          <span className="tonight-card-title">
            <ItemTitle item={lead} />
          </span>
          {/* (3) whose it is: the School tag and office, or the club. */}
          <span className="tonight-card-by">
            {lead.kind === "school" ? <SchoolTag size="hero" /> : <ClubSwatch orgId={lead.ev.org?.id ?? null} />}
            <span className="tonight-ellipsis">{lead.text.byline}</span>
            {/* One line, 16px tall: the card keeps its fixed height. The
                club's name gives way (ellipsis) before the chip does. */}
            {membersOnly ? <MembersOnlyChip size="row" /> : null}
          </span>
          {/* (4) when and where. */}
          <span className="tonight-card-when">
            <b>{lead.text.time}</b>
            {cardWhenRest(lead)}
          </span>
          {/* (5) how much else is on. */}
          <span className="tonight-card-more">{TONIGHT_COPY.more(view.more)}</span>
        </div>
        <span className="tonight-card-chev" aria-hidden="true">
          <IconChevron size={13} />
        </span>
      </section>
    </Reveal>
  );
}
