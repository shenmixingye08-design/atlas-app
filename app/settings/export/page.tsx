import type { Metadata } from "next";

import { DataExportSettings } from "@/components/settings/data-export-settings";
import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.dataExport.metaTitle,
};

export default function DataExportSettingsPage() {
  return (
    <AtlasAppShell active="settings" width="default">
      <div className="space-y-8 animate-fade-up">
        <header className="space-y-3">
          <p className="text-caption">{ui.brand}</p>
          <h1 className="text-display text-foreground">{ui.dataExport.pageTitle}</h1>
          <p className="text-body max-w-2xl text-[var(--foreground-muted)]">
            {ui.dataExport.pageSubtitle}
          </p>
        </header>
        <DataExportSettings />
      </div>
    </AtlasAppShell>
  );
}
