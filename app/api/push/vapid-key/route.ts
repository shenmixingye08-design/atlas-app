import { auth } from "@clerk/nextjs/server";

import { getVapidPublicKey, isWebPushConfigured } from "@/lib/push/vapid";

export async function GET(): Promise<Response> {
  const publicKey = getVapidPublicKey();
  return Response.json({
    configured: isWebPushConfigured(),
    publicKey,
  });
}
