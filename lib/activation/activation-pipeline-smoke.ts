/**
 * Server-side proof that the Activation Word path uses generateDeliverables
 * (same invoker as V2 word_generate), with Storage + ownership + DOCX checks.
 *
 * This is NOT a mock success path for the UI — it exercises the real engine.
 */

import "server-only";

import { getHealthVersionPayload } from "@/lib/health/version-info";
import { invokeRealDeliverableStep } from "@/lib/automation-platform/execution/invoke-real-deliverable";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import { buildIntegritySnapshot } from "@/lib/deliverables/integrity";
import { probeDeliverableStorage } from "@/lib/deliverables/object-storage";
import { WEEKLY_REPORT_DEFAULTS } from "@/lib/activation/weekly-report-template";

const SMOKE_USER = "__atlas_activation_pipeline_smoke__";

export type ActivationPipelineSmokeResult = {
  ok: boolean;
  stage:
    | "storage_probe"
    | "word_generate"
    | "storage_save"
    | "validation"
    | "download_verify"
    | "completed"
    | "failed";
  runId: string | null;
  artifactId: string | null;
  projectId: string | null;
  downloadUrl: string | null;
  sizeBytes: number | null;
  hasPkHeader: boolean | null;
  ooxmlVerified: boolean | null;
  durable: boolean | null;
  ownershipConfirmed: boolean | null;
  error: string | null;
  durationMs: number;
  time_to_first_artifact_ms: number | null;
  version: ReturnType<typeof getHealthVersionPayload>;
};

export async function runActivationPipelineSmoke(input?: {
  requestOrigin?: string;
}): Promise<ActivationPipelineSmokeResult> {
  const started = Date.now();
  const version = getHealthVersionPayload();
  const origin = input?.requestOrigin ?? "https://atlasapp.jp";
  const runId = `act_smoke_${Date.now().toString(36)}`;
  const projectId = `activation_smoke_${runId}`;

  const storage = await probeDeliverableStorage();
  if (!storage.ready && storage.severity === "critical") {
    return {
      ok: false,
      stage: "storage_probe",
      runId,
      artifactId: null,
      projectId,
      downloadUrl: null,
      sizeBytes: null,
      hasPkHeader: null,
      ooxmlVerified: null,
      durable: false,
      ownershipConfirmed: null,
      error: storage.warning ?? "storage_not_ready",
      durationMs: Date.now() - started,
      time_to_first_artifact_ms: null,
      version,
    };
  }

  const invoked = await invokeRealDeliverableStep({
    stepType: "word_generate",
    stepName: "週次営業報告書",
    configuration: {
      title: WEEKLY_REPORT_DEFAULTS.name,
      documentType: "report",
      tone: "formal",
    },
    userId: SMOKE_USER,
    automationName: WEEKLY_REPORT_DEFAULTS.name,
    runId,
    assignmentNotes: WEEKLY_REPORT_DEFAULTS.contentNotes,
    requestOrigin: origin,
  });

  if (!invoked.ok || invoked.artifacts.length === 0) {
    return {
      ok: false,
      stage: "word_generate",
      runId,
      artifactId: null,
      projectId,
      downloadUrl: null,
      sizeBytes: null,
      hasPkHeader: null,
      ooxmlVerified: null,
      durable: false,
      ownershipConfirmed: null,
      error: invoked.errorMessage || "activation_word_generate_failed",
      durationMs: Date.now() - started,
      time_to_first_artifact_ms: null,
      version,
    };
  }

  const artifact = invoked.artifacts[0]!;
  const artifactId = artifact.id;
  const downloadUrl = artifact.url;

  if (!downloadUrl?.includes(`/api/deliverables/${artifactId}`)) {
    return {
      ok: false,
      stage: "storage_save",
      runId,
      artifactId,
      projectId,
      downloadUrl: downloadUrl ?? null,
      sizeBytes: null,
      hasPkHeader: null,
      ooxmlVerified: null,
      durable: false,
      ownershipConfirmed: false,
      error: "download_url_missing_or_invalid",
      durationMs: Date.now() - started,
      time_to_first_artifact_ms: null,
      version,
    };
  }

  const stored = await getStoredDeliverableForUser(artifactId, SMOKE_USER);
  if (!stored?.buffer?.byteLength) {
    return {
      ok: false,
      stage: "download_verify",
      runId,
      artifactId,
      projectId,
      downloadUrl,
      sizeBytes: 0,
      hasPkHeader: false,
      ooxmlVerified: false,
      durable: false,
      ownershipConfirmed: false,
      error: "stored_buffer_missing_or_wrong_owner",
      durationMs: Date.now() - started,
      time_to_first_artifact_ms: null,
      version,
    };
  }

  // Wrong-owner must not resolve.
  const wrongOwner = await getStoredDeliverableForUser(
    artifactId,
    "__atlas_activation_wrong_owner__",
  );
  if (wrongOwner) {
    return {
      ok: false,
      stage: "validation",
      runId,
      artifactId,
      projectId,
      downloadUrl,
      sizeBytes: stored.buffer.byteLength,
      hasPkHeader: null,
      ooxmlVerified: null,
      durable: null,
      ownershipConfirmed: false,
      error: "ownership_isolation_failed",
      durationMs: Date.now() - started,
      time_to_first_artifact_ms: null,
      version,
    };
  }

  let verifyBuffer = stored.buffer;
  let verifyFileName = stored.fileName;
  let durable =
    stored.storageStatus === "stored" ||
    stored.storageStatus === "regenerated" ||
    stored.storageStatus === "legacy_base64";

  if (storage.ready && storage.backend === "supabase") {
    const { resetDeliverableMemoryStoreForTests } = await import(
      "@/lib/deliverables/store"
    );
    const { resetDurableDeliverableStoreForTests } = await import(
      "@/lib/deliverables/durable-store"
    );
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
    const reloaded = await getStoredDeliverableForUser(artifactId, SMOKE_USER, {
      bypassMemory: true,
      bypassDisk: true,
    });
    if (!reloaded?.buffer?.byteLength) {
      return {
        ok: false,
        stage: "storage_save",
        runId,
        artifactId,
        projectId,
        downloadUrl,
        sizeBytes: stored.buffer.byteLength,
        hasPkHeader: false,
        ooxmlVerified: false,
        durable: false,
        ownershipConfirmed: true,
        error: "reload_after_memory_clear_failed",
        durationMs: Date.now() - started,
        time_to_first_artifact_ms: null,
        version,
      };
    }
    verifyBuffer = reloaded.buffer;
    verifyFileName = reloaded.fileName;
    durable = true;
  }

  const integrity = buildIntegritySnapshot({
    buffer: verifyBuffer,
    format: "docx",
    fileName: verifyFileName,
  });

  const ok =
    integrity.hasPkHeader &&
    integrity.ooxmlVerified &&
    verifyBuffer.byteLength > 0;

  const durationMs = Date.now() - started;

  return {
    ok,
    stage: ok ? "completed" : "failed",
    runId,
    artifactId,
    projectId,
    downloadUrl,
    sizeBytes: verifyBuffer.byteLength,
    hasPkHeader: integrity.hasPkHeader,
    ooxmlVerified: integrity.ooxmlVerified,
    durable,
    ownershipConfirmed: true,
    error: ok
      ? null
      : [
          !integrity.hasPkHeader ? "missing_pk" : null,
          !integrity.ooxmlVerified ? "ooxml_incomplete" : null,
        ]
          .filter(Boolean)
          .join(",") || "validation_failed",
    durationMs,
    time_to_first_artifact_ms: ok ? durationMs : null,
    version,
  };
}
