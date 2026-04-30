// ══════════════════════════════════════════════════════════════════════════
// Vibe — mock other-users for the demo
//
// Read by profile.html when the URL has ?user=<slug>, and by network.html /
// "People also viewed" cards as the navigation target. Each entry mirrors
// the vibe_user_v1 shape (name, bio, work, snapshot, glance, counts) plus
// a `posts` array (rendered shape from savePostsToStorage) and a `vibes`
// array (rendered shape from saveVibesToStorage).
//
// Adding a new mock user: pick a slug, fill in identity + a couple of work
// items + a few posts + 2-3 vibes. The same render path that hydrates the
// owner's profile will hydrate theirs.
// ══════════════════════════════════════════════════════════════════════════

const VIBE_MOCK_USERS = {

  ka: {
    slug: 'ka',
    name: 'Kwame Asante',
    tagline: '"AI is the cheapest co-founder you will ever hire."',
    headline: 'AI Founder · Building Atlas',
    location: 'Lagos → San Francisco',
    website: 'kwame.ai',
    avatarBg: '#2D1B4E',
    bio: "Second-time founder. First company sold to Stripe in 2022. Now building Atlas — a small, opinionated tool for autonomous research agents. I write a lot, ship a lot, and answer DMs faster than email.",
    vibeTags: [
      { label: 'AI Builder',     color: 'coral' },
      { label: 'Founder mode',   color: 'purple' },
      { label: 'Ships fast',     color: 'mint' },
      { label: 'Open source',    color: 'sky' },
    ],
    skills: ['Python', 'TypeScript', 'LLMs', 'Distributed Systems', 'Fundraising', 'Hiring'],
    currentlyOn: [
      { icon: '🔬', text: 'Atlas v2 — async agent runtime' },
      { icon: '📝', text: 'Writing weekly on building solo with AI' },
      { icon: '✈️',  text: 'Lagos ↔ SF every 6 weeks' },
    ],
    workExperience: [
      { title: 'Founder & CEO', company: 'Atlas',   dates: '2024 – Present', location: 'San Francisco', description: 'Building autonomous research agents for analysts and operators. Seed round closed Q1 2025.' },
      { title: 'Founder',       company: 'Klado',   dates: '2019 – 2022',    location: 'Lagos',         description: 'Built a payments rail for African creators. Acquired by Stripe in 2022.' },
      { title: 'Software Engineer', company: 'Andela', dates: '2017 – 2019', location: 'Lagos',         description: 'Backend engineer on the placement platform. First 50 employees.' },
    ],
    snapshot: {
      role: 'Founder & CEO',
      seniority: 'Founder (8 yrs)',
      locationSnap: 'San Francisco, CA',
      availability: 'Building Atlas',
      preferred: 'Founder · Building',
      topSkills: 'Python, LLMs, Fundraising',
    },
    glance: {
      profileViews: '8,142 this month',
      vibeViews:    '21k total',
      status:       '<span class="avail-badge"><span class="avail-dot"></span>Building</span>',
      responseTime: 'Within an hour',
    },
    counts: { connections: '1.4k', mutual: '12', followers: '4.2k' },
    posts: [
      { id: 'ka-p1', ottoType: 'syndicated', date: '2 hours ago',
        ottoBadgeHTML: '<span class="op-badge orange"><span class="op-badge-dot"></span>otto · 4 platforms</span>',
        bodyHTML: 'Solo founders aren\'t solo anymore. The right AI stack is worth ~3 engineers — but only if you\'re willing to be the bottleneck on taste, not output.',
        tagsHTML: '<span class="ppost-tag">#AI</span><span class="ppost-tag">#Founders</span>',
        platformStatsHTML: '<div class="op-ps"><div class="op-ps-tile" style="background:#0A66C2;"></div>LinkedIn · <strong>2.4k views</strong></div><div class="op-ps"><div class="op-ps-tile" style="background:#000;"></div>X · <strong>1.8k views</strong></div>',
        reactionsHTML: '<span class="ppost-chip">&#128293; 1.2k</span><span class="ppost-chip">&#128161; 488</span><span class="ppost-chip">&#128172; 92</span>' },
      { id: 'ka-p2', ottoType: 'vibe-only', date: 'Yesterday',
        ottoBadgeHTML: '<span class="op-badge gray">vibe only</span>',
        bodyHTML: 'Closed our seed in 11 days from first email to wired. The trick wasn\'t the deck. It was being so deep in customer calls that every objection had a name attached.',
        tagsHTML: '<span class="ppost-tag">#Fundraising</span><span class="ppost-tag">#Startups</span>',
        platformStatsHTML: '',
        reactionsHTML: '<span class="ppost-chip">&#128293; 2.1k</span><span class="ppost-chip">&#128161; 822</span><span class="ppost-chip">&#128172; 41</span>' },
      { id: 'ka-p3', ottoType: 'drafted', date: '4 days ago',
        ottoBadgeHTML: '<span class="op-badge purple"><span class="op-badge-dot"></span>otto drafted · review</span>',
        bodyHTML: 'Hot take: "AI engineer" is not a job title yet. It\'s the assumption underneath every job title.',
        tagsHTML: '<span class="ppost-tag">#AI</span>',
        platformStatsHTML: '',
        reactionsHTML: '<span class="ppost-chip">&#129327; 488</span><span class="ppost-chip">&#128161; 211</span>' },
    ],
    vibes: [
      { id: 'ka-v1', title: 'How I built a $1M ARR product in 90 days', views: '12k views · 1:14', bg: 'linear-gradient(135deg,#2d1b4e,#4a2a7a)' },
      { id: 'ka-v2', title: 'The "minimum viable AI agent" playbook',     views: '7.8k views · 0:58', bg: 'linear-gradient(135deg,#1a0533,#2d1b4e)' },
      { id: 'ka-v3', title: 'My YC interview, frame by frame',             views: '5.2k views · 1:31', bg: 'linear-gradient(135deg,#3a1a1a,#5a2a2a)' },
    ],
  },

  ps: {
    slug: 'ps',
    name: 'Priya Sinha',
    tagline: '"Growth without retention is just a magic trick."',
    headline: 'Growth Lead · Independent',
    location: 'London → New York',
    website: 'priyasinha.co',
    avatarBg: '#3B1A00',
    bio: "Spent 6 years scaling Spotify\'s subscription funnel. Now I work with 4 startups at a time on activation, retention, and pricing. I\'m allergic to vanity metrics and friendly to honest ones.",
    vibeTags: [
      { label: 'Growth',         color: 'coral' },
      { label: 'Retention nerd', color: 'purple' },
      { label: 'Honest metrics', color: 'mint' },
    ],
    skills: ['Activation', 'Retention modeling', 'SQL', 'Pricing', 'Onboarding design', 'A/B testing'],
    currentlyOn: [
      { icon: '📈', text: 'Working with 4 seed-stage SaaS startups' },
      { icon: '✍️',  text: 'Writing a short book on activation' },
    ],
    workExperience: [
      { title: 'Independent Growth Advisor', company: 'Self',     dates: '2024 – Present', location: 'New York', description: 'Embedded growth work for early-stage SaaS. Activation-first; pricing where appropriate.' },
      { title: 'Senior Growth PM',           company: 'Spotify',  dates: '2018 – 2024',    location: 'London',  description: 'Owned the free-to-paid funnel. Took global conversion from 2.4% to 4.1% over 4 years.' },
      { title: 'Product Analyst',            company: 'Deliveroo', dates: '2016 – 2018',   location: 'London',  description: 'Built the original retention dashboards. Wrote a lot of SQL.' },
    ],
    snapshot: {
      role: 'Growth Lead',
      seniority: 'Senior (8 yrs)',
      locationSnap: 'New York, NY',
      availability: 'Booked through Q3',
      preferred: 'Advisory · 4 clients max',
      topSkills: 'Activation, Retention, Pricing',
    },
    glance: {
      profileViews: '3,210 this month',
      vibeViews:    '14k total',
      status:       '<span class="avail-badge"><span class="avail-dot"></span>Selectively taking new work</span>',
      responseTime: 'Usually within a day',
    },
    counts: { connections: '892', mutual: '14', followers: '3.1k' },
    posts: [
      { id: 'ps-p1', ottoType: 'syndicated', date: '6 hours ago',
        ottoBadgeHTML: '<span class="op-badge orange"><span class="op-badge-dot"></span>otto · 2 platforms</span>',
        bodyHTML: '<strong>Activation is not onboarding.</strong> Onboarding is the tour. Activation is the moment a user does the thing that makes them stay. Most teams confuse the two and optimize the wrong one.',
        tagsHTML: '<span class="ppost-tag">#Growth</span><span class="ppost-tag">#Activation</span>',
        platformStatsHTML: '<div class="op-ps"><div class="op-ps-tile" style="background:#0A66C2;"></div>LinkedIn · <strong>3.1k views</strong></div><div class="op-ps"><div class="op-ps-tile" style="background:#000;"></div>X · <strong>982 views</strong></div>',
        reactionsHTML: '<span class="ppost-chip">&#128161; 1.4k</span><span class="ppost-chip">&#129327; 311</span>' },
      { id: 'ps-p2', ottoType: 'vibe-only', date: '3 days ago',
        ottoBadgeHTML: '<span class="op-badge gray">vibe only</span>',
        bodyHTML: 'If your North Star metric only goes up and to the right, it\'s not your North Star metric. It\'s a vanity metric in a costume.',
        tagsHTML: '<span class="ppost-tag">#Metrics</span>',
        platformStatsHTML: '',
        reactionsHTML: '<span class="ppost-chip">&#128293; 622</span><span class="ppost-chip">&#128161; 198</span>' },
    ],
    vibes: [
      { id: 'ps-v1', title: 'The 4-question retention audit',           views: '6.1k views · 1:02', bg: 'linear-gradient(135deg,#3B1A00,#5a2a00)' },
      { id: 'ps-v2', title: 'Why your free trial is killing conversion', views: '3.8k views · 0:51', bg: 'linear-gradient(135deg,#2a1a00,#4a2a00)' },
    ],
  },

  lm: {
    slug: 'lm',
    name: 'Luca Moretti',
    tagline: '"Boring tech, weird products."',
    headline: 'Full-stack Dev · Remote-first',
    location: 'Milan',
    website: 'luca.dev',
    avatarBg: '#2a2800',
    bio: "I build small, useful internet things — usually for one person\'s very specific problem. Postgres, TypeScript, and a stubborn refusal to use Kubernetes for anything under a million users.",
    vibeTags: [
      { label: 'Indie Hacker',  color: 'coral' },
      { label: 'Boring stack',  color: 'mint' },
      { label: 'Solo dev',      color: 'lavender' },
    ],
    skills: ['TypeScript', 'Postgres', 'Next.js', 'SQL', 'Stripe', 'Solo product'],
    currentlyOn: [
      { icon: '⚙️',  text: 'Shipping a tiny CRM for freelancers' },
      { icon: '☕', text: 'Open-sourcing my contract templates' },
    ],
    workExperience: [
      { title: 'Indie Developer', company: 'Self',     dates: '2022 – Present', location: 'Remote', description: 'Two SaaS products at $30k MRR combined. Solo-built and solo-run.' },
      { title: 'Senior Engineer', company: 'Hashicorp', dates: '2019 – 2022',   location: 'Remote', description: 'Worked on Terraform Cloud. Learned distributed systems by breaking them.' },
    ],
    snapshot: {
      role: 'Full-stack Engineer',
      seniority: 'Senior (10 yrs)',
      locationSnap: 'Milan, IT (remote-first)',
      availability: 'Open to short contracts',
      preferred: 'Async · Solo or tiny teams',
      topSkills: 'TypeScript, Postgres, Stripe',
    },
    glance: {
      profileViews: '1,420 this month',
      vibeViews:    '4.8k total',
      status:       '<span class="avail-badge"><span class="avail-dot"></span>Open to contracts</span>',
      responseTime: 'A day or two',
    },
    counts: { connections: '414', mutual: '9', followers: '1.6k' },
    posts: [
      { id: 'lm-p1', ottoType: 'vibe-only', date: 'Yesterday',
        ottoBadgeHTML: '<span class="op-badge gray">vibe only</span>',
        bodyHTML: 'My entire production stack is Next.js + Postgres + a single Hetzner box. It serves 30k MAU and costs €18/month. Boring works.',
        tagsHTML: '<span class="ppost-tag">#IndieHacker</span><span class="ppost-tag">#Stack</span>',
        platformStatsHTML: '',
        reactionsHTML: '<span class="ppost-chip">&#128293; 488</span><span class="ppost-chip">&#129327; 122</span>' },
    ],
    vibes: [
      { id: 'lm-v1', title: 'My one-server SaaS deployment, walked end-to-end', views: '2.4k views · 2:11', bg: 'linear-gradient(135deg,#2a2800,#4a4a00)' },
    ],
  },

  ao: {
    slug: 'ao',
    name: 'Aisha Okafor',
    tagline: '"Most product decisions are made on vibes. I make them on tape."',
    headline: 'UX Researcher · Google',
    location: 'Brooklyn, NY',
    website: 'aisha.research',
    avatarBg: '#2D1A00',
    bio: 'Senior UX Researcher on Google Search. I run the studies that no one wants to read but everyone needs to. Trained at Carnegie Mellon, sharpened at Mozilla, currently obsessed with AI search behavior.',
    vibeTags: [
      { label: 'UX Research',    color: 'purple' },
      { label: 'Generative',     color: 'coral' },
      { label: 'Mixed methods',  color: 'sky' },
    ],
    skills: ['Generative research', 'Diary studies', 'Interview design', 'Synthesis', 'Stakeholder reporting'],
    currentlyOn: [
      { icon: '🔍', text: 'Studying how people search with AI assistants' },
      { icon: '📚', text: 'Reading: Don Norman, again' },
    ],
    workExperience: [
      { title: 'Senior UX Researcher', company: 'Google',   dates: '2021 – Present', location: 'New York', description: 'Generative research on Search, including the AI overview launch.' },
      { title: 'UX Researcher',        company: 'Mozilla',  dates: '2018 – 2021',    location: 'Remote',  description: 'Browser behavior studies. Privacy-first methods.' },
    ],
    snapshot: {
      role: 'UX Researcher',
      seniority: 'Senior (7 yrs)',
      locationSnap: 'Brooklyn, NY',
      availability: 'Happy at Google',
      preferred: 'Full-time · In-house',
      topSkills: 'Generative research, Synthesis',
    },
    glance: {
      profileViews: '2,108 this month',
      vibeViews:    '6.4k total',
      status:       '<span class="avail-badge"><span class="avail-dot"></span>Open to talks &amp; advisory</span>',
      responseTime: 'Within a few days',
    },
    counts: { connections: '612', mutual: '11', followers: '2.4k' },
    posts: [
      { id: 'ao-p1', ottoType: 'syndicated', date: '8 hours ago',
        ottoBadgeHTML: '<span class="op-badge orange"><span class="op-badge-dot"></span>otto · 2 platforms</span>',
        bodyHTML: 'Most "AI changes search behavior" takes are based on demos, not diaries. People don\'t change how they search — they change what they ask <em>after</em> they search.',
        tagsHTML: '<span class="ppost-tag">#UXR</span><span class="ppost-tag">#AI</span>',
        platformStatsHTML: '<div class="op-ps"><div class="op-ps-tile" style="background:#0A66C2;"></div>LinkedIn · <strong>1.4k views</strong></div>',
        reactionsHTML: '<span class="ppost-chip">&#128161; 622</span><span class="ppost-chip">&#129327; 188</span>' },
      { id: 'ao-p2', ottoType: 'vibe-only', date: '2 days ago',
        ottoBadgeHTML: '<span class="op-badge gray">vibe only</span>',
        bodyHTML: 'A research finding only matters if a designer can hold it in their head while they sketch.',
        tagsHTML: '<span class="ppost-tag">#Research</span>',
        platformStatsHTML: '',
        reactionsHTML: '<span class="ppost-chip">&#128161; 388</span><span class="ppost-chip">&#129327; 92</span>' },
    ],
    vibes: [
      { id: 'ao-v1', title: 'How I run a 1-week diary study', views: '4.1k views · 1:22', bg: 'linear-gradient(135deg,#2D1A00,#4a2a00)' },
      { id: 'ao-v2', title: 'Synthesis: from sticky notes to story', views: '2.3k views · 0:48', bg: 'linear-gradient(135deg,#1a1a3a,#2a2a5a)' },
    ],
  },

  dn: {
    slug: 'dn',
    name: 'Diana Nguyen',
    tagline: '"Design at scale is not design with more pixels — it is design with more constraints."',
    headline: 'Design Lead · Airbnb',
    location: 'San Francisco, CA',
    website: 'diananguyen.design',
    avatarBg: '#1A001A',
    bio: 'Lead designer on Airbnb\'s host platform. 12 years across Adobe, Square, and Airbnb. I care about systems, accessibility, and the quiet kind of craft that nobody screenshots.',
    vibeTags: [
      { label: 'Systems Design', color: 'purple' },
      { label: 'Accessibility',  color: 'mint' },
      { label: 'Craft',          color: 'gold' },
    ],
    skills: ['Figma', 'Design Systems', 'Accessibility', 'Prototyping', 'Design Ops', 'Critique'],
    currentlyOn: [
      { icon: '🏠', text: 'Redesigning the host onboarding flow' },
      { icon: '🎨', text: 'Mentoring 3 designers via ADPList' },
    ],
    workExperience: [
      { title: 'Design Lead',           company: 'Airbnb',  dates: '2021 – Present', location: 'San Francisco', description: 'Lead the host platform design team (8 designers).' },
      { title: 'Senior Product Designer', company: 'Square', dates: '2017 – 2021',   location: 'San Francisco', description: 'Design system and merchant tools.' },
      { title: 'Product Designer',      company: 'Adobe',   dates: '2013 – 2017',    location: 'San Jose',      description: 'Worked across Creative Cloud apps. Long apprenticeship in craft.' },
    ],
    snapshot: {
      role: 'Design Lead',
      seniority: 'Lead (12 yrs)',
      locationSnap: 'San Francisco, CA',
      availability: 'Happy at Airbnb',
      preferred: 'Full-time · Hybrid',
      topSkills: 'Figma, Systems, Accessibility',
    },
    glance: {
      profileViews: '4,820 this month',
      vibeViews:    '11k total',
      status:       '<span class="avail-badge"><span class="avail-dot"></span>Open to mentoring</span>',
      responseTime: 'Within a few days',
    },
    counts: { connections: '1.1k', mutual: '8', followers: '3.7k' },
    posts: [
      { id: 'dn-p1', ottoType: 'vibe-only', date: 'Today',
        ottoBadgeHTML: '<span class="op-badge gray">vibe only</span>',
        bodyHTML: 'A design system is a contract. The quality of the contract is invisible until someone breaks it.',
        tagsHTML: '<span class="ppost-tag">#DesignSystems</span><span class="ppost-tag">#Craft</span>',
        platformStatsHTML: '',
        reactionsHTML: '<span class="ppost-chip">&#128161; 822</span><span class="ppost-chip">&#129327; 244</span>' },
    ],
    vibes: [
      { id: 'dn-v1', title: 'How we audit accessibility across 200 components', views: '5.4k views · 1:48', bg: 'linear-gradient(135deg,#1A001A,#3a003a)' },
      { id: 'dn-v2', title: 'A 60-second design crit, demonstrated',           views: '3.2k views · 1:01', bg: 'linear-gradient(135deg,#001A2A,#002a4a)' },
    ],
  },

};

// Loaded as a global so any page that wants to navigate to a mock profile
// can introspect available slugs. Profile.html reads VIBE_MOCK_USERS[slug]
// via ?user= URL param. Network.html / People-also-viewed cards link via
// /html/profile.html?user=<slug>.
window.VIBE_MOCK_USERS = VIBE_MOCK_USERS;
