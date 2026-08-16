import { auth } from "@clerk/nextjs/server";

import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import {
  getFeatureFlagSnapshotForOwner,
  parseFeatureFlagUpdateBody,
  updateFeatureFlagStateForOwner,
} from "@/lib/feature-flags/service";

export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  return Response.json(await getFeatureFlagSnapshotForOwner());
}

export async function PATCH(request: Request): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseFeatureFlagUpdateBody(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const result = await updateFeatureFlagStateForOwner(parsed.id, parsed.state);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  const { userId } = await auth();
  const { recordAuditLogSafe, auditRequestContext } = await import(
    "@/lib/owner/audit-log"
  );
  const ctx = auditRequestContext(request);
  recordAuditLogSafe({
    userId: userId ?? null,
    email: owner.email,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    category: "owner",
    action: "owner_action",
    targetId: parsed.id,
    result: "success",
    reason: `feature flag → ${parsed.state}`,
  });
  return Response.json(result.snapshot);
}
