import type { Metadata } from "next";

import { TermsOfServicePage } from "@/components/legal/terms-of-service-page";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.legal.termsMetaTitle,
  description: ui.legal.termsMetaDescription,
};

export default function TermsPage() {
  return <TermsOfServicePage />;
}
