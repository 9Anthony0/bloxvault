import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Roblox thumbnails are served from rotating CDN hosts (tr.rbxcdn.com, t0-t7.rbxcdn.com, …)
    remotePatterns: [{ protocol: "https", hostname: "**.rbxcdn.com" }],
  },
};

export default nextConfig;
