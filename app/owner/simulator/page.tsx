import { ProfitSimulatorPanel } from "@/components/owner/profit-simulator-panel";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { buildLiveProfitScenario } from "@/lib/owner/profit-simulator/defaults";

export default async function OwnerProfitSimulatorPage() {
  await requireAtlasOwner();
  const baseline = buildLiveProfitScenario();

  return (
    <OwnerShell active="simulator">
      <div className="space-y-8">
        <ProfitSimulatorPanel baseline={baseline} />
      </div>
    </OwnerShell>
  );
}
