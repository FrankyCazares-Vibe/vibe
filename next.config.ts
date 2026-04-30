import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/html/landing.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
