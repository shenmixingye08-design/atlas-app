import type { MetadataRoute } from "next";

import { ensureAcquisitionHydrated } from "@/lib/growth/acquisition/durable";
import { publicUseCasePages } from "@/lib/growth/acquisition/usecases";
import { FIRST_OFFER_PATH } from "@/lib/growth/first-revenue/constants";
import { ensureFirstRevenueHydrated } from "@/lib/growth/first-revenue/durable";
import { getOfferLpStatus } from "@/lib/growth/first-revenue/store";
import { getSiteOrigin } from "@/lib/seo/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await ensureAcquisitionHydrated();
  await ensureFirstRevenueHydrated();
  const origin = getSiteOrigin();
  const lastModified = new Date();

  const paths = [
    "/",
    "/capabilities",
    "/pricing",
    "/terms",
    "/privacy",
    "/legal",
    "/contact",
    "/tools/automation-diagnosis",
  ] as const;

  const staticEntries = paths.map((path) => ({
    url: `${origin}${path === "/" ? "" : path}`,
    lastModified,
    changeFrequency: path === "/" ? ("weekly" as const) : ("monthly" as const),
    priority: path === "/" ? 1 : 0.7,
  }));

  const useCases = publicUseCasePages().map((page) => ({
    url: `${origin}/use-cases/${page.slug}`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const firstOffer =
    getOfferLpStatus() === "approved"
      ? [
          {
            url: `${origin}${FIRST_OFFER_PATH}`,
            lastModified,
            changeFrequency: "weekly" as const,
            priority: 0.8,
          },
        ]
      : [];

  return [...staticEntries, ...useCases, ...firstOffer];
}
