import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { LearningEngineSettings } from "@/components/settings/learning-engine-settings";
import { WorkflowLearningPanel } from "@/components/workflow-learning/workflow-learning-panel";

export default function LearningSettingsPage() {
  return (
    <AtlasAppShell active="learning" width="wide">
      <div className="space-y-12">
        <WorkflowLearningPanel />
        <details className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)]">
            従来の仕事分析レポートも見る
          </summary>
          <div className="mt-4">
            <LearningEngineSettings />
          </div>
        </details>
      </div>
    </AtlasAppShell>
  );
}
