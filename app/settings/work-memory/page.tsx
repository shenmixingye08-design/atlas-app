import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { WorkMemorySettings } from "@/components/settings/work-memory-settings";
import { ui } from "@/lib/i18n";

export default function WorkMemorySettingsPage() {
  return (
    <AtlasAppShell active="settings" width="default">
      <div className="space-y-8 animate-fade-up">
        <header className="space-y-3">
          <p className="text-caption">{ui.brand}</p>
          <h1 className="text-display text-foreground">{ui.workMemory.pageTitle}</h1>
          <p className="text-body max-w-2xl text-[var(--foreground-muted)]">
            {ui.workMemory.pageSubtitle}
          </p>
        </header>
        <WorkMemorySettings />
      </div>
    </AtlasAppShell>
  );
}
