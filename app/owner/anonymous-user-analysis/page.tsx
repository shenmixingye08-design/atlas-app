import { AnonymousUserAnalysisPanel } from "@/components/owner/anonymous-user-analysis-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerAnonymousUserAnalysisPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="anonymousUserAnalysis" />
        <AnonymousUserAnalysisPanel />
      </div>
    </OwnerShell>
  );
}
