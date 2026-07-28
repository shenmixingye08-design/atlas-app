import "server-only";

import { getHealthVersionPayload } from "@/lib/health/version-info";

import { generateDeliverables } from "./engine";
import { probeDeliverableStorage } from "./object-storage";
import { getStoredDeliverableForUser } from "./store";
import { buildIntegritySnapshot } from "./integrity";

const SMOKE_USER = "__atlas_word_pipeline_smoke__";
const SMOKE_CONTENT = [
  "# ATLAS Wordパイプライン確認",
  "",
  "## 概要",
  "本番環境で Word 生成・Storage 保存・ダウンロード URL を自動確認するための固定文書です。",
  "",
  "## 本文",
  "この文書はお客様向けの成果物ではありません。システムが .docx を正しく作成できるかを確認します。",
  "日本語の本文が十分に含まれていること、見出しと段落が分かれていることを検証します。",
  "生成に成功した場合、PK ヘッダー付きの OOXML バイナリが Storage に保存されます。",
].join("\n");

export type WordPipelineSmokeResult = {
  ok: boolean;
  stage:
    | "storage_probe"
    | "docx_generate"
    | "storage_save"
    | "download_verify"
    | "completed"
    | "failed";
  jobId: string | null;
  deliverableId: string | null;
  downloadUrl: string | null;
  durable: boolean | null;
  hasPkHeader: boolean | null;
  sizeBytes: number | null;
  storageReady: boolean;
  storageWarning: string | null;
  error: string | null;
  durationMs: number;
  version: ReturnType<typeof getHealthVersionPayload>;
};

/**
 * Secret-free production smoke: fixed Japanese text → .docx → durable store.
 * Does NOT call OpenAI. Safe to expose as a public health check (rate-limited by caller).
 */
export async function runWordPipelineSmoke(input?: {
  requestOrigin?: string;
}): Promise<WordPipelineSmokeResult> {
  const started = Date.now();
  const version = getHealthVersionPayload();
  const origin = input?.requestOrigin ?? "https://atlasapp.jp";

  const storage = await probeDeliverableStorage();
  if (!storage.ready && storage.severity === "critical") {
    return {
      ok: false,
      stage: "storage_probe",
      jobId: null,
      deliverableId: null,
      downloadUrl: null,
      durable: false,
      hasPkHeader: null,
      sizeBytes: null,
      storageReady: false,
      storageWarning: storage.warning,
      error: storage.warning ?? "storage_not_ready",
      durationMs: Date.now() - started,
      version,
    };
  }

  try {
    const generated = await generateDeliverables(
      {
        assignment: "Wordパイプライン確認用の文書を作成してください",
        finalDeliverable: SMOKE_CONTENT,
        title: "ATLAS Wordパイプライン確認",
        formats: ["docx"],
      },
      origin,
      {
        userId: SMOKE_USER,
        jobId: `smoke_word_${Date.now().toString(36)}`,
        suppressWordReadyNotification: true,
        contentAlreadyApproved: true,
      },
    );

    const docx = generated.deliverables.find((d) => d.format === "docx");
    if (!docx) {
      const reason =
        generated.failures.map((f) => f.reasons.join(",")).join(";") ||
        "docx_not_produced";
      return {
        ok: false,
        stage: reason.includes("storage") ? "storage_save" : "docx_generate",
        jobId: generated.jobId ?? null,
        deliverableId: null,
        downloadUrl: null,
        durable: false,
        hasPkHeader: null,
        sizeBytes: null,
        storageReady: storage.ready,
        storageWarning: storage.warning,
        error: reason,
        durationMs: Date.now() - started,
        version,
      };
    }

    const stored = await getStoredDeliverableForUser(docx.id, SMOKE_USER);
    if (!stored?.buffer?.byteLength) {
      return {
        ok: false,
        stage: "download_verify",
        jobId: generated.jobId ?? null,
        deliverableId: docx.id,
        downloadUrl: docx.downloadUrl ?? null,
        durable: false,
        hasPkHeader: false,
        sizeBytes: 0,
        storageReady: storage.ready,
        storageWarning: storage.warning,
        error: "stored_buffer_missing",
        durationMs: Date.now() - started,
        version,
      };
    }

    // Prove cross-instance durability on Supabase: drop memory and reload via Storage.
    let verifyBuffer = stored.buffer;
    let verifyFileName = stored.fileName;
    let verifyDurable =
      stored.storageStatus === "stored" ||
      stored.storageStatus === "regenerated" ||
      stored.storageStatus === "legacy_base64";
    if (storage.ready && storage.backend === "supabase") {
      const { resetDeliverableMemoryStoreForTests } = await import("./store");
      const { resetDurableDeliverableStoreForTests } = await import(
        "./durable-store"
      );
      resetDeliverableMemoryStoreForTests();
      resetDurableDeliverableStoreForTests();
      const reloaded = await getStoredDeliverableForUser(docx.id, SMOKE_USER, {
        bypassMemory: true,
        bypassDisk: true,
      });
      if (!reloaded?.buffer?.byteLength) {
        return {
          ok: false,
          stage: "download_verify",
          jobId: generated.jobId ?? null,
          deliverableId: docx.id,
          downloadUrl: docx.downloadUrl ?? null,
          durable: false,
          hasPkHeader: false,
          sizeBytes: stored.buffer.byteLength,
          storageReady: storage.ready,
          storageWarning: storage.warning,
          error: "reload_after_memory_clear_failed",
          durationMs: Date.now() - started,
          version,
        };
      }
      verifyBuffer = reloaded.buffer;
      verifyFileName = reloaded.fileName;
      verifyDurable = true;
    }

    const integrity = buildIntegritySnapshot({
      buffer: verifyBuffer,
      format: "docx",
      fileName: verifyFileName,
    });

    const hasPk = integrity.hasPkHeader;
    const ok =
      hasPk &&
      integrity.ooxmlVerified &&
      Boolean(docx.downloadUrl?.includes(`/api/deliverables/${docx.id}`));

    return {
      ok,
      stage: ok ? "completed" : "failed",
      jobId: generated.jobId ?? null,
      deliverableId: docx.id,
      downloadUrl: docx.downloadUrl ?? null,
      durable: verifyDurable,
      hasPkHeader: hasPk,
      sizeBytes: verifyBuffer.byteLength,
      storageReady: storage.ready,
      storageWarning: storage.warning,
      error: ok
        ? null
        : [
            !hasPk ? "missing_pk" : null,
            !integrity.ooxmlVerified ? "ooxml_incomplete" : null,
            !docx.downloadUrl?.includes(`/api/deliverables/${docx.id}`)
              ? "download_url_invalid"
              : null,
          ]
            .filter(Boolean)
            .join(",") || "docx_integrity_failed",
      durationMs: Date.now() - started,
      version,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "smoke_exception";
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[word_pipeline] smoke failed", { message, stack });
    return {
      ok: false,
      stage: "failed",
      jobId: null,
      deliverableId: null,
      downloadUrl: null,
      durable: null,
      hasPkHeader: null,
      sizeBytes: null,
      storageReady: storage.ready,
      storageWarning: storage.warning,
      error: message,
      durationMs: Date.now() - started,
      version,
    };
  }
}
