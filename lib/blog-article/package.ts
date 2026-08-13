import type { Deliverable, WorkerDeliverablePayload } from "@/lib/orchestration/deliverable-types";

import {
  collectFactNotes,
  defaultCtaForIntent,
  excerptFrom,
  sanitizeBlogTitle,
  slugFromTitle,
  softenUnsourcedClaims,
  titleLooksStuffed,
} from "./copy";
import {
  resolveBlogIntent,
  suggestedHeadingOutline,
  type BlogIntent,
} from "./intent";

export type BlogFaqItem = { question: string; answer: string };

export type BlogArticlePackage = {
  intent: BlogIntent;
  title: string;
  body: string;
  excerpt: string;
  slug: string;
  metaDescription: string;
  tags: string[];
  categoryCandidates: string[];
  faq: BlogFaqItem[];
  cta: string | null;
  featuredImageHint: string | null;
  internalLinkCandidates: string[];
  factNotes: string[];
  snsPost: string;
  audience: string;
};

export type FinalizeBlogInput = {
  assignment: string;
  title: string;
  summary?: string;
  content: string;
  markdown?: string;
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
  keywords?: string[];
  cta?: string | null;
  snsPost?: string;
  audience?: string;
  preferCta?: boolean;
  memoryCta?: string | null;
};

function headingCount(markdown: string): number {
  return (markdown.match(/^#{2,3}\s+/gm) ?? []).length;
}

function ensureOutline(body: string, intent: BlogIntent): string {
  if (headingCount(body) >= 2) return body;
  const outline = suggestedHeadingOutline(intent);
  const paragraphs = body
    .replace(/^#\s+.+$/m, "")
    .split(/\n\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) {
    return outline.map((heading) => `## ${heading}\n\n本文を追記してください。`).join("\n\n");
  }
  const chunks: string[] = [];
  const size = Math.max(1, Math.ceil(paragraphs.length / outline.length));
  outline.forEach((heading, index) => {
    const slice = paragraphs.slice(index * size, (index + 1) * size);
    if (slice.length === 0) return;
    chunks.push(`## ${heading}\n\n${slice.join("\n\n")}`);
  });
  return chunks.join("\n\n");
}

function extractFaq(body: string): BlogFaqItem[] {
  const items: BlogFaqItem[] = [];
  const qa = body.matchAll(/(?:^|\n)(?:#{2,3}\s*)?(?:Q[:：]\s*|質問[:：]\s*)(.+)\n+(?:A[:：]\s*|回答[:：]\s*)(.+)/gi);
  for (const match of qa) {
    const question = match[1]?.trim();
    const answer = match[2]?.trim();
    if (question && answer) items.push({ question, answer });
    if (items.length >= 5) break;
  }
  return items;
}

function tagsFrom(input: FinalizeBlogInput, intent: BlogIntent, title: string): string[] {
  const base = [...(input.tags ?? []), ...(input.keywords ?? [])]
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean);
  if (base.length === 0) {
    base.push(intent === "howto" ? "手順" : "解説");
    const keyword = title.replace(/[について|とは|ガイド|徹底]/g, "").slice(0, 12);
    if (keyword) base.push(keyword);
  }
  return [...new Set(base)].slice(0, 8);
}

/**
 * Deterministic blog package. Does not call Word generators or WP APIs.
 */
export function buildBlogArticlePackage(input: FinalizeBlogInput): BlogArticlePackage {
  const intent = resolveBlogIntent({
    assignment: input.assignment,
    title: input.title,
    body: input.content,
  });
  let title = sanitizeBlogTitle(input.seoTitle || input.title);
  if (titleLooksStuffed(title)) {
    title = sanitizeBlogTitle(title.split(/[\s・]/).slice(0, 8).join(" "));
  }
  const rawBody = (input.markdown?.trim() || input.content || "")
    .replace(/^#\s+.+\n+/, "")
    .replace(/^【(?:好み反映|文体|適用する好み|敬称・トーン)】.+$/gm, "")
    .replace(/\n## SEO[\s\S]*?(?=\n## )/i, "\n")
    .replace(/\n## 推奨タグ[\s\S]*?(?=\n## )/i, "\n")
    .replace(/\n## 記事本文\s*\n/i, "\n")
    .replace(/\n## SNS投稿文[\s\S]*$/i, "")
    .replace(/\b(Key points|Overview|Thank you)\b/gi, "")
    .replace(/^(?:こんにちは[。、]?|はじめまして[。、]?|今回は[、]?)/m, "")
    .trim();
  const softened = softenUnsourcedClaims(rawBody, input.assignment);
  const body = ensureOutline(softened, intent);
  const excerpt = excerptFrom(input.seoDescription || input.summary || body, 120);
  const faq = extractFaq(body);
  const cta = input.preferCta
    ? defaultCtaForIntent(intent, input.memoryCta ?? input.cta ?? null)
    : input.cta?.trim() || defaultCtaForIntent(intent, input.memoryCta ?? null);
  const factNotes = collectFactNotes(body, input.assignment);
  const tags = tagsFrom(input, intent, title);

  return {
    intent,
    title,
    body,
    excerpt,
    slug: slugFromTitle(title),
    metaDescription: excerptFrom(excerpt, 110),
    tags,
    categoryCandidates: [intent === "howto" ? "使い方" : intent === "news" ? "お知らせ" : "ブログ"],
    faq,
    cta,
    featuredImageHint: /写真|図|イメージ/.test(input.assignment) ? "記事内容を示す図" : null,
    internalLinkCandidates: tags.slice(0, 3).map((tag) => `${tag}の関連記事`),
    factNotes,
    snsPost: input.snsPost?.trim() || `「${title}」を公開しました。`,
    audience: input.audience?.trim() || "実務担当者",
  };
}

export function packageToMarkdown(pkg: BlogArticlePackage): string {
  const parts = [`# ${pkg.title}`, "", pkg.body];
  if (pkg.faq.length > 0) {
    parts.push("", "## よくある質問");
    for (const item of pkg.faq) {
      parts.push("", `### ${item.question}`, "", item.answer);
    }
  }
  if (pkg.cta) {
    parts.push("", pkg.cta);
  }
  if (pkg.factNotes.length > 0) {
    parts.push("", "## 確認メモ");
    for (const note of pkg.factNotes) parts.push(`- ${note}`);
  }
  return parts.join("\n").trim();
}

export function applyBlogPackageToDeliverable(
  deliverable: Deliverable,
  assignment: string,
): Deliverable {
  if (deliverable.type !== "blog") return deliverable;
  const pkg = buildBlogArticlePackage({
    assignment,
    title: deliverable.title,
    summary: deliverable.summary,
    content: deliverable.content,
    markdown: deliverable.markdown,
    tags: deliverable.metadata.tags,
    seoTitle: deliverable.metadata.seo.title,
    seoDescription: deliverable.metadata.seo.description,
    keywords: deliverable.metadata.seo.keywords,
    cta: deliverable.metadata.cta,
    snsPost: deliverable.metadata.snsPost,
    audience: deliverable.metadata.audience,
  });
  const markdown = packageToMarkdown(pkg);
  return {
    ...deliverable,
    title: pkg.title,
    summary: pkg.excerpt,
    content: pkg.body,
    markdown,
    plainText: markdown.replace(/[#*_`>-]/g, " ").replace(/\s+/g, " ").trim(),
    metadata: {
      ...deliverable.metadata,
      tags: pkg.tags,
      seo: {
        title: pkg.title,
        description: pkg.metaDescription,
        keywords: pkg.tags,
      },
      snsPost: pkg.snsPost,
      audience: pkg.audience,
      cta: pkg.cta ?? deliverable.metadata.cta,
      excerpt: pkg.excerpt,
      slug: pkg.slug,
      faq: pkg.faq,
      categoryCandidates: pkg.categoryCandidates,
      featuredImageHint: pkg.featuredImageHint,
      factNotes: pkg.factNotes,
      internalLinkCandidates: pkg.internalLinkCandidates,
      blogIntent: pkg.intent,
    },
  };
}

export function applyBlogPackageToPayload(
  payload: WorkerDeliverablePayload,
  assignment: string,
): WorkerDeliverablePayload {
  const pkg = buildBlogArticlePackage({
    assignment,
    title: payload.title,
    summary: payload.summary,
    content: payload.content,
    markdown: payload.markdown,
    tags: payload.tags,
    seoTitle: payload.seo?.title,
    seoDescription: payload.seo?.description,
    keywords: payload.seo?.keywords,
    cta: payload.cta,
    snsPost: payload.snsPost,
    audience: payload.audience,
  });
  return {
    ...payload,
    type: "blog",
    title: pkg.title,
    summary: pkg.excerpt,
    content: pkg.body,
    markdown: packageToMarkdown(pkg),
    tags: pkg.tags,
    seo: {
      title: pkg.title,
      description: pkg.metaDescription,
      keywords: pkg.tags,
    },
    snsPost: pkg.snsPost,
    audience: pkg.audience,
    cta: pkg.cta ?? payload.cta,
    excerpt: pkg.excerpt,
    slug: pkg.slug,
  };
}
