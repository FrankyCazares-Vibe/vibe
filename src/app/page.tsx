export default function Home() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      flexDirection: 'column',
      gap: '16px',
      background: '#FAF7F2'
    }}>
      <div style={{
        fontFamily: 'Fraunces, serif',
        fontSize: '48px',
        fontWeight: '900',
        letterSpacing: '-2px',
        color: '#1C1C1E'
      }}>
        vibe<span style={{ color: '#FF5C35' }}>.</span>
      </div>
      <div style={{
        fontFamily: 'DM Sans, sans-serif',
        fontSize: '16px',
        color: '#8A8580'
      }}>
        Your campus, your career, one profile.
      </div>
    </div>
  );
}
