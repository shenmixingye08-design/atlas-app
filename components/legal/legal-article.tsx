import Link from "next/link";

import type { LegalArticle as LegalArticleType } from "@/lib/legal/types";

type LegalArticleProps = {
  article: LegalArticleType;
  /** Defaults to 第{number}条 */
  formatSectionLabel?: (article: LegalArticleType) => string;
};

function defaultSectionLabel(article: LegalArticleType): string {
  return article.sectionPrefix ?? `第${article.number}条`;
}

export function LegalArticle({
  article,
  formatSectionLabel = defaultSectionLabel,
}: LegalArticleProps) {
  const sectionLabel = formatSectionLabel(article);

  return (
    <section
      id={article.id}
      className="terms-article scroll-mt-24 border-b border-[var(--border-subtle)] pb-10 last:border-b-0"
      aria-labelledby={`${article.id}-heading`}
    >
      <h2
        id={`${article.id}-heading`}
        className="text-xl font-semibold tracking-tight text-[var(--terms-heading)] sm:text-2xl"
      >
        <span className="text-[var(--terms-accent)]">{sectionLabel}</span>
        <span className="ml-2">{article.title}</span>
      </h2>

      <div className="mt-5 space-y-4">
        {article.blocks.map((block, index) => {
          const key = `${article.id}-${index}`;

          if (block.type === "paragraph") {
            return (
              <p
                key={key}
                className="text-[15px] leading-7 text-[var(--terms-body)] sm:text-base sm:leading-8"
              >
                {block.text}
              </p>
            );
          }

          if (block.type === "subheading") {
            return (
              <h3
                key={key}
                className="pt-2 text-base font-semibold text-[var(--terms-heading)]"
              >
                {block.text}
              </h3>
            );
          }

          if (block.type === "link") {
            return (
              <div key={key} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--terms-toc-hover-bg)] px-4 py-3">
                <Link
                  href={block.href}
                  className="text-[15px] font-medium text-[var(--terms-accent)] hover:underline sm:text-base"
                >
                  {block.label}
                </Link>
                {block.description ? (
                  <p className="mt-1 text-sm text-[var(--terms-muted)]">
                    {block.description}
                  </p>
                ) : null}
              </div>
            );
          }

          return (
            <ul
              key={key}
              className="list-disc space-y-2 pl-5 text-[15px] leading-7 text-[var(--terms-body)] sm:text-base sm:leading-8"
            >
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        })}
      </div>
    </section>
  );
}
