import { ActivationFunnelPanel } from "@/components/owner/activation-funnel-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export const dynamic = "force-dynamic";

export default async function OwnerActivationFunnelPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="activationFunnel" />
        <ActivationFunnelPanel />
      </div>
    </OwnerShell>
  );
}
