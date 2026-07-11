import { auth } from "@clerk/nextjs/server";

import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  getFeatureFlagSnapshot,
  parseFeatureFlagUpdateBody,
  updateFeatureFlagState,
} from "@/lib/feature-flags/service";

export async function GET(): Promise<Response> {
  await requireAtlasOwner();
  return Response.json(getFeatureFlagSnapshot());
}

export async function PATCH(request: Request): Promise<Response> {
  const owner = await requireAtlasOwner();

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

  const snapshot = updateFeatureFlagState(parsed.id, parsed.state);
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
  return Response.json(snapshot);
}
