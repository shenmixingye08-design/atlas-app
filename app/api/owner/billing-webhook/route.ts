import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import { getHydratedStripeWebhookMonitoringSnapshot } from "@/lib/owner/billing-webhook/service";

export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  return Response.json(await getHydratedStripeWebhookMonitoringSnapshot());
}
