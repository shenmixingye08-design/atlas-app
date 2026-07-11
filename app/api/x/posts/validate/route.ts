import { auth } from "@clerk/nextjs/server";

import { validateTweetText } from "@/lib/integrations/x/post/validate";

type RequestBody = {
  text?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const { requireBillingFeature } = await import("@/lib/billing/access");
  const denied = await requireBillingFeature(userId, "sns_assist");
  if (denied) return denied;

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json(
      { status: "error", message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const text = typeof body.text === "string" ? body.text : "";
  const validation = validateTweetText(text);

  return Response.json({ validation });
}
