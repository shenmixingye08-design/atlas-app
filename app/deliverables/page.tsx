import type { Metadata } from "next";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { DeliverablesListPage } from "@/components/deliverables/deliverables-list-page";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.nav.deliverables,
  description: ui.phase3.deliverablesSubtitle,
};

export default function DeliverablesPage() {
  return (
    <AtlasAppShell active="deliverables" width="default">
      <DeliverablesListPage />
    </AtlasAppShell>
  );
}
