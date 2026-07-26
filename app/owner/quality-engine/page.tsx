import { ArtifactFeedbackPanel } from "@/components/owner/artifact-feedback-panel";
import { QualityBenchmarkPanel } from "@/components/owner/quality-benchmark/benchmark-panel";
import { QualityEnginePanel } from "@/components/owner/quality-engine-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerQualityEnginePage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="qualityEngine" />
        <QualityEnginePanel />
        <QualityBenchmarkPanel />
        <ArtifactFeedbackPanel />
      </div>
    </OwnerShell>
  );
}
