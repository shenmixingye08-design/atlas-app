import {
  getVapidPublicKey,
  logVapidConfigIssues,
} from "@/lib/push/vapid";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const status = logVapidConfigIssues("vapid-key");
  const publicKey = getVapidPublicKey();

  return Response.json({
    configured: status.configured,
    publicKey,
    // Safe codes only — never private key / subject values.
    errorCode: publicKey ? null : status.errorCode,
  });
}
