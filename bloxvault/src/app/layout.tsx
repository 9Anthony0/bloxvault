import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "BloxVault — Hidden gem vault for Roblox",
  description: "Save Roblox games from Reels & TikToks in two seconds. Log, rate, and discover hidden gems.",
  applicationName: "BloxVault",
  appleWebApp: { capable: true, title: "BloxVault", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
