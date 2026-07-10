import { processStripeWebhookRequest } from "@/lib/billing/stripe/webhook";
import { recordWebhookFailure } from "@/lib/owner/error-monitoring/telemetry";
import { recordServiceHealthSuccess } from "@/lib/owner/system-status/telemetry";

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    const result = await processStripeWebhookRequest(rawBody, signature);
    if (result.status >= 200 && result.status < 300) {
      recordServiceHealthSuccess("stripe", "billing_webhook");
    }
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook processing failed";
    recordWebhookFailure(message, "billing_webhook");
    return Response.json({ error: message }, { status: 400 });
  }
}
