import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { CampusAppShell } from "@/components/campus-app-shell";

export const metadata = {
  title: "otto · Vibe",
  description: "Your AI co-pilot",
};

/**
 * `/otto` runs the static prototype inside CampusAppShell so the React
 * sidebar (with the rich identity chip) matches /campus and /network.
 * ?embedded=1 tells the prototype to suppress its own sidebar.
 */
export default async function OttoPage() {
  await enforceCampusAccess("/otto");
  return (
    <CampusAppShell>
      <iframe
        src="/html/otto.html?app=1&embedded=1"
        title="otto"
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
