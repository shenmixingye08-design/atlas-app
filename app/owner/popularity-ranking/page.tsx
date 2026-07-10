import { PopularityRankingPanel } from "@/components/owner/popularity-ranking-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerPopularityRankingPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="popularityRanking" />
        <PopularityRankingPanel />
      </div>
    </OwnerShell>
  );
}
