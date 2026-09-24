export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#FAF7F2",
        // Inside the App Store app the web view runs under the status bar
        // (viewport-fit=cover, Capacitor contentInset "never"), so the top
        // and bottom insets are real there; in a browser tab they're 0.
        padding:
          "calc(24px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom))",
        fontFamily: '"DM Sans", sans-serif',
      }}
    >
      {children}
    </div>
  );
}
