import { CancellationAnalysisPanel } from "@/components/owner/cancellation-analysis-panel";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerCancellationAnalysisPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell active="cancellationAnalysis">
      <div className="space-y-8">
        <CancellationAnalysisPanel />
      </div>
    </OwnerShell>
  );
}
