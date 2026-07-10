"use client";

import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { TERMS_ARTICLES, TERMS_META } from "@/lib/legal";
import { ui } from "@/lib/i18n";

export function TermsOfServicePage() {
  return (
    <LegalDocumentPage
      meta={TERMS_META}
      articles={TERMS_ARTICLES}
      badge={ui.legal.termsBadge}
      title={ui.legal.termsTitle}
      intro={ui.legal.termsIntro}
      footerNote={ui.legal.footerNote}
    />
  );
}
