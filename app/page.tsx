import type { Metadata } from "next";

import { LandingPage } from "@/components/landing/landing-page";
import {
  MINERVOT_DEFAULT_DESCRIPTION,
  MINERVOT_DEFAULT_TITLE,
  getSiteOrigin,
} from "@/lib/seo/site";

const siteOrigin = getSiteOrigin();

export const metadata: Metadata = {
  title: {
    absolute: MINERVOT_DEFAULT_TITLE,
  },

  description: MINERVOT_DEFAULT_DESCRIPTION,

  alternates: {
    canonical: siteOrigin,
  },

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
  },
};

export default function Page() {
  return <LandingPage />;
}
