import { BillingWebhookPanel } from "@/components/owner/billing-webhook-panel";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export default async function OwnerBillingWebhookPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell active="billingWebhook">
      <div className="space-y-8">
        <BillingWebhookPanel />
      </div>
    </OwnerShell>
  );
}
