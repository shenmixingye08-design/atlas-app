import type { Metadata } from "next";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { CompanySelectionDashboard } from "@/components/company/company-selection-dashboard";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.company,
  description: "業種特化の AI 会社テンプレートを選択",
};

export default function CompanyPage() {
  return (
    <AtlasAppShell active="company" width="wide">
      <CompanySelectionDashboard />
    </AtlasAppShell>
  );
}
