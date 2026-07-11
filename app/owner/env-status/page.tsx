import { EnvStatusPanel } from "@/components/owner/env-status-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerEnvStatusPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="envStatus" />
        <EnvStatusPanel />
      </div>
    </OwnerShell>
  );
}
