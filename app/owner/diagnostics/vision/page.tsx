import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { VisionDiagnosticsPanel } from "@/components/owner/vision-diagnostics-panel";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerVisionDiagnosticsPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="visionDiagnostics" />
        <VisionDiagnosticsPanel />
      </div>
    </OwnerShell>
  );
}
