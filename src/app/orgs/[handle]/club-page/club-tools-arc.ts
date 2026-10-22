/**
 * The Arc's pure pieces (Oct 22, 2026, Franky: "the little planet on the
 * right edge, the tools floating out of it in an arc"; the approved board is
 * `FloatArc.dc.html`, handoffs/2026-10-22-club-tools-arc/PLAN.md B1). The
 * launcher itself is ClubToolsLauncher.tsx; this file is what it computes:
 * where the planet and the seven bubbles sit in the window, where a tool's
 * card goes, and the words on the bubbles and the cards' first lines.
 *
 * The board drew the Arc on a 960 × 800 artboard with the planet's centre on
 * its right edge. In the app the launcher is fixed to the WINDOW: the
 * planet's centre is on the window's right edge, halfway down, and it comes
 * out 36px when opened. Every position here is worked out from that point,
 * so the same arc reads at 900px wide and at 2,000.
 *
 * PURE ON PURPOSE: no imports but types, so `club-tools-arc.test.ts` loads it
 * under plain `node --test`. The role words restate member-rules.ts
 * `roleWord` for the same reason; keep the two the same.
 */

export type ArcToolId = "invite" | "members" | "followers" | "requests" | "officers" | "events" | "settings";

/** One bubble. `tint` is an "r,g,b" triple for the bubble's glow and its card's. */
export type ArcTool = { id: ArcToolId; name: string; tint: string; hot: boolean };

/** The Arc's order, top to bottom; Join requests, bigger and coral, in the middle. */
export const ARC_TOOLS: readonly ArcTool[] = Object.freeze([
  { id: "invite", name: "Invite and share", tint: "255,176,138", hot: false },
  { id: "members", name: "Members", tint: "160,124,255", hot: false },
  { id: "followers", name: "Followers", tint: "92,206,196", hot: false },
  { id: "requests", name: "Join requests", tint: "255,92,53", hot: true },
  { id: "officers", name: "Officers and titles", tint: "242,194,91", hot: false },
  { id: "events", name: "Past events", tint: "120,170,255", hot: false },
  { id: "settings", name: "Club settings", tint: "200,192,220", hot: false },
]);

export function arcTool(id: ArcToolId): ArcTool {
  return ARC_TOOLS.find((t) => t.id === id) ?? ARC_TOOLS[0];
}

/**
 * The board's numbers. `radius` is the arc's (236 on the board), `stepDeg`
 * the angle between two bubbles, so seven span 120°, from 240° (top) to
 * 120° (bottom) around the planet. A window too short for the whole arc gets
 * a smaller radius, and below `comfortRadius` smaller bubbles, never under
 * 48px (a 44px target with room to spare). `minRadius` is the smallest arc
 * whose 48px bubbles still don't touch; a window under about 350px tall
 * (nobody's computer) clips the two ends rather than piling them up.
 */
export const ARC = Object.freeze({
  planet: 92,
  openShift: 36,
  openScale: 1.12,
  radius: 236,
  comfortRadius: 200,
  minRadius: 152,
  stepDeg: 20,
  bubble: 64,
  hotBubble: 76,
  minBubble: 48,
  /** The idle bob, ±px (globals.css `vibe-arc-bob`). */
  bob: 3,
  margin: 16,
  cardWidth: 372,
  cardMinWidth: 300,
  cardGap: 42,
});

/** The app frame's left menu (globals.css `.vibe-app-shell`): a card never covers it when there is room. */
export const FRAME_MENU_WIDTH = 200;

export type ArcBubbleSpot = {
  id: ArcToolId;
  size: number;
  /** Top-left corner in the window. */
  left: number;
  top: number;
  /** From the bubble's place back to the planet's centre: where it springs out from. */
  fromX: number;
  fromY: number;
};

export type ArcLayout = {
  /** The open planet's centre. */
  hub: { x: number; y: number };
  radius: number;
  bubbles: ArcBubbleSpot[];
  /** The tool card's column: left and width; it is centred on the planet, `margin` from the top and bottom at most. */
  card: { left: number; width: number; margin: number };
  /** The round close target over the open planet. */
  closeSpot: { left: number; top: number; size: number };
};

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Where everything goes in a window `width` × `height`. `leftInset` is what
 * the card keeps clear on the left (the frame's menu plus a margin) while it
 * can stay `cardMinWidth` wide; in a window too narrow for both it gives the
 * menu up, never its own width.
 */
export function arcLayout(width: number, height: number, leftInset: number = ARC.margin): ArcLayout {
  const hub = { x: width - ARC.openShift, y: height / 2 };
  const n = ARC_TOOLS.length;
  const step = ARC.stepDeg;
  const halfSpan = ((n - 1) * step) / 2;
  // The end bubbles (64px) clear the window's top and bottom by `margin`,
  // their bob included.
  const room = hub.y - ARC.margin - ARC.bob - ARC.bubble / 2;
  const fit = room / Math.sin(rad(halfSpan));
  const radius = Math.round(Math.max(ARC.minRadius, Math.min(ARC.radius, fit)));
  const scale =
    radius >= ARC.comfortRadius ? 1 : Math.max(ARC.minBubble / ARC.bubble, radius / ARC.comfortRadius);

  const bubbles = ARC_TOOLS.map((t, i): ArcBubbleSpot => {
    const a = rad(180 + halfSpan - i * step);
    const cx = hub.x + radius * Math.cos(a);
    const cy = hub.y + radius * Math.sin(a);
    const size = Math.round((t.hot ? ARC.hotBubble : ARC.bubble) * scale);
    return {
      id: t.id,
      size,
      left: Math.round(cx - size / 2),
      top: Math.round(cy - size / 2),
      fromX: Math.round(hub.x - cx),
      fromY: Math.round(hub.y - cy),
    };
  });

  const hot = Math.round(ARC.hotBubble * scale);
  const cardRight = hub.x - radius - hot / 2 - ARC.cardGap;
  const clearOfMenu = cardRight - Math.max(leftInset, ARC.margin);
  const widest = cardRight - ARC.margin;
  const cardWidth = Math.max(0, Math.min(ARC.cardWidth, clearOfMenu >= ARC.cardMinWidth ? clearOfMenu : widest));

  const closeSize = Math.round(ARC.planet * ARC.openScale);
  return {
    hub,
    radius,
    bubbles,
    card: { left: Math.round(cardRight - cardWidth), width: Math.round(cardWidth), margin: ARC.margin },
    closeSpot: { left: Math.round(hub.x - closeSize / 2), top: Math.round(hub.y - closeSize / 2), size: closeSize },
  };
}

// ── Words ─────────────────────────────────────────────────────────────────

export type ArcCounts = { requests: number | null; members: number | null; followers: number | null };

const isCount = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** The number on a bubble's shoulder: none when unknown or nothing, "99+" past 99. */
export function chipText(n: number | null | undefined): string | null {
  if (!isCount(n) || n < 1) return null;
  return n > 99 ? "99+" : String(Math.floor(n));
}

/** The planet's coral count, join requests only; small, so "9+" past 9 (as the old handle). */
export function planetCount(n: number | null | undefined): string | null {
  if (!isCount(n) || n < 1) return null;
  return n > 9 ? "9+" : String(Math.floor(n));
}

/** The planet's name for a screen reader: "Club tools, 2 want to join". */
export function planetLabel(requests: number | null | undefined): string {
  if (!isCount(requests) || requests < 1) return "Club tools";
  const n = Math.floor(requests);
  return `Club tools, ${n.toLocaleString("en-US")} ${n === 1 ? "wants" : "want"} to join`;
}

/** The grey words after a bubble's name in its label ("1 waiting", "4", "who came"). */
export function bubbleMeta(id: ArcToolId, counts: ArcCounts): string {
  if (id === "requests") {
    if (!isCount(counts.requests)) return "";
    return counts.requests > 0 ? `${counts.requests.toLocaleString("en-US")} waiting` : "no one waiting";
  }
  if (id === "members" && isCount(counts.members)) return counts.members.toLocaleString("en-US");
  if (id === "followers" && isCount(counts.followers)) return counts.followers.toLocaleString("en-US");
  if (id === "events") return "who came";
  return "";
}

/** A bubble's whole name, said and shown: "Join requests, 1 waiting". */
export function bubbleLabel(id: ArcToolId, counts: ArcCounts): string {
  const meta = bubbleMeta(id, counts);
  const name = arcTool(id).name;
  return meta ? `${name}, ${meta}` : name;
}

/** The Join requests card's first line. */
export function requestsSub(n: number): string {
  if (!isCount(n) || n < 1) return "No one is waiting";
  if (n === 1) return "1 person is waiting on you";
  return `${n.toLocaleString("en-US")} people are waiting on you`;
}

export function membersSub(n: number | null | undefined): string {
  return isCount(n) ? `${n.toLocaleString("en-US")} in the club` : "Who's in the club";
}

export function followersSub(n: number | null | undefined): string {
  if (!isCount(n)) return "People who follow the club";
  return `${n.toLocaleString("en-US")} ${n === 1 ? "follows" : "follow"} the club`;
}

// ── People in the cards ───────────────────────────────────────────────────

/** A row of GET /api/orgs/[slug]/members, the fields the cards read. */
export type ArcMember = {
  user_id: string;
  role: string;
  joined_at: string;
  title: string | null;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
};

/** One person's line in a card: their name, a grey line under it, and a chip on the right. */
export type ArcPersonLine = {
  id: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  line: string;
  tag: string | null;
};

const ROLE_WORD: Record<string, string> = { owner: "Owner", admin: "Officer", member: "Member" };
const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1, member: 2 };

/** The role as the club says it (member-rules.ts `roleWord`): the stored `admin` is an Officer. */
export function arcRoleWord(role: string): string {
  return ROLE_WORD[role] ?? "Member";
}

/** "Maya Okafor", else "@maya", else "Someone". */
export function displayName(name: string | null | undefined, handle: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (n) return n;
  const h = (handle ?? "").trim();
  return h ? `@${h}` : "Someone";
}

/** Two letters for a photo-less avatar: "MO" for Maya Okafor, "M" for @maya. */
export function initials(name: string | null | undefined, handle: string | null | undefined): string {
  const source = (name ?? "").trim() || (handle ?? "").trim() || "?";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Which of the board's four avatar gradients a person gets: the same one every time. */
export function avatarTint(id: string, tints = 4): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % tints;
}

/** The route's order, kept: the owner, officers, members, each by when they joined. */
function byRole<T extends Pick<ArcMember, "role" | "joined_at">>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const ra = ROLE_RANK[a.role] ?? 99;
    const rb = ROLE_RANK[b.role] ?? 99;
    if (ra !== rb) return ra - rb;
    return (a.joined_at || "").localeCompare(b.joined_at || "");
  });
}

const withYou = (line: string, you: boolean) => (you ? `${line} · you` : line);

/**
 * The Members card's first `limit` people. The grey line is their title, else
 * their @handle (the role is the chip, so it isn't said twice); the owner and
 * officers carry their role as the chip.
 */
export function memberPreview(rows: readonly ArcMember[], viewerId: string | null | undefined, limit = 5): ArcPersonLine[] {
  return byRole(rows)
    .slice(0, Math.max(0, limit))
    .map((m) => {
      const base = m.title ?? (m.handle ? `@${m.handle}` : arcRoleWord(m.role));
      return {
        id: m.user_id,
        name: displayName(m.name, m.handle),
        handle: m.handle,
        avatarUrl: m.avatar_url,
        line: withYou(base, !!viewerId && m.user_id === viewerId),
        tag: m.role === "owner" || m.role === "admin" ? arcRoleWord(m.role) : null,
      };
    });
}

/**
 * Officers and titles: the owner, the officers and any member an officer gave
 * a title ("Social chair"), in the route's order. The chip is the title when
 * there is one, else the role.
 */
export function officerLines(rows: readonly ArcMember[], viewerId: string | null | undefined): ArcPersonLine[] {
  return byRole(rows)
    .filter((m) => m.role === "owner" || m.role === "admin" || !!m.title)
    .map((m) => {
      const base = m.role === "owner" ? "Runs the club" : m.role === "admin" ? "Helps run the club" : "A member with a title";
      return {
        id: m.user_id,
        name: displayName(m.name, m.handle),
        handle: m.handle,
        avatarUrl: m.avatar_url,
        line: withYou(base, !!viewerId && m.user_id === viewerId),
        tag: m.title ?? arcRoleWord(m.role),
      };
    });
}
