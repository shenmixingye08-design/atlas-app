import type { Metadata } from "next";

import { MaintenancePageContent } from "@/components/system-pages/maintenance-page";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.systemPages.maintenanceMetaTitle,
};

export default function MaintenanceRoutePage() {
  return <MaintenancePageContent />;
}
