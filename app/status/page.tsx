import type { Metadata } from "next";

import { PublicStatusPageContent } from "@/components/system-pages/public-status-page";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.systemPages.statusMetaTitle,
  description: ui.systemPages.statusMetaDescription,
};

export default function StatusRoutePage() {
  return <PublicStatusPageContent />;
}
