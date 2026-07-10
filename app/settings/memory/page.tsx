import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { MemorySettings } from "@/components/settings/memory-settings";
import { ui } from "@/lib/i18n";

export default function MemorySettingsPage() {
  return (
    <AtlasAppShell active="settings" width="default">
      <div className="space-y-8 animate-fade-up">
        <header className="space-y-3">
          <p className="text-caption">{ui.brand}</p>
          <h1 className="text-display text-foreground">{ui.memory.pageTitle}</h1>
          <p className="text-body max-w-2xl text-[var(--foreground-muted)]">
            {ui.memory.pageSubtitle}
          </p>
        </header>
        <MemorySettings />
      </div>
    </AtlasAppShell>
  );
}
