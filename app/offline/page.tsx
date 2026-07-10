import type { Metadata } from "next";

import { OfflinePageContent } from "@/components/system-pages/offline-page";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.systemPages.offlineMetaTitle,
};

export default function OfflineRoutePage() {
  return <OfflinePageContent />;
}
