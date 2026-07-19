import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { AppProviders } from "@/components/providers/app-providers";
import { OfflineWatcher } from "@/components/system-pages/offline-watcher";
import {
  MINERVOT_DEFAULT_DESCRIPTION,
  MINERVOT_DEFAULT_TITLE,
  getSiteOrigin,
} from "@/lib/seo/site";
import { THEME_BOOT_SCRIPT } from "@/lib/theme/storage";

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
    default: MINERVOT_DEFAULT_TITLE,
    template: "%s — MINERVOT",
  },

  description: MINERVOT_DEFAULT_DESCRIPTION,

  applicationName: "MINERVOT",

  keywords: [
    "MINERVOT",
    "AI秘書",
    "AIアシスタント",
    "AI自動化",
    "業務自動化",
    "仕事効率化",
    "タスク管理",
    "メール自動化",
    "SNS自動投稿",
    "資料作成AI",
    "スケジュール管理",
    "日本語AI",
  ],

  authors: [
    {
      name: "MINERVOT",
    },
  ],

  creator: "MINERVOT",
  publisher: "MINERVOT",

  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: siteOrigin,
    siteName: "MINERVOT",
    title: MINERVOT_DEFAULT_TITLE,
    description: MINERVOT_DEFAULT_DESCRIPTION,
  },

  twitter: {
    card: "summary_large_image",
    title: MINERVOT_DEFAULT_TITLE,
    description: MINERVOT_DEFAULT_DESCRIPTION,
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },

  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    {
      media: "(prefers-color-scheme: light)",
      color: "#ffffff",
    },
    {
      media: "(prefers-color-scheme: dark)",
      color: "#0f1115",
    },
  ],
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
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>

      <body className="flex min-h-full flex-col bg-[var(--background)] text-[var(--text-primary)]">
        <AppProviders>
          {children}
          <OfflineWatcher />
        </AppProviders>
      </body>
    </html>
  );
}
