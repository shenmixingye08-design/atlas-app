import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { WordDownloadDiagnosticsPanel } from "@/components/owner/word-download-diagnostics-panel";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerWordDownloadDiagnosticsPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="wordDownloadDiagnostics" />
        <WordDownloadDiagnosticsPanel />
      </div>
    </OwnerShell>
  );
}
