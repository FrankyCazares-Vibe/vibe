// Fixtures for the visual pass (handoffs/chat-redesign/wave-2-build/visual).
//
// Every answer the phone screens read under /api/** while the harness shoots,
// typed by eye against src/lib/chat/types.ts (InboxClub, SpaceResponse,
// ThreadMessagesResponse, ChatMessage, PollCard, EventCard, EventRef,
// CalendarRoomFields) and src/components/mobile/messages/types.ts
// (ThreadEntry). Times are computed from `NOW` (the instant the browser's
// clock is frozen at, shoot.mjs) so "Live now", "Tonight · 9:30 PM", "Ended ·
// chat open N more days", "Yesterday", "Tue" all appear.
//
// `makeFixtures(NOW)` → { answer(method, url, variant), ids, dump() }.
// `variant` flags: clubsEmpty, weekEmpty, inbox500, inboxDelayMs, shareEmpty.

export const ZONE = "America/Indiana/Indianapolis";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";

// ── time helpers ────────────────────────────────────────────────────────────

function partsIn(date, zone) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = {};
  for (const { type, value } of f.formatToParts(date)) p[type] = value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

/** A Date for y-m-d h:mi in `zone` (two passes fix the zone offset). */
function zoned(y, m, d, h, mi, zone = ZONE) {
  let guess = Date.UTC(y, m - 1, d, h, mi, 0);
  for (let i = 0; i < 2; i += 1) {
    const p = partsIn(new Date(guess), zone);
    const asIf = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, 0);
    guess += Date.UTC(y, m - 1, d, h, mi, 0) - asIf;
  }
  return new Date(guess);
}

export function makeFixtures(NOW) {
  const nowMs = NOW.getTime();
  const iso = (d) => new Date(d).toISOString();
  const ago = (minutes) => iso(nowMs - minutes * 60_000);
  const ahead = (minutes) => iso(nowMs + minutes * 60_000);
  const today = partsIn(NOW, ZONE);
  /** `dayOffset` days from today at h:mi local. */
  const at = (dayOffset, h, mi = 0) => {
    const base = zoned(today.y, today.m, today.d, 12, 0);
    const day = new Date(base.getTime() + dayOffset * 86_400_000);
    const p = partsIn(day, ZONE);
    return iso(zoned(p.y, p.m, p.d, h, mi));
  };

  // ── people ────────────────────────────────────────────────────────────────
  const person = (n, handle, name) => ({ id: `aaaaaaaa-000${n}-4000-8000-00000000000${n}`, handle, name, avatar_url: null });
  const me = { id: VIEWER_ID, handle: "harness", name: "Harness Student", avatar_url: null };
  const dana = person(1, "dana", "Dana Ortiz");
  const priya = person(2, "priya", "Priya Shah");
  const jay = person(3, "jay", "Jay Kim");
  const maya = person(4, "maya", "Maya Reyes");
  const sam = person(5, "sam", "Sam Torres");
  const ava = person(6, "ava", "Ava Lee");

  // ── clubs ─────────────────────────────────────────────────────────────────
  const org = (n, handle, name, verified) => ({ id: `bbbbbbbb-000${n}-4000-8000-00000000000${n}`, handle, name, logo_url: null, banner_url: null, verified });
  const salsa = org(1, "salsa-club", "Salsa Club", true);
  const chess = org(2, "chess-club", "Chess Club", false);
  const hikers = org(3, "night-hikers", "Night Hikers", false);

  const roomId = (n) => `cccccccc-${String(n).padStart(4, "0")}-4000-8000-0000000000${String(n).padStart(2, "0")}`;
  const rooms = {
    salsaLounge: roomId(1),
    salsaBoard: roomId(2),
    salsaOfficers: roomId(3),
    fallFormal: roomId(4), // live
    openPractice: roomId(5), // after (ended, chat open)
    lateNight: roomId(6), // soon, tonight
    welcomeMixer: roomId(7), // closed
    chessLounge: roomId(11),
    chessBoard: roomId(12),
    hikersLounge: roomId(21),
    hikersBoard: roomId(22),
    hikersOfficers: roomId(23),
    dmDana: roomId(31),
    dmSam: roomId(32),
    groupStudy: roomId(33),
    requestAva: roomId(34),
  };

  // ── events (EventRef) ─────────────────────────────────────────────────────
  const eventId = (n) => `dddddddd-000${n}-4000-8000-00000000000${n}`;
  /** @returns {import("../../src/lib/chat/types").EventRef} */
  const ev = (n, title, starts_at, ends_at, location, state, room_id, viewer_status, going_count, maybe_count) => ({
    id: eventId(n),
    title,
    starts_at,
    ends_at,
    location,
    state,
    room_id,
    viewer_status,
    going_count,
    maybe_count,
  });
  const E = {
    // Live now (started 30 min ago), the viewer is going.
    fallFormal: ev(1, "Fall Formal", ago(30), ahead(150), "Alumni Hall", "live", rooms.fallFormal, "going", 18, 6),
    // Tonight, starts within 24 h (the Soon ring), the viewer said maybe.
    lateNight: ev(2, "Late Night Social", at(0, 21, 30), at(0, 23, 30), "Union Basement", "soon", rooms.lateNight, "maybe", 9, 4),
    // Next Tuesday: quiet card, no RSVP, no room for the viewer.
    beginner: ev(3, "Beginner Lesson", at(5, 19, 0), at(5, 20, 30), "Studio B", "soon", null, null, 7, 2),
    // Ended two days ago, the chat still open.
    openPractice: ev(4, "Open Practice", at(-2, 19, 0), at(-2, 20, 30), "Studio B", "after", rooms.openPractice, "going", 12, 1),
    // Closed (ended more than 7 days ago).
    welcomeMixer: ev(5, "Welcome Mixer", at(-19, 19, 0), at(-19, 22, 0), "Union Ballroom", "closed", rooms.welcomeMixer, "going", 31, 4),
    // Live, the viewer is NOT going (the Lounge's event card).
    social: ev(6, "Salsa Social", at(0, 17, 30), at(0, 21, 0), "Union Ballroom", "live", null, null, 11, 3),
  };

  // ── messages ──────────────────────────────────────────────────────────────
  let seq = 0;
  const msgId = () => {
    seq += 1;
    return `eeeeeeee-${String(seq).padStart(4, "0")}-4000-8000-${String(seq).padStart(12, "0")}`;
  };
  /** A full ChatMessage (types.ts 6.1) with every field at its default, then `over`. */
  const msg = (author, content, created_at, over = {}) => ({
    id: msgId(),
    content,
    created_at,
    user_id: author ? author.id : "",
    attachment_id: null,
    attachment_kind: null,
    media_url: null,
    media_kind: null,
    parent_message_id: null,
    users: author,
    attachment: null,
    parent_preview: null,
    reactions: [],
    kind: "text",
    thread_root_id: null,
    card: null,
    reply_count: null,
    author_role: author ? roleOf(author) : null,
    hidden: false,
    removed: null,
    ...over,
  });
  function roleOf(p) {
    if (p.id === dana.id) return "owner";
    if (p.id === priya.id || p.id === me.id) return "admin";
    return "member";
  }
  /** The stub of contract 8.1: a message hidden by a block. */
  const stub = (created_at) => ({
    ...msg(null, "", created_at),
    hidden: true,
  });

  const cardFallback = (e) => `Event: ${e.title} · ${new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(e.starts_at))}`;

  const playlistPoll = {
    type: "poll",
    question: "Playlist for tonight?",
    anonymous: false,
    multi: false,
    closes_at: null,
    closed: false,
    total_voters: 14,
    options: [
      { id: "o-bachata", label: "Bachata-heavy", count: 5, capacity: null, full: false, mine: false, voters: [jay, maya, sam, ava, priya], voters_more: 0 },
      { id: "o-classic", label: "Classic salsa", count: 7, capacity: null, full: false, mine: true, voters: [me, dana, priya, jay, maya, sam, ava], voters_more: 0 },
      { id: "o-mix", label: "Mix it up", count: 2, capacity: null, full: false, mine: false, voters: [maya, ava], voters_more: 0 },
    ],
  };
  const nightsPoll = {
    type: "poll",
    question: "Which nights work for practice?",
    anonymous: true,
    multi: true,
    closes_at: ago(60 * 26),
    closed: true,
    total_voters: 12,
    options: [
      { id: "o-mon", label: "Monday", count: 6, capacity: null, full: false, mine: false, voters: [], voters_more: 0 },
      { id: "o-wed", label: "Wednesday", count: 9, capacity: null, full: false, mine: true, voters: [], voters_more: 0 },
      { id: "o-fri", label: "Friday", count: 4, capacity: null, full: false, mine: true, voters: [], voters_more: 0 },
    ],
  };
  const setupSignup = {
    type: "signup",
    question: "Setup crew for the formal",
    anonymous: false,
    multi: true,
    closes_at: null,
    closed: false,
    total_voters: 4,
    options: [
      { id: "s-deco", label: "Decorations 5–6 PM", count: 3, capacity: 3, full: true, mine: false, voters: [jay, maya, sam], voters_more: 0 },
      { id: "s-door", label: "Door 6:30–7:30", count: 1, capacity: 2, full: false, mine: true, voters: [me], voters_more: 0 },
      { id: "s-clean", label: "Cleanup after", count: 0, capacity: 4, full: false, mine: false, voters: [], voters_more: 0 },
    ],
  };

  // The Lounge (oldest first): text runs by three people, a poll, a closed
  // anonymous multi poll, a sign-up, a live event card, a cancelled event
  // card, a stub, the viewer's own removed message, a quote, an own text.
  const lounge = [];
  const l1 = msg(dana, "Who's bringing the speaker tonight?", ago(180));
  lounge.push(l1);
  lounge.push(msg(jay, "I can, it's in my car", ago(175), { reactions: [{ emoji: "🔥", count: 2, viewer_reacted: false }] }));
  lounge.push(msg(jay, "also have the extension cord", ago(174)));
  lounge.push(msg(dana, "Poll: Playlist for tonight?", ago(150), { kind: "poll", card: playlistPoll }));
  lounge.push(msg(maya, "Remember to bring your ID for the door", ago(120)));
  lounge.push(msg(priya, "Poll: Which nights work for practice?", ago(110), { kind: "poll", card: nightsPoll }));
  lounge.push(msg(dana, "Sign-up: Setup crew for the formal", ago(100), { kind: "poll", card: setupSignup }));
  lounge.push(msg(priya, cardFallback(E.social), ago(80), { kind: "event_card", card: { type: "event", note: "Come through after the formal if you're still standing", event: E.social } }));
  lounge.push(msg(jay, "Event: Rooftop Practice · Sat Oct 10, 6:00 PM", ago(70), { kind: "event_card", card: { type: "event", note: null, event: null } }));
  lounge.push(stub(ago(60)));
  lounge.push(msg(me, "wait is it BYOB", ago(50), { removed: { by: "officer", at: ago(45), reason: null } }));
  lounge.push(msg(sam, "Yes!! bringing the good one", ago(20), { parent_message_id: l1.id, parent_preview: { id: l1.id, content: l1.content, user_id: dana.id, author: dana, media_kind: null, attachment_kind: null } }));
  lounge.push(msg(me, "On my way, save me a spot 🙌", ago(5)));

  // The Board (oldest first; the view shows newest first).
  const boardPosts = [
    msg(dana, "Welcome to the fall semester! Practices are Tue/Thu 7 PM in Studio B. Bring water and a friend.", at(-6, 18, 4), { reply_count: 12 }),
    msg(priya, "Dues are $15 this semester. Venmo @salsaclub by Friday so we can pay for the formal venue.", at(-2, 12, 20), { reply_count: 3 }),
    msg(priya, cardFallback(E.fallFormal), at(-1, 9, 45), { kind: "event_card", card: { type: "event", note: "Doors at 7. Dress sharp.", event: E.fallFormal }, reply_count: 0 }),
    msg(dana, "Formal tickets are at the door tonight — bring your ID.", ago(40), { reply_count: 3 }),
  ];
  const newestPost = boardPosts[3];
  const boardReplies = [
    msg(jay, "Cash or card?", ago(35), { thread_root_id: newestPost.id }),
    stub(ago(30)),
    msg(maya, "Both work, I'll be at the table from 6:30", ago(25), { thread_root_id: newestPost.id }),
  ];

  const fallFormalRows = [
    msg(dana, "Doors are open!", ago(28)),
    msg(jay, "Line is moving fast", ago(24)),
    msg(maya, "Save me a spot near the DJ", ago(20)),
    msg(me, "Walking over now", ago(15)),
    msg(priya, "Coat check is on the left when you come in", ago(9)),
    msg(sam, "🔥🔥🔥", ago(2)),
  ];
  const openPracticeRows = [
    msg(dana, "Great practice everyone, same time Thursday", at(-2, 20, 40)),
    msg(sam, "My feet hurt in the best way", at(-2, 20, 52)),
  ];
  const welcomeMixerRows = [
    msg(dana, "Thanks for coming out tonight!", at(-19, 22, 10)),
    msg(ava, "That was so fun, see you at practice", at(-19, 22, 30)),
    msg(jay, "🙌", at(-19, 22, 41)),
  ];
  const chessLoungeRows = [
    msg(priya, "Anyone up for blitz tonight?", ago(180)),
    msg(sam, "I'm in after 8", ago(170)),
  ];
  const dmDanaRows = [
    msg(dana, "Are you coming to the formal?", ago(25)),
  ];

  // ── the reads ─────────────────────────────────────────────────────────────
  const preview = (m) => ({ id: m.id, text: m.content, author_name: m.users?.name ?? "", created_at: m.created_at, kind: m.kind });

  /** @type {import("../../src/lib/chat/types").InboxClub[]} */
  const clubs = [
    {
      org: salsa,
      viewer_role: "admin",
      board: { room_id: rooms.salsaBoard, latest: preview(newestPost), unread: true },
      lounge: { room_id: rooms.salsaLounge, latest: preview(lounge[lounge.length - 1]), unread_count: 12 },
      next_event: E.fallFormal,
      last_activity_at: ago(5),
      pinned_at: ago(60 * 48),
      muted_until: null,
    },
    {
      org: chess,
      viewer_role: "member",
      board: { room_id: rooms.chessBoard, latest: null, unread: false },
      lounge: { room_id: rooms.chessLounge, latest: preview(chessLoungeRows[0]), unread_count: 3 },
      next_event: null,
      last_activity_at: ago(180),
      pinned_at: null,
      muted_until: ahead(60 * 24 * 7),
    },
  ];

  const peer = (p) => ({ id: p.id, handle: p.handle, name: p.name, avatar_url: null, school: "IU Indianapolis" });
  const member = (p, role = "member") => ({ id: p.id, handle: p.handle, name: p.name, avatar_url: null, role });
  const thread = (id, over) => ({
    id,
    type: "dm",
    name: "",
    photo_url: null,
    peer: null,
    members: [],
    last_message: null,
    unread: false,
    accepted_at: ago(60 * 24 * 30),
    is_request: false,
    peer_last_read_at: null,
    pinned_at: null,
    viewer_role: "member",
    muted_until: null,
    ...over,
  });
  const threads = [
    thread(rooms.dmSam, {
      name: sam.name,
      peer: peer(sam),
      last_message: { content: "Sent the notes, lmk if the last page is cut off", created_at: at(-1, 21, 10), user_id: me.id, media_kind: null, attachment_kind: null },
      pinned_at: ago(60 * 24),
      peer_last_read_at: at(-1, 21, 30),
    }),
    thread(rooms.dmDana, {
      name: dana.name,
      peer: peer(dana),
      last_message: { content: "Are you coming to the formal?", created_at: ago(25), user_id: dana.id, media_kind: null, attachment_kind: null },
      unread: true,
    }),
    thread(rooms.groupStudy, {
      type: "group",
      name: "Study Buddies",
      members: [member(priya, "admin"), member(jay), member(maya)],
      last_message: { content: "Library at 8? I got the room by the windows", created_at: ago(120), user_id: maya.id, media_kind: null, attachment_kind: null },
      unread: true,
      viewer_role: "admin",
    }),
  ];
  const requests = [
    thread(rooms.requestAva, {
      name: ava.name,
      peer: peer(ava),
      last_message: { content: "hey! we met at the involvement fair, this is Ava", created_at: ago(60), user_id: ava.id, media_kind: null, attachment_kind: null },
      unread: true,
      accepted_at: null,
      is_request: true,
    }),
  ];

  const calendarEntry = (e, viewer_status, room_state) => ({
    kind: "rsvp",
    id: e.id,
    title: e.title,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    location: e.location,
    color: "#FF5C35",
    viewer_status,
    org: { handle: salsa.handle, name: salsa.name, verified: salsa.verified },
    org_id: salsa.id,
    room_id: e.room_id,
    room_state,
  });
  const calendar = [
    calendarEntry(E.openPractice, "going", "after"),
    calendarEntry(E.fallFormal, "going", "live"),
    calendarEntry(E.lateNight, "maybe", "soon"),
  ];

  const spaceRoom = (id, kind, name, unread, can_post, event = null) => ({ id, kind, name, unread, can_post, event });
  /** @type {import("../../src/lib/chat/types").SpaceResponse} */
  const salsaSpace = {
    ok: true,
    org: { ...salsa, member_count: 48 },
    viewer: { role: "admin", can_moderate: true },
    rooms: [
      spaceRoom(rooms.salsaLounge, "lounge", "Lounge", false, true),
      spaceRoom(rooms.salsaBoard, "board", "Board", true, true),
      spaceRoom(rooms.salsaOfficers, "officers", "Officers", false, true),
      spaceRoom(rooms.fallFormal, "event", E.fallFormal.title, false, true, E.fallFormal),
      spaceRoom(rooms.lateNight, "event", E.lateNight.title, false, true, E.lateNight),
    ],
    board_latest: newestPost,
    up_next: [E.fallFormal, E.lateNight, E.beginner],
  };
  const chessSpace = {
    ok: true,
    org: { ...chess, member_count: 23 },
    viewer: { role: "member", can_moderate: false },
    rooms: [spaceRoom(rooms.chessLounge, "lounge", "Lounge", false, true), spaceRoom(rooms.chessBoard, "board", "Board", false, false)],
    board_latest: null,
    up_next: [],
  };
  const hikersSpace = {
    ok: true,
    org: { ...hikers, member_count: 1 },
    viewer: { role: "owner", can_moderate: true },
    rooms: [
      spaceRoom(rooms.hikersLounge, "lounge", "Lounge", false, true),
      spaceRoom(rooms.hikersBoard, "board", "Board", false, true),
      spaceRoom(rooms.hikersOfficers, "officers", "Officers", false, true),
    ],
    board_latest: null,
    up_next: [],
  };

  const threadRoom = (id, kind, name, orgRef, event = null) => ({ id, kind, name, org: orgRef, event });
  const viewerIn = (role, can_post, can_reply, can_moderate) => ({ role, can_post, can_reply, can_moderate });
  /** Every room the harness can open: its rows, `room` and `viewer`. */
  const threadsById = {
    [rooms.salsaLounge]: { messages: lounge, room: threadRoom(rooms.salsaLounge, "lounge", "Lounge", salsa), viewer: viewerIn("admin", true, false, true) },
    [rooms.salsaBoard]: { messages: boardPosts, replies: { [newestPost.id]: boardReplies }, room: threadRoom(rooms.salsaBoard, "board", "Board", salsa), viewer: viewerIn("admin", true, true, true) },
    [rooms.salsaOfficers]: { messages: [msg(dana, "Officers: meet at 6:30 by the door", ago(90))], room: threadRoom(rooms.salsaOfficers, "officers", "Officers", salsa), viewer: viewerIn("admin", true, false, true) },
    [rooms.fallFormal]: { messages: fallFormalRows, room: threadRoom(rooms.fallFormal, "event", E.fallFormal.title, salsa, { ...E.fallFormal, going: [dana, priya, jay, maya, sam] }), viewer: viewerIn("admin", true, false, true) },
    [rooms.lateNight]: { messages: [], room: threadRoom(rooms.lateNight, "event", E.lateNight.title, salsa, { ...E.lateNight, going: [priya, ava] }), viewer: viewerIn("admin", true, false, true) },
    [rooms.openPractice]: { messages: openPracticeRows, room: threadRoom(rooms.openPractice, "event", E.openPractice.title, salsa, { ...E.openPractice, going: [dana, sam, jay] }), viewer: viewerIn("admin", true, false, true) },
    [rooms.welcomeMixer]: { messages: welcomeMixerRows, room: threadRoom(rooms.welcomeMixer, "event", E.welcomeMixer.title, salsa, { ...E.welcomeMixer, going: [dana, ava, jay, priya, maya, sam] }), viewer: viewerIn("admin", false, false, true) },
    [rooms.chessLounge]: { messages: chessLoungeRows, room: threadRoom(rooms.chessLounge, "lounge", "Lounge", chess), viewer: viewerIn("member", true, false, false) },
    [rooms.chessBoard]: { messages: [], room: threadRoom(rooms.chessBoard, "board", "Board", chess), viewer: viewerIn("member", false, true, false) },
    [rooms.hikersLounge]: { messages: [], room: threadRoom(rooms.hikersLounge, "lounge", "Lounge", hikers), viewer: viewerIn("owner", true, false, true) },
    [rooms.hikersBoard]: { messages: [], room: threadRoom(rooms.hikersBoard, "board", "Board", hikers), viewer: viewerIn("owner", true, true, true) },
    [rooms.hikersOfficers]: { messages: [], room: threadRoom(rooms.hikersOfficers, "officers", "Officers", hikers), viewer: viewerIn("owner", true, false, true) },
    [rooms.dmDana]: { messages: dmDanaRows, room: null, viewer: viewerIn(null, true, false, false) },
  };
  const spaces = { [salsa.handle]: salsaSpace, [chess.handle]: chessSpace, [hikers.handle]: hikersSpace };

  const threadPage = (t, messages) => ({
    ok: true,
    messages,
    viewer_id: VIEWER_ID,
    peer_last_read_at: null,
    peer_typing: [],
    room: t.room,
    viewer: t.viewer,
  });

  const json = (status, body, delayMs = 0) => ({ status, body, delayMs });
  const notFound = (path) => json(404, { ok: false, error: "That's not there anymore.", code: "not_found", path });

  /**
   * The router: `method` + `url` (absolute or path) + `variant` → { status, body, delayMs }.
   * Returns null for a path the table does not know (the caller logs it, answers 404).
   */
  function answer(method, urlText, variant = {}) {
    const url = new URL(urlText, "http://localhost");
    const p = url.pathname;
    const q = url.searchParams;
    let m;

    if (p === "/api/me/features" && method === "GET") return json(200, { ok: true, chat_v2: true });

    if (p === "/api/me/threads" && method === "GET") {
      if (q.get("scope") === "chats") return json(200, { ok: true, threads, requests });
      return json(200, { ok: true, threads, requests });
    }
    if (p === "/api/me/threads" && method === "POST") return json(200, { ok: true, channel_id: rooms.dmDana });

    if (p === "/api/me/inbox" && method === "GET") {
      if (variant.inbox500) return json(500, { ok: false, error: "Internal error" }, variant.inboxDelayMs ?? 0);
      return json(200, { ok: true, clubs: variant.clubsEmpty ? [] : clubs }, variant.inboxDelayMs ?? 0);
    }

    if (p === "/api/me/calendar" && method === "GET") return json(200, { ok: true, entries: variant.weekEmpty ? [] : calendar });

    if ((m = p.match(/^\/api\/orgs\/([^/]+)\/space$/)) && method === "GET") {
      const space = spaces[decodeURIComponent(m[1])];
      if (!space) return json(404, { ok: false, error: "That's not there anymore.", code: "not_found" });
      if (q.get("events") === "1") {
        const upcoming = variant.shareEmpty ? [] : space.up_next;
        return json(200, { ...space, upcoming });
      }
      return json(200, space);
    }

    if ((m = p.match(/^\/api\/me\/threads\/([^/]+)\/messages$/))) {
      const t = threadsById[decodeURIComponent(m[1])];
      if (!t) return notFound(p);
      if (method === "GET") {
        if (q.get("root")) return json(200, threadPage(t, (t.replies ?? {})[q.get("root")] ?? []));
        if (q.get("after") || q.get("before")) return json(200, threadPage(t, []));
        return json(200, threadPage(t, t.messages));
      }
      if (method === "POST") {
        let body = {};
        try {
          body = JSON.parse(variant.postBody ?? "{}");
        } catch {
          body = {};
        }
        const sent = msg(me, typeof body.content === "string" ? body.content : "", iso(Date.now()), { thread_root_id: typeof body.thread_root_id === "string" ? body.thread_root_id : null, parent_message_id: typeof body.parent_message_id === "string" ? body.parent_message_id : null, reply_count: t.room?.kind === "board" && !body.thread_root_id ? 0 : null });
        return json(200, { ok: true, message: sent });
      }
    }
    if ((m = p.match(/^\/api\/me\/threads\/([^/]+)\/messages\/([^/]+)$/)) && method === "DELETE") return json(200, { ok: true, removed: true });
    if ((m = p.match(/^\/api\/me\/threads\/([^/]+)\/messages\/([^/]+)\/react$/))) return json(200, { ok: true });
    if ((m = p.match(/^\/api\/me\/threads\/([^/]+)\/read$/)) && method === "POST") return json(200, { ok: true });
    if ((m = p.match(/^\/api\/me\/threads\/([^/]+)\/cards$/)) && method === "POST") {
      const t = threadsById[decodeURIComponent(m[1])];
      if (!t) return notFound(p);
      const created = msg(me, "Poll: (from the harness)", iso(Date.now()), { kind: "poll", card: { ...playlistPoll, question: "Harness poll", total_voters: 0, options: playlistPoll.options.map((o) => ({ ...o, count: 0, mine: false, voters: [] })) }, reply_count: t.room?.kind === "board" ? 0 : null });
      return json(201, { ok: true, message: created });
    }
    if ((m = p.match(/^\/api\/me\/threads\/([^/]+)\/cards\/([^/]+)\/vote$/)) && method === "PUT") {
      const t = threadsById[decodeURIComponent(m[1])];
      const row = t?.messages.find((x) => x.id === m[2]);
      if (!row?.card) return notFound(p);
      return json(200, { ok: true, card: row.card });
    }
    if ((m = p.match(/^\/api\/events\/([^/]+)\/rsvp$/))) return json(200, { ok: true });
    if (p === "/api/me/suggested-connections" && method === "GET") return json(200, { ok: true, users: [] });
    if (p === "/api/users/search" && method === "GET") return json(200, { ok: true, users: [] });

    return null;
  }

  /** Every canonical answer, for the record (tools/fixtures/*.json). */
  function dump() {
    const out = {
      "features.json": answer("GET", "/api/me/features").body,
      "threads.json": answer("GET", "/api/me/threads?scope=chats").body,
      "inbox.json": answer("GET", "/api/me/inbox").body,
      "calendar.json": answer("GET", "/api/me/calendar").body,
      "space-salsa-club.json": answer("GET", "/api/orgs/salsa-club/space").body,
      "space-salsa-club-events.json": answer("GET", "/api/orgs/salsa-club/space?events=1").body,
      "space-night-hikers.json": answer("GET", "/api/orgs/night-hikers/space").body,
      "messages-lounge.json": answer("GET", `/api/me/threads/${rooms.salsaLounge}/messages?limit=50`).body,
      "messages-board.json": answer("GET", `/api/me/threads/${rooms.salsaBoard}/messages?limit=50`).body,
      "messages-board-replies.json": answer("GET", `/api/me/threads/${rooms.salsaBoard}/messages?root=${newestPost.id}&limit=200`).body,
      "messages-event-live.json": answer("GET", `/api/me/threads/${rooms.fallFormal}/messages?limit=50`).body,
      "messages-event-after.json": answer("GET", `/api/me/threads/${rooms.openPractice}/messages?limit=50`).body,
      "messages-event-closed.json": answer("GET", `/api/me/threads/${rooms.welcomeMixer}/messages?limit=50`).body,
      "messages-dm.json": answer("GET", `/api/me/threads/${rooms.dmDana}/messages?limit=50`).body,
      "vote.json": answer("PUT", `/api/me/threads/${rooms.salsaLounge}/cards/${lounge[3].id}/vote`).body,
      "cards-post.json": answer("POST", `/api/me/threads/${rooms.salsaLounge}/cards`).body,
    };
    return out;
  }

  return {
    answer,
    dump,
    ids: { rooms, viewer: VIEWER_ID, newestPostId: newestPost.id, orgs: { salsa: salsa.handle, chess: chess.handle, hikers: hikers.handle } },
  };
}
