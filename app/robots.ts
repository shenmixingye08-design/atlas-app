import type { MetadataRoute } from "next";

import { getSiteOrigin } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/capabilities",
          "/pricing",
          "/terms",
          "/privacy",
          "/legal",
          "/contact",
        ],
        disallow: [
          "/chat",
          "/history",
          "/settings",
          "/projects",
          "/workspace",
          "/automations",
          "/billing",
          "/api/",
          "/owner",
          "/sign-in",
          "/sign-up",
          "/solutions",
          "/marketplace",
          "/mihon",
          "/company",
          "/connections",
          "/connectors",
          "/integrations",
          "/notifications",
          "/maintenance",
          "/offline",
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
