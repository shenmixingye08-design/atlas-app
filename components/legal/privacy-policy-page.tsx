"use client";

import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { PRIVACY_ARTICLES, PRIVACY_META } from "@/lib/legal";
import { ui } from "@/lib/i18n";

export function PrivacyPolicyPage() {
  return (
    <LegalDocumentPage
      meta={PRIVACY_META}
      articles={PRIVACY_ARTICLES}
      badge={ui.legal.privacyBadge}
      title={ui.legal.privacyTitle}
      intro={ui.legal.privacyIntro}
      footerNote={ui.legal.privacyFooterNote}
    />
  );
}
