import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { atlasClerkAppearance } from "@/lib/clerk/appearance";
import { OfflineWatcher } from "@/components/system-pages/offline-watcher";
import {
  ATLAS_DEFAULT_DESCRIPTION,
  ATLAS_DEFAULT_TITLE,
  getSiteOrigin,
} from "@/lib/seo/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteOrigin = getSiteOrigin();

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: ATLAS_DEFAULT_TITLE,
    template: "%s — ATLAS",
  },
  description: ATLAS_DEFAULT_DESCRIPTION,
  applicationName: "ATLAS",
  keywords: [
    "ATLAS",
    "AI秘書",
    "仕事の記憶",
    "自動化",
    "資料作成",
    "習慣",
  ],
  authors: [{ name: "ATLAS" }],
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: siteOrigin,
    siteName: "ATLAS",
    title: ATLAS_DEFAULT_TITLE,
    description: ATLAS_DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: ATLAS_DEFAULT_TITLE,
    description: ATLAS_DEFAULT_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-[#1d1d1f]">
        <ClerkProvider appearance={atlasClerkAppearance}>
          {children}
          <OfflineWatcher />
        </ClerkProvider>
      </body>
    </html>
  );
}
