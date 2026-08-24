import type { MetadataRoute } from "next";

import { ensureAcquisitionHydrated } from "@/lib/growth/acquisition/durable";
import { publicUseCasePages } from "@/lib/growth/acquisition/usecases";
import { getSiteOrigin } from "@/lib/seo/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await ensureAcquisitionHydrated();
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

  return [...staticEntries, ...useCases];
}
