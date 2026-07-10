import type { Metadata } from "next";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { MihonDashboard } from "@/components/showcase/mihon-dashboard";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.mihon,
  description: ui.mihon.subtitle.replace(/\n/g, " "),
};

export default function MihonPage() {
  return (
    <AtlasAppShell active="mihon" width="wide">
      <MihonDashboard />
    </AtlasAppShell>
  );
}
