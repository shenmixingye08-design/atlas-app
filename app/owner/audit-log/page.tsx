import { AuditLogPanel } from "@/components/owner/audit-log-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerAuditLogPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="auditLog" />
        <AuditLogPanel />
      </div>
    </OwnerShell>
  );
}
