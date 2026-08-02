import { auth } from "@clerk/nextjs/server";

import { runIntegrationBenchmark100 } from "@/lib/integration-platform/benchmark";
import { catalogAudit } from "@/lib/integration-platform/connection-manager";
import {
  ensureSandboxConnections,
  getIntegrationDashboard,
  refreshConnectionToken,
  seedDisconnectedCatalog,
} from "@/lib/integration-platform/service";
import type { IntegrationServiceId } from "@/lib/integration-platform/types";
import { INTEGRATION_SERVICE_IDS } from "@/lib/integration-platform/types";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const view = new URL(request.url).searchParams.get("view") ?? "dashboard";
  seedDisconnectedCatalog(userId);

  if (view === "catalog") {
    return Response.json({ catalog: catalogAudit() });
  }

  if (view === "benchmark") {
    // Sandbox-only measured 100-call report — never pretends to be live prod traffic
    const report = await runIntegrationBenchmark100({
      ownerId: userId,
      callsPerService: 100,
    });
    return Response.json(report);
  }

  await ensureSandboxConnections(userId).catch(() => undefined);
  const dashboard = await getIntegrationDashboard(userId);
  return Response.json(dashboard);
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    action?: string;
    serviceId?: string;
  };

  if (body.action === "refresh" && body.serviceId) {
    if (
      !(INTEGRATION_SERVICE_IDS as readonly string[]).includes(body.serviceId)
    ) {
      return Response.json({ error: "unknown_service" }, { status: 400 });
    }
    const token = await refreshConnectionToken(
      userId,
      body.serviceId as IntegrationServiceId,
    );
    return Response.json({
      ok: Boolean(token),
      expiresAt: token?.expiresAt ?? null,
      rotationVersion: token?.rotationVersion ?? null,
    });
  }

  if (body.action === "benchmark") {
    const report = await runIntegrationBenchmark100({
      ownerId: userId,
      callsPerService: 100,
    });
    return Response.json(report);
  }

  return Response.json({ error: "unknown_action" }, { status: 400 });
}
