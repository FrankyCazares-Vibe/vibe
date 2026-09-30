# Vibe — Feature Control Inventory

> **Correction, same day — read this first.** The first sweep marked every non-responding element as dead. Vibe is a social network, and counts, badges and status pills are product, not bugs. The "does nothing" and "goes somewhere unfinished" counts below are the raw sweep. **The corrected list is `handoffs/2026-09-10-controls-resorted.md`: of those 70, only 15 are real bugs, and 3 are already fixed.** Act on that file, not on the dead or unfinished sections of this one.

**Built:** September 10, 2026 · **Method:** five parallel code sweeps, then a live signed-in walkthrough of the highest-impact findings.

> **How to read this.** Every button, link, form field and menu item a student can touch was catalogued and given one verdict. The plain-English sections come first. File paths are for whoever does the fixing.

## What we found, in plain English

There are **580 things a student can click** in Vibe today. **388 of them work properly.** **47 do nothing at all** when clicked. **23 take you somewhere that was never finished.** **74 do the action but never check whether it actually worked**, so when something fails the student sees no error, no message, nothing. **39 are fine but currently unreachable**, because of a permission or because the data they need does not exist yet. **9 could not be judged without clicking them live.**

The honest headline: **the product is largely built, and the gap is feedback rather than function.** Very little is fake. What is missing is the app telling the student what happened. That matters more than usual right now, because seven of your eight accounts have not accepted the Terms, so the server refuses their posts, comments and reposts — and every one of those refusals is currently invisible. Those testers will type something, press the button, watch nothing happen, and conclude the app is broken.

## Verified by hand in a signed-in browser

These were confirmed live on September 10, on the founder's own account, against production. Everything created was deleted afterwards.

| What was tested | Result |
|---|---|
| Writing and publishing a post | **Works.** Saved, appeared in the feed, composer cleared. |
| Writing a comment | **Works** when the server accepts it. |
| Deleting a post | **Works**, with a confirmation prompt first. |
| A comment the server rejects | **Silent failure, confirmed.** The comment is refused, the text stays in the box, and the student is shown nothing whatsoever: no error, no message, no change on the page. This is what all seven un-consented accounts get on every attempt. |
| The eye / views icon on a post | **Dead, confirmed.** No navigation, no change, no request sent. It sits in a row of four icons that all respond. |
| The Message pill in campus search | **Dead, confirmed.** No navigation, no change, no request sent. The label changes with your real relationship to that person, so it looks live. |

## Does nothing when clicked (47)

The button exists, a student will press it, and nothing happens.

### Campus (desktop) (10)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| Campus banner → search dropdown | The orange pill on a People row — labelled "Connect", "Connect back", or "Message" | Send a connection request / open a DM, right from search | onClick={(e) => e.stopPropagation()} and nothing else. It does not connect, does not message, does not navigate — it only prevents the row's profile navigation. The label is computed from u. | src/app/campus/campus-home.tsx:3896-3910 |
| Campus banner → search dropdown | The "View" pill on a Clubs & Orgs row | View the org | onClick={(e) => e.stopPropagation()} only. Dead — and worse than the People pill because clicking the pill actively SUPPRESSES the row navigation the user was aiming at. | src/app/campus/campus-home.tsx:3992-4006 (EntityRow) |
| Feed tab → Otto strip | A "Heads up" event row | Click it to open that event | Plain <div> with a colour dot, title and time chip. No onClick, no href, no role. Purely decorative. | src/app/campus/campus-home.tsx:10876-10909 |
| Feed tab → post row | Views (eye + count) | Maybe see who viewed | EngagementAction with no onClick, so it renders as disabled={true} — a non-interactive counter. Views are recorded automatically by an IntersectionObserver at ≥50% for 1 tick. | src/app/campus/campus-home.tsx:5584-5588; EngagementAction 6424-6465; observer 5104-5130 |
| Feed tab → post row | Friend repost pill (stacked avatars + "X and 2 others reposted this") | Click to see who reposted | No Link, no onClick anywhere in the component — avatars and names are decorative only. | src/app/campus/campus-home.tsx:5665-5720 (no href/onClick in range); rendered at 5368 |
| Feed tab → comment row | Comment author avatar / name / @handle | Open that commenter's profile | Rendered as plain <div>/<span> — no Link anywhere in CommentRow's header. | src/app/campus/campus-home.tsx:6167-6189 (no Link/href in the name block) |
| Feed tab (empty) | Empty-feed message | A way to get posts flowing | Static copy only: 'No posts yet — orgs you follow and people from your school will show up here once they post.' No button, no link. The composer is still above it, so there IS a path, just  | src/app/campus/campus-home.tsx:4437-4453 |
| Orgs tab (empty results) | Empty-state copy ("No orgs to discover yet — be the first to create one." / "No orgs match …") | A button to create one | Static text inside a DarkGlassCard, no button. The 'Start an org' banner IS still visible above it, so there is a path — just not from this card. | src/app/campus/campus-home.tsx:7912-7924 |
| Org settings → Danger (owners only) | "Transfer or delete" card — action button labelled "—" | Transfer ownership to someone else | onClick={() => {}} and disabled. The card exists solely to explain why owners can't leave; the description says 'transfer ownership first (coming soon)'. There is no transfer flow anywhere. | src/app/campus/campus-home.tsx:2131-2138 |
| Map tab (campus set, no other students) | "No zones yet" state | Something to do next | Static copy: "You're the first here. Once other students pick this campus, their majors light up as zones." No button, no link. | src/app/campus/campus-home.tsx:9399-9408 |

### Mobile app (20)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| Landing (/) — hero | Otto orb above the typewriter headline | Tap Otto to start / to talk to him | Renders <OttoOrb size={56}/> inside a plain div. OttoOrb has no onClick, no role, no href — grep for onClick/button/role in src/components/the-map/OttoOrb.tsx returns nothing. | src/components/landing/home-landing.tsx:119 |
| Landing (/) — hero | "scroll" cue + line under the headline | Tap to scroll down to the orbit section | A div with aria-hidden and style opacity:0→1 once the typewriter finishes. No onClick, no anchor. | src/components/landing/home-landing.tsx:134 |
| Landing (/) — bottom rail | Three progress dots (coral / yellow / purple) | Tap a dot to jump to that feature | <span> elements whose border/background/box-shadow reflect the visited Set. No onClick anywhere. | src/components/landing/home-landing.tsx:168 |
| Landing (/) — bottom rail | "IU · live" school chips | A school picker, or a list of campuses you can request | Two static <span>s inside a div. No handler, no link. | src/components/landing/home-landing.tsx:185 |
| Landing (/) — footer | "vibe · prototype" / "early access" | Footer links (about, contact, legal) | Two bare <span>s. There is NO link to /legal/terms or /legal/privacy anywhere on the landing page. | src/components/landing/home-landing.tsx:218 |
| /auth/signup | Step chips "1 Account · 2 .edu · 3 Otto" | Tap to jump between steps | A div marked aria-hidden containing static spans. No handlers. | src/app/auth/signup/page.tsx:99 |
| Onboarding — desktop and mobile | Progress dots / "N of 4" strip | Tap a dot to jump back to an earlier step | Desktop: four <div class="dot"> with no onclick, updated by updateProgress(). Mobile: four <span> with no onClick. There is NO back control anywhere in either onboarding implementation — no  | public/html/onboarding.html:333-338, :738-746; src/components/mobile/OnboardingMobile.tsx:435-441 |
| Onboarding — desktop, chrome | Custom cursor dot + ring, and the "preview · your saved answers won't change" replay pill | n/a — decoration / status | Two absolutely-positioned divs driven by mousemove + rAF; bindCursorHover adds a hover class over buttons/inputs. The replay pill is a div with hidden removed when ?replay=1. | public/html/onboarding.html:325-326, :341, :700-712 |
| Campus → Otto strip (Feed/Events tabs only) | Trending hashtag chip (e.g. #gameday) | Show me posts with that hashtag | onPickTag fires but CampusMobile's handler ignores the tag and only calls setTab("feed"). No filter state exists on mobile. If you are already on Feed, nothing at all changes. | /Users/franciscocazares/vibe/src/components/mobile/CampusMobile.tsx:287 |
| Campus → Otto strip → "Heads up" | Upcoming-event row (title + time chip) | Tap the event I RSVP'd to and see it | Rows are plain divs with no onClick and no link — tapping does nothing | /Users/franciscocazares/vibe/src/app/campus/campus-home.tsx:10875 |
| Campus → Feed | Post author name / avatar on a card | Go to that person's profile | No handler and no link — the tap falls through to the card button and opens the post viewer instead | /Users/franciscocazares/vibe/src/components/mobile/CampusMobile.tsx:694 |
| Campus → Feed | #hashtag chips under a post | See other posts with that tag | Plain <span>s, no handler; the tap bubbles to the card and opens the post viewer | /Users/franciscocazares/vibe/src/components/mobile/CampusMobile.tsx:810 |
| Campus → Map → zone sheet | Person row with no handle | Open their profile | href falls back to '#' — the tap does nothing but leave a '#' in the URL | /Users/franciscocazares/vibe/src/components/mobile/MapMobile.tsx:948 |
| Post viewer → comments | A comment row | Like it, reply to it, or delete my own | CommentRow is a non-interactive div — no like, no reply, no delete, and the author's name is not a link | /Users/franciscocazares/vibe/src/components/mobile/PostViewerMobile.tsx:820 |
| Messages → conversation | (Absent) photo / video attachment in the composer | Send a photo in a DM, the way I can on desktop | The mobile input bar is a textarea plus Send — there is no attach control at all, and /api/me/messages-upload-url is never called from any mobile file | /Users/franciscocazares/vibe/src/components/mobile/MessagesMobile.tsx:1218 |
| Messages → conversation | A bubble that carries a photo, video, or a shared post | See the image / video / post preview | MessageBubble renders {message.content} only. The MessageRow type has no media_url / media_kind / attachment fields even though the API returns them (with signed R2 URLs), so media-only mess | /Users/franciscocazares/vibe/src/components/mobile/MessagesMobile.tsx:3103 |
| Messages → group → Group info | Group photo (the big circle at the top) | Tap to change the group photo | It is a plain styled div. setPhotoUrl is declared but never called and there is no file input — nothing happens on tap | /Users/franciscocazares/vibe/src/components/mobile/MessagesMobile.tsx:2086 |
| otto → 'Otto saw' (activity) | Activity rows ('X liked your post', 'X commented…') | Tap it to open the post or the person | Rows are <li> with no link and no handler — nothing is tappable | /Users/franciscocazares/vibe/src/components/otto/OttoActivity.tsx:71 |
| Profile → identity block | Followers and Connections stat tiles | Tap to see who they are | StatTile is a plain <div> stack — no onClick, no link. Tapping does nothing | /Users/franciscocazares/vibe/src/components/mobile/ProfileMobile.tsx:1219 |
| Profile (visitor) | (Absent) ⋯ safety menu — Block / Mute / Report user | Report or block someone from their profile | The visitor header renders only the Connect button — no kebab, no safety actions anywhere on a mobile profile. The only Block on mobile lives inside an open DM's 3-dot sheet, and there is no | /Users/franciscocazares/vibe/src/components/mobile/ProfileMobile.tsx:1533 |

### Other React routes (8)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| Otto's Room → 'Otto saw' section | Activity rows ('X liked your post — snippet') | Tap the line to open the post/person | Rendered as plain <p>/<li> text. No link, no onClick anywhere in the component. Unknown notification types render the literal fallback 'someone did something'. | src/components/otto/OttoActivity.tsx:74 |
| Otto's Room → Asking for you | Pass (on a follower row) | Stop asking me about this person | Purely local: setAsking() filters the row out of this session's array. No fetch, no persistence — the code comment says 'local-only at v1'. The row returns on every reload. | src/components/otto/OttoPageClient.tsx:108 |
| Otto's Room → Stats tab | Top posts rows | Tap my top post to open it | Rendered as <li> with two <span>s. No link and no handler — unlike every other post surface in the app. | src/components/otto/OttoMetrics.tsx:177 |
| Settings → Account info | 'School email' row hint: 'Not yet verified — visit /auth/school-email.' | A tappable way to go verify | Plain text — the path is written out but not linked. /auth/school-email does exist as a route. | src/components/settings/SettingsClient.tsx:412 |
| /orgs/[handle] → header | '✓ Joined' badge (member state) | Tap it to leave the org | A <span> with cursor:default — not a button. DELETE /api/orgs/<slug>/join (self-leave) exists in the API but nothing on this page calls it, so there is no leave affordance on the org profile | src/app/orgs/[handle]/join-button.tsx:73 |
| /orgs/[handle] → header | 'Request pending' badge | Tap to cancel my request | Static <span>, no handler, no cancel path in the UI. | src/app/orgs/[handle]/join-button.tsx:89 |
| /orgs/[handle] → Channels card | A channel row (non-member) | Dimmed rows are previews only | href='#' with e.preventDefault(); the row is 65% opacity and a hint below reads 'Join the org above to chat in these channels.' | src/app/orgs/[handle]/ChannelsSection.tsx:274 |
| /orgs/[handle] → Recent posts | A post card in the org feed | Tap to open the post, like it, or comment | Rendered as a static <article> with a plain <img>. No link to /posts/<id>, no like/comment/save affordance anywhere in the section — unlike every other post surface in the product. | src/app/orgs/[handle]/page.tsx:643 |

### Static desktop pages (9)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| Profile nav (search dropdown) | The Connect / Message / Connect back / Pending / View / Open pill on every search result row | Connect (or message) that person without leaving the page | The button is rendered with NO onclick and no delegated listener anywhere. It has its own hover styling so it reads as a real button. The click just bubbles to the parent .search-result row, | public/html/profile.html:6454 (button emitted with no handler); CSS at :2047 |
| Profile nav | Edit pencil | Turn on edit mode | On your own profile toggleEdit() works. On a VISITED profile (/profile/<handle>, i.e. ?handle=) and on the public anonymous share page the button is still visible because the hiding rule is  | public/html/profile.html:3184 (markup), :1591 (no-op CSS rule), :3943 (early return) |
| Visited profile header | N mutual pill | See mutual connections | Hardcoded style=display:none since S55. openMutualsModal still exists and opens #mutualsModal, whose body is an intentionally empty shell. | public/html/profile.html:3303 (display:none) and :3766 (empty modal) |
| Profile identity (edit mode) | The Auto-saved toast | Confirmation that typing was saved | Two input listeners share the same saveTimer variable. The first (line 3969) schedules the Auto-saved toast at 1800ms; the second (line 8528), registered later so it runs second on every inp | public/html/profile.html:3969-3975 vs :8528-8532 (both assign saveTimer) |
| Otto (cross-post drafts flow) | Want me to send this to your other 3 platforms? -> Yes, draft them / Skip, plus the drafts panel Approve all / Skip all / finalize | Otto drafts LinkedIn / IG / X versions of my post | The entire flow is unreachable. publishFlow() is defined but called from nowhere in the repo; it is only re-exported as window.otto.publishFlow. About 300 lines of bubble, thinking panel, pe | public/html/_otto.js:908 (definition) and :1223 (only other reference); no call site anywhere in public/ or src/ |
| Profile right rail | PROFESSIONAL SNAPSHOT card (Role / Seniority / Location / Availability / Preferred / Top skills) | A recruiter-facing summary I can fill in | #recruiterCard is display:none unless it gets class .visible, and nothing in the file ever adds .visible (grep for recruiterCard finds only the markup and three read-only save/hydrate loops) | public/html/profile.html:3640 (markup), CSS :696-700, :3210 (#recBanner), :4003 (orphan toggleRecruiter) |
| Messages thread column | Connections tab (of All / Unread / Connections) | Show only conversations with people I am connected to | switchTab only special-cases mode === unread. For both all AND conn it sets every row to display:'' , i.e. shows everything. The Connections tab moves the active pill and changes nothing els | public/html/messages.html:994 (button) and :1479 (switchTab ignores conn) |
| Messages conversation header | Latest Vibe pill (#cPill) | See the persons latest post | Rendered with style=display:none. The only JS reference to #cPill anywhere sets display=none again on every channel open. It is never shown and its href is a hardcoded /profile. | public/html/messages.html:1020 and the sole reference at :2109 |
| Onboarding progress dots | The four dots and the N of 4 label | Maybe clickable to jump between steps | Plain divs with no handler; updateProgress only sets .done/.now classes | public/html/onboarding.html:333-338 and :746 |

## Goes somewhere unfinished (23)

It leads to a screen, state or destination that was never built out.

### Campus (desktop) (3)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| Campus banner → search dropdown | An Events result row | Open that event | goEvent → window.location.assign(`/campus?tab=events&event={id}`). The Events tab loads, but NOTHING in the codebase ever reads the `event` search param — grep for searchParams shows only we | src/app/campus/campus-home.tsx:3597-3599; searchParams reads at 312,313,321,329,332,374 |
| Feed tab → post row | Post image | Open the photo full-size | role=button that opens the comments drawer. There is NO lightbox / full-size viewer on desktop — the image is a CSS background at 56% padding-top, so it is cropped and cannot be viewed uncro | src/app/campus/campus-home.tsx:5513-5531 |
| Events tab (empty) | Empty-state copy: "Be the first to post one — hit \"+ Create event\" above." | Follow the instruction and create an event | It is plain text, not a button — and for any user who is not an owner/admin of a verified org, the '+ Create event' button it points at is not rendered at all. So the instruction is unfollow | src/app/campus/campus-home.tsx:6666-6678 alongside the canCreate guard at 6629 |

### Mobile app (10)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| /auth/login (arrived from a bad confirm link) | ?error=auth_callback banner | Tells me the link expired and offers a way to get a new one | Renders a static red paragraph: "That confirmation link is invalid or expired. Sign in if you already confirmed your email, or sign up again." There is no resend-confirmation control anywher | src/app/auth/login/page.tsx:114-118; no 'resend' handler exists under src/app/auth/** |
| /auth/school-email | "← back" (top-left) | Step back in the signup flow | Next Link href="/" — drops a mid-signup, signed-in student onto the logged-out marketing landing, which has no signed-in state at all: src/app/page.tsx renders HomeLanding with no session re | src/app/auth/school-email/page.tsx:125; src/app/page.tsx:5 (no auth check) |
| /auth/verify-school with no ?token | (none — the state has zero controls) | Some way forward | Renders one red paragraph: "Missing verification token. Open the link from your email." No link, no button, no nav — the page has no shell. | src/app/auth/verify-school/page.tsx:90-96 |
| Onboarding — desktop, skip dialog | "Skip anyway" | Leaves onboarding and drops me somewhere sensible | bailOnboarding() → window.location.href = '/'. Two problems stack: (1) inside the iframe this navigates the frame, not the tab; (2) the destination is the logged-out marketing landing, which | public/html/onboarding.html:530 and :915; src/app/page.tsx:5 |
| Onboarding — mobile, skip sheet | "Keep going" / tap the backdrop / "Skip anyway" | Dismiss, or leave | "Keep going" and a backdrop tap (e.target === e.currentTarget) both setSkipOpen(false). "Skip anyway" does window.location.href = '/' — the logged-out marketing landing, which has no signed- | src/components/mobile/OnboardingMobile.tsx:858-888; src/app/page.tsx:5 |
| Campus → Feed → post 3-dot sheet | Send to chats | Share this post into a DM | Opens SharePostSheet; sending POSTs the message with attachment_id/attachment_kind='post'. The message row is created, but MessagesMobile never renders attachments — the recipient on mobile  | /Users/franciscocazares/vibe/src/components/mobile/SharePostSheet.tsx:130 |
| Campus → Feed | Video post thumbnail (play triangle overlay) | Play the video | Opens PostViewerMobile, which contains no <video> element at all. isImage is false for video posts (media_url starts with 'clips/'), so the viewer shows the caption with NO media — the video | /Users/franciscocazares/vibe/src/components/mobile/PostViewerMobile.tsx:270 |
| Post viewer | #hashtag pills under the post body, and inline #tags in the text | See other posts with this tag | Links to /campus?tab=feed&tag=<t>. CampusMobile reads only ?channel, ?post and ?clip — both 'tab' and 'tag' are ignored — so you land on the unfiltered Feed. Desktop ignores ?tag too | /Users/franciscocazares/vibe/src/components/mobile/PostViewerMobile.tsx:596 |
| Messages → inbox | All / Requests tab pills | See message requests and accept or decline them | The Requests tab lists request threads, but MessagesMobile contains no Accept and no Decline control anywhere — grep for 'accept' returns only the accepted_at type field. The only way to acc | /Users/franciscocazares/vibe/src/components/mobile/MessagesMobile.tsx:420 |
| otto → 'Coming up' | Event title link | Open the event | Link to /events/<id> — there is no /events route in the app at all (src/app has no events directory), so this is a 404 | /Users/franciscocazares/vibe/src/components/otto/OttoUpcoming.tsx:48 |

### Other React routes (4)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| Otto's Room → Coming up | Event title link | Open the event | <Link href={`/events/${id}`}> — there is NO src/app/events route and no rewrite/redirect for /events/*. It is a 404. | src/components/otto/OttoUpcoming.tsx:48 |
| Settings → Campus tour | Replay tour → | Same tour, on my phone | Navigates to /profile/<your own handle>?welcome=1. On mobile that route renders ProfileMobile with targetHandle set, and ProfileMobile computes isVisitor = !!targetHandle with no self-check  | src/components/settings/SettingsClient.tsx:123 |
| /posts/[id] → post body | #hashtag chips (and inline #tags in the body text) | See other posts with this tag | Links to /campus?tab=feed&tag=<t>. campus-home initialises feedTagFilter to null and NEVER reads a ?tag= search param (grep for '"tag"' in campus-home returns nothing), and mobile has no tag | src/components/mobile/PostViewerMobile.tsx:596 |
| /posts/[id] (clip post) | The media area of a clip share-link | The video plays | The viewer only renders media when isImage is true (type === 'post' AND media_url not containing 'clips/'). There is no <video> element anywhere in PostViewerMobile, so a clip's share page r | src/components/mobile/PostViewerMobile.tsx:563 |

### Static desktop pages (6)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| Onboarding skip dialog | Skip anyway | Leave onboarding and land somewhere sensible | bailOnboarding() sets window.location.href='/'. The page is an iframe, so this navigates the IFRAME. The marketing landing page renders inside the 100vw/100vh iframe while the address bar st | public/html/onboarding.html:907 with src/app/onboarding/OnboardingSwitch.tsx:24 |
| Onboarding header | vibe. logo | Home | Plain <a href="/"> inside the iframe, so it loads the landing page nested rather than at top level | public/html/onboarding.html:329 |
| Profile nav (search dropdown) | An Events search result row | Opens that event | Navigates to /campus?tab=events&event=<id>. campus-home.tsx reads ?tab but NEVER reads ?event (no get("event") anywhere in src/). You land on the generic Events tab; the specific event is ne | public/html/profile.html:6434; src/app/campus/campus-home.tsx:321 reads only tab |
| Profile nav | Calendar icon | Opens my calendar | openCalModal() opens a real month-grid modal. But the calendar is 100% localStorage (CAL_KEY vibe_cal_events_v1) with NO server sync, and it is pre-seeded on every load with four fabricated  | public/html/profile.html:3160, :6483 (seedEvents), :6626 (_calSave) |
| Profile calendar modal | Month arrows, day cells, + Add / + Add an event, the x on an event, colour swatches, Cancel, Save event | Manage my schedule | modalChangeMonth / modalSelectDay / openCreateEventForKey / removeCalEvent / pickColor / saveNewEvent all work against the in-memory calendarEvents map, persisted only to localStorage. saveN | public/html/profile.html:8660-8738 markup, :6563-6628 handlers |
| Otto panel (all pages that load _otto.js) | A notification row of type mention in a chat | Jump to that conversation | __ottoOpenNotif sends you to plain /messages. The code comment says the channel is found via the messages channel_id but no channel id is ever passed, so you land on the generic inbox and ha | public/html/_otto.js:744-753 |

## Never checks whether it worked (74)

The action is attempted but the answer is ignored, so a failure is invisible to the student.

### Campus (desktop) (15)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| Calendar modal → Export popover | Apple Calendar | Download an .ics I can open in Calendar.app | Creates a synthetic <a href="/api/me/calendar/ics" download> and clicks it, then closes the popover. Route exists. No success/failure feedback whatsoever — if the endpoint 500s or the browse | src/components/LeftNav.tsx:1219-1229,1278 |
| Calendar modal → Export popover | Google Calendar | Get my calendar into Google | Same silent .ics download, PLUS window.open to calendar.google.com/…/settings/export in a new tab. Note the sub-label says 'Opens import settings' but the URL Google is sent to is the EXPORT | src/components/LeftNav.tsx:1231-1238,1291 |
| Calendar modal → Export popover | Outlook | Download an .ics for Outlook | Identical silent .ics download to the Apple row; the only difference is the label and sub-copy. | src/components/LeftNav.tsx:1218-1229,1302 |
| Calendar modal → day panel → event card | Delete (personal entries only) | Remove my personal event | window.confirm, then DELETE /api/me/personal-events/{id}. Non-ok throws and is only console.error'd — the row stays on screen with no message, so a failed delete looks like a no-op. | src/components/LeftNav.tsx:1326-1339,1402 |
| Feed tab → repost menu | Repost / Undo repost | Repost it, or take my repost back | POST or DELETE /api/posts/{id}/repost. On any failure it calls onDone('noop') which just closes the menu and refetches — the user sees the menu close and nothing change, with no error. /api/ | src/app/campus/campus-home.tsx:5771-5789,5866,5884 |
| Feed tab → post 3-dot menu | Copy link | Copy the post URL, with confirmation | navigator.clipboard.writeText(`${origin}/posts/{id}`) inside a try/catch with an empty catch. No toast, no label flip, no error. On a non-secure context or when the permission is denied, the | src/app/campus/campus-home.tsx:5265-5288 |
| Feed tab → post 3-dot menu | Report post (non-owned posts only) | Report it, and be told it was reported | Fire-and-forget POST /api/me/reports with a hardcoded reason_code:'other' and empty reason — no reason picker, no response check, empty catch, no confirmation. /api/me/reports HAS a terms ga | src/app/campus/campus-home.tsx:5290-5320; gate at src/app/api/me/reports/route.ts:43 |
| Feed tab → post 3-dot menu | Delete (own posts only) | Delete my post | window.confirm, DELETE /api/posts/{id}, throws on non-ok. On failure it only console.errors and un-disables the button — the menu stays open and no error shows. | src/app/campus/campus-home.tsx:5050-5070,5326-5330 |
| Feed tab → comments drawer | "Write a comment…" input (Enter to submit) | Post a comment | 1000-char cap; Enter without Shift submits. POST /api/posts/{id}/comments; on !data.ok it does nothing at all — the draft stays in the box with no error. /api/posts/[id]/comments HAS a terms | src/app/campus/campus-home.tsx:5971-5991,6021-6042 |
| Feed tab → comments drawer | Post (comment submit button) | Same as Enter | Same submit(); disabled while empty or submitting. | src/app/campus/campus-home.tsx:6043-6060 |
| Feed tab → comment row | Reply submit button | Post the reply | POST /api/posts/{id}/comments with parent_comment_id. Same silent-on-failure pattern as top-level comments: on !data.ok nothing happens and the reply box stays open with the text intact. | src/app/campus/campus-home.tsx:6116-6136,6271-6277 |
| Orgs tab (Discover) → org card | Join / Request to join | Join it (public) or send a request (private) | POST /api/orgs/{handle}/join. On data.ok it sets local state to 'joined' or 'pending' based on data.joined. On !data.ok NOTHING happens — no error, button just un-busies. Note /api/orgs/[slu | src/app/campus/campus-home.tsx:7783-7803,8857-8886 |
| Orgs tab → org quick-view modal | Join / Request to join (modal CTA) | Join from the preview | Calls the SAME handleJoin as the card — identical silent-failure behaviour. Disabled once org.role or a local status exists. | src/app/campus/campus-home.tsx:8307-8332,7989-7991 |
| Channel settings → Overview | ↑ Up / ↓ Down (reorder) | Move the channel in the list | Immediately calls onChannelsReordered locally, THEN POSTs /api/orgs/{handle}/channels/reorder — with no res.ok check and only a console.error catch. If the server rejects, the rail shows the | src/app/campus/campus-home.tsx:2422-2440,2526-2556 |
| Chat tab → message pane | Send | Send the message | POST /api/me/threads/{channelId}/messages. On !data.ok it RESTORES the draft text and the reply target so you can retry — but shows no error explaining why. /api/me/threads/[id]/messages HAS | src/app/campus/campus-home.tsx:12013-12043,12611-12615 |

### Mobile app (19)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| Landing (/) — whole page | Any click once the warp has started | Click something else / go back | The capture handler starts with `if (warping) return;` and body gets cursor:progress. If router.push never lands (offline, chunk fetch failure), the page stays in the warp state with no esca | src/components/landing/home-landing.tsx:72 |
| /auth/signup | "Create account →" submit | Creates my account and moves me to the .edu step | supabase.auth.signUp with emailRedirectTo=/auth/callback?next=%2Fauth%2Fschool-email%3Faccount_verified%3D1. If a session comes back (email confirmation disabled) it router.pushes /auth/scho | src/app/auth/signup/page.tsx:53-79 |
| /auth/forgot-password | "Send reset link" submit | Emails me a reset link and tells me if the address is wrong | POST /api/auth/password-reset. The route deliberately returns the SAME generic ok:true body for every non-config outcome (unknown email, Resend failure, generateLink failure) to prevent acco | src/app/auth/forgot-password/page.tsx:12-40; src/app/api/auth/password-reset/route.ts:20-88 |
| Onboarding — desktop, step 2 | Handle field (@yourhandle) with live availability status | Tells me instantly whether the handle is free, and reserves it | oninput → onHandleInput: lowercases in place, shows "too short" / "letters / numbers / _" locally, then debounces 280ms and GETs /api/handle/check?h=… (auth-gated; treats your own handle as  | public/html/onboarding.html:384-386, :782-803, :980-990; src/app/api/handle/check/route.ts:15-47 |
| Onboarding — desktop, step 4 | "Or paste a link" URL input | A pasted resume link previews and gets saved | onblur → maybePreviewResumeLink(): only previews http/https URLs whose path ends in .pdf or an image extension; anything else (a Google Drive or Notion link) is silently ignored with no mess | public/html/onboarding.html:509, :888-902, :925-927 |
| Onboarding — desktop, step 4 | "Finish & open my profile →" | Saves everything and opens my profile | Collects the draft, mirrors it into localStorage (vibeSave, defined in /html/_persistence.js loaded at line 14), then in replay mode warps to /profile with NO server save. Otherwise POSTs /a | public/html/onboarding.html:922-997 (fall-through at :997); src/app/api/me/onboarding-complete/route.ts:85-99 |
| Onboarding — mobile, step 4 | "Finish & open my profile →" | Saves and opens my profile | Identical logic to desktop, minus the iframe: setWarping(true), replay → /profile with no save, otherwise POST /api/me/onboarding-complete, handle 403 terms_required, best-effort handle PATC | src/components/mobile/OnboardingMobile.tsx:359-414 (fallback at :410-412), button at :845-852 |
| Post viewer | Repost | Repost, and see that it happened | Fire-and-forget POST /api/posts/[id]/repost inside a try/catch that swallows everything. No count, no active state, no toast — the button looks identical before and after, whether it worked  | /Users/franciscocazares/vibe/src/components/mobile/PostViewerMobile.tsx:639 |
| Post viewer → 3-dot menu | Copy link | Copy the post URL | Closes the menu, writes /posts/<id> to the clipboard, and shows NO confirmation; a clipboard rejection is swallowed silently | /Users/franciscocazares/vibe/src/components/mobile/PostViewerMobile.tsx:492 |
| Post viewer → 3-dot menu | Report post | Report it and be told it was received | Menu closes, then a fire-and-forget POST /api/me/reports with the response never inspected and errors swallowed. The user gets no confirmation and no error | /Users/franciscocazares/vibe/src/components/mobile/PostViewerMobile.tsx:505 |
| Post viewer → comments | Comment input + Post button (and Enter key) | Post my comment | POST /api/posts/[id]/comments; on success appends the row and clears the box. On a non-ok response nothing happens at all — no error, draft stays, count unchanged; the network catch is also  | /Users/franciscocazares/vibe/src/components/mobile/PostViewerMobile.tsx:732 |
| otto → 'Coming up' / 'Otto's asking' | Reminder Done / Dismiss (or Pass) | Mark the reminder handled | Row is removed locally, then POST /reminders/[id]/act or DELETE /reminders/[id] fires with only a console.error on network failure — the HTTP status is never checked, so a 403/500 leaves the | /Users/franciscocazares/vibe/src/components/mobile/OttoMobile.tsx:65 |
| otto → 'Otto's asking' | Connect (follow back a new follower) | Follow them back | Row removed locally, then POST /api/me/follow with no response check and only console.error on throw | /Users/franciscocazares/vibe/src/components/mobile/OttoMobile.tsx:85 |
| otto → 'Otto's asking' | Pass (on a follower request) | Dismiss this suggestion for good | Pure local state filter — no network call of any kind. The request reappears on the next page load | /Users/franciscocazares/vibe/src/components/mobile/OttoMobile.tsx:100 |
| otto → 'How chatty should I be' | Quiet / Moderate / Loud segments and the 5 notification checkboxes | Change my notification settings | Local state flips instantly, then a 350ms-debounced PATCH /api/me/otto/settings whose response is never checked (.catch → console.error only) | /Users/franciscocazares/vibe/src/components/otto/OttoSettings.tsx:109 |
| Profile → Portfolio | Company / project logo slot (owner) | Upload a logo | File picker → /api/me/profile-upload (kind=logo) → profile-sync patch. Errors are set into editError, which only renders in the identity block near the TOP of the page — roughly two screens  | /Users/franciscocazares/vibe/src/components/mobile/ProfileMobile.tsx:731 |
| Profile → Portfolio → Resume | Upload / Add pill (owner) | Attach a resume PDF | Hidden file input → /api/me/profile-upload (kind=resume) → appended to resume_docs; the pill shows 'Uploading…' then reverts. Any error lands in the off-screen editError banner, and the 4th  | /Users/franciscocazares/vibe/src/components/mobile/ProfileMobile.tsx:2845 |
| Profile (blocked state) | Unblock <name> / ← Back | Unblock them; leave | DELETE /api/me/block then window.location.reload(); on a failed response it just re-enables the button with no message. ← Back links to /network | /Users/franciscocazares/vibe/src/components/mobile/ProfileMobile.tsx:4463 |
| Onboarding (mobile) → step 4 | Finish & open my profile → | Save everything and land on my profile | POST /api/me/onboarding-complete, then a best-effort PATCH /api/me/handle, then redirect to j.next + ?welcome=1. But on ANY failure other than the terms 403 — network error, 500, ok:false —  | /Users/franciscocazares/vibe/src/components/mobile/OnboardingMobile.tsx:849 |

### Other React routes (17)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| Network (desktop) → list footer | Load more (N left) | Append the next 20 rows | Fetches the next page and appends. There is NO catch block — a network/500 failure throws inside the async handler (unhandled rejection), the spinner clears via finally, and nothing is appen | src/components/network/NetworkPageClient.tsx:640 |
| Network (desktop) → user card action | Connect (orange, state = not following) | Follow them; button flips to Following | POST /api/me/follow {target_id}. On res.ok the parent splices state to 'following' and refreshes counts. On ANY failure (403 block, 429 rate limit, 500) nothing changes and no error is rende | src/components/network/UserCard.tsx:333 |
| Network (desktop) → user card action | Connect back (gold, state = they follow you) | Follow back and become a mutual connection | Same POST /api/me/follow; on success local state becomes 'connected'. Same silent-failure path. | src/components/network/UserCard.tsx:424 |
| Network (desktop) → user card action | Following → Unfollow (label changes on hover) | Hovering warns me it will unfollow; clicking unfollows | DELETE /api/me/follow. Success splices to 'none' (or 'followed_by'). Failure is swallowed with no message. | src/components/network/UserCard.tsx:352 |
| Network (desktop) → user card action | Message (state = connected) | Open (or create) a DM thread with them | POST /api/me/threads {handle} then window.location = /messages?channel=<id>. /api/me/threads POST IS terms-gated (403 terms_required) — for an un-consented account nothing happens at all, no | src/components/network/UserCard.tsx:371 |
| Otto side panel (open) | (implicit) opening the panel marks everything read | My unread badge clears because I looked | If any loaded row is unread it fires POST /api/me/notifications/mark-read {all:true} in the background; the result is never checked (bare catch). | src/components/network/OttoSidePanel.tsx:93 |
| Otto's Room → Coming up | Done / Dismiss on a dated reminder | Done = I did it; Dismiss = I don't care. Row disappears. | Row is removed from local state FIRST, then POST /api/me/otto/reminders/<id>/act or DELETE /api/me/otto/reminders/<id>. Response is never inspected; errors go to console.error only. | src/components/otto/OttoPageClient.tsx:85 |
| Otto's Room → Asking for you | Connect (on a 'X wants to connect' follower row) | Follow them back | Removes the row locally, then POST /api/me/follow {target_id}. Result never checked; console.error only on throw. | src/components/otto/OttoPageClient.tsx:95 |
| Otto's Room → Asking for you | Done / Pass on an undated reminder | Complete or drop the reminder | Same handlers as the Coming-up section (act / delete). 'Pass' here maps to DELETE, unlike 'Pass' on follower rows which does nothing. | src/components/otto/OttoRequests.tsx:113 |
| Otto's Room → How chatty should I be | Chattiness segmented control (Quiet / Moderate / Loud) | A preset that sets my notification volume | Sets all five toggles to the preset and queues one debounced PATCH /api/me/otto/settings 350ms later. The fetch result is never inspected (bare .catch → console). The values persist to users | src/components/otto/OttoSettings.tsx:146 |
| Otto's Room → How chatty should I be | Five checkboxes (RSVP day before, mention pings, like milestones, daily summary 9AM, unanswered DMs >24h) | Turn each notification type on/off | Optimistic local state + the same debounced PATCH; failures invisible. Values are stored and read back, but no code path sends any of these notifications — there is no scheduler, email, or p | src/components/otto/OttoSettings.tsx:166 |
| Settings → Sign out | Sign out | End my session | POST /api/auth/logout then hard navigation to /auth/login. The POST's status is never checked — on a throw it only un-busies the button; a non-2xx response still navigates you to login (whic | src/components/settings/SettingsClient.tsx:921 |
| /posts/[id] → ⋯ menu | Copy link | Link on my clipboard, ideally with a confirmation | navigator.clipboard.writeText(origin + /posts/<id>) inside a try/catch with an empty catch. The menu closes either way — there is no toast, so a blocked clipboard (insecure context, permissi | src/components/mobile/PostViewerMobile.tsx:492 |
| /posts/[id] → ⋯ menu | Report post | A reason picker, or at least a 'thanks, we got it' | Fires POST /api/me/reports immediately with a hardcoded reason_code:'other' and empty reason — no confirmation dialog, no reason picker, and the response is discarded in an empty catch. The  | src/components/mobile/PostViewerMobile.tsx:505 |
| /posts/[id] → engagement bar | Repost | Reposts it; the button reflects that I reposted | POST /api/posts/<id>/repost with an empty catch and no state change at all — no count update, no active styling, no toast. The route IS terms-gated, so for an un-consented account it 403s an | src/components/mobile/PostViewerMobile.tsx:639 |
| /posts/[id] → comments composer | Comment field + Post button (Enter also submits) | My comment appears in the list | POST /api/posts/<id>/comments; on ok the comment is appended and the count bumps. On ANY failure the catch is empty — the draft stays in the box, nothing appends, no error appears. The route | src/components/mobile/PostViewerMobile.tsx:732 |
| /orgs/[handle] → header | Request to join (private org) | My request reaches the admins and I hear back | Same endpoint files an org_join_requests row and the button becomes a static 'Request pending' badge. NO notification is created for org staff — the join route inserts nothing into notificat | src/app/orgs/[handle]/join-button.tsx:122 |

### Static desktop pages (23)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| Onboarding step 4 | Finish and open my profile | Saves everything and takes me into the app | POSTs /api/me/onboarding-complete. 403 terms_required redirects to /auth/terms; success plays the warp and sets location.href = j.next + ?welcome=1. TWO problems: (a) both navigations happen | public/html/onboarding.html:514 and :915-993 |
| Onboarding step 4 | Handle claim (part of Finish) | My chosen @handle is claimed | PATCH /api/me/handle inside a bare try/catch with an empty catch and no response check. If the handle was taken between the availability check and Finish, the user is never told and lands wi | public/html/onboarding.html:975-984 |
| Profile nav | The unread dot on the nav icons | Tells me I have unread messages | The markup hardcodes class has-unread on the Messages button so the dot shows before any data loads. _miniMessenger.paintBadge then targets document.querySelectorAll('.nav-msg-btn') indiscri | public/html/profile.html:3171 and CSS :2066; public/html/_miniMessenger.js:311-316 |
| Profile share modal | Search your connections field | Filter recipients | Debounced 220ms refetch of /api/me/connections?q=. On a network failure the catch sets recipients to [] which renders No connections to send to yet, indistinguishable from genuinely having n | public/html/profile.html:9094-9114 |
| Profile cover | Upload photo (cover panel) | New banner, saved | Opens the file picker, runs the 3:1 image cropper, converts to a data URL, applies it, toasts Cover photo updated immediately, then saveProfileToStorage -> scheduleProfileServerSync (1.2s de | public/html/profile.html:3240 and :4116 |
| Profile cover / Choose a cover modal | Drag an image onto the Drop an image or click to browse zone, then Apply | That image becomes my banner | The drop handler uses URL.createObjectURL -> a blob: URL. applyCoverPhoto paints it, but saveProfileToStorage only accepts data:, https: or http: prefixes, so user.coverPhoto is never update | public/html/profile.html:4179-4196 (drop handler) and :7406 (prefix allowlist) |
| Profile avatar | Avatar circle -> Upload a photo zone, and the thumbnails in the preview strip | Set my profile photo | toggleAvatarPicker opens the pane; the zone clicks #avatarFileInput; handleAvatarUpload runs the 1:1 circle cropper, applies a data URL, toasts Profile photo updated, then defers the real up | public/html/profile.html:3252, :3261, :4022, :4051 |
| Profile connections modal | Connections / Following / Followers tabs, the search field, Load more | Browse and filter each list | switchConnectionsTab refetches; search is a debounced server-side q=; Load more pages by offset. A failed fetch is caught and renders No one here yet, identical to a genuinely empty list. | public/html/profile.html:9231-9233, :9336, :9385-9404 |
| Profile connections modal | The Connect / Connect back / Following / Message pill on each row | Follow or message from the list | handleAction POSTs or DELETEs /api/me/follow (or POSTs /api/me/threads for Message). On success the row updates. On ANY failure the catch is empty and the r.ok/j.ok check simply falls throug | public/html/profile.html:9347-9390 |
| Visited profile header | Connect (primary button) | Send a connection request | Real path: optimistic setVibeRelState then POST/DELETE /api/me/follow with a rollback and a toast on failure. When connected the button becomes Message and goes to /messages?to=<handle>. BUT | public/html/profile.html:3295 and :6022-6086 (fake-accept timer at :6079) |
| Visited profile header | Follow instead pill | Follow without connecting | handleSoftFollow flips the label to Following and toasts BEFORE the fetch, then awaits /api/me/follow inside a bare try with an empty catch and no response check. Worse, the pill is only vis | public/html/profile.html:3299 and :6087-6119; visibility set at :5885 and :5908 |
| Visited profile header | Kebab -> Report -> reason -> Submit report | Report is filed and I hear back | POSTs /api/me/reports and handles a JSON error, but the promise chain has NO .catch(). On a network drop or a non-JSON response the Submit button stays disabled reading Sending... forever wi | public/html/_safetyActions.js:293-319 (no catch on the fetch chain) |
| Profile nav | Edit pencil -> exit edit mode | Changes saved | toggleEdit() unconditionally toasts Changes saved on exit. It does not call any save and does not check anything; the actual write happened (or failed) on the debounced path. So the toast ap | public/html/profile.html:3964 |
| Profile floating edit toolbar | B / I / U / Clear | Format the text I am editing | execCmd uses the deprecated document.execCommand for bold/italic/underline; Clear empties the focused field. The resulting <b>/<i>/<u> markup is discarded on save because saveProfileToStorag | public/html/profile.html:3115-3119, :3994-3995, :7360 (textContent read) |
| Profile post card (edit mode) | The x Delete post button on a post card | Deletes the post | deleteProfilePost() removes the DOM node, rewrites vibe_posts_v1 and toasts Post removed. It NEVER calls the delete API. On the next load hydrateProfilePostsFromAPI wipes the list and repain | public/html/profile.html:8265 (button), :8308-8324 (no fetch), :7963-7978 (server repaint); working path at public/html/_postViewer.js:712 |
| Profile post card (edit mode) | Pin / Pinned button on a post card, and Unpin on the pinned card | Pin a post to the top of my profile | pinFromProfile updates the DOM and localStorage immediately, then _syncPinToServer PATCHes /api/me/pinned with a bare .catch(() => {}) and no response check. A rejected pin still shows as pi | public/html/profile.html:8264, :5394, :5468-5481 (silent catch) |
| Post viewer share picker, opened FROM /messages | Send / Send to N (share picker CTA) | Confirmation that it sent | The send loop works, but the only feedback is guarded by if (window.showToast). profile.html defines a global showToast; messages.html does NOT define one anywhere. So sharing a post from th | public/html/_sharePicker.js:291-294; no showToast definition in public/html/messages.html (only a guarded call at :2669) |
| Messages thread column | Message requests banner | Open the pending requests | Hidden by default; __dmRenderList shows it and sets reqBanner.onclick to open the FIRST request only. With 3 pending requests the banner reads 3 people but always opens request #1. | public/html/messages.html:986-991 and :1925-1938 |
| Messages request bar | Accept / Decline | Accept or reject a message request | Both hide the bar (and Decline removes the thread from view) BEFORE the fetch, then call /accept or /decline with no r.ok or j.ok check at all and only a console.error catch. A rejected requ | public/html/messages.html:1036 (Decline), :2286-2310 |
| Messages bubble hover actions | Emoji reaction buttons, Reply, and Delete on your own message | React, reply, delete | Reactions paint optimistically then POST/DELETE /react; on failure they silently refetch the channel so the reaction just quietly disappears with no message. Reply sets the reply pill. Delet | public/html/messages.html:1265-1281, :1666-1706 (silent revert), :2791 |
| Messages chat info panel (groups) | Per-member Mute button | Confirmation that they are muted in this group | The API call is real, but the success feedback is if (window.showToast) window.showToast(...). messages.html never defines showToast, so the confirmation never appears. | public/html/messages.html:2571 (button) and :2669 (guarded toast that can never fire) |
| Messages chat info panel (groups) | + Add (members) then Add to group | Add everyone I picked | __dmPanelDoAdd loops the selection. It surfaces an alert only for 403 not-connected failures; any other per-user failure is console.warn only, so a partial failure looks like a full success. | public/html/messages.html:2557, :2961-2993 |
| Messages deep link (/messages?to=<handle>) | Arriving here from a profile Message button, a connections-modal Message pill, or an org link | The conversation with that person opens | __dmEnsureFromHandle POSTs /api/me/threads and on ANY failure returns null after only a console.error. initMessagesPage then does nothing at all - no toast, no banner - so you land on the ge | public/html/messages.html:3048-3059 (silent null) and :3096-3113 (no else branch), contrast :3117-3126 |

## Blocked by a gate or missing data, not broken (39)

These are not bugs. They need a permission, or data that does not exist yet.

### Campus (desktop) (21)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| Left nav → Platform section | Admin | Open the admin console | Rendered only after /api/me/profile-bootstrap returns isPlatformAdmin===true. Link href=/admin. Fetch failure silently leaves it hidden. | src/components/LeftNav.tsx:206-215,335 |
| Calendar modal → day panel → event card | Add to calendar app (RSVP entries only) | Download this one event as .ics | <a href="/api/events/{id}/ics" download>. Route exists. Rendered only for kind==='rsvp' entries. | src/components/LeftNav.tsx:1387-1392 |
| Otto corner → mention toast | Open post → | Jump to the post I was mentioned on | <a href="/posts/{id}"> and clears the toast. /posts/[id] exists. | src/components/network/OttoCorner.tsx:577 |
| Events tab | + Create event | Post an event | Only rendered when canCreate — i.e. you are owner OR admin of at least one org where verified===true. 3 of 5 orgs are verified, so this is reachable for their owners/admins and invisible to  | src/app/campus/campus-home.tsx:6592-6597,6629-6632 |
| Events tab → event card | Org name / logo | Open the hosting org | Link href=/orgs/{ev.org.handle}. | src/app/campus/campus-home.tsx:6786-6788 |
| Events tab → event card | Add to calendar (.ics) | Download this event for my calendar app | <a href="/api/events/{id}/ics" download> with stopPropagation. Only rendered once you have an RSVP status. | src/app/campus/campus-home.tsx:6888-6897 |
| Events tab → event card | Manage attendees (organisers only) | See who's coming | Only rendered when ev.viewer_can_manage. Opens AttendeesModal which GETs /api/events/{id}/attendees. | src/app/campus/campus-home.tsx:6899-6903,6947-6951 |
| Chat tab → channel rail | ⚙ on a channel row | Edit this channel | Opens ChannelSettingsModal. Only rendered when canManage (owner/admin) AND the row is hovered — it is invisible until you mouse over the row, and it does not exist at all for members/mods. | src/app/campus/campus-home.tsx:11429-11455; canManage at 11478 |
| Chat tab → channel rail footer | + Channel | Create a channel | Opens CreateChannelModal. Rendered only when canManage. | src/app/campus/campus-home.tsx:11643-11648 |
| Org settings → Requests | Approve / Deny | Accept or reject a join request | POST /api/orgs/{handle}/requests/{id} {action}, inline error on failure, refresh on success. Panel only renders for staff of a PRIVATE org. | src/app/campus/campus-home.tsx:1955-1972,2035-2052 |
| Map tab | Canvas drag (pan) and mouse-wheel zoom | Move around the map | onPointerDown/Move/Up set pan; a non-passive wheel listener zooms anchored to the cursor. Cursor flips grab→grabbing. | src/app/campus/campus-home.tsx:9245-9260,9270-9320,9374-9377 |
| Map tab | A major bubble (e.g. "Computer Science") | See who's in that major | pickZone → ZonePanel slides in on the right and fetches that zone's people, then the map pans/zooms to centre the bubble. | src/app/campus/campus-home.tsx:9497-9513,10094-10104 |
| Map tab → Org Center | Collapsed "Org Center · N" pill | Expand the org cluster | onToggleCollapse → expands into a list of org buttons. | src/app/campus/campus-home.tsx:10235-10241 |
| Map tab → Org Center | Collapse ✕ | Fold the org cluster away | Same onToggleCollapse back to the pill. | src/app/campus/campus-home.tsx:10315-10321 |
| Map tab → Org Center | An org row in the expanded cluster | See that org's members on the map | onPick(org) → pickZone({kind:'org'}) → ZonePanel for that org. | src/app/campus/campus-home.tsx:10343-10349 |
| Map tab | "Jump to a major…" search input (Enter picks the top hit) | Find a major without hunting | Filters the loaded major list; Enter calls jumpToMajor(searchResults[0]). Only rendered when hasData. | src/app/campus/campus-home.tsx:9560-9572 |
| Map tab → search dropdown | A search result row | Fly to that major | jumpToMajor(m.name) — pans so the bubble lands at viewport centre, zooms in, and opens the zone panel. | src/app/campus/campus-home.tsx:9600-9604,9213+ |
| Map tab | Recenter | Reset the view | setPan({0,0}); setZoom(1). Hidden until zones exist so it can't float over the empty-state overlays. It does NOT close an open zone panel. | src/app/campus/campus-home.tsx:9685-9716 |
| Map tab → zone panel | Close ✕ | Dismiss the panel | setSelected(null); the panel unmounts. The map's pan/zoom is NOT restored. | src/app/campus/campus-home.tsx:10553-10557,9721-9727 |
| Map tab → zone panel | Discover / Mutuals / Connected tabs | Slice the people list | setTab; counts come from the zone fetch. Two distinct empty states exist: a zone-level one ('Nobody else at your campus has this major…') and a per-tab one ('No mutuals here yet.'). | src/app/campus/campus-home.tsx:10581-10593,10625-10645 |
| Map tab → zone panel | A person row (View →) | Open that person's profile | Whole row is a Link to /profile/{handle}, falling back to /network when the user has no handle. | src/app/campus/campus-home.tsx:10661-10665 |

### Mobile app (8)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| Landing (/) — orbit centre | The sun / "Step inside →" CTA at orbit centre | The big glowing Otto in the middle is the main call to action — tap it to enter | Rendered ONLY when `unlocked && focused === null`, i.e. after all three moons have been clicked in this page session. Until then the centre is a non-interactive div (.vibe-landing-orbital-co | src/components/landing/landing-orbit.tsx:74 (showSunCta = unlocked && focused === null); src/components/landing/home-landing.tsx:50 |
| /auth/school-email (step 2 of signup) | Page entry itself (server gate) | I'm sent here right after confirming my email | layout.tsx awaits enforceSchoolEmailPage(): no user → /auth/login?next=/auth/school-email; no complete consent record → /auth/terms?next=/auth/school-email; already school_verified → /onboar | src/app/auth/school-email/layout.tsx:5; src/lib/auth/campus-access.ts:50-77 |
| /auth/terms (consent interstitial) | Page entry itself | I only see this once, and never if I've already agreed | Server page: no user → login with a return-to; consent already complete (hasRecordedConsent: terms_accepted_at AND age_attested_at AND terms_version === '2026-05-07') → redirect(next) so the | src/app/auth/terms/page.tsx:47-77; src/lib/legal/terms.ts:22-25 |
| /legal/privacy §4 | "your profile page" link | Opens my profile to edit my data | Next Link to /profile. src/proxy.ts sends anonymous visitors from /profile to /auth/login?next=/profile. Since the legal pages are exactly where a logged-out prospective signup reads, this l | src/app/legal/privacy/page.tsx:101; src/proxy.ts:100-107 |
| /legal/privacy §4 and /legal/terms §6 | "Settings → Danger zone" / "Settings" links | Opens account settings to delete my account | Next Links to /settings. The settings page itself redirects an anonymous visitor to /auth/login?next=/settings; signed in it loads with no consent gate. | src/app/legal/privacy/page.tsx:112 and src/app/legal/terms/page.tsx:98; src/app/settings/page.tsx:18 |
| /onboarding — routing | Arriving at /onboarding at all | Meet Otto after verifying my campus | Server page gates in order: no user → login; no complete consent → /auth/terms?next=/onboarding; not school_verified → /auth/school-email; already Otto-complete and no ?replay=1 → /profile.  | src/app/onboarding/page.tsx:29-62; src/app/onboarding/OnboardingSwitch.tsx:22-38; src/app/onboarding/classic/route.ts:26-70 |
| Campus → Events | Manage attendees (+ the attendees modal's Message / Message all) | See who's coming and message them | Renders only when ev.viewer_can_manage; the modal fetches /api/events/[id]/attendees and its Message buttons POST /api/me/threads then window.location.href = /messages?channel=… | /Users/franciscocazares/vibe/src/app/campus/campus-home.tsx:6949 |
| Campus → Map | Map canvas (pan / pinch), major bubbles, Recenter button, zone sheet tabs and people rows | Explore the campus map | /api/campus-map returns reason:'no_school' for every account whose users.school is blank — which is all 8 production users — so the map never renders bubbles; the whole surface is replaced b | /Users/franciscocazares/vibe/src/components/mobile/MapMobile.tsx:391 |

### Other React routes (7)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| Settings → Blocked users | Unblock | Remove someone from my block list | DELETE /api/me/block {target_id}; on success the row is spliced out. Failure is swallowed entirely — no error, row stays. The card is unreachable today: the blocks table has 0 rows, so every | src/components/settings/SettingsClient.tsx:376 |
| /orgs/[handle] → Upcoming events | + Create event (owner/admin only) | Create an event scoped to this org | Opens campus's CreateEventModal pre-seeded with only this org as the eligible org; on create it refetches /api/events?org_id=… | src/app/orgs/[handle]/OrgEventsSection.tsx:90 |
| /orgs/[handle] → Upcoming events | Manage attendees (event creator / org staff) | See and manage who's coming | Opens AttendeesModal (campus-home) backed by /api/events/[id]/attendees. | src/app/campus/campus-home.tsx:6944 |
| /orgs/[handle] → Owner/admin tools bar | Banner / Logo / Edit details / New post (4 buttons) | The full set of things an org owner can manage from the org page | Each opens its modal. The bar renders only when viewerRole is owner or admin. Notably absent: any Members or Requests entry — join-request approval and member management exist only under cam | src/app/orgs/[handle]/admin-actions.tsx:101 |
| /admin (route access) | Navigating to /admin at all | Only admins get in | No session → /auth/login?next=/admin. Session without is_platform_admin → redirect('/campus') deliberately, so the URL never confirms the page exists. | src/app/admin/page.tsx:28 |
| /the-map (founder roadmap) | Navigating to /the-map | Internal roadmap, admins only | Anonymous → /auth/login?next=/the-map; signed-in non-admin → notFound(). Also 404s outright if the service role key isn't configured. | src/app/the-map/page.tsx:36 |
| /network and /otto (route access) | Navigating to /network or /otto | They just open | enforceCampusAccess runs login → consent → school_verified → otto-complete in that order. Consent requires terms_accepted_at AND age_attested_at AND terms_version === '2026-05-07'; only 1 of | src/lib/auth/campus-access.ts:35 |

### Static desktop pages (3)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| Profile identity | Verify your student status CTA (next to your name) | Start school-email verification | Sets window.location.href = /auth/school-email. Only rendered when studentVerification is not verified; since /profile is behind enforceCampusAccess which already requires school_verified, n | public/html/profile.html:7157-7169; gate at src/app/profile/page.tsx:14 |
| Messages left sidebar (Campus / Network / Messages / otto / your profile chip / the whole My Calendar widget) | Every control in aside.left-nav, including the calendar title button, the chevron toggle, the month arrows and the day cells | Navigate and see my calendar next to my DMs | MessagesSwitch always loads the iframe with embedded=1, and _persistence.js then adds body.vibe-embedded, whose CSS rule hides .left-nav entirely so the React CampusAppShell sidebar can show | public/html/messages.html:24 (body.vibe-embedded .left-nav display:none), :945-969 (calendar inside the aside); src/app/messages/MessagesSwitch.tsx:41 sets embedded=1 |
| Messages calendar modal (reachable via the hidden sidebar only) | Month arrows, day cells, + Add an event, event x, Save event, close x | Manage my calendar | Same localStorage-only implementation and the same four fabricated seed events as the profile page | public/html/messages.html:1485 (seed), :1623-1624 (localStorage), :3189-3207 (modal); trigger hidden by :24 |

## Needs a live click to know (9)

Could not be settled from the code.

### Campus (desktop) (1)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| Feed tab → composer | Text area (with @mention typeahead) | Type a post; typing @ suggests people | Controlled textarea capped at 2000 chars. bindMentionPicker attaches the legacy _mentionPicker.js typeahead on mount. | src/app/campus/campus-home.tsx:4500-4503,4705 |

### Mobile app (7)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| /auth/update-password (from the reset email) | Automatic session restore from the URL hash | The reset link logs me in just long enough to set a new password | On mount, reads #access_token/#refresh_token, calls setSession, strips the hash, sets sessionReady. If there is NO hash it silently sets sessionReady=true and shows the form anyway — so a di | src/app/auth/update-password/page.tsx:20-45 |
| Onboarding — desktop (iframe of /onboarding/classic) | "vibe." logo, top-left | Leaves onboarding and goes home | <a href="/"> with no target inside the iframe, so it navigates the IFRAME to the landing page. next.config.ts sets X-Frame-Options: SAMEORIGIN, so same-origin framing is allowed and the land | public/html/onboarding.html:329; src/app/onboarding/OnboardingSwitch.tsx:29; next.config.ts:57 |
| Campus → composer sheet | Typing @ or # in the textarea (mention/hashtag picker) | Autocomplete list of people / tags | bindMentionPicker injects /html/_mentionPicker.js and calls window.vibeBindMentionPicker(textarea) once loaded | /Users/franciscocazares/vibe/src/lib/composer/helpers.ts:101 |
| Campus → Events | Add to calendar (appears only after you RSVP) | Add to my phone calendar | <a href="/api/events/[id]/ics" download> — the route exists, but 'download' on iOS Safari does not behave like desktop; it may open the file, offer 'Add to Calendar', or do nothing visible | /Users/franciscocazares/vibe/src/app/campus/campus-home.tsx:6891 |
| Campus → Chat → channel chat → 3-dot | Pin to top / Mute… / Clear chat history / Delete conversation (on an ORG channel) | Pin or mute this channel | Hits the same /api/me/threads/[id]/{pin,mute,clear,hide} routes, all of which require a channel_members row. Org membership upserts those rows for public channels, so it may work — but a cha | /Users/franciscocazares/vibe/src/app/api/me/threads/[id]/pin/route.ts:42 |
| Profile → resume viewer | Close (×) / 'Edit bars' / draw or tap a bar / 'Open' / reset-zoom pill / pinch | Read the resume, black out details, open the raw file | PDFs are rasterized page-by-page through pdf.js loaded from a CDN; 'Edit bars' turns pointer drags into redaction rectangles and taps into deletes, persisted through the parent's profile-syn | /Users/franciscocazares/vibe/src/components/mobile/ResumeViewerMobile.tsx:302 |
| Profile / Campus / Network (Otto spotlight tour) | Tour bubble Next / Skip buttons (only after Settings → Replay tour) | Walk the 3-leg tour | useMobileTour loads /html/_otto-tour.js, polls up to 8s for the leg's anchor element, then starts; Done hands off to the next leg via localStorage and navigates, Skip ends the flow. All 6 an | /Users/franciscocazares/vibe/src/components/mobile/use-mobile-tour.ts:172 |

### Static desktop pages (1)

| Screen | Control | Student expects | What actually happens | Where |
|---|---|---|---|---|
| Public profile share page (/profile/<handle> and the anonymous /html/profile.html?handle=) | The whole signed-in top nav rendered to logged-out visitors: Campus, Network, search box, calendar, messages, edit pencil, settings cog, share | A share link should show a public profile, not app chrome I cannot use | src/proxy.ts explicitly lets anonymous traffic through for ?handle=. Nothing in the page hides the nav for a logged-out viewer (only .owner-only is hidden by viewer-mode). Search hits /api/s | src/proxy.ts:88-90; public/html/profile.html:3126-3206 (nav has no viewer-mode/anon gate) |

## Confirmed working (388)

Listed compactly so a walkthrough can spot-check rather than test each one.

| Screen | Control | Viewport |
|---|---|---|
| Landing (/) — orbit | PULSE moon (coral, inner ring) | both |
| Landing (/) — orbit | SCENE moon (yellow, middle ring) | both |
| Landing (/) — orbit | CONNECT moon (purple, outer ring) | both |
| Landing (/) — orbit detail | "← Back to orbit" button | both |
| Landing (/) — orbit detail | Escape key while a feature card is open | desktop |
| Landing (/) — bottom rail | "New here? Create your account →" | both |
| Landing (/) — bottom rail | "Already have an account? Log in →" | both |
| /auth/login | "← back" (top-left) | both |
| /auth/login | "Personal email" input | both |
| /auth/login | "Password" input | both |
| /auth/login | "Forgot?" link beside the password label | both |
| /auth/login | "Sign in →" submit | both |
| /auth/login | "New to vibe? Create an account" | both |
| /auth/signup | "← back" | both |
| /auth/signup | "Personal email" input | both |
| /auth/signup | "Password" input (8–20 characters) | both |
| /auth/signup | "I'm 18 or older and I agree…" checkbox | both |
| /auth/signup | "Terms of Service" link inside the consent line | both |
| /auth/signup | "Privacy Policy" link inside the consent line | both |
| /auth/signup | "Already have an account? Log in" | both |
| /auth/callback (landed on from the confirmation email) | The confirmation link itself (no on-page control — the page auto-runs) | both |
| /auth/forgot-password | "Email" input | both |
| /auth/forgot-password | "Back to log in" | both |
| /auth/update-password | "New password" input | both |
| /auth/update-password | "Update password" submit | both |
| /auth/update-password | "Back to log in" | both |
| /auth/school-email | "School email" input (@iu.edu or @iupui.edu) | both |
| /auth/school-email | "Send verification link →" submit | both |
| /auth/school-email | "Wrong email used to sign up? Log back in" | both |
| /auth/school-email | Loading gate ("Loading…" before the form) | both |
| /auth/verify-school (from the IU verification email) | The verification link itself (auto-runs on load) | both |
| /auth/verify-school error state | "Try again" | both |
| /auth/verify-school success state | "Continue manually" | both |
| /auth/terms | "I'm 18 or older and I agree…" checkbox | both |
| /auth/terms | "Terms of Service" / "Privacy Policy" links in the consent line | both |
| /auth/terms | "Continue →" submit | both |
| /auth/terms | "delete your account" link | both |
| /auth/terms | "sign out" button (inline, styled as a link) | both |
| /legal/terms and /legal/privacy | "← Back to Vibe" | both |
| /legal/terms and /legal/privacy — footer | "Terms of Service" · "Privacy Policy" · "Contact" | both |
| /legal/privacy §4 and §9, /legal/terms §12 | hello@connectvibe.app mailto links (three of them) | both |
| Onboarding — desktop | "Skip onboarding" (header) and "Maybe later" (step 1) | desktop |
| Onboarding — desktop, skip dialog | "Keep going" / Esc | desktop |
| Onboarding — desktop, step 1 | "Let's go →" | desktop |
| Onboarding — desktop, step 2 | Name / Bio / Major / Department / Year / Interests / Skills fields | desktop |
| Onboarding — desktop, step 2 | "Which campus are you at?" select | desktop |
| Onboarding — desktop, step 2 | "What are you here for?" — 4 checkboxes (Meeting people / Showing my work / Find | desktop |
| Onboarding — desktop, step 2 | "Continue →" and "Skip to resume →" | desktop |
| Onboarding — desktop, step 3 | Role 1 and Role 2 field groups (company / title / dates / location / description | desktop |
| Onboarding — desktop, step 3 | "Continue →" and "Skip" | desktop |
| Onboarding — desktop, step 4 | "Upload PDF or image" → hidden file input | desktop |
| Onboarding — mobile | "Skip" (header, steps 2–4 only) | mobile |
| Onboarding — mobile, sticky footer | Step 1 "Let's go →"; step 2 "Continue →" / "Skip to resume →"; step 3 "Continue  | mobile |
| Onboarding — mobile, step 2 | Name / handle (live check) / bio / campus select / major / department / year / i | mobile |
| Onboarding — mobile, step 4 | "Upload PDF or image" and the resume link field | mobile |
| Network (desktop) → tab strip | Connections / Following / Followers tabs | desktop |
| Network (desktop) → tab strip | Suggestions tab | desktop |
| Network (desktop) → search | Search field above the list | desktop |
| Network (desktop) → Suggestions filters | All / From your orgs / Mutuals / Same major pills | desktop |
| Network (desktop) → user card | Avatar, name, and the wide banner block (three separate links) | desktop |
| Network (desktop) → empty state | 'Find your clubs →' / 'Browse orgs →' / 'Open the feed →' CTA | desktop |
| Otto corner orb (desktop chrome on /campus, /network, /settings, /otto — hidden  | Bottom-right dark orb | desktop |
| Otto corner → mention toast | 'Open post →' in the live mention pop-up | desktop |
| Otto corner → mention toast | Dismiss | desktop |
| Otto side panel → header | × close button, backdrop click, and Esc | desktop |
| Otto side panel → stats grid | Follows / Connections / Likes / Comments tiles | desktop |
| Otto side panel → metrics block | Whole 4-tile metrics block (Profile views 30d / Post views / Likes / Reposts) | desktop |
| Otto side panel → filter pills | All / Follows / Connections / Likes / Comments | desktop |
| Otto side panel → notification row | The row body (anywhere outside the avatar/name) | desktop |
| Otto side panel → notification row | Actor avatar and actor name (two nested buttons) | desktop |
| Otto side panel → footer | Open Otto's command center → | desktop |
| Otto's Room (/otto) → tabs | Today / Stats | desktop |
| Otto's Room → Asking for you | Open inbox → | desktop |
| Otto's Room → Tell otto something | Text field + Save | desktop |
| Otto's Room → Stats tab | Recent viewer avatars under Profile views | desktop |
| Settings → Account info | 'your profile page' link | both |
| Settings → Campus card | Campus <select> (saves on change, no Save button) | both |
| Settings → Handle card | @handle input (live availability check) | both |
| Settings → Handle card | Save (handle change) | both |
| Settings → Campus tour | Replay tour → | desktop |
| Settings → Danger zone | Delete account… | both |
| Settings → Danger zone | Handle confirmation input + 'Permanently delete' | both |
| Settings → Danger zone | Cancel | both |
| Settings → footer | Terms of Service / Privacy Policy | both |
| /profile (own profile, desktop bridge) | (automatic) the bridge itself | desktop |
| /profile → bridge error state | 'Sign in again' and 'Back to campus' links | desktop |
| /profile/[handle] (someone else's profile) | (automatic) desktop redirect into the static viewer | desktop |
| /posts/[id] (share-link post page) | × close | both |
| /posts/[id] → header | Author avatar + name | both |
| /posts/[id] → header | ⋯ three-dot menu | both |
| /posts/[id] → ⋯ menu | Send to chats | both |
| /posts/[id] → ⋯ menu (own post) | Delete post | both |
| /posts/[id] → engagement bar | Heart / like | both |
| /posts/[id] → engagement bar | Comment bubble (count) | both |
| /posts/[id] → engagement bar | Bookmark / save | both |
| /posts/[id] → post body | @mention links inside the text | both |
| /orgs/[handle] → top nav | vibe. wordmark | both |
| /orgs/[handle] → top nav | ← Return to Organizations (signed in) / Sign in (signed out) | both |
| /orgs/[handle] → header | Join (public org) | both |
| /orgs/[handle] → header | Sign in to join / Sign in to request (logged out) | both |
| /orgs/[handle] → content tabs | Posts / Events / About pills | mobile |
| /orgs/[handle] → Channels card | + Join all public (members only) | both |
| /orgs/[handle] → Channels card | A channel row (member) | both |
| /orgs/[handle] → Upcoming events | Going / Interested RSVP buttons on an event card | both |
| /orgs/[handle] → Upcoming events | Add to calendar (only after you RSVP) | both |
| /orgs/[handle] → Links card | Each external link row | both |
| /orgs/[handle] → Edit details modal | Save | both |
| /orgs/[handle] → Edit details modal | Links editor: Add / × remove rows | both |
| /orgs/[handle] → Edit details / Upload / New post modals | Cancel, the × in the modal header, and backdrop click | both |
| /orgs/[handle] → Change banner / Change logo modal | Pick a file → cropper Confirm/Cancel | both |
| /orgs/[handle] → Change banner / logo modal | Save (upload) | both |
| /orgs/[handle] → Post as the org modal | Publish | both |
| /admin → header nav | ← Campus, Profile, Network, Settings links | both |
| /admin → org list | Search by name or handle | both |
| /admin → org list | all / verified / community / dormant filter pills (with counts) | both |
| /admin → org row | Org name link | both |
| /admin → org row | Verify / Unverify | both |
| /the-map → closing section | 'companion: the product journal ›' | both |
| /the-map → Lyra constellation | prev / next buttons and the numbered stage dots | desktop |
| /the-map → Lyra constellation | Stacked stage cards | mobile |
| Left nav (every campus-shelled route) | "vibe." wordmark | desktop |
| Left nav | Campus | desktop |
| Left nav | Network | desktop |
| Left nav | Messages | desktop |
| Left nav | Otto | desktop |
| Left nav | Settings | desktop |
| Left nav → identity chip | Profile card (banner + avatar + name) | desktop |
| Left nav → calendar widget | "My Calendar" header (with orange count badge) | desktop |
| Left nav → calendar widget | ‹ / › month arrows (mini calendar) | desktop |
| Left nav → calendar widget | A day cell in the mini calendar | desktop |
| Calendar modal | ‹ / › month arrows | desktop |
| Calendar modal | Export ▾ | desktop |
| Calendar modal | + New Event | desktop |
| Calendar modal | × close | desktop |
| Calendar modal → month grid | A day cell | desktop |
| Calendar modal → day panel | + Add an event (empty day) | desktop |
| Calendar → Add personal event form | Colour swatches (6 presets) | desktop |
| Calendar → Add personal event form | Cancel | desktop |
| Calendar → Add personal event form | Save event | desktop |
| Otto corner (bottom-right orb, every campus route except Chat tab and /messages) | Otto orb | desktop |
| Otto corner → mention toast | Dismiss | desktop |
| Otto side panel | Close ✕ / scrim | desktop |
| Otto side panel | Stat tiles: Follows / Connections / Likes / Comments | desktop |
| Otto side panel | Metrics block (Profile views / Post views / Likes / Reposts) | desktop |
| Otto side panel | Filter chips (All / Follows / Connections / Likes / Comments) | desktop |
| Otto side panel → notification row | The row itself | desktop |
| Otto side panel → notification row | Actor avatar | desktop |
| Otto side panel → notification row | Actor name (bold text) | desktop |
| Otto side panel → footer | Open Otto's command center → | desktop |
| Campus banner (top of every campus tab) | Search campus input | both |
| Campus banner → search dropdown | Clear (recently searched) | desktop |
| Campus banner → search dropdown | A recent-search person row | desktop |
| Campus banner → search dropdown | × on a recent-search row | desktop |
| Campus banner → search dropdown | A People result row | desktop |
| Campus banner → search dropdown | A Clubs & Orgs result row | desktop |
| Campus tab bar | Feed / Events / Orgs / Chat / Map pills | desktop |
| Feed tab → Otto strip | Trending hashtag chip (e.g. #iu) | both |
| Feed tab (tag-filtered) | ← Back to main feed | desktop |
| Feed tab → composer | Paperclip (attach photo or video) | desktop |
| Feed tab → composer → crop modal | Aspect buttons (Square 1:1 / Portrait 4:5 / Landscape 16:9) | desktop |
| Feed tab → composer → crop modal | Drag image / zoom slider | desktop |
| Feed tab → composer → crop modal | Cancel / Confirm | desktop |
| Feed tab → composer | ✕ Remove photo | desktop |
| Feed tab → composer | ✕ Remove video | desktop |
| Feed tab → composer | Post | desktop |
| Feed tab → post row | Author avatar / display name / @handle | desktop |
| Feed tab → post row (org posts) | · posted by @handle | desktop |
| Feed tab → post row | Inline @mention in post text | desktop |
| Feed tab → post row | Inline #hashtag in post text | desktop |
| Feed tab → post row | Post body text (background click) | desktop |
| Feed tab → post row | Video player (native controls) | desktop |
| Feed tab → post row | Like (heart) | desktop |
| Feed tab → post row | Comment (speech bubble) | desktop |
| Feed tab → post row | Repost (arrows) | desktop |
| Feed tab → post row | Save / bookmark | desktop |
| Feed tab → repost menu | Comment textarea (quote repost) | desktop |
| Feed tab → repost menu | Cancel | desktop |
| Feed tab → post row (repost entries) | "X reposted this" banner line | desktop |
| Feed tab → post row 3-dot menu | ⋯ (top-right of the card) | desktop |
| Feed tab → post 3-dot menu | Send to chats | desktop |
| Feed tab → comment row | Comment like (heart) | desktop |
| Feed tab → comment row | Reply | desktop |
| Events tab → event card | Going | both |
| Events tab → event card | Interested (with count) | both |
| Events tab → attendees modal | Message all (n) | desktop |
| Events tab → attendees modal | Message (per attendee row) | desktop |
| Events tab → attendees modal | Close / backdrop | desktop |
| Events tab → create event modal | Title / description / location fields | desktop |
| Events tab → create event modal | Start / End datetime-local inputs | desktop |
| Events tab → create event modal | Org <select> | desktop |
| Events tab → create event modal | Cancel / backdrop | desktop |
| Events tab → create event modal | Create event | desktop |
| Orgs tab (Discover) | "Start an org" banner card | desktop |
| Orgs tab (Discover) | Search organizations input | desktop |
| Orgs tab (Discover) | ✕ clear search | desktop |
| Orgs tab (Discover) | Filter chips: All / Public / Private | desktop |
| Orgs tab (Discover) | Show dormant toggle (right-aligned pill switch) | desktop |
| Orgs tab (Discover) → org card | The card body (anywhere not a button) | desktop |
| Orgs tab (Discover) → org card | Profile (secondary button) | desktop |
| Orgs tab → org quick-view modal | Close ✕ / backdrop | desktop |
| Orgs tab → org quick-view modal | Org link pills (Instagram, website, etc.) | desktop |
| Orgs tab → org quick-view modal | Open profile → | desktop |
| Create org modal | Name field (auto-derives handle) | desktop |
| Create org modal | Handle field | desktop |
| Create org modal | Visibility segments (Public / Private) | desktop |
| Create org modal | Backdrop preset swatches | desktop |
| Create org modal | Cancel / backdrop | desktop |
| Create org modal | Create org (submit) | desktop |
| Chat tab (no orgs joined) | "Browse clubs and orgs" card | desktop |
| Chat tab (no orgs joined) | "Create an org" card | desktop |
| Chat tab → server rail (72px, far left) | An org pill (logo or initials) | desktop |
| Chat tab → server rail | + (create a new org) | desktop |
| Chat tab → channel rail header | Org name / @handle header | desktop |
| Chat tab → channel rail | A channel row (#general etc.) | desktop |
| Chat tab → channel rail footer | Settings | desktop |
| Create channel modal | Name / Topic fields | desktop |
| Create channel modal | Public / Private segments | desktop |
| Create channel modal | Cancel / Create channel | desktop |
| Org settings modal | ✕ close | desktop |
| Org settings modal | Tab pills: Overview / Channels / Members / Requests / Danger | desktop |
| Org settings → Overview | Name / Description / Philanthropy fields | desktop |
| Org settings → Overview | Visibility segments (Public / Private) | desktop |
| Org settings → Overview | Backdrop swatches | desktop |
| Org settings → Overview → Links editor | Label + URL fields and the Add button | desktop |
| Org settings → Overview → Links editor | × Remove link | desktop |
| Org settings → Overview | Save changes | desktop |
| Org settings → Channels | A channel row (expand/collapse) | desktop |
| Org settings → Channels → expanded row | Public / Private segments | desktop |
| Org settings → Channels → expanded row | Save | desktop |
| Org settings → Channels → expanded row | Delete channel | desktop |
| Org settings → Members | Role <select> per member | desktop |
| Org settings → Members | Remove (kick) | desktop |
| Org settings → Danger | Leave org | desktop |
| Org settings → Danger (owners only) | Delete org | desktop |
| Channel settings modal | ✕ close / tab pills (Overview / Access / Danger) | desktop |
| Channel settings → Overview | Public / Private segments | desktop |
| Channel settings → Overview | Pin this channel / 📌 Pinned toggle | desktop |
| Channel settings → Overview | Save changes | desktop |
| Channel settings → Access (private channels only) | @handle field + Grant access | desktop |
| Channel settings → Access | Revoke | desktop |
| Channel settings → Danger | Delete channel | desktop |
| Chat tab → message pane | Message input (Enter to send, Esc to cancel reply) | desktop |
| Chat tab → message hover toolbar | Quick-reaction emojis (❤️ 👍 👎 😂 🔥) | desktop |
| Chat tab → message hover toolbar | Reply | desktop |
| Chat tab → message | An existing reaction chip (emoji + count) | desktop |
| Chat tab → composer | × Cancel reply | desktop |
| Map tab (current default state) | Go to Settings → | desktop |
| Every mobile screen → bottom tab bar | Campus / Network / otto / Messages / Profile tabs | mobile |
| Campus → crimson banner | Magnifying-glass icon | mobile |
| Campus → tab strip | Feed / Events / Orgs / Chat / Map pills (and horizontal swipe) | mobile |
| Campus → Feed | Post card body (single tap) | mobile |
| Campus → Feed | Post card (double tap) | mobile |
| Campus → Feed | Heart / like pill | mobile |
| Campus → Feed | Comment (speech-bubble) pill | mobile |
| Campus → Feed | Repost pill | mobile |
| Campus → Feed | Bookmark / save button | mobile |
| Campus → Feed | 3-dot menu on a post card | mobile |
| Campus → Feed → post 3-dot sheet | Copy link | mobile |
| Campus → Feed → post 3-dot sheet | Report post | mobile |
| Campus → Feed | Orange + composer FAB (bottom-right) | mobile |
| Campus → composer sheet | Post button | mobile |
| Campus → composer sheet | Attach photo or video (paperclip pill) + hidden file input | mobile |
| Campus → composer → image cropper | Aspect chips (1:1 / 4:5 / 16:9), drag to pan, zoom slider, Cancel, Save | mobile |
| Campus → composer sheet | Remove photo (×) / Remove video (×) / Cancel | mobile |
| Campus → Events | Going button | mobile |
| Campus → Events | Interested button | mobile |
| Campus → Events | Org name link on an event card | mobile |
| Campus → Orgs | Org row (whole card) | mobile |
| Campus → Chat | 'Search servers' input | mobile |
| Campus → Chat | Org (server) card | mobile |
| Campus → Chat → channels drawer | Back arrow / org name link / 'Search channels' | mobile |
| Campus → Chat → channels drawer | Channel row (#general etc.) | mobile |
| Campus → Map (no-campus state) | 'Go to Settings →' | mobile |
| Campus → search overlay | Search input / Cancel arrow / result rows | mobile |
| Post viewer (from Campus feed, Profile, or /posts/[id]) | Close (×) / swipe-dismiss | mobile |
| Post viewer | Author row in the header | mobile |
| Post viewer | Like (heart) | mobile |
| Post viewer | Comment count button | mobile |
| Post viewer | Bookmark / save | mobile |
| Post viewer → 3-dot menu | Delete post (owner only) | mobile |
| Post viewer | Inline @mention in post text | mobile |
| Share sheet (Send to chats) | 'Search chats…' / chat row toggles / caption field / Send | mobile |
| Network | 'Search people' input + clear (×) | mobile |
| Network | Discover / Connections / Following / Followers pills (and swipe) | mobile |
| Network → any list row | Connect / Follow back button | mobile |
| Network → Connections tab | 'Connected ✓' button on an existing connection | mobile |
| Network → Discover | Dismiss suggestion (×) | mobile |
| Network → any row | Avatar / name link | mobile |
| Network → search results | Search result row | mobile |
| Messages → inbox | Compose (pencil) button | mobile |
| Messages → inbox | Thread row | mobile |
| Messages → conversation | Send button / Enter key | mobile |
| Messages → conversation | Long-press a bubble → emoji reaction picker; tap a reaction chip | mobile |
| Messages → conversation | Back arrow / peer name in the header | mobile |
| Messages → conversation → 3-dot sheet | View profile / Group info / Pin to top / Mute… / Clear chat history / Leave grou | mobile |
| Messages → group → Group info | Group name (tap to rename, admin only) + Save | mobile |
| Messages → group → Group info | + Add (admin) → person picker; member row → View profile / Mute member / Unmute  | mobile |
| otto | Today / Stats pills (and horizontal swipe) | mobile |
| otto → 'Otto's asking' | Open inbox → | mobile |
| otto → 'Tell otto something' | Reminder text field + Save | mobile |
| otto → Stats | Recent-viewer avatars | mobile |
| Profile (own) → floating actions | Search (magnifier) | mobile |
| Profile (own) → floating actions | Edit (pencil) | mobile |
| Profile (own) → floating actions | Settings (gear) | mobile |
| Profile (own) → edit mode | Save (check) / Cancel (×) | mobile |
| Profile (own) → edit mode | Change cover / Change profile photo | mobile |
| Profile → tabs | Posts / Portfolio tabs and Posts / Reposts / Saved sub-pills | mobile |
| Profile → Posts / Reposts / Saved | Post card, repost row, saved grid tile | mobile |
| Profile → Portfolio | Edit pill on 'Working on' / 'Experience' | mobile |
| Profile → Portfolio → Resume | Document row / Remove (×) | mobile |
| Profile (own) | Orange + compose FAB | mobile |
| Profile (visitor) | Connect / Follow back / Following ✓ / Connected ✓ button | mobile |
| Onboarding (mobile) | Let's go → / Continue → / Skip to resume → / Skip | mobile |
| Onboarding (mobile) → step 2 | Handle field (live availability) | mobile |
| Onboarding (mobile) → step 4 | Upload resume (file) / resume link field | mobile |
| Onboarding (mobile) → top bar | Skip → 'Skip onboarding?' sheet → Keep going / Skip anyway | mobile |
| Onboarding (header, all steps) | Skip onboarding | desktop |
| Onboarding step 1 | Lets go arrow | desktop |
| Onboarding step 1 | Maybe later | desktop |
| Onboarding skip dialog | Keep going | desktop |
| Onboarding step 2 | Handle field (@yourhandle) | desktop |
| Onboarding step 2 | Campus / Major / Department / Year selects and the Interests, Skills, Bio, Name  | desktop |
| Onboarding step 2 | Continue arrow / Skip to resume arrow | desktop |
| Onboarding step 3 | Role 1 / Role 2 fields and Continue / Skip | desktop |
| Onboarding step 4 | Upload PDF or image | desktop |
| Onboarding step 4 | Or paste a link field | desktop |
| Profile nav | vibe. logo / Campus / Network links | desktop |
| Profile nav (search) | Search for people, clubs, events, orgs input | desktop |
| Profile nav (search dropdown) | An Orgs search result row | desktop |
| Profile nav (search dropdown) | A People search result row | desktop |
| Profile nav (search dropdown, default state) | Clear (Recently searched) and the small x on each recent chip | desktop |
| Profile nav | Messages icon (chat bubble) | desktop |
| Profile nav | View as visitor pill | desktop |
| Profile nav | Settings cog | desktop |
| Profile nav | Share profile icon | desktop |
| Profile share modal | Copy button | desktop |
| Profile share modal | Send button on a recipient row | desktop |
| Profile cover / Choose a cover modal | Choose gradient, the gradient swatches, Apply, Cancel | desktop |
| Profile header stats | Followers count and Connections count | desktop |
| Visited profile header | ... (kebab) menu -> Unfollow / Report / Mute / Block | desktop |
| Profile identity (edit mode) | Name / tagline / location / website / bio contenteditable fields | desktop |
| Profile identity (edit mode) | @handle inline editor | desktop |
| Profile identity (edit mode) | Major select, Year select, Campus select | desktop |
| Profile identity (edit mode) | + Add tag, the x on each tag, and the tag modal Save/Cancel | desktop |
| Profile Otto hero | Open arrow (in the dark otto card) | desktop |
| Otto panel | Open Ottos command center arrow (panel footer) and the panel close x | desktop |
| Profile section nav | Overview / Experience / Skills / Posts pills | desktop |
| Profile Experience card (edit mode) | + Add role, the work modal fields, Save, Cancel | desktop |
| Profile Experience card (edit mode) | Company logo square on a work row (and the equivalent on Currently working on) | desktop |
| Profile Experience / Currently working on (edit mode) | The x delete button on a work row or a Currently item, and the drag handle | desktop |
| Profile Skills card (edit mode) | + Add skill, the modal suggestion chips, Save, and the x on a skill pill | desktop |
| Profile post composer (own profile) | + Photo, and the x on the image preview | desktop |
| Profile post composer (own profile) | Publish | desktop |
| Profile post composer | @ mention typeahead in the composer textarea | desktop |
| Profile Posts card | All / Posts / Reposts / Saved tabs | desktop |
| Profile post card | Clicking the body of a post card, and Read more | desktop |
| Post viewer modal (profile and messages) | Heart / like | desktop |
| Post viewer modal | Bookmark / save | desktop |
| Post viewer modal | Share (paper plane) | desktop |
| Post viewer modal | Comment field and Post button, comment heart, Reply, reply submit, cancel reply | desktop |
| Post viewer modal | ... menu -> Delete post (own) or Report post / Mute / Block (others) | desktop |
| Profile right rail | Resume / Portfolio preview tile (Open viewer arrow) | desktop |
| Profile right rail | Attach / Clear (resume) | desktop |
| Resume viewer modal | Page thumbnails, the x on a thumbnail, Prev, Next, Done, the modal x | desktop |
| Resume viewer modal (owner) | Turn on edit mode banner, drag-to-draw redaction bars, bar handles, the x on a b | desktop |
| Profile right rail | Currently working on -> + Add, icon picker, Save, the x on an item | desktop |
| Profile (fresh onboarded) | The x on the welcome - lets fill this in banner | desktop |
| Profile (first visit after onboarding) | Otto tour Next / Skip tour / Take me to campus | desktop |
| Profile (blocked visitor screen) | Unblock <name> / Back to campus | desktop |
| Mini messenger (profile page) | Panel x, the Open link in the header, thread rows, search, back, send, emoji rea | desktop |
| Messages thread column | New button | desktop |
| Messages thread column | Search box above the thread list | desktop |
| Messages thread column | All and Unread tabs | desktop |
| Messages thread column (empty state) | Find people arrow | desktop |
| Messages thread column (load failure) | Retry link | desktop |
| Messages conversation header | Person icon button | desktop |
| Messages conversation header | ... (three dots) chat info button | desktop |
| Messages composer | Paperclip attach, the staged-media x, the textarea, Enter to send, the send arro | desktop |
| Messages bubble with a shared post attachment | Clicking the attached post card | desktop |
| Messages bubble with an @mention | The highlighted @handle link inside a message | desktop |
| Messages composer | @ mention typeahead | desktop |
| Messages chat info panel | Pin chat / Unpin chat | desktop |
| Messages chat info panel | Mute chat / Unmute chat | desktop |
| Messages chat info panel (groups, admin only) | Remove button on a member row, and Leave group | desktop |
| Messages chat info panel (groups) | Group name input (saves on blur), the + on the group photo | desktop |
| Messages chat info panel (1:1) | View profile, Report <name>, Block <name> | desktop |
| Messages chat info panel | Clear chat history / Delete conversation | desktop |
| Messages compose overlay | Direct / Group tabs, the search field, result rows, the x on a selected chip, gr | desktop |

## Note on testing

183 of these controls change real data when activated. There is no separate test database: the live site and local development share one. The live checks above were chosen to be reversible, and everything created was removed.
