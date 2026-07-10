"use client";

import Link from "next/link";

import { LegalArticle } from "@/components/legal/legal-article";
import { LegalFooterLinks } from "@/components/legal/legal-footer-links";
import { LegalTableOfContents } from "@/components/legal/legal-table-of-contents";
import type { LegalArticle as LegalArticleType, LegalDocumentMeta } from "@/lib/legal/types";
import { ui } from "@/lib/i18n";

type LegalDocumentPageProps = {
  meta: LegalDocumentMeta;
  articles: LegalArticleType[];
  badge: string;
  title: string;
  intro: string;
  footerNote: string;
  formatSectionLabel?: (article: LegalArticleType) => string;
  formatMobileSectionLabel?: (article: LegalArticleType) => string;
};

function defaultSectionLabel(article: LegalArticleType): string {
  return article.sectionPrefix ?? `第${article.number}条`;
}

export function LegalDocumentPage({
  meta,
  articles,
  badge,
  title,
  intro,
  footerNote,
  formatSectionLabel = defaultSectionLabel,
  formatMobileSectionLabel = formatSectionLabel,
}: LegalDocumentPageProps) {
  return (
    <div className="terms-page min-h-screen bg-[var(--terms-bg)] text-[var(--terms-heading)]">
      <header className="terms-page-header border-b border-[var(--border-subtle)] bg-[var(--terms-bg)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 shadow-md shadow-blue-500/20">
              <span className="text-sm font-bold text-white">A</span>
            </div>
            <span className="text-base font-semibold tracking-tight">{ui.brand}</span>
          </Link>
          <button
            type="button"
            className="terms-print-button rounded-full border border-[var(--border-subtle)] px-4 py-1.5 text-sm text-[var(--terms-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--terms-heading)]"
            onClick={() => window.print()}
          >
            {ui.legal.print}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8 sm:py-14">
        <div className="mx-auto max-w-[800px] lg:max-w-none">
          <div className="mb-10 space-y-3 lg:mb-12">
            <p className="text-sm font-medium text-[var(--terms-accent)]">{badge}</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
            <p className="text-base leading-relaxed text-[var(--terms-muted)]">{intro}</p>
            <p className="text-sm text-[var(--terms-muted)]">
              {ui.legal.effectiveDate(meta.effectiveDateDisplay)}
            </p>
          </div>

          <div className="terms-layout grid gap-10 lg:grid-cols-[220px_minmax(0,800px)] lg:gap-14 xl:grid-cols-[240px_minmax(0,800px)]">
            <aside className="terms-toc-aside lg:sticky lg:top-24 lg:self-start">
              <div className="terms-toc-mobile overflow-x-auto pb-2 lg:hidden">
                <div className="flex min-w-max gap-2">
                  {articles.map((article) => (
                    <a
                      key={article.id}
                      href={`#${article.id}`}
                      className="rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--terms-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--terms-heading)]"
                    >
                      {formatMobileSectionLabel(article)}
                    </a>
                  ))}
                </div>
              </div>
              <LegalTableOfContents
                articles={articles}
                className="hidden lg:block"
                formatSectionLabel={formatSectionLabel}
              />
            </aside>

            <main className="terms-main min-w-0 space-y-10">
              {articles.map((article) => (
                <LegalArticle
                  key={article.id}
                  article={article}
                  formatSectionLabel={formatSectionLabel}
                />
              ))}

              <footer className="terms-meta border-t border-[var(--border-subtle)] pt-8">
                <dl className="grid gap-3 text-sm text-[var(--terms-muted)] sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-[var(--terms-heading)]">
                      {ui.legal.lastUpdatedLabel}
                    </dt>
                    <dd>{meta.lastUpdatedDisplay}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-[var(--terms-heading)]">
                      {ui.legal.versionLabel}
                    </dt>
                    <dd>{meta.version}</dd>
                  </div>
                </dl>
                <p className="mt-6 text-xs leading-relaxed text-[var(--terms-muted)]">
                  {footerNote}
                </p>
                <LegalFooterLinks
                  variant="light"
                  className="terms-print-button mt-6 border-t border-[var(--border-subtle)] pt-6"
                />
              </footer>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
