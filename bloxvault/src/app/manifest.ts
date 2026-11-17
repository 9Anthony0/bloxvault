import type { MetadataRoute } from "next";

/**
 * PWA manifest. `share_target` puts BloxVault in the phone's share sheet once installed:
 * Instagram/TikTok → Share → BloxVault opens `/?url=…&text=…`, and the Quick-Drop bar
 * auto-submits it. That's the "save in under 2 seconds" path.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BloxVault",
    short_name: "BloxVault",
    description: "Play-later vault & hidden gem finder for Roblox",
    start_url: "/",
    display: "standalone",
    background_color: "#08090b",
    theme_color: "#08090b",
    orientation: "portrait",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    share_target: {
      action: "/",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  } as MetadataRoute.Manifest;
}
