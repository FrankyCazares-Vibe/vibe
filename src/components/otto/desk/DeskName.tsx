"use client";

import "./desk-names.css";

import Link from "next/link";
import type { ReactNode } from "react";

import type { DeskItem } from "@/lib/otto/desk";

/**
 * People's names link to their profile (polish 1, Nov 11, Franky's walk:
 * "if you hover over peoples names it highlights them"). The model sets
 * `item.actor` only for someone the viewer may see; this links the first
 * occurrence of `actor.name` in the title and leaves the rest as text.
 *
 * Every desk renderer uses these two:
 * - `DeskTitle`: the title, with the name as a link when there is one.
 * - `DeskLinkRow`: a row that opens `href` as a whole. With an actor it
 *   can't be one big <a> (a link can't hold a link), so the row's own link
 *   stretches over it (`dk-cover`) and the name sits above it.
 */

/** The title's three parts around the actor's name, or null when the title doesn't name them. */
export function splitTitle(item: Pick<DeskItem, "title" | "actor">): { before: string; name: string; after: string } | null {
  const a = item.actor;
  if (!a || !a.name || !a.href) return null;
  const at = item.title.indexOf(a.name);
  if (at < 0) return null;
  return { before: item.title.slice(0, at), name: a.name, after: item.title.slice(at + a.name.length) };
}

/** True when the title will hold a name link (so a whole-row link must become a cover). */
export function hasNameLink(item: Pick<DeskItem, "title" | "actor">): boolean {
  return splitTitle(item) !== null;
}

/** The title with the person's name linked to their profile. */
export function DeskTitle({ item }: { item: Pick<DeskItem, "title" | "actor"> }) {
  const parts = splitTitle(item);
  if (!parts || !item.actor) return <>{item.title}</>;
  return (
    <>
      {parts.before}
      <Link className="dk-name" href={item.actor.href} aria-label={`${parts.name}'s profile`}>
        {parts.name}
      </Link>
      {parts.after}
    </>
  );
}

export type DeskLinkRowProps = {
  item: Pick<DeskItem, "title" | "actor">;
  href: string;
  /** The row's class ("dk-row", "dk-done", or a renderer's own). */
  className: string;
  children: ReactNode;
};

/**
 * A row that opens `href`: one <a> when the title names nobody, else a box
 * with a stretched link (named by the title) under the name link.
 */
export function DeskLinkRow({ item, href, className, children }: DeskLinkRowProps) {
  if (!hasNameLink(item)) {
    return (
      <Link className={className} href={href}>
        {children}
      </Link>
    );
  }
  return (
    <div className={`${className} dk-cover-host`}>
      <Link className="dk-cover" href={href} aria-label={item.title} />
      {children}
    </div>
  );
}
