import { AuditLogPanel } from "@/components/owner/audit-log-panel";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerAuditLogPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell active="auditLog">
      <div className="space-y-8">
        <AuditLogPanel />
      </div>
    </OwnerShell>
  );
}
