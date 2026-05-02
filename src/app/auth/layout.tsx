export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#FAF7F2",
        padding: "24px 16px",
        fontFamily: '"DM Sans", sans-serif',
      }}
    >
      {children}
    </div>
  );
}
