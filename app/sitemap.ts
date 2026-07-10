import type { MetadataRoute } from "next";

import { getSiteOrigin } from "@/lib/seo/site";

export default function sitemap(): MetadataRoute.Sitemap {
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
  ] as const;

  return paths.map((path) => ({
    url: `${origin}${path === "/" ? "" : path}`,
    lastModified,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
