import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getProductionOpsDashboard } from "@/lib/production/dashboard";
import { selfHealQueue } from "@/lib/production/recovery";
import { dispatchProductionAlert } from "@/lib/production/alerts";
import { createDisasterBackup } from "@/lib/owner/disaster-recovery/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  await requireAtlasOwner();
  const snapshot = await getProductionOpsDashboard();
  return Response.json(snapshot, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request): Promise<Response> {
  await requireAtlasOwner();
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
  };

  if (body.action === "self_heal") {
    const result = selfHealQueue();
    return Response.json({ ok: true, result });
  }

  if (body.action === "backup") {
    const backup = await createDisasterBackup({
      label: "Production readiness checkpoint",
    });
    return Response.json({ ok: true, backupId: backup.id });
  }

  if (body.action === "test_alert") {
    const alert = await dispatchProductionAlert({
      title: "Production readiness test alert",
      message: "Owner-triggered test — ignore if unexpected.",
      severity: "info",
      kind: "production_test_alert",
      force: true,
    });
    return Response.json({ ok: true, alert });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
