import { AnonymousUserAnalysisPanel } from "@/components/owner/anonymous-user-analysis-panel";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerAnonymousUserAnalysisPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell active="anonymousUserAnalysis">
      <div className="space-y-8">
        <AnonymousUserAnalysisPanel />
      </div>
    </OwnerShell>
  );
}
