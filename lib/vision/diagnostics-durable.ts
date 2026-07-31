import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

import type { VisionDiagnosticRecord } from "@/lib/vision/diagnostics";

const DOMAIN_KEY = "atlasVisionDiagnostics";
const MAX_DIAGNOSTICS = 30;

type DiagnosticsPayload = {
  diagnostics: VisionDiagnosticRecord[];
};

function slimRecord(record: VisionDiagnosticRecord): VisionDiagnosticRecord {
  return {
    ...record,
    stages: record.stages.slice(-40).map((stage) => ({
      ...stage,
      detail: stage.detail
        ? Object.fromEntries(
            Object.entries(stage.detail).map(([key, value]) => {
              if (typeof value === "string" && value.length > 8_000) {
                return [key, `${value.slice(0, 8_000)}…[truncated]`];
              }
              return [key, value];
            }),
          )
        : undefined,
    })),
  };
}

/** Persist one diagnostic into the user's Supabase atlas_user_state row. */
export async function persistVisionDiagnosticDurable(
  record: VisionDiagnosticRecord,
): Promise<"supabase" | "skipped"> {
  try {
    const existing =
      (await loadDurableDomain<DiagnosticsPayload>(record.userId, DOMAIN_KEY))
        ?.diagnostics ?? [];
    const slim = slimRecord(record);
    const next = [
      slim,
      ...existing.filter((row) => row.id !== slim.id),
    ].slice(0, MAX_DIAGNOSTICS);
    const result = await persistDurableDomain(
      record.userId,
      DOMAIN_KEY,
      { diagnostics: next },
      {
        forceSupabase: true,
        compact: (payload) => payload,
      },
    );
    return result === "supabase" ? "supabase" : "skipped";
  } catch (error) {
    console.error("[vision] durable diagnostic persist failed", {
      diagnosticId: record.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return "skipped";
  }
}

export async function loadVisionDiagnosticDurable(
  userId: string,
  id: string,
): Promise<VisionDiagnosticRecord | null> {
  try {
    const payload = await loadDurableDomain<DiagnosticsPayload>(
      userId,
      DOMAIN_KEY,
    );
    const row = payload?.diagnostics?.find((item) => item.id === id) ?? null;
    if (!row || row.userId !== userId) return null;
    return row;
  } catch {
    return null;
  }
}
