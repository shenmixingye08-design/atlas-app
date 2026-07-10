import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { LearningEngineSettings } from "@/components/settings/learning-engine-settings";
import { ui } from "@/lib/i18n";

export default function LearningSettingsPage() {
  return (
    <AtlasAppShell active="settings" width="default">
      <div className="space-y-8 animate-fade-up">
        <header className="space-y-3">
          <p className="text-caption">{ui.brand}</p>
          <h1 className="text-display text-foreground">
            {ui.learningEngine.pageTitle}
          </h1>
          <p className="text-body max-w-2xl text-[var(--foreground-muted)]">
            {ui.learningEngine.pageSubtitle}
          </p>
        </header>
        <LearningEngineSettings />
      </div>
    </AtlasAppShell>
  );
}
