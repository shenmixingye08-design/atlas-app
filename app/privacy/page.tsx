import type { Metadata } from "next";

import { PrivacyPolicyPage } from "@/components/legal/privacy-policy-page";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.legal.privacyMetaTitle,
  description: ui.legal.privacyMetaDescription,
};

export default function PrivacyPage() {
  return <PrivacyPolicyPage />;
}
