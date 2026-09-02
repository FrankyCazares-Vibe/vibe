import type { Metadata, Viewport } from "next";
import "./globals.css";
import { JetBrains_Mono } from "next/font/google";

import { CustomCursor } from "@/components/CustomCursor";
import { cn } from "@/lib/utils";

const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-mono'});

export const metadata: Metadata = {
  title: "Vibe",
  description: "Your campus, your career, one profile.",
  icons: {
    icon: [
      // Google Search does not use SVG. It wants a square ICO/PNG >48px
      // on a stable URL, linked from the homepage.
      { url: "/icon.png", type: "image/png", sizes: "192x192" },
      { url: "/favicon-48.png", type: "image/png", sizes: "48x48" },
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/vibe-icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FAF7F2",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn("font-mono", jetbrainsMono.variable)}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;0,900;1,400&family=DM+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        {/* Single cursor for the whole React app — landing, auth, every
            shelled surface. Static prototype pages have their own. */}
        <CustomCursor />
      </body>
    </html>
  );
}