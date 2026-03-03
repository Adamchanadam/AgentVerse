import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@agentverse/shared"],
  // Proxy API calls to Hub in development
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.HUB_URL ?? "http://localhost:3000"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
