import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { CampusAppShell } from "@/components/campus-app-shell";

export const metadata = {
  title: "Messages · Vibe",
  description: "DMs and channels",
};

type Props = {
  searchParams: Promise<{ to?: string | string[] }>;
};

/**
 * `/messages` runs the static prototype inside CampusAppShell so the React
 * sidebar (with the rich identity chip) matches /campus and /network. The
 * prototype itself stays in /html/messages.html — passing ?embedded=1 tells
 * it to suppress its own sidebar so we don't double up. ?to=<handle> is
 * preserved so the prototype can auto-create/open the right DM channel.
 */
export default async function MessagesPage({ searchParams }: Props) {
  await enforceCampusAccess("/messages");
  const { to } = await searchParams;
  const handle = Array.isArray(to) ? to[0] : to;
  const params = new URLSearchParams({ app: "1", embedded: "1" });
  if (handle) params.set("to", handle.toLowerCase());
  const src = `/html/messages.html?${params.toString()}`;
  return (
    <CampusAppShell iframeEmbed>
      <iframe
        src={src}
        title="Messages"
        style={{
          width: "100%",
          height: "100vh",
          border: "none",
          display: "block",
          background: "#FAF7F2",
        }}
      />
    </CampusAppShell>
  );
}
