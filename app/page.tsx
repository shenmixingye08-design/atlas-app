import type { Metadata } from "next";

import { LandingPage } from "@/components/landing/landing-page";
import {
  ATLAS_DEFAULT_DESCRIPTION,
  ATLAS_DEFAULT_TITLE,
  getSiteOrigin,
} from "@/lib/seo/site";

export const metadata: Metadata = {
  title: {
    absolute: ATLAS_DEFAULT_TITLE,
  },
  description: ATLAS_DEFAULT_DESCRIPTION,
  alternates: {
    canonical: getSiteOrigin(),
  },
  openGraph: {
    title: ATLAS_DEFAULT_TITLE,
    description: ATLAS_DEFAULT_DESCRIPTION,
    url: getSiteOrigin(),
  },
};

/** 公開ホームページ。認証 protect はかけない（proxy.ts）。 */
export default function Home() {
  return <LandingPage />;
}
