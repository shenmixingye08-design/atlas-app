import { auth } from "@clerk/nextjs/server";

import {
  handleLineWebhookEvents,
  verifyLineWebhookSignature,
  type LineWebhookEvent,
} from "@/lib/integrations/line";

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");

  try {
    if (!verifyLineWebhookSignature(rawBody, signature)) {
      return Response.json({ message: "Invalid signature" }, { status: 401 });
    }
  } catch {
    return Response.json(
      { message: "LINE channel secret is not configured" },
      { status: 503 },
    );
  }

  const payload = JSON.parse(rawBody) as { events?: LineWebhookEvent[] };
  await handleLineWebhookEvents(payload.events ?? []);

  return Response.json({ ok: true });
}

/** Health check for LINE Developers console. */
export async function GET(): Promise<Response> {
  const { userId } = await auth();
  return Response.json({
    ok: true,
    authenticated: Boolean(userId),
    service: "line-webhook",
  });
}
