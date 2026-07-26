import { PopularityRankingPanel } from "@/components/owner/popularity-ranking-panel";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerPopularityRankingPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell active="popularityRanking">
      <div className="space-y-8">
        <PopularityRankingPanel />
      </div>
    </OwnerShell>
  );
}
