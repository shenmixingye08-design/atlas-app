import type { WordPressPostPayload } from "@/lib/integrations/wordpress/types";

import { packageToMarkdown, type BlogArticlePackage } from "./package";

/**
 * Map a blog package onto the existing WordPress post payload.
 * Does not post. Does not invent category/tag IDs.
 */
export function blogPackageToWordPressPayload(
  pkg: BlogArticlePackage,
  status: WordPressPostPayload["status"] = "draft",
): WordPressPostPayload {
  const body = packageToMarkdown(pkg).replace(/^#\s+.+\n+/, "").trim();
  return {
    title: pkg.title,
    content: body || pkg.body,
    status,
    excerpt: pkg.excerpt,
    slug: pkg.slug,
    featuredImageAlt: pkg.featuredImageHint ?? undefined,
  };
}
