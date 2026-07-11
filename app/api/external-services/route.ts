import { auth } from "@clerk/nextjs/server";

import { externalServiceManager } from "@/lib/integrations/external-services/service";
import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureExternalAuthHydrated(userId);
  const context = await resolveFeatureAccessContext();
  const catalog = externalServiceManager.getCatalog(userId, context);
  return Response.json(catalog);
}
