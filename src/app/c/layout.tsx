/**
 * Club links (`/c/<code>`, `/c/welcome`): the sign-up page's frame, since the
 * link page is the sign-up form for someone signed out.
 */
export default function ClubLinkLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--cream)",
        padding:
          "calc(24px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom))",
        fontFamily: '"DM Sans", sans-serif',
      }}
    >
      {children}
    </div>
  );
}
