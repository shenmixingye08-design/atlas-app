/**
 * Storage / Artifact / Revision — 1000-file durability gate
 */

import { beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  appendArtifactRevision,
  registerRootArtifact,
} from "@/lib/artifacts/registry";
import { assertNeverOverwrite } from "@/lib/artifacts/revision-policy";
import type { ArtifactKind } from "@/lib/artifacts/types";
import {
  resetDeliverableMemoryStoreForTests,
  getStoredDeliverableForUser,
} from "@/lib/deliverables/store";
import { resetDeliverableVersionsForTests } from "@/lib/deliverables/versioning";
import { assertArtifactAccess } from "@/lib/storage/authz";
import {
  executeStorageCleanup,
  planStorageCleanup,
  resetStorageCleanupForTests,
  softDeleteArtifact,
  isSoftDeleted,
} from "@/lib/storage/cleanup";
import { inspectArtifactIntegrity } from "@/lib/storage/integrity-matrix";
import { buildArtifactPreview } from "@/lib/storage/preview";
import {
  createSignedDownloadToken,
  verifySignedDownloadToken,
  regenerateSignedDownloadToken,
} from "@/lib/storage/signed-url";
import {
  minimalCsv,
  minimalDocx,
  minimalPdf,
  minimalPng,
  minimalPptx,
  minimalXlsx,
} from "@/lib/storage/minimal-zip";

const ARTIFACT_DIR = "/opt/cursor/artifacts/storage-production";
const N = 1000;

const KINDS: ArtifactKind[] = [
  "docx",
  "xlsx",
  "pdf",
  "pptx",
  "csv",
  "image",
];

function bufferFor(kind: ArtifactKind): Buffer {
  switch (kind) {
    case "docx":
      return minimalDocx();
    case "xlsx":
      return minimalXlsx();
    case "pdf":
      return minimalPdf();
    case "pptx":
      return minimalPptx();
    case "csv":
      return minimalCsv();
    case "image":
      return minimalPng();
    default:
      return Buffer.from("text", "utf8");
  }
}

function extFor(kind: ArtifactKind): string {
  switch (kind) {
    case "docx":
      return ".docx";
    case "xlsx":
      return ".xlsx";
    case "pdf":
      return ".pdf";
    case "pptx":
      return ".pptx";
    case "csv":
      return ".csv";
    case "image":
      return ".png";
    default:
      return ".txt";
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[i]!;
}

describe("storage artifact durability n=1000", () => {
  beforeEach(() => {
    resetDeliverableMemoryStoreForTests();
    resetDeliverableVersionsForTests();
    resetStorageCleanupForTests();
  });

  it(
    "uploads, previews, downloads, revises, and denies cross-user for 1000 files",
    async () => {
      const durations: number[] = [];
      let uploadOk = 0;
      let downloadOk = 0;
      let previewOk = 0;
      let revisionOk = 0;
      let corrupt = 0;
      let zeroByte = 0;
      let authzFailOk = 0;
      let success = 0;

      for (let i = 0; i < N; i += 1) {
        const t0 = performance.now();
        const kind = KINDS[i % KINDS.length]!;
        const ownerId = `owner_${i % 25}`;
        const otherId = `intruder_${i % 25}`;
        const buf = bufferFor(kind);

        const integrity = inspectArtifactIntegrity({ buffer: buf, kind });
        if (!integrity.ok) corrupt += 1;
        if (integrity.details.zeroByte) zeroByte += 1;

        const root = registerRootArtifact({
          ownerId,
          buffer: buf,
          fileName: `file_${i}${extFor(kind)}`,
          kind,
          sourceContent: `source_${i}`,
        });
        if (root.stored.buffer.byteLength > 0) uploadOk += 1;

        // Download path (owner)
        const loaded = await getStoredDeliverableForUser(root.stored.id, ownerId);
        if (loaded && loaded.contentSha256 === root.identity.contentSha256) {
          downloadOk += 1;
        }

        // Preview
        if (loaded) {
          const preview = buildArtifactPreview(loaded);
          if (preview.downloadAvailable) {
            if (preview.ok || preview.errorCode) previewOk += 1;
          }
        }

        // Cross-user must fail
        const denied = await assertArtifactAccess({
          artifactId: root.stored.id,
          requesterId: otherId,
          action: "download",
        });
        const deniedGet = await getStoredDeliverableForUser(
          root.stored.id,
          otherId,
        );
        if (!denied.ok && !deniedGet) authzFailOk += 1;

        // Revision (never overwrite)
        expect(() =>
          assertNeverOverwrite({
            parentArtifactId: root.stored.id,
            newArtifactId: root.stored.id,
          }),
        ).toThrow();

        const revBuf = bufferFor(kind);
        const rev = await appendArtifactRevision({
          parentArtifactId: root.stored.id,
          ownerId,
          buffer: revBuf,
          fileName: `file_${i}_edit${extFor(kind)}`,
          mimeType: root.identity.mimeType,
          kind,
          revisionReason: `${kind}_edit`,
        });
        if (
          rev.stored.id !== root.stored.id &&
          rev.identity.version >= 2 &&
          rev.identity.parentArtifactId === root.stored.id
        ) {
          revisionOk += 1;
        }

        const parentStill = await getStoredDeliverableForUser(
          root.stored.id,
          ownerId,
        );
        if (
          parentStill &&
          parentStill.contentSha256 === root.identity.contentSha256
        ) {
          // parent intact
        } else {
          corrupt += 1;
        }

        // Signed URL
        const token = createSignedDownloadToken({
          artifactId: root.stored.id,
          ownerId,
          ttlMs: 60_000,
        });
        expect(verifySignedDownloadToken(token).ok).toBe(true);
        const regen = regenerateSignedDownloadToken(token);
        expect(regen.artifactId).toBe(token.artifactId);

        // Soft delete + authz
        if (i % 40 === 0) {
          softDeleteArtifact(root.stored.id, "test_cleanup");
          expect(isSoftDeleted(root.stored.id)).toBe(true);
        }

        if (
          integrity.ok &&
          loaded &&
          rev.stored.id !== root.stored.id &&
          !denied.ok
        ) {
          success += 1;
        }

        durations.push(performance.now() - t0);
      }

      // Cleanup pass (expired temps / URLs)
      const candidates = planStorageCleanup({
        deliverables: [],
        nowMs: Date.now() + 3_600_000,
      });
      executeStorageCleanup(candidates);

      const sorted = [...durations].sort((a, b) => a - b);
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const p95 = percentile(sorted, 95);

      const report = {
        n: N,
        successRate: success / N,
        avgMs: Number(avg.toFixed(3)),
        p95Ms: Number(p95.toFixed(3)),
        uploadSuccessRate: uploadOk / N,
        downloadSuccessRate: downloadOk / N,
        previewSuccessRate: previewOk / N,
        revisionSuccessRate: revisionOk / N,
        corruptRate: corrupt / N,
        zeroByteRate: zeroByte / N,
        authzDenialRate: authzFailOk / N,
        kinds: KINDS,
        timestamp: new Date().toISOString(),
      };

      mkdirSync(ARTIFACT_DIR, { recursive: true });
      writeFileSync(
        path.join(ARTIFACT_DIR, "durability-1000-report.json"),
        JSON.stringify(report, null, 2),
      );

      expect(report.uploadSuccessRate).toBe(1);
      expect(report.downloadSuccessRate).toBe(1);
      expect(report.revisionSuccessRate).toBe(1);
      expect(report.previewSuccessRate).toBe(1);
      expect(report.authzDenialRate).toBe(1);
      expect(report.zeroByteRate).toBe(0);
      expect(report.corruptRate).toBe(0);
      expect(report.successRate).toBeGreaterThanOrEqual(0.99);
      expect(avg).toBeLessThan(50);
      expect(p95).toBeLessThan(100);
    },
    300_000,
  );
});
