"use client";

import { useCallback, useEffect, useState } from "react";

import type { LegalArticle } from "@/lib/legal/types";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";

type LegalTableOfContentsProps = {
  articles: LegalArticle[];
  className?: string;
  formatSectionLabel?: (article: LegalArticle) => string;
};

function defaultSectionLabel(article: LegalArticle): string {
  return article.sectionPrefix ?? `第${article.number}条`;
}

export function LegalTableOfContents({
  articles,
  className,
  formatSectionLabel = defaultSectionLabel,
}: LegalTableOfContentsProps) {
  const [activeId, setActiveId] = useState(articles[0]?.id ?? "");

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort(
          (a, b) =>
            a.target.getBoundingClientRect().top -
            b.target.getBoundingClientRect().top,
        );

      if (visible[0]?.target.id) {
        setActiveId(visible[0].target.id);
      }
    },
    [],
  );

  useEffect(() => {
    const sections = articles
      .map((article) => document.getElementById(article.id))
      .filter((node): node is HTMLElement => node !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(handleIntersect, {
      root: null,
      rootMargin: "-20% 0px -55% 0px",
      threshold: 0,
    });

    for (const section of sections) {
      observer.observe(section);
    }

    return () => observer.disconnect();
  }, [articles, handleIntersect]);

  return (
    <nav
      aria-label={ui.legal.tocLabel}
      className={cn("terms-toc", className)}
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--terms-muted)]">
        {ui.legal.tocLabel}
      </p>
      <ol className="space-y-1">
        {articles.map((article) => {
          const isActive = activeId === article.id;
          const sectionLabel = formatSectionLabel(article);

          return (
            <li key={article.id}>
              <a
                href={`#${article.id}`}
                className={cn(
                  "block rounded-lg px-3 py-2 text-sm leading-snug transition-colors",
                  isActive
                    ? "bg-[var(--terms-toc-active-bg)] font-medium text-[var(--terms-accent)]"
                    : "text-[var(--terms-muted)] hover:bg-[var(--terms-toc-hover-bg)] hover:text-[var(--terms-heading)]",
                )}
                aria-current={isActive ? "location" : undefined}
              >
                <span className="mr-1.5 tabular-nums">{sectionLabel}</span>
                {article.title}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
