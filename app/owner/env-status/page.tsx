import { EnvStatusPanel } from "@/components/owner/env-status-panel";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerEnvStatusPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell active="envStatus">
      <div className="space-y-8">
        <EnvStatusPanel />
      </div>
    </OwnerShell>
  );
}
