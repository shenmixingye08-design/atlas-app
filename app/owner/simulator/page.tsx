import { OwnerNav } from "@/components/owner/owner-nav";
import { ProfitSimulatorPanel } from "@/components/owner/profit-simulator-panel";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { buildLiveProfitScenario } from "@/lib/owner/profit-simulator/defaults";

export default async function OwnerProfitSimulatorPage() {
  await requireAtlasOwner();
  const baseline = buildLiveProfitScenario();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="simulator" />
        <ProfitSimulatorPanel baseline={baseline} />
      </div>
    </OwnerShell>
  );
}
