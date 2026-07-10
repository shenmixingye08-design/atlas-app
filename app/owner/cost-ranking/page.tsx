import { CostRankingPanel } from "@/components/owner/cost-ranking-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerCostRankingPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="costRanking" />
        <CostRankingPanel />
      </div>
    </OwnerShell>
  );
}
