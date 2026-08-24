import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { RevenueAgentPanel } from "@/components/owner/revenue-agent-panel";
import { requireAtlasOwnerOrNotFound } from "@/lib/auth/require-atlas-owner";

export const dynamic = "force-dynamic";

export default async function OwnerRevenueAgentPage() {
  await requireAtlasOwnerOrNotFound();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="revenueAgent" />
        <RevenueAgentPanel />
      </div>
    </OwnerShell>
  );
}
