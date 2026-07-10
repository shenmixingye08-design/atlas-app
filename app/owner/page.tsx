import { OwnerDashboard } from "@/components/owner/owner-dashboard";
import { BillingWebhookSummaryCard } from "@/components/owner/billing-webhook-panel";
import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getApiUsageMonitoringSnapshot } from "@/lib/owner/api-usage/service";
import { getStripeWebhookMonitoringSnapshot } from "@/lib/owner/billing-webhook/service";
import { getOwnerDashboardSnapshot } from "@/lib/owner/service";

export default async function OwnerPage() {
  await requireAtlasOwner();
  const snapshot = await getOwnerDashboardSnapshot();
  const apiUsage = getApiUsageMonitoringSnapshot();
  const billingWebhook = getStripeWebhookMonitoringSnapshot();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="dashboard" />
        <BillingWebhookSummaryCard snapshot={billingWebhook} />
        <OwnerDashboard
          snapshot={snapshot}
          apiUsageWarnings={apiUsage.warnings}
        />
      </div>
    </OwnerShell>
  );
}
