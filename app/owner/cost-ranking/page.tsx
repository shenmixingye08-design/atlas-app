import { CostRankingPanel } from "@/components/owner/cost-ranking-panel";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerCostRankingPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell active="costRanking">
      <div className="space-y-8">
        <CostRankingPanel />
      </div>
    </OwnerShell>
  );
}
