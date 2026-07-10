import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getStripeWebhookMonitoringSnapshot } from "@/lib/owner/billing-webhook/service";

export async function GET(): Promise<Response> {
  await requireAtlasOwner();
  return Response.json(getStripeWebhookMonitoringSnapshot());
}
