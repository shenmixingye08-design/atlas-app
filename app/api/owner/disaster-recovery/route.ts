import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  createDisasterBackup,
  disasterIncidentsToCsv,
  disasterRecoveryHistoryToCsv,
  disasterRecoverySnapshotToCsv,
  getDisasterRecoverySnapshot,
  processDisasterQueue,
  restoreDisasterBackup,
  deactivateFallback,
  disableMaintenanceManually,
} from "@/lib/owner/disaster-recovery";
import type { DrTargetId } from "@/lib/owner/disaster-recovery/types";

export async function GET(request: Request): Promise<Response> {
  await requireAtlasOwner();
  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  const section = url.searchParams.get("section") ?? "all";
  const snapshot = await getDisasterRecoverySnapshot();

  if (format === "csv") {
    if (section === "incidents") {
      return csvResponse(disasterIncidentsToCsv(), "atlas-dr-incidents.csv");
    }
    if (section === "recovery") {
      return csvResponse(
        disasterRecoveryHistoryToCsv(snapshot.recoveryHistory),
        "atlas-dr-recovery.csv",
      );
    }
    return csvResponse(
      disasterRecoverySnapshotToCsv(snapshot),
      "atlas-disaster-recovery.csv",
    );
  }

  return Response.json(snapshot);
}

export async function POST(request: Request): Promise<Response> {
  await requireAtlasOwner();

  let body: {
    action?: unknown;
    backupId?: unknown;
    targetId?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  if (action === "process_queue") {
    const result = processDisasterQueue();
    return Response.json({
      result,
      snapshot: await getDisasterRecoverySnapshot(),
    });
  }

  if (action === "backup") {
    const backup = await createDisasterBackup();
    return Response.json({
      backup,
      snapshot: await getDisasterRecoverySnapshot(),
    });
  }

  if (action === "restore") {
    if (typeof body.backupId !== "string" || !body.backupId) {
      return Response.json({ error: "backupId is required" }, { status: 400 });
    }
    try {
      const backup = restoreDisasterBackup(body.backupId);
      return Response.json({
        backup,
        snapshot: await getDisasterRecoverySnapshot(),
      });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Restore failed" },
        { status: 400 },
      );
    }
  }

  if (action === "clear_fallback") {
    if (typeof body.targetId !== "string") {
      return Response.json({ error: "targetId is required" }, { status: 400 });
    }
    deactivateFallback(body.targetId as DrTargetId);
    return Response.json({ snapshot: await getDisasterRecoverySnapshot() });
  }

  if (action === "disable_maintenance") {
    disableMaintenanceManually();
    return Response.json({ snapshot: await getDisasterRecoverySnapshot() });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
