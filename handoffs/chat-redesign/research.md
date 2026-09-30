# Club chat redesign — research (S68, 2026-09-29)

Plain-English research for replacing Vibe's Discord-style club chat (club icon rail → #channels → message list) with Vibe's own version. Read with `franky-brief.md` (what Franky wants) and `code-map.md` (what exists today). Sources are linked inline and collected at the end.

## The short version

- **Students don't hate chat. They hate noise, clutter and not knowing where things are.** Two-thirds of Americans say group chats overwhelm them, three in four have muted one, and more than half have left one because of the volume. Club chats are the worst case: 60–2,000 people, half of whom joined at a club fair and never came back.
- **Every big platform has now split "the club speaks" from "members talk."** WhatsApp Communities, GroupMe's Announcement mode, Instagram broadcast channels and Telegram channels with comments all do it. For Vibe this is table stakes, not the innovation.
- **The fresh territory is time and place.** Partiful, Luma, Apple Invites and (this month) Snapchat Plans all build chat *around an event* that opens before, runs during and becomes a photo album after. No club chat product ties the club's standing room, its events and its campus together. That is Vibe's opening, because Vibe already has clubs, events, a feed and a shared two-university campus in one app.
- **Discord is loved for being free, hangout-y and customizable, and resented for being complicated.** Discord itself admits first sessions are intimidating; its channel sprawl, role maze and two mobile redesigns (2023 and 2026) drew heavy backlash.
- **What clubs actually run on today is GroupMe** (it claims 70%+ of US colleges), for one reason: anyone can join in a tap. Its costs: spam bots and fake students in open chats, buried announcements, and muted chats that miss the one message that mattered. Vibe's school-verified accounts remove the spam problem.

**Recommendation (details in Part 4):** build Direction A ("Front desk + lounge") as the skeleton for v1, with Direction B's event rooms inside it from day one, since events are on the launch plan. Keep Direction C's campus layer as the phase-2 bet once there are enough real clubs.

---

## Part 1 — How others handle group and community chat

Each entry covers what it is, what to take, what to avoid.

### Discord
- **What it is:** servers → categories → #text and voice channels, roles with fine-grained permissions, threads, forum channels, bots. In 2021 it launched **Student Hubs**: verify a school email, then browse a directory of student-run servers for clubs, classes and social groups ([Discord blog](https://discord.com/blog/discover-your-next-favorite-campus-club-in-student-hubs), [Student Hubs FAQ](https://support.discord.com/hc/en-us/articles/4406046651927-Discord-Student-Hubs-FAQ)).
- **What students like:** easy to join if you already use it, free, voice channels for just hanging out, and it gives a club more exposure. A UMD beekeeping club said it fit much better than GroupMe ([The Diamondback, 2021](https://dbknews.com/2021/09/20/umd-discord-hubs-in-person-clubs/)).
- **What students dislike:** it's complex. When Discord rebranded away from gaming, it said the first few interactions could be intimidating ([TechPowerUp](https://www.techpowerup.com/269276/discord-is-rebranding-to-appeal-to-a-wider-non-gaming-audience)). New members are confused by long channel lists, bots and roles, and some leave straight away ([Discord: channel categories and names](https://discord.com/community/channel-categories-and-names)). Mods create too many channels, which splits conversation and leaves many channels empty ([Hacker News thread](https://news.ycombinator.com/item?id=36921637)). Roles and permission overrides confuse even experienced owners ([CommunityOne guide](https://blog.communityone.io/discord-roles-permissions-guide/)). @everyone and role pings get around mute settings, which users hate ([Discord feedback forum](https://support.discord.com/hc/en-us/community/posts/360042792072-Suppress-everyone-and-here-per-channel)).
- **Mobile is its weak spot.** The Dec 2023 mobile redesign drew a huge backlash (one poll: 97% preferred the old layout) ([Android Authority](https://www.androidauthority.com/discord-new-mobile-layout-update-3392631/)). A 2026 test that makes mobile look like desktop is getting the same reaction ([Dexerto](https://www.dexerto.com/tech/discord-reveals-mobile-layout-update-performance-improvements-2736879/)). The server rail plus channel list is a desktop idea squeezed onto a phone.
- **Worth taking:** onboarding questions that pick your channels for you ([Community Onboarding FAQ](https://support.discord.com/hc/en-us/articles/11074987197975-Community-Onboarding-FAQ)). Forum channels for things you'll look up later ([Forum channels blog](https://discord.com/blog/forum-channels-space-for-organized-conversation)). In-channel conversation summaries ([Discord support](https://support.discord.com/hc/en-us/articles/12926016807575-In-Channel-Conversation-Summaries)). Drop-in voice.
- **Avoid:** unlimited channels, the permission matrix, the icon rail, and pings that ignore mute.

### Slack
- **What it is:** workspaces, channels, threads, huddles. A work tool, and it looks like one.
- **Worth taking:** **Catch Up** on mobile: swipe through unread conversations one card at a time (right = done, left = later), built because people check Slack in 30-second bursts ([Slack Catch Up write-up](https://raw.studio/blog/slack-catch-up-swiping-right-for-productivity/), [case study](https://medium.com/@somyadhaulya/slack-catch-up-swipe-go-f6f617f56f5e)). **Huddles:** one-tap audio that people drift in and out of, less pressure than video ([Slack blog](https://slack.com/blog/collaboration/how-slack-customers-collaborate-with-huddles)).
- **Avoid:** the free plan hides history older than 90 days, which kills club continuity ([Teachfloor comparison](https://www.teachfloor.com/blog/slack-vs-discord)). Threads hide conversation. It feels corporate.

### GroupMe (the one clubs actually use)
- **Why clubs use it:** big groups without swapping phone numbers, join by link, works by SMS for people without the app, and iMessage caps groups at 32 ([The Bucknellian](https://bucknellian.net/126849/opinion/groupme-a-problematic-necessity-for-college-campuses/)). GroupMe says over 70% of US colleges use it and campus group creation is up 200% ([GroupMe 2024 review](https://groupme.com/blog/2024-year-in-review)).
- **Recent features:** Topics ("a group chat inside your group chat"), **Announcement mode** (only leaders post; everyone can react and RSVP), **Event Groups** (a chat for each event), GroupMe Campus discovery ([Back to School post](https://groupme.com/blog/what-s-new-in-groupme-back-to-school)). 2025 added shared albums, any-emoji reactions, voice messages and **Copilot chat summaries** ([GroupMe 2025 review](https://groupme.com/blog/2025-year-in-review)).
- **Local proof:** IU Bloomington's "Free Food On Campus" GroupMe has almost 2,000 members. Students like finding clubs and events they'd never have heard of; bots and scammers are a constant problem ([Indiana Daily Student, Feb 2025](https://www.idsnews.com/article/2025/02/free-food-on-campus-group-chat-connects-students-with-each-other-and-free-food)). IU students already want a campus-wide "what's happening" layer.
- **Pain:** the DM alerts are unreliable, so big chats get muted. First-years added at the activities fair stay in chats they never engage with ([Bucknellian](https://bucknellian.net/126849/opinion/groupme-a-problematic-necessity-for-college-campuses/)). Spam bots selling concert tickets in club, dorm and Greek chats have pushed groups toward email checks and manual approval ([Daily Northwestern, Nov 2024](https://dailynorthwestern.com/2024/11/06/lateststories/groupme-chatbots-raise-frustrations-for-student-organizations/)). Fake "students" with forged IDs interrupt club chats at UCLA ([Bruinlife](https://bruinlife.com/the-fake-students-of-groupme/)).
- **Lesson:** joining in one tap is what wins, and open join links are what break it. Vibe can keep the one tap and drop the open link, because every account is school-verified.

### WhatsApp Communities + Channels
- **Communities:** an umbrella over several groups, with a default **Announcements group** that every member is in and only admins post to. Up to 2,000 members ([WhatsApp FAQ](https://faq.whatsapp.com/768544097924262), [admin FAQ](https://faq.whatsapp.com/742237357891080)). Members can now **reply to announcements**: replies are grouped, minimised and muted for everyone. Anyone can create **events** that members RSVP to, with automatic reminders ([WhatsApp blog](https://blog.whatsapp.com/new-to-communities-events-and-replies-in-announcement-groups)).
- **Jan 2026:** **member tags** (a per-group label such as "Goalkeeper" or "Noah's Dad", without changing your name) and custom early **event reminders** ([Meta newsroom](https://about.fb.com/news/2026/01/whatsapp-group-chats-member-tags-text-stickers-event-reminders/)). **Quick recap:** an opt-in AI summary of the unread chats you pick ([Dataconomy](https://dataconomy.com/2025/07/21/whatsapp-will-now-summarize-your-messy-group-chats/)).
- **Channels:** one-way broadcast. Followers can't see each other, admins can't see who follows, and followers only react or vote ([WhatsApp blog](https://blog.whatsapp.com/introducing-whatsapp-channels-a-private-way-to-follow-what-matters)).
- **Worth taking:** grouped, muted replies under announcements, member tags as a light version of roles, and follow-without-exposure (it fits Vibe's "following ≠ membership").

### Instagram (broadcast channels, group chats, Community Chat)
- **Broadcast channels:** a creator sends text, polls, photos and voice notes to followers' inboxes. The Dec 2024 update added nested **replies** and **prompts**: a question that stays open for 24 hours, answered with text or photos, with the best answers featured ([Tubefilter](https://www.tubefilter.com/2024/12/04/instagram-broadcast-channels-prompts-replies/), [Instagram](https://about.instagram.com/blog/announcements/introducing-broadcast-channels)). Brands use them for drops and reminders ([Marketing Brew, Oct 2025](https://www.marketingbrew.com/stories/2025/10/16/instagram-broadcast-channels-brand-strategy)).
- **Group chats (2025):** **QR invite codes**, up to 3 **pinned messages**, **scheduled messages** (hold the send button), music sharing, translation ([Instagram, Feb 2025](https://about.instagram.com/blog/announcements/new-instagram-dm-update-2025)), plus nicknames and long-press to see who's in a group ([SocialBee](https://socialbee.com/blog/instagram-updates/)).
- **Community Chat (2025):** Discord-style topic chats for up to 250 people, with admins who can remove messages and members ([MediaPost](https://www.mediapost.com/publications/article/403981/instagram-takes-on-discord-adds-community-chat.html)).
- **Why it matters:** Instagram is where clubs post flyers today ([UW-Whitewater](https://blogs.uww.edu/ucinfo/2025/04/04/digital-marketing-tools-your-student-organization-needs/)). The 24-hour prompt is the best "make it feel alive without noise" pattern in this research.

### iMessage (iOS 26)
- Group chats now have **polls** (Apple Intelligence suggests one when people are deciding something), **typing indicators**, **custom backgrounds** that everyone in the group sees, Apple Cash in groups, and an "add to contacts" button for people you don't know yet ([9to5Mac, Jan 2026](https://9to5mac.com/2026/01/12/ios-26s-messages-app-adds-five-great-new-group-chat-features/)).
- **Hard limit:** 32 people. That cap is why clubs leave iMessage for GroupMe.
- **Worth taking:** chat backgrounds as identity (Vibe already has backdrop presets), and a poll that suggests itself when people are clearly deciding something.

### Telegram (topics + channels with comments)
- **Topics:** turns a group into a forum where each topic has its own history, pins and notification setting. A "General" topic holds the old history, and you can view one topic or all of them ([Telegram blog](https://telegram.org/blog/topics-in-groups-collectible-usernames), [API docs](https://core.telegram.org/api/forum)).
- **Channel + linked discussion group:** each broadcast post gets a **Comments** button that opens its own thread, and subscribers can comment without joining the group ([Telegram API: discussion groups](https://core.telegram.org/api/discussion)).
- **Worth taking:** "announcement with its own comments" is the cleanest split between the club speaking and members replying. Per-topic notification settings.
- **Avoid:** up to 5,000 topics per group. Topic sprawl is Discord's channel sprawl again.

### Snapchat (group chats, School Communities, Plans)
- Students use Snap for close friend groups because it's casual, visual and fast, and they know exactly who sees what ([Josie Ahlquist](https://www.josieahlquist.com/for-the-love-of-snapchat/)).
- **School Communities (Aug 2024):** verify a school email, get a school badge, and post to a shared school Story ([PPC Land](https://ppc.land/snapchat-launches-school-communities/)).
- **Snap bought Saturn** (the social class-schedule app, supported at 80% of US high schools) in June 2025 ([TechCrunch](https://techcrunch.com/2025/06/20/snap-acquires-saturn-a-social-calendar-app-for-high-school-and-college-students/)). **Snapchat Plans (Sept 2026):** invite up to 200 friends, Going / Maybe / Can't go, an automatic reminder an hour before, and past plans kept on your profile ([TechCrunch](https://techcrunch.com/2026/09/10/snapchat-takes-aim-at-partiful-with-new-event-planning-features/)).
- **Signal:** Snap is heading straight for "campus + events + chat". Vibe needs to move fast.

### Geneva → Bumble BFF Groups
- Geneva organised a group around a **home** with typed rooms: chat, **forum** (long posts in a list view, sorted by latest activity, with pins and drafts), audio and video ([Geneva forum rooms](https://www.geneva.com/blog/introducing-forum-rooms)). No likes or follower counts ([True Interactive](https://trueinteractive.com/blog/will-brands-cozy-up-to-geneva-the-no-like-zone/)).
- Bumble bought it in 2024, shut the app in Sept 2025, and rebuilt BFF on it with a **Groups** tab: chat rooms, planning hangouts, an in-group calendar ([Yahoo Finance](https://finance.yahoo.com/news/bumble-bff-revamped-app-focusing-121941463.html)).
- **Lesson:** "rooms by type" is a good idea, and a standalone community app still struggles to make money. Vibe's advantage is that chat sits inside a social app students already open.

### BAND
- Built for teams, school clubs and parents. Each group has a **post board**, shared **calendar** with RSVPs, **sign-up sheets on events**, **attendance check-in** (self or by an organiser), polls, files, and chat ([Google Play](https://play.google.com/store/apps/details?id=com.nhn.android.band&hl=en_US&gl=US), [SmartSocial](https://www.smartsocial.com/post/band-app)).
- **Worth taking:** sign-up slots and attendance are exactly the officer chores that clubs now handle with Google Forms. Put them in chat.
- **Avoid:** it looks like a parent-teacher tool.

### Heartbeat / Circle (creator community platforms)
- Heartbeat gives each channel a type: **Threads** (post with stacked replies, for 30+ people, announcements, Q&A) or **Chat** (quick back-and-forth, for 5–15 people) ([Heartbeat help](https://help.heartbeat.chat/hc/en-us/articles/35344840135825-Choosing-Which-Discussion-Channels-to-Use-for-Your-Community)). It also has one-click voice rooms and online indicators.
- Circle's "spaces" can be a feed, chat, events, course or **member directory**. Its restrained design means new members understand it without a tour ([Bettermode review](https://bettermode.com/blog/circle-community-platform)).
- **Worth taking:** choose the format by group size. A 60-person club needs a feed-like board plus a smaller live chat, not one firehose. A member directory as a first-class space.

### Partiful, Luma, Apple Invites (event-anchored chat)
- **Partiful:** the event page is the social object. Guests see who's going, comment with GIFs, and add to a **shared photo album** after the party. Hosts send up to 10 **text blasts**, filtered by RSVP status, up to 60 days after the event ([Partiful help](https://help.partiful.com/en-us/articles/15777531-how-do-i-send-a-text-blast), [photo uploads](https://help.partiful.com/hc/en-us/articles/26984026098459-How-do-I-upload-photos-to-my-event-page)). **Org Profiles** let fraternities and clubs run events under a shared handle with several admins, and **Find-a-Time** lets guests vote on a time ([Sacra](https://sacra.com/c/partiful/)). A design critique praises the Going / Maybe / Can't go control ([Pratt IxD](https://ixd.prattsi.org/2025/02/design-critique-partiful/)).
- **Luma:** the host starts an **event chat**. Everyone approved is added automatically, and leaving the guest list removes you. The host can **close** the chat: no new messages, but it stays readable under "closed chats" ([Luma help](https://help.luma.com/p/event-chat)). **Calendars** people follow, with newsletters to followers ([Luma help](https://help.luma.com/p/calendar-memberships)).
- **Apple Invites (Feb 2025):** an invite with RSVP, a shared album and a playlist, and anyone can RSVP ([Apple Newsroom](https://www.apple.com/newsroom/2025/02/introducing-apple-invites-a-new-app-that-brings-people-together/)).
- **Worth taking:** the chat's membership follows the RSVP list, it opens before the event, it closes into an album afterwards, and you can message people by RSVP status. None of this exists in club chat products.

### Fizz, Yik Yak, Sidechat (campus-native, anonymous)
- **Fizz:** you need a school email, the feed is anonymous, has upvotes, New / Top / "Fizzin" (trending now) sorting and a marketplace, and runs on 240+ campuses ([TechCrunch](https://techcrunch.com/2024/07/03/fizz-the-anonymous-gen-z-social-app-adds-a-marketplace-for-college-students/), [Colby Echo](https://colbyecho.news/2025/10/09/fizz-the-colleges-favorite-anonymous-social-platform/)). A Dartmouth writer says about 30% of users post, against roughly 1% on typical social apps, because the conversation is local enough to matter ([The Dartmouth, May 2025](https://www.thedartmouth.com/article/2025/05/jiang-one-writer-reflects-on-the-role-of-the-anonymous-social-media-feed-in-dartmouths-campus-culture-and-what-it-means-to-really-fizz)). Clubs can post flyers to an Explore page. The downsides are real: pile-ons, mockery of sincere posts, and bans on some campuses (UNC system) ([Inside Higher Ed](https://www.insidehighered.com/news/tech-innovation/teaching-learning/2024/03/13/unc-system-banning-anonymous-social-apps-over)).
- **Yik Yak (back since 2021):** anonymous posts within 5 miles, used for dining tips, which shuttle to catch, which student groups to join, even organising a snowball fight ([Wikipedia](https://en.wikipedia.org/wiki/Yik_Yak), [WSU Guardian](https://www.wsuguardian.com/article/2025/04/yik-yak-and-wsu)).
- **Lesson:** a *campus-wide* conversation gets far more participation than a club chat, because everyone shares the same place and the same moment. Vibe can have that energy with **names and verification** instead of anonymity, which fits "warm, not casual".

### CampusGroups, Anthology Engage (Corq), Modern Campus Involve (Presence)
- These are the university-bought club platforms: registration, rosters, events, attendance, co-curricular records ([CampusGroups](https://www.readyeducation.com/campusgroups/), [Involve](https://moderncampus.com/products/student-engagement-and-learning-platform)). **Purdue uses Corq/Engage** ([Purdue SAO](https://www.purdue.edu/sao/resources/corq-instructions.php)). CampusGroups has had a chat feature since 2017 ([CampusGroups blog](https://blog.campusgroups.com/campusgroups/2017/6/30/chat)).
- **Student reception:** Corq is rated about 2.1/5 on the App Store and about 2.5 on Google Play, with complaints about slow loading, frozen lists and loops back to campus selection ([App Store](https://apps.apple.com/us/app/corq/id940682997), [Google Play](https://play.google.com/store/apps/details?id=com.campuslabs.collegiatelink&hl=en)). Students treat these as the place you register, not the place you talk. Vendors themselves pitch "one source of truth" because students scatter across GroupMe, Instagram and email ([Ready Education](https://www.readyeducation.com/articles/one-source-of-truth-the-future-of-student-communication/)).
- **Lesson:** officers need these tools for the school's paperwork, and chat is where the life happens. Vibe should never feel like Corq. Its value is the social layer the official tools can't provide.

### 2025–2026 newcomers doing something new
- **Shapes (Apr 2026, $8M seed, 400k MAU):** humans and AI characters in the same group chat. The AI can message on its own because, the founders say, people don't want to be the first to send a message ([TechCrunch](https://techcrunch.com/2026/04/29/meet-shapes-the-app-bringing-humans-and-ai-into-the-same-group-chats/)). This is a real insight about dead chats. The execution (AI with "free will") would clash with Vibe's warmth and trust. An Otto that nudges officers, not one that pretends to be a member, is the safe version.
- **Series (Yale founders, $5.1M pre-seed, 750+ campuses):** an AI "social network" that runs entirely inside iMessage and introduces people ([TechCrunch](https://techcrunch.com/2026/04/24/two-college-kids-raise-a-5-1-million-pre-seed-to-build-an-ai-social-network-in-imessage/)). The signal: intros between students who don't know each other yet are valuable.
- **AI catch-up is now everywhere:** GroupMe Copilot summaries (2025), WhatsApp quick recap (2025), Discord in-channel summaries, Slack AI's pinch-to-summarise Catch Up, Apple Intelligence summaries in notifications. By 2026, "summarise my unreads" is expected, not special. (Franky left Otto recaps out of v1; that's fine for now.)
- **Snapchat Plans (Sept 2026)** and **Partiful Ticketing + Org Profiles (June 2026):** events are becoming the core social object for Gen Z ([Morningstar/PR Newswire](https://www.morningstar.com/news/pr-newswire/20260602ny74669/partiful-launches-ticketing-bringing-paid-events-into-the-social-platform-where-people-already-make-plans)).
- **iOS 26 group polls + backgrounds** and **Instagram Community Chat:** the big platforms keep adding club-ish features, but none has a campus, verified students, or a club's events and feed in the same place.

### Pattern map (who already does what)

| Pattern | Who does it | Status for Vibe |
|---|---|---|
| Admin-only announcements, members react | WhatsApp Communities, GroupMe Announcement mode, IG broadcast, Telegram channel | Table stakes. v1 must-have |
| Replies grouped under an announcement | WhatsApp (muted, minimised), Telegram (comments), IG broadcast replies | Table stakes |
| Chat tied to an event's RSVP list | Luma, GroupMe Event Groups, Partiful activity | Fresh for clubs. v1 must-have |
| Chat closes into an album after the event | Luma (closed chats), Partiful and Apple Invites (albums) | Fresh |
| Polls in chat | iMessage, WhatsApp, GroupMe, Discord, IG | Table stakes. v1 must-have |
| Sign-up slots, attendance check-in | BAND | Fresh in a chat context. v1 must-have (sign-ups) |
| Onboarding that picks your rooms | Discord Community Onboarding | Fresh done simply |
| Per-group role labels | WhatsApp member tags | Fresh |
| 24-hour prompts | IG broadcast prompts | Fresh |
| AI catch-up | GroupMe, WhatsApp, Discord, Slack, Apple | Expected by 2026. Later for Vibe |
| Campus-wide live conversation | Fizz, Yik Yak, Sidechat (anonymous), IU "Free Food" GroupMe | Bold if named and verified |
| Swipe-through unread cards | Slack Catch Up | Fresh on phone |

---

## Part 2 — The biggest pain points (with evidence)

Numbered so Part 3 can refer to them as **P1–P14**.

**P1. Announcements get buried in chatter.** In one-room club chats, deadlines disappear into scrollback, files get posted again, and questions that were already answered get asked again ([Pigeon](https://pigeonchat.site/blog/school-university-group-organization)). Student org guides list missed meetings, unanswered questions, forgotten deadlines and low turnout as the result ([Flare](https://www.theflareapp.com/post/why-every-student-organization-needs-a-communication-strategy)). GroupMe built Announcement mode so important messages rise above the noise ([GroupMe](https://groupme.com/blog/what-s-new-in-groupme-back-to-school)). **In Vibe today, #announcements is an ordinary channel any member can post in** (`code-map.md`).

**P2. Notification overload, then mute, then miss the one thing that mattered.** 66% of Americans feel overwhelmed by group chats, 75% have muted one, 55% have left one because of the volume, and 42% say managing them feels like a part-time job (n=1,005, 2023) ([Secure Data Recovery](https://www.securedatarecovery.com/blog/group-messaging-feels-like-job)). Four in five Irish adults have muted a group chat ([Irish Times](https://www.irishtimes.com/business/2023/12/13/survey-finds-four-fifths-of-adults-have-pressed-mute-on-family-friends-or-work-group-chat/)). Big GroupMe chats get muted, and then important messages are missed ([Bucknellian](https://bucknellian.net/126849/opinion/groupme-a-problematic-necessity-for-college-campuses/)). Discord role pings get past mute ([Discord feedback](https://support.discord.com/hc/en-us/community/posts/4403522513943-Make-Mute-and-Nothing-notification-settings-work-for-channel-regardless-of-role-mentions)).

**P3. "Who is everyone in here?"** Big club chats mix officers, regulars, people from the club fair and strangers, with nothing to tell them apart. Platforms keep adding fixes: WhatsApp member tags were built to cut confusion in big groups where people don't know each other ([Meta](https://about.fb.com/news/2026/01/whatsapp-group-chats-member-tags-text-stickers-event-reminders/)), iOS 26 adds "add to contacts" for unknown group members ([9to5Mac](https://9to5mac.com/2026/01/12/ios-26s-messages-app-adds-five-great-new-group-chat-features/)), and Instagram added long-press to see who's in a group. **Vibe's club chat has no member list today.**

**P4. New members join cold and lurk.** If you only scroll and never post, you feel invisible, and it soon feels like you missed your chance to speak up ([ZeeMee](https://zeemee.com/inside-college-group-chats-how-to-actually-meet-your-people/), [ZeeMee on loneliness](https://zeemee.com/when-college-group-chats-make-you-feel-lonely-build-offline-friendships/)). Newcomers don't know where things are without someone guiding them ([Pigeon](https://pigeonchat.site/blog/school-university-group-organization)). Confused Discord newcomers simply leave ([Discord](https://discord.com/community/channel-categories-and-names)). Students already report more social anxiety and prefer to ask peers online ([EdSurge](https://www.edsurge.com/news/2023-09-07-how-students-use-unofficial-online-backchannels-for-classes)).

**P5. Event logistics get lost in the scroll.** Where exactly, what time, who's driving, what to bring, "running late", "we moved to room 204". Partiful's blasts exist for exactly these messages ([Partiful](https://help.partiful.com/en-us/articles/15777531-how-do-i-send-a-text-blast)), WhatsApp added custom event reminders for travel time ([Meta](https://about.fb.com/news/2026/01/whatsapp-group-chats-member-tags-text-stickers-event-reminders/)), and BAND puts sign-up sheets on the event itself ([SmartSocial](https://www.smartsocial.com/post/band-app)). **Vibe chat has no events, polls or RSVPs today.**

**P6. Dead chats.** Too many channels means most sit empty ([HN](https://news.ycombinator.com/item?id=36921637)). Nobody wants to send the first message ([Shapes founders via TechCrunch](https://techcrunch.com/2026/04/29/meet-shapes-the-app-bringing-humans-and-ai-into-the-same-group-chats/)). Club chats fade between events and after finals. An empty channel makes the whole club look dead to a new member.

**P7. Officers burn out being the human reminder bot.** Student-leader burnout comes from role overload and from groups that run events all the time, where the constant planning and coordination piles up ([UNL Student Involvement](https://cms.unl.edu/student-involvement/sites/unl.edu.student-involvement/files/media/file/RSO%20Advisor%20Burnout.pdf)). Academic work on student-leader burnout is growing ([Christian Higher Education, 2024](https://www.tandfonline.com/doi/full/10.1080/15363759.2024.2444206); abstract not accessible to the research tools). In chat, that looks like reposting the same reminder, answering the same question five times, chasing RSVPs, and never knowing who actually saw the announcement.

**P8. Social chat and club business in one pipe.** Memes bury the dues deadline, and the dues deadline kills the vibe. Heartbeat's rule of thumb: threaded posts for 30+ people and business, live chat for 5–15 people and banter ([Heartbeat](https://help.heartbeat.chat/hc/en-us/articles/35344840135825-Choosing-Which-Discussion-Channels-to-Use-for-Your-Community)). Guides recommend separate spaces for announcements, discussion, events and admin ([Pigeon](https://pigeonchat.site/blog/school-university-group-organization)).

**P9. Too much structure (the Discord problem).** Endless channels and categories. Discord's own onboarding asks for at least seven default channels ([Discord](https://support.discord.com/hc/en-us/articles/11074987197975-Community-Onboarding-FAQ)). Franky's brief names "icon rail + #channels" as the part that feels most like Discord.

**P10. Roles are either missing or a maze.** Discord's hierarchy and overrides trip up even experienced owners ([CommunityOne](https://blog.communityone.io/discord-roles-permissions-guide/)). GroupMe has almost no roles. Members don't know who the treasurer is or who to ask about dues.

**P11. Spam, bots and fake students.** Open join links let in scammers selling tickets in club, dorm and Greek chats ([Daily Northwestern](https://dailynorthwestern.com/2024/11/06/lateststories/groupme-chatbots-raise-frustrations-for-student-organizations/), [Bruinlife](https://bruinlife.com/the-fake-students-of-groupme/), [IDS](https://www.idsnews.com/article/2025/02/free-food-on-campus-group-chat-connects-students-with-each-other-and-free-food)). **Vibe already solves this with school-verified accounts. Say so loudly when talking to clubs.**

**P12. Tools scattered everywhere.** Flyers on Instagram, chat on GroupMe, registration on Corq or Engage, sign-ups in Google Forms, minutes in email. Student org guides recommend layering several tools ([Flare](https://www.theflareapp.com/post/why-every-student-organization-needs-a-communication-strategy)), and vendors sell "one source of truth" ([Ready Education](https://www.readyeducation.com/articles/one-source-of-truth-the-future-of-student-communication/)). Vibe's structural edge is having the club's profile, feed, events and chat in one app.

**P13. Desktop layouts crammed onto phones.** Two Discord mobile redesigns drew heavy backlash ([Android Authority](https://www.androidauthority.com/discord-new-mobile-layout-update-3392631/), [Dexerto](https://www.dexerto.com/tech/discord-reveals-mobile-layout-update-performance-improvements-2736879/)). Slack built Catch Up because people check chat in 30-second bursts on their phones ([Raw Studio](https://raw.studio/blog/slack-catch-up-swiping-right-for-productivity/)). Franky's brief says phone first.

**P14. Officer turnover breaks continuity.** Accounts and chats belong to whoever made them. Ex-officers keep access for years, and new officers start from zero. University officer-transition guides all list handing over accounts, files and passwords ([Tufts](https://students.tufts.edu/office-campus-life/student-organizations/leadership-transition), [DePaul](https://dehub.depaul.edu/OSI/officer-transitions/), [CASE](https://www.case.org/resources/does-your-institution-have-social-media-transition-plan)).

---

## Part 3 — Interaction ideas Vibe could own

**Novelty key:** **Stakes** = table stakes (others have it; we must too, done better). **Fresh** = uncommon, clearly better. **Bold** = nobody does it; riskier. **v1?** = whether it fits Franky's v1 must-haves (announcements separate, event chats, polls/sign-ups/RSVPs in chat) or has to wait (Otto is out of v1; presence and read receipts wait for the pending privacy fix in `code-map.md`).

**I1. The Board and the Room: two voices, one club.** *(P1, P2, P8, P12 · Stakes, Fresh in execution · v1)*
Every club has a **Board** where only officers post and a **Room** where everyone talks. Each Board post is a card (headline, body, and an optional event, poll or sign-up). Members react and reply in a folded thread under the card that never notifies, the way WhatsApp and Telegram do it. What's new: a Board post marked public also becomes a post on the club's profile and in its followers' feeds, so officers write once and it lands in three places.

**I2. The "Up next" strip.** *(P5, P1, P7 · Fresh · v1)*
A slim sticky strip at the top of every club chat shows the next event (day, place, your RSVP), open sign-ups ("2 of 6 driver spots left") and anything due. Tap it and a bottom sheet opens with the details. It replaces pinned messages, which nobody reads.

**I3. Event rooms that open, go live and close into an album.** *(P5, P6, P8 · Fresh, Bold for clubs · v1)*
Tapping "Going" puts you in the event's room automatically, like Luma. The room has three states. **Soon:** opens a few days before, holds logistics and the faces of who's going. **Live:** on the day it gets a coral glow, "we moved to room 204", a map pin and check-in. **After:** it locks to read-only and turns into the event page's photo album and recap, with one last "thanks + photos" message from the officers. Nobody ever has to delete the "Formal carpool" chat.

**I4. Messages by RSVP status.** *(P5, P7, P2 · Fresh · v1 nice-to-have)*
Officers can message Going, Maybe or Not yet separately, as Partiful does. "Running 10 minutes late" goes only to people who are coming, and "Last call to RSVP" goes only to people who haven't answered. Nobody else gets pinged.

**I5. The "+" tray: Poll, Sign-up, RSVP, Headcount.** *(P5, P7, P6 · Stakes (poll), Fresh (headcount) · v1)*
The composer's "+" opens a bottom sheet of cards. **Sign-up** has slots with limits (3 drivers, snacks, set-up crew), the BAND idea done at chat speed. **Headcount** is a one-tap "I'm in" for spur-of-the-moment plans ("pickup soccer at 5?"). Once it reaches a set number of people, an officer can turn it into a real event in one tap.

**I6. "Turn this into…"** *(P7, P1, P8 · Fresh · v1 partly)*
An officer long-presses any member's message and chooses "Make it an announcement / event / poll / pinned answer". Chatter becomes structure without retyping, and the card credits the member ("from Maya"). This makes officers editors, not typists.

**I7. Quiet by default, loud when it matters.** *(P2 · Stakes, Fresh with the budget · v1 rules)*
Three plain levels per club: **Everything**, **Board + me** (the default) and **Only me**. Board posts notify once. The Room never notifies unless someone @mentions or replies to you. Event rooms only notify during their Live window. Officers get a small weekly budget of "Important" pushes that break through, the way Partiful caps blasts at 10. The budget is what keeps members from muting the club. (Push is dark in prod, but the rules should be designed now.)

**I8. "Seen by" for officers.** *(P7, P1 · Fresh, and a Vibe+ for orgs hook · waits for the privacy fix)*
Officers see "Seen by 41 of 63" on Board cards, shown from 5 up so a count never exposes one person. Under "counts public, identities private", *who* hasn't seen it is the paid layer. Officers stop reposting "did everyone see this??"

**I9. A warm welcome instead of a cold join.** *(P4, P3, P6 · Fresh · v1 light)*
A new member lands on a **Welcome card**: the officers' faces and roles, three things to know (written by officers), the next event with an RSVP button, and a one-tap intro ("I'm ___, ___ year, here for ___"). The Room groups new joins into one "3 new members this week, say hi" chip instead of a system line per person.

**I10. Faces, not a member list.** *(P3, P10, P11 · Stakes, Fresh · v1)*
A **People** sheet, visible only to members, groups the club as officers first, then people you know (mutuals, same major), then everyone, with year, major and an IU/Purdue chip. Officer messages in chat carry their role in small caps. It answers "who is everyone in here" and shows that everyone is a verified student.

**I11. Hats, not permissions.** *(P10, P14, P7 · Fresh · v1 labels)*
Keep only three real levels (Member, Officer, Owner) over the existing owner/admin/mod/member. Officers wear a free-text **hat** ("Treasurer", "Social chair", "Rush lead"), the WhatsApp member-tag idea. Members can tap "Ask the treasurer" to message whoever holds the hat, so the question reaches next year's treasurer too.

**I12. Rooms: few, capped, typed.** *(P9, P6, P8 · Fresh because of the cap · v1)*
No more #channels. Every club gets Board + Room + Officers (private), plus event rooms that appear on their own. Officers can add up to about 3 extra rooms ("Rush '26", "Intramurals") and pick a type: **Chat** for fast talk or **Threads** for forum-style posts. No "#", no categories, no permission matrix.

**I13. 24-hour prompts.** *(P6, P4 · Fresh · v1.1)*
An officer posts a light prompt ("Pic of your fall break", "Best study spot on campus?"). Answers stack into a mosaic under it. After 24 hours it closes and can be kept as a post on the club's profile. This is the Instagram prompt idea, and the easiest first post a lurker can make.

**I14. "Here now", only at events.** *(P3, P6, P7 · Bold · waits for the privacy fix; opt-in)*
No green dots all day. During a Live event, members can tap "I'm here", which shows "12 here at the Campus Center" with faces and doubles as attendance for officers (the BAND idea). Presence means something because it's tied to a real place and time.

**I15. Catch-up cards (phone).** *(P2, P13, P1 · Fresh · v1.1)*
Opening Chat after a day away shows a short swipe stack: Board posts you haven't seen, changes to events you RSVP'd to, sign-ups about to close, and your mentions. Swipe right for done, left for later, like Slack's Catch Up. The cards are structured items, not AI. Otto one-line summaries of the Room can be added once Otto is in scope.

**I16. The campus layer: "Today on campus".** *(P12, P6, P4 · Bold · phase 2)*
A named, verified, campus-wide stream per campus (the shared IU/Purdue Indianapolis campus is one community; no chatting across campuses, per the founders' rule). Clubs post public happenings (tabling, free food, open meetings) and any student can reply or tap "I'm in". It feeds the rolling newsletter's "today." and Otto's Heads up. It's the IU "Free Food On Campus" GroupMe, done properly.

**I17. Cross-club rooms and an Officer Commons.** *(P7, P12 · Bold · later)*
When two clubs co-host, the event room includes both memberships. Officers from every club on a campus share an **Officer Commons** for co-hosting asks, room bookings and vendor tips. No club app does this, and it turns Vibe into the officers' network.

**I18. Semesters as chapters.** *(P6, P14 · Bold · later)*
At the end of term the Room archives into a "Fall '26" chapter (searchable, with a recap card of events and photos) and the new term opens clean with a welcome. The officer handover moves Owner and hats, and the history belongs to the club, not a person's account.

**I19. Phone-first ergonomics.** *(P13, P9 · Fresh · v1)*
The club switcher is a **bottom sheet pulled up from the chat header** (or a horizontal swipe between club cards), not a left rail. The "+" tray sits at thumb height. Long-press a message to react, reply or (for officers) "Turn this into…". The Up next strip shrinks as you scroll. Every destination is reachable one-handed.

**I20. Otto for officers (later).** *(P7, P1, P2 · Bold · out of v1 by Franky's call)*
Otto drafts the Board post from an event, spots repeat questions ("5 people asked about parking. Pin an answer?") and writes the weekly club recap. It is always labelled as Otto and never pretends to be a member. That's where Vibe differs from Shapes, whose AI messages on its own.

### Idea matrix

| # | Idea | Pains | Novelty | v1? |
|---|---|---|---|---|
| I1 | Board + Room | P1 P2 P8 P12 | Stakes/Fresh | Yes |
| I2 | Up next strip | P5 P1 P7 | Fresh | Yes |
| I3 | Event rooms lifecycle | P5 P6 P8 | Fresh/Bold | Yes |
| I4 | Message by RSVP status | P5 P7 P2 | Fresh | Nice |
| I5 | "+" tray (poll, sign-up, headcount) | P5 P7 P6 | Stakes/Fresh | Yes |
| I6 | Turn this into… | P7 P1 P8 | Fresh | Partly |
| I7 | Quiet by default + budget | P2 | Stakes/Fresh | Rules now |
| I8 | Seen by (officers) | P7 P1 | Fresh | After privacy fix |
| I9 | Welcome card | P4 P3 P6 | Fresh | Yes (light) |
| I10 | Faces / People sheet | P3 P10 P11 | Stakes/Fresh | Yes |
| I11 | Hats | P10 P14 P7 | Fresh | Labels |
| I12 | Capped, typed rooms | P9 P6 P8 | Fresh | Yes |
| I13 | 24-hour prompts | P6 P4 | Fresh | v1.1 |
| I14 | Here now at events | P3 P6 P7 | Bold | After privacy fix |
| I15 | Catch-up cards | P2 P13 P1 | Fresh | v1.1 |
| I16 | Today on campus | P12 P6 P4 | Bold | Phase 2 |
| I17 | Cross-club + Officer Commons | P7 P12 | Bold | Later |
| I18 | Semesters as chapters | P6 P14 | Bold | Later |
| I19 | Phone-first ergonomics | P13 P9 | Fresh | Yes |
| I20 | Otto for officers | P7 P1 P2 | Bold | Later |

---

## Part 4 — Three directions for the redesign

All three drop the icon rail, the "#", the squircles and the channel list. They differ in what a chat *is organised around*: **the club as a place** (A), **time and events** (B), or **the campus** (C). This matches Franky's "familiar-but-better / fresh / bold" range.

### Direction A — "Front Desk + Lounge" (familiar, but better)

**Mental model.** Each club is a place you walk into. At the front desk (the **Board**) the club tells you what's happening, and the **Up next** strip shows what's coming. Behind it is the **Lounge** (the Room), where members hang out. Your clubs and your DMs live in **one inbox**, the way iMessage works, rather than on a separate server rail.

**Phone.** The Chat tab is a single list. Club rows are taller than DM rows: the club's crest and colour, its name in Fraunces, a coral dot when there's an unread Board post, and a small next-event chip ("Thu · Formal"). Tap a club and you get the header (crest, name, your hat), the **Up next** strip, and a row of **room chips**: `Lounge · Officers · Formal 10/4 · Rush '26`. A live event's chip glows coral. The newest unread Board card is docked above the Lounge messages; pull down to see the whole Board. The "+" tray holds Poll, Sign-up, RSVP and Headcount. To switch clubs, pull up a bottom sheet from the header or swipe sideways.

**Desktop.** Three columns: **inbox** (clubs + DMs) → **the room** (Board card docked on top) → a **club panel** (Up next, Board history, People faces, the club's profile link). No icon rail. The room chips sit above the messages.

**What replaces rail + #channels.** One inbox list replaces the rail. A capped row of room chips (Lounge, Officers, event rooms, up to ~3 extras) replaces #channels.

**Ties to the rest of Vibe.** Public Board posts appear on the club profile and in followers' feeds. Event rooms come from the club's events. People sheet → profiles.

**Trade-offs.** + The easiest to build: today's `channels` rows become rooms with a `kind` (board / lounge / officers / event), and Board write access is officer-only. + Almost nothing new to learn. + Meets all three v1 must-haves. − The least "wow". Without strong visual craft it could read as "WhatsApp Communities, nicer". − Big orgs (a fraternity with committees) will push against the room cap. Hold it at about 3 extras and see.

### Direction B — "Tonight" (fresh: time-first, the event is the room)

**Mental model.** Chat is organised by *when*, not by topic. Almost every conversation hangs off a moment (Tuesday's meeting, Friday's formal, Saturday's service day), and each moment's room opens, goes live and closes into an album. A club's standing Lounge is the in-between hangout. The home screen answers "what's happening now and next across all my clubs?"

**Phone.** The Chat tab opens on a vertical timeline. **Live now**: a card lit with the coral bloom ("Formal · 23 here · 4 new"). Then **Today**, **This week**, **Later**, and below them **Hangouts** (each club's Lounge) and **People** (DMs). Each card shows the event cover, club crest, the faces of who's going, unread count and your RSVP chip. Tap one and the event room opens with a hero cover that shrinks as you scroll, logistics tiles pinned under it (**Where · When · Bring · Rides**), then the chat. During Live there's an "I'm here" button. After the event, a photo grid replaces the composer.

**Desktop.** A **week strip** across the top (Mon–Sun, dots on days with events), the timeline list on the left, the room in the centre, and on the right **Going / Here** faces plus the logistics tiles.

**What replaces rail + #channels.** A time axis replaces the rail. Moments (event rooms) plus one Lounge per club replace #channels.

**Ties to the rest of Vibe.** This is the tightest fit with Events, the rolling newsletter ("today.") and Otto's Heads up. It is also the launch plan in UI form (clubs → events → demo days). Board posts attach to the moment they're about, or sit in the club's Lounge header.

**Trade-offs.** + Most distinctly Vibe, and the most beautiful: event covers, faces, the bloom on Live. + Cleans itself up because rooms expire, so no dead chats. + Logistics finally have a home. − Cold start: it needs clubs to post events, and with zero clubs signed it can look empty. Mitigation: Headcount → event in one tap, and Hangouts always present. − Random banter needs a clear home (Hangouts). − Harder to scan for someone who just wants "the SAE chat". Keep search and a "by club" toggle.

### Direction C — "The Quad" (bold: campus-first, circles inside a living campus)

**Mental model.** You're always part of one living campus conversation (**the Quad**: IU + Purdue Indianapolis together), and your **circles** (clubs, friend groups) sit inside it. On the Quad, clubs are the voices everyone hears. Step into a circle to talk privately with its members. This is "clubs and students chatting all together" taken literally.

**Phone.** The top of the Chat tab is a **circle row**, round club crests and friend groups in the style of Stories. A coral ring means a new Board post; a pulsing ring means a live event. Below it is **Today on campus**: club cards (tabling, free food, open meeting, "need 2 more for intramurals"), 24-hour prompts and event rooms opening. Students reply inline with their name and IU or Purdue school chip, and can tap "I'm in". Tap a circle and the club slides up as a sheet over the Quad (Board card on top, Lounge below). Swipe down to return.

**Desktop.** Left: circles as a labelled vertical list of round crests (not squircles). Centre: the Quad, or the circle you've opened. Right: Otto's "Heads up" and your RSVPs.

**What replaces rail + #channels.** The circle row replaces the rail. The Quad plus each circle's Board and Lounge replace #channels.

**Ties to the rest of Vibe.** Feed and chat almost merge: public Board posts flow to the Quad, and the Map and newsletter pull from it. It is also a recruiting engine for clubs, since students discover clubs by watching them on the Quad.

**Trade-offs.** + The boldest answer to Franky's "all together" line. + Vibe feels alive even when your own clubs are quiet, which fixes dead chats at the app level. + Nobody else has a *named and verified* campus conversation (Fizz, Yik Yak and Sidechat are anonymous). − It needs a lot of people to work. With zero clubs signed, an empty Quad at launch would hurt more than an empty club chat. − Heavy moderation load, and public-reply culture is where Fizz went toxic (names and verification help but don't remove this). − Blurs "is this public?" It needs a very clear public/private cue, for example the Quad lit with the coral bloom and circles on calm paper.

### Side by side

| | A · Front Desk + Lounge | B · Tonight | C · The Quad |
|---|---|---|---|
| Organised around | The club (place) | Time (events) | The campus |
| Replaces the rail with | One inbox list | A timeline | A circle row |
| Replaces #channels with | Board + Lounge + room chips | Moments + Hangouts | Quad + circles |
| v1 must-haves | All three, natural fit | All three, events-heavy | Needs A underneath |
| Build effort on today's code | Low–medium | Medium | High (+ moderation) |
| Risk | Looks too familiar | Cold start without events | Cold start + moderation |
| "Wow" | Craft-dependent | High | Highest |

### Recommendation

Build **A as the skeleton** (inbox, Board + Lounge, room chips, Up next, the "+" tray) and ship **B's event rooms inside it** from day one: the event room is a room chip with the Soon → Live → After lifecycle, and the Up next strip is B's timeline in miniature. That covers every v1 must-have and puts events at the centre without a cold-start risk. Design **C as phase 2**, built first as a feed mode ("Today on campus") rather than a chat, once there are enough real clubs to fill it (the launch plan's 10 signed clubs is a sensible trigger). If Franky wants to see all three, mock one phone screen per direction in the same brand frame so he can compare them side by side.

---

## Part 5 — Visual references worth opening

Mobbin links are real app screens; some need a Mobbin account to view in full.

**What we're moving away from (Discord)**
- Discord iOS server channels, the rail-and-list pattern: [Mobbin](https://mobbin.com/explore/screens/b6eeab07-975d-49a6-a28d-3976345782aa)
- Discord iOS server welcome page, for comparison with I9's Welcome card: [Mobbin](https://mobbin.com/explore/screens/f898b171-f0dc-4b89-9e52-07359fd942bd)
- Discord iOS conversation settings (members / media / pins / links / files tabs), a useful model for the People sheet: [Mobbin](https://mobbin.com/explore/screens/6b9cc269-028d-46a6-8450-eccf4a3a295e)

**Event-anchored rooms (Direction B, and A's event rooms)**
- Luma iOS "Your events" list and flow, a clean time-sorted list with RSVP state: [screen](https://mobbin.com/explore/screens/a9ee5b7d-b815-49be-a03a-5d51a542ed18), [flow](https://mobbin.com/explore/flows/93586417-16c6-461d-9ab0-e29e433e7caf). Written breakdown of Luma's slide-up detail screens and host dashboard: [ScreensDesign](https://screensdesign.com/showcase/luma-delightful-events)
- Partiful event details, notifications and background editor. The event page as a social object, with playful per-event themes: [details](https://mobbin.com/screens/1f9c25ba-d901-4b43-a1f5-0ebfff42c470), [notifications](https://mobbin.com/explore/screens/a43134db-c206-4d7c-bede-0ef6d6be912a), [background editor](https://mobbin.com/explore/screens/ace99e1e-bc0f-4180-94e3-f297725ff411). Critique: [Pratt IxD](https://ixd.prattsi.org/2025/02/design-critique-partiful/)
- Apple Invites: a full-bleed cover that becomes the header, going faces, and a shared album afterwards. The best reference for the Live → After hero: [Apple Newsroom](https://www.apple.com/newsroom/2025/02/introducing-apple-invites-a-new-app-that-brings-people-together/)
- Mobbin "Event detail" pattern library: [Mobbin](https://mobbin.com/explore/mobile/screens/event-detail)

**Club speaks / members talk (I1)**
- WhatsApp Communities setup guide (announcement group + sub-groups): [WhatsApp](https://www.whatsapp.com/communities/learning/settingupyourcommunity)
- Instagram broadcast channels for creators (prompts, polls, replies): [Instagram Creators](https://creators.instagram.com/create/broadcast-channels)
- Geneva forum rooms, a compact list view for long posts: [Geneva](https://www.geneva.com/blog/introducing-forum-rooms)

**Chat craft, themes and backgrounds**
- Telegram iOS chat themes and theme editor. Per-chat identity done well, relevant to Vibe's club backdrops: [themes](https://mobbin.com/explore/screens/14a985fc-eeee-4f41-ac6a-351091ec9dbc), [options](https://mobbin.com/explore/screens/f8d44ffa-6476-42bd-b9b1-5475ec5bd34b), [dark chat view](https://mobbin.com/explore/screens/9d56d074-a9db-446b-96f7-c0e9454b449f)
- iOS 26 Messages group backgrounds and polls: [9to5Mac](https://9to5mac.com/2026/01/12/ios-26s-messages-app-adds-five-great-new-group-chat-features/), [Cult of Mac](https://www.cultofmac.com/how-to/ios-26-messages-features)
- Mobbin pattern libraries: [Chat detail](https://mobbin.com/explore/mobile/screens/chat-detail), [Groups & community](https://mobbin.com/explore/mobile/screens/groups-community), [Communication apps](https://mobbin.com/explore/mobile/app-categories/communication)

**Catch-up and triage (I15)**
- Slack Catch Up swipe cards: [case study](https://medium.com/@somyadhaulya/slack-catch-up-swipe-go-f6f617f56f5e); Slack iOS home with unreads, threads and mentions: [Mobbin](https://mobbin.com/explore/screens/8e65f9c9-5b08-4303-8a56-ef403676143e)

**Mood boards (for exploring, not copying)**
- Dribbble: [group chat app](https://dribbble.com/tags/group_chat_app), [community app UI](https://dribbble.com/search/community-app-Ui), [dark chat](https://dribbble.com/search/chat-dark)
- Vibe's own S67 design canvas (brand, Night palette, rolling newsletter): [canvas](https://claude.ai/artifact/B69NRnhbB8mvdrKsc9NQFJ)

### How to make it look fantastic in Vibe's brand
- **Keep the bubbles.** Franky didn't flag the message look. Keep iMessage-style bubbles on the phone and put the craft into the frame around them.
- **Fraunces only where it earns it:** club names, Board headlines, event titles, and section heads ("Live now", "Up next"). Messages stay in DM Sans.
- **Coral `#FF5C35` means "now or for you":** Live rooms, unread Board posts, your "Going", the main action. If everything is coral, nothing is.
- **Night:** near-black `#0C0B0B`, Board cards on paper `#161515`, and the **coral bloom only behind Live rooms** (and later the Quad), so the glow itself tells you something is happening.
- **Light:** cream `#FAF7F2`, Board cards as paper with a soft edge, the same bloom rule.
- **Club identity:** crest plus a thin club-colour strip on the room header (echoing the school strip on the nav identity chip), and keep the per-club backdrop presets.
- **School chips:** a small crimson (IU) or gold (Purdue) dot next to names in People and on the Quad, reusing the campus-header colours.
- **Remove every Discord tell:** blurple `#5865F2`, squircles and the active capsule, "#", uppercase coloured role chips, and the copy "Servers", "Text channels", "Message #name", "+ Channel" (full list in `code-map.md`).
- **Words:** Board, Lounge, Up next, Going / Maybe / Can't go, I'm in, Here now, Hats. Short, warm, campus-y.

---

## Part 6 — Calls for Franky (each with a recommendation)

1. **Direction.** A, B, C or a mix? **Recommend:** A as the skeleton, B's event rooms inside it for v1, C in phase 2.
2. **Names for the two voices.** "Board + Lounge", "Announcements + Chat" or "Club + Hangout"? **Recommend:** Board + Lounge. It's short, warm and not Discord. Show him two or three options visually.
3. **Can members reply to Board posts?** **Recommend:** yes, folded under the card and never notifying (the WhatsApp model), so questions stay next to the announcement.
4. **How many extra rooms can a club add?** **Recommend:** 3, plus automatic event rooms and a private Officers room. Raise the cap only if a real club asks.
5. **Who's in an event room?** **Recommend:** Going + Maybe. For a **public** event, non-members who RSVP get into *that event room only*, never the Lounge. It's a gentle path from follower to member that respects "following ≠ membership".
6. **Default notification level.** **Recommend:** "Board + me", with a small weekly "Important" budget for officers.
7. **"Seen by" on Board posts.** **Recommend:** officers only, counts from 5 up, after the read-state privacy fix. Names can be Vibe+ for orgs later ("counts public, identities private").
8. **Where the club chat lives.** **Recommend:** the Chat tab becomes the single inbox (clubs + DMs). The club page's "Chat" button deep-links into it. No separate server view.

---

## Caveats on the evidence
- Reddit can't be reached by the research tools, so student voice comes from campus newspapers (Bucknellian, Daily Northwestern, Indiana Daily Student, Bruinlife, The Dartmouth, Diamondback), surveys and product docs. Before building, a handful of real IU/Purdue Indy officer interviews would beat all of it. The launch plan's club research step is the natural place for them.
- Several numbers are companies' own claims: GroupMe's "70% of US colleges", Snap's "80% of US high schools", Shapes' MAU, and the Fizz participation figure (from a student columnist). Treat them as direction, not fact.
- App-store ratings (Corq) were read in September 2026 and move over time.
- The group-chat overwhelm survey is US adults of all ages, 2023, run by a data-recovery company. The direction matches the Irish survey and the student op-eds.

## Sources

**Discord:** [Student Hubs blog](https://discord.com/blog/discover-your-next-favorite-campus-club-in-student-hubs) · [Student Hubs FAQ](https://support.discord.com/hc/en-us/articles/4406046651927-Discord-Student-Hubs-FAQ) · [Diamondback: UMD clubs on Discord](https://dbknews.com/2021/09/20/umd-discord-hubs-in-person-clubs/) · [TechPowerUp: Discord rebrand](https://www.techpowerup.com/269276/discord-is-rebranding-to-appeal-to-a-wider-non-gaming-audience) · [Discord: channel categories and names](https://discord.com/community/channel-categories-and-names) · [HN: too many channels](https://news.ycombinator.com/item?id=36921637) · [CommunityOne: roles and permissions](https://blog.communityone.io/discord-roles-permissions-guide/) · [Feedback: suppress @everyone per channel](https://support.discord.com/hc/en-us/community/posts/360042792072-Suppress-everyone-and-here-per-channel) · [Feedback: mute vs role mentions](https://support.discord.com/hc/en-us/community/posts/4403522513943-Make-Mute-and-Nothing-notification-settings-work-for-channel-regardless-of-role-mentions) · [Android Authority: 2023 mobile layout](https://www.androidauthority.com/discord-new-mobile-layout-update-3392631/) · [Dexerto: 2026 mobile update](https://www.dexerto.com/tech/discord-reveals-mobile-layout-update-performance-improvements-2736879/) · [Community Onboarding FAQ](https://support.discord.com/hc/en-us/articles/11074987197975-Community-Onboarding-FAQ) · [Forum channels](https://discord.com/blog/forum-channels-space-for-organized-conversation) · [In-channel summaries](https://support.discord.com/hc/en-us/articles/12926016807575-In-Channel-Conversation-Summaries)

**Slack:** [Raw Studio: Catch Up](https://raw.studio/blog/slack-catch-up-swiping-right-for-productivity/) · [Catch Up case study](https://medium.com/@somyadhaulya/slack-catch-up-swipe-go-f6f617f56f5e) · [Slack: huddles](https://slack.com/blog/collaboration/how-slack-customers-collaborate-with-huddles) · [Teachfloor: Slack vs Discord](https://www.teachfloor.com/blog/slack-vs-discord)

**GroupMe:** [Bucknellian op-ed](https://bucknellian.net/126849/opinion/groupme-a-problematic-necessity-for-college-campuses/) · [GroupMe: Back to School](https://groupme.com/blog/what-s-new-in-groupme-back-to-school) · [GroupMe 2024 review](https://groupme.com/blog/2024-year-in-review) · [GroupMe 2025 review](https://groupme.com/blog/2025-year-in-review) · [IDS: Free Food On Campus](https://www.idsnews.com/article/2025/02/free-food-on-campus-group-chat-connects-students-with-each-other-and-free-food) · [Daily Northwestern: spam bots](https://dailynorthwestern.com/2024/11/06/lateststories/groupme-chatbots-raise-frustrations-for-student-organizations/) · [Bruinlife: fake students](https://bruinlife.com/the-fake-students-of-groupme/) · [EdSurge: student backchannels](https://www.edsurge.com/news/2023-09-07-how-students-use-unofficial-online-backchannels-for-classes)

**WhatsApp:** [Communities FAQ](https://faq.whatsapp.com/768544097924262) · [Announcements FAQ](https://faq.whatsapp.com/742237357891080) · [Events + replies in announcement groups](https://blog.whatsapp.com/new-to-communities-events-and-replies-in-announcement-groups) · [Member tags, event reminders (Jan 2026)](https://about.fb.com/news/2026/01/whatsapp-group-chats-member-tags-text-stickers-event-reminders/) · [Quick recap](https://dataconomy.com/2025/07/21/whatsapp-will-now-summarize-your-messy-group-chats/) · [Channels](https://blog.whatsapp.com/introducing-whatsapp-channels-a-private-way-to-follow-what-matters) · [Setting up a Community](https://www.whatsapp.com/communities/learning/settingupyourcommunity)

**Instagram / Meta:** [Tubefilter: prompts + replies](https://www.tubefilter.com/2024/12/04/instagram-broadcast-channels-prompts-replies/) · [Introducing broadcast channels](https://about.instagram.com/blog/announcements/introducing-broadcast-channels) · [Marketing Brew](https://www.marketingbrew.com/stories/2025/10/16/instagram-broadcast-channels-brand-strategy) · [DM update, Feb 2025](https://about.instagram.com/blog/announcements/new-instagram-dm-update-2025) · [SocialBee updates](https://socialbee.com/blog/instagram-updates/) · [MediaPost: Community Chat](https://www.mediapost.com/publications/article/403981/instagram-takes-on-discord-adds-community-chat.html) · [UW-Whitewater: org marketing](https://blogs.uww.edu/ucinfo/2025/04/04/digital-marketing-tools-your-student-organization-needs/) · [Creators: broadcast channels](https://creators.instagram.com/create/broadcast-channels)

**iMessage:** [9to5Mac: iOS 26 group features](https://9to5mac.com/2026/01/12/ios-26s-messages-app-adds-five-great-new-group-chat-features/) · [Cult of Mac](https://www.cultofmac.com/how-to/ios-26-messages-features)

**Telegram:** [Topics blog](https://telegram.org/blog/topics-in-groups-collectible-usernames) · [Forum API](https://core.telegram.org/api/forum) · [Discussion groups API](https://core.telegram.org/api/discussion)

**Snapchat / Saturn:** [Josie Ahlquist](https://www.josieahlquist.com/for-the-love-of-snapchat/) · [PPC Land: School Communities](https://ppc.land/snapchat-launches-school-communities/) · [TechCrunch: Snap buys Saturn](https://techcrunch.com/2025/06/20/snap-acquires-saturn-a-social-calendar-app-for-high-school-and-college-students/) · [TechCrunch: Snapchat Plans](https://techcrunch.com/2026/09/10/snapchat-takes-aim-at-partiful-with-new-event-planning-features/)

**Geneva / Bumble:** [Forum rooms](https://www.geneva.com/blog/introducing-forum-rooms) · [True Interactive](https://trueinteractive.com/blog/will-brands-cozy-up-to-geneva-the-no-like-zone/) · [Yahoo Finance: BFF on Geneva](https://finance.yahoo.com/news/bumble-bff-revamped-app-focusing-121941463.html)

**BAND:** [Google Play](https://play.google.com/store/apps/details?id=com.nhn.android.band&hl=en_US&gl=US) · [SmartSocial](https://www.smartsocial.com/post/band-app)

**Heartbeat / Circle:** [Heartbeat: Threads vs Chat](https://help.heartbeat.chat/hc/en-us/articles/35344840135825-Choosing-Which-Discussion-Channels-to-Use-for-Your-Community) · [Bettermode: Circle review](https://bettermode.com/blog/circle-community-platform)

**Partiful / Luma / Apple Invites:** [Partiful text blasts](https://help.partiful.com/en-us/articles/15777531-how-do-i-send-a-text-blast) · [Partiful photos](https://help.partiful.com/hc/en-us/articles/26984026098459-How-do-I-upload-photos-to-my-event-page) · [Sacra: Partiful](https://sacra.com/c/partiful/) · [Partiful Ticketing (PR Newswire)](https://www.morningstar.com/news/pr-newswire/20260602ny74669/partiful-launches-ticketing-bringing-paid-events-into-the-social-platform-where-people-already-make-plans) · [Pratt IxD critique](https://ixd.prattsi.org/2025/02/design-critique-partiful/) · [Luma event chat](https://help.luma.com/p/event-chat) · [Luma calendar memberships](https://help.luma.com/p/calendar-memberships) · [ScreensDesign: Luma](https://screensdesign.com/showcase/luma-delightful-events) · [Apple Invites](https://www.apple.com/newsroom/2025/02/introducing-apple-invites-a-new-app-that-brings-people-together/)

**Fizz / Yik Yak:** [TechCrunch: Fizz marketplace](https://techcrunch.com/2024/07/03/fizz-the-anonymous-gen-z-social-app-adds-a-marketplace-for-college-students/) · [Colby Echo](https://colbyecho.news/2025/10/09/fizz-the-colleges-favorite-anonymous-social-platform/) · [The Dartmouth](https://www.thedartmouth.com/article/2025/05/jiang-one-writer-reflects-on-the-role-of-the-anonymous-social-media-feed-in-dartmouths-campus-culture-and-what-it-means-to-really-fizz) · [Inside Higher Ed: UNC bans](https://www.insidehighered.com/news/tech-innovation/teaching-learning/2024/03/13/unc-system-banning-anonymous-social-apps-over) · [Yik Yak (Wikipedia)](https://en.wikipedia.org/wiki/Yik_Yak) · [WSU Guardian](https://www.wsuguardian.com/article/2025/04/yik-yak-and-wsu)

**University platforms:** [CampusGroups](https://www.readyeducation.com/campusgroups/) · [Modern Campus Involve](https://moderncampus.com/products/student-engagement-and-learning-platform) · [Purdue SAO: CORQ](https://www.purdue.edu/sao/resources/corq-instructions.php) · [CampusGroups chat](https://blog.campusgroups.com/campusgroups/2017/6/30/chat) · [Corq on App Store](https://apps.apple.com/us/app/corq/id940682997) · [Corq on Google Play](https://play.google.com/store/apps/details?id=com.campuslabs.collegiatelink&hl=en) · [Ready Education: one source of truth](https://www.readyeducation.com/articles/one-source-of-truth-the-future-of-student-communication/)

**Newcomers:** [TechCrunch: Shapes](https://techcrunch.com/2026/04/29/meet-shapes-the-app-bringing-humans-and-ai-into-the-same-group-chats/) · [TechCrunch: Series](https://techcrunch.com/2026/04/24/two-college-kids-raise-a-5-1-million-pre-seed-to-build-an-ai-social-network-in-imessage/)

**Pain-point evidence:** [Secure Data Recovery survey](https://www.securedatarecovery.com/blog/group-messaging-feels-like-job) · [Irish Times survey](https://www.irishtimes.com/business/2023/12/13/survey-finds-four-fifths-of-adults-have-pressed-mute-on-family-friends-or-work-group-chat/) · [Pigeon: school/university groups](https://pigeonchat.site/blog/school-university-group-organization) · [Flare: org communication](https://www.theflareapp.com/post/why-every-student-organization-needs-a-communication-strategy) · [ZeeMee: group chats](https://zeemee.com/inside-college-group-chats-how-to-actually-meet-your-people/) · [ZeeMee: loneliness](https://zeemee.com/when-college-group-chats-make-you-feel-lonely-build-offline-friendships/) · [UNL: student leader burnout](https://cms.unl.edu/student-involvement/sites/unl.edu.student-involvement/files/media/file/RSO%20Advisor%20Burnout.pdf) · [Student leader burnout (T&F, 2024)](https://www.tandfonline.com/doi/full/10.1080/15363759.2024.2444206) · [Tufts: leadership transition](https://students.tufts.edu/office-campus-life/student-organizations/leadership-transition) · [DePaul: officer transitions](https://dehub.depaul.edu/OSI/officer-transitions/) · [CASE: social media transition](https://www.case.org/resources/does-your-institution-have-social-media-transition-plan)
