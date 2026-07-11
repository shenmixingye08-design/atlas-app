import {
  handleLineWebhookEvents,
  isLineMessagingConfigured,
  verifyLineWebhookSignature,
  type LineWebhookEvent,
} from "@/lib/integrations/line";

export async function POST(request: Request): Promise<Response> {
  if (!isLineMessagingConfigured()) {
    return Response.json(
      { message: "LINE Messaging API is not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!verifyLineWebhookSignature(rawBody, signature)) {
    return Response.json({ message: "Invalid signature" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody) as { events?: LineWebhookEvent[] };
    await handleLineWebhookEvents(payload.events ?? []);
  } catch (error) {
    console.warn("[LINE webhook] handler error:", error);
    // Acknowledge to avoid endless LINE retries on our bugs; signature already verified.
  }

  return Response.json({ ok: true });
}

/** Health check for LINE Developers console (no secrets). */
export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    configured: isLineMessagingConfigured(),
    service: "line-webhook",
  });
}
