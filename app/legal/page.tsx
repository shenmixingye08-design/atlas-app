import type { Metadata } from "next";

import { LegalNoticePage } from "@/components/legal/legal-notice-page";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.legal.commercialMetaTitle,
  description: ui.legal.commercialMetaDescription,
};

export default function CommercialLegalPage() {
  return <LegalNoticePage />;
}
