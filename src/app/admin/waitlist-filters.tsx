"use client";

/**
 * The waitlist tab's filters. They live in component state only, never the
 * URL: a search can be part of someone's name.
 */

import { WAITLIST_YEAR_OPTIONS } from "@/lib/waitlist/form";
import type { WaitlistStatus } from "@/lib/waitlist/types";
import { EMPTY_WAITLIST_FILTERS, WAITLIST_LEAVING_SOON_DAYS, type WaitlistFilters } from "@/lib/waitlist/view";

import { ActionButton, COLORS, inputStyle, labelStyle } from "./admin-shell";
import { STATUS_WORDS } from "./waitlist-rows";

const STATUSES: WaitlistStatus[] = ["waiting", "unconfirmed", "invited", "expired", "joined"];

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label style={{ flex: 1, minWidth: 130 }}>
      <span style={labelStyle}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        {options.map(([v, text]) => (
          <option key={v} value={v} className="adm-option">
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ flex: 1, minWidth: 150 }}>
      <span style={labelStyle}>{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" style={inputStyle} />
    </label>
  );
}

export function WaitlistFilterBar({
  filters,
  onChange,
  sources,
}: {
  filters: WaitlistFilters;
  onChange: (next: WaitlistFilters) => void;
  /** The source tags on the list ("none" for no tag). */
  sources: string[];
}) {
  const set = <K extends keyof WaitlistFilters>(key: K, value: WaitlistFilters[K]) => onChange({ ...filters, [key]: value });
  const changed = JSON.stringify(filters) !== JSON.stringify(EMPTY_WAITLIST_FILTERS);
  return (
    <div className="adm-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="adm-fields">
        <Select
          label="Status"
          value={filters.status}
          onChange={(v) => set("status", v as WaitlistFilters["status"])}
          options={[["all", "Everyone"], ...STATUSES.map((s): [string, string] => [s, STATUS_WORDS[s]])]}
        />
        <Select
          label="School"
          value={filters.school}
          onChange={(v) => set("school", v as WaitlistFilters["school"])}
          options={[["all", "Both"], ["iu", "IU"], ["purdue", "Purdue"], ["none", "Other address"]]}
        />
        <Select
          label="Year"
          value={filters.year}
          onChange={(v) => set("year", v)}
          options={[
            ["all", "Any year"],
            ...WAITLIST_YEAR_OPTIONS.map((o): [string, string] => [o.value === "" ? "none" : o.value, o.label]),
          ]}
        />
        <Select
          label="Source"
          value={filters.source}
          onChange={(v) => set("source", v)}
          options={[["all", "Any"], ...sources.map((s): [string, string] => [s, s === "none" ? "No tag" : s])]}
        />
      </div>
      <div className="adm-fields">
        <Text label="Major" value={filters.major} onChange={(v) => set("major", v)} />
        <Text label="Club" value={filters.club} onChange={(v) => set("club", v)} />
        <Text label="Search" value={filters.text} onChange={(v) => set("text", v)} />
      </div>
      {/* Side by side, the labels sit further apart than a box sits from its
          own words, so "Runs a club" doesn't read as the next box's label. */}
      <div className="adm-actions" style={{ columnGap: 24 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: COLORS.text }}>
          <input
            type="checkbox"
            checked={filters.officersOnly}
            onChange={(e) => set("officersOnly", e.target.checked)}
            style={{ width: 18, height: 18, margin: 0, accentColor: COLORS.accent }}
          />
          Runs a club
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: COLORS.text }}>
          <input
            type="checkbox"
            checked={filters.leavingSoon}
            onChange={(e) => set("leavingSoon", e.target.checked)}
            style={{ width: 18, height: 18, margin: 0, accentColor: COLORS.accent }}
          />
          {`Leaving within ${WAITLIST_LEAVING_SOON_DAYS} days`}
        </label>
        {changed ? (
          <ActionButton onClick={() => onChange(EMPTY_WAITLIST_FILTERS)}>Clear filters</ActionButton>
        ) : null}
      </div>
    </div>
  );
}
