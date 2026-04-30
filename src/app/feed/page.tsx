import LeftNav from '@/components/LeftNav';

const posts = [
  {
    id: 1, initials: 'KA', color: '#2D1B4E',
    name: 'Kwame Asante', role: 'AI Founder · Lagos → SF', time: '2h ago',
    body: 'The best products don\'t solve problems. They dissolve them. You stop noticing the friction because it\'s just... gone.',
  },
  {
    id: 2, initials: 'LM', color: '#1A3D5C',
    name: 'Luca Moretti', role: 'Product Lead · Fintech', time: '4h ago',
    body: 'Three years ago I gave a talk to 12 people in a basement. Last week: Web Summit main stage. Compounding is real. Show up anyway.',
  },
  {
    id: 3, initials: 'PS', color: '#4E1B2D',
    name: 'Priya Sinha', role: 'Growth Lead · Ex-Spotify', time: '6h ago',
    body: 'Hot take: most "growth hacks" are just delayed trust destruction. Build something people actually want to tell their friends about.',
  },
];

const suggestions = [
  { name: 'Zara Williams', role: 'CS · IU Senior', initials: 'ZW', color: '#1B4E2D' },
  { name: 'Jordan Lee', role: 'Finance · Junior', initials: 'JL', color: '#1A4D7C' },
  { name: 'Nina Okonkwo', role: 'Finance · IU Alumni', initials: 'NO', color: '#1A7C7C' },
];

export default function FeedPage() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 320px', minHeight: '100vh' }}>

      <LeftNav />

      {/* Center */}
      <main style={{ borderRight: '1px solid rgba(28,28,30,0.08)' }}>

        {/* Tabs */}
        <div style={{
          padding: '0 20px', borderBottom: '1px solid rgba(28,28,30,0.08)',
          position: 'sticky', top: 0, background: 'rgba(250,247,242,0.92)',
          backdropFilter: 'blur(14px)', zIndex: 50, display: 'flex',
        }}>
          {['For You', 'Following', 'Trending', 'Vibes'].map((tab, i) => (
            <button key={tab} style={{
              fontSize: '14px', fontWeight: '600',
              color: i === 0 ? '#1C1C1E' : '#8A8580',
              padding: '16px 18px', border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: i === 0 ? '2px solid #FF5C35' : '2px solid transparent',
            }}>{tab}</button>
          ))}
        </div>

        {/* Composer */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(28,28,30,0.08)', background: 'white' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px', background: '#1C1C1E',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Fraunces, serif', fontSize: '14px', fontWeight: '700', color: 'white', flexShrink: 0,
            }}>MC</div>
            <textarea placeholder="What's on your mind?" style={{
              width: '100%', padding: '12px 16px', borderRadius: '14px',
              border: '1.5px solid rgba(28,28,30,0.08)', background: '#FAF7F2',
              fontFamily: 'DM Sans, sans-serif', fontSize: '14px', color: '#1C1C1E',
              resize: 'none', outline: 'none', minHeight: '48px',
            }} />
          </div>
        </div>

        {/* Posts */}
        {posts.map((post) => (
          <div key={post.id} style={{
            padding: '20px', borderBottom: '1px solid rgba(28,28,30,0.08)', background: 'white',
          }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '13px', background: post.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Fraunces, serif', fontSize: '15px', fontWeight: '700',
                color: 'white', flexShrink: 0,
              }}>{post.initials}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#1C1C1E' }}>{post.name}</span>
                  <span style={{ fontSize: '12px', color: '#8A8580' }}>{post.role}</span>
                  <span style={{ fontSize: '12px', color: '#8A8580', marginLeft: 'auto' }}>{post.time}</span>
                </div>
                <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#1C1C1E', marginBottom: '12px' }}>
                  {post.body}
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['🔥 247', '🧠 89', '👏 134'].map((r) => (
                    <button key={r} style={{
                      background: '#FAF7F2', border: '1px solid rgba(28,28,30,0.08)',
                      borderRadius: '100px', padding: '5px 12px',
                      fontSize: '12px', fontWeight: '600', color: '#8A8580', cursor: 'pointer',
                    }}>{r}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </main>

      {/* Right */}
      <aside style={{ padding: '20px 16px' }}>
        <div style={{
          background: 'white', borderRadius: '16px',
          border: '1px solid rgba(28,28,30,0.08)', padding: '16px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#1C1C1E', marginBottom: '12px' }}>
            People you may know
          </div>
          {suggestions.map((s) => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px', background: s.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Fraunces, serif', fontSize: '12px', fontWeight: '700', color: 'white',
              }}>{s.initials}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#1C1C1E' }}>{s.name}</div>
                <div style={{ fontSize: '11px', color: '#8A8580' }}>{s.role}</div>
              </div>
              <button style={{
                fontSize: '12px', fontWeight: '700', color: '#FF5C35',
                background: '#FFF5F2', border: '1px solid rgba(255,92,53,0.2)',
                borderRadius: '100px', padding: '4px 12px', cursor: 'pointer',
              }}>Connect</button>
            </div>
          ))}
        </div>
      </aside>

    </div>
  );
}