/**
 * Simulated 10-run measurement against mocked Google Drive API.
 * Real live API runs are gated by GOOGLE_DRIVE_LIVE_E2E=true (see scripts).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "memory"),
  loadDurableDomain: vi.fn(async () => null),
}));

import {
  resetExternalServiceCredentialStore,
  saveExternalServiceCredentials,
} from "@/lib/integrations/external-services/credential-store";
import {
  resetExternalServiceStore,
  saveExternalServiceConnection,
} from "@/lib/integrations/external-services/store";
import { createDefaultConnection } from "@/lib/integrations/external-services/registry";
import { googleServiceDefinition } from "@/lib/integrations/google/definition";
import { googleDriveLiveAdapter } from "@/lib/integrations/google/drive/live/adapter";
import {
  getGoogleDriveLiveMetrics,
  resetGoogleDriveLiveMetrics,
} from "@/lib/integrations/google/drive/live/metrics";
import { resetGoogleDriveUploadIdempotencyForTests } from "@/lib/integrations/google/drive/live/idempotency";
import type { StoredDeliverable } from "@/lib/deliverables/store";
import { createHash } from "node:crypto";

const OWNER = "user_drive_measure";

function installDriveMock(sizeByUpload: Map<number, number>) {
  let uploads = 0;
  const metaByFileId = new Map<string, { size: number; name: string }>();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/drive/v3/files/folder_measure")) {
      return new Response(
        JSON.stringify({
          id: "folder_measure",
          name: "Measure",
          mimeType: "application/vnd.google-apps.folder",
          trashed: false,
          webViewLink: "https://drive.google.com/drive/folders/folder_measure",
        }),
        { status: 200 },
      );
    }
    if (url.includes("/drive/v3/files?") && init?.method !== "POST") {
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    }
    if (url.includes("/upload/drive/v3/files") && init?.method === "POST") {
      uploads += 1;
      const id = `file_m_${uploads}`;
      const size = sizeByUpload.get(uploads) ?? 24;
      const name = `measure-${uploads}.docx`;
      metaByFileId.set(id, { size, name });
      return new Response(
        JSON.stringify({
          id,
          name,
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: String(size),
          webViewLink: `https://drive.google.com/file/d/${id}/view`,
          parents: ["folder_measure"],
          trashed: false,
        }),
        { status: 200, headers: { "x-guploader-uploadid": `req_${uploads}` } },
      );
    }
    const fileMatch = url.match(/\/drive\/v3\/files\/(file_m_\d+)/);
    if (fileMatch) {
      const id = fileMatch[1]!;
      const meta = metaByFileId.get(id) ?? { size: 24, name: `${id}.docx` };
      return new Response(
        JSON.stringify({
          id,
          name: meta.name,
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: String(meta.size),
          webViewLink: `https://drive.google.com/file/d/${id}/view`,
          parents: ["folder_measure"],
          trashed: false,
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ error: { message: url } }), {
      status: 404,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return () => uploads;
}

describe("Google Drive Live Adapter measurements (mocked provider)", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetGoogleDriveUploadIdempotencyForTests();
    resetGoogleDriveLiveMetrics();
    saveExternalServiceCredentials({
      userId: OWNER,
      serviceId: "google",
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      scope: "https://www.googleapis.com/auth/drive.file",
      updatedAt: new Date().toISOString(),
    });
    saveExternalServiceConnection(OWNER, {
      ...createDefaultConnection(googleServiceDefinition),
      status: "connected",
      connectedAt: new Date().toISOString(),
      lastUsedAt: null,
      scopes: ["https://www.googleapis.com/auth/drive.file"],
      features: [...googleServiceDefinition.plannedFeatures],
      errorMessage: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("records 10 consecutive unique uploads without duplicates", async () => {
    const sizeByUpload = new Map<number, number>();
    const getUploads = installDriveMock(sizeByUpload);
    const rows: Array<{
      attempt: number;
      artifactId: string;
      fileId: string;
      webViewLink: string;
      latencyMs: number;
      retryCount: number;
      duplicate: boolean;
      verification: string;
      finalStatus: string;
    }> = [];

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const buffer = Buffer.from(`measure-payload-${attempt}-xxxx`);
      sizeByUpload.set(attempt, buffer.byteLength);
      const checksum = createHash("sha256").update(buffer).digest("hex");
      const art: StoredDeliverable = {
        id: `art_m_${attempt}`,
        userId: OWNER,
        fileName: `measure-${attempt}.docx`,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        format: "docx",
        buffer,
        isPlaceholder: false,
        generatedAt: new Date().toISOString(),
        sourceContent: `# ${attempt}`,
        baseFileName: `measure-${attempt}`,
        contentSha256: checksum,
      };
      const started = Date.now();
      const result = await googleDriveLiveAdapter.uploadFile({
        ownerId: OWNER,
        runId: `run_m_${attempt}`,
        stepId: "step_drive",
        configuration: {
          targetFolderId: "folder_measure",
          conflictPolicy: "fail",
        },
        inputBindings: {},
        artifact: art,
      });
      const latencyMs = Date.now() - started;
      expect(result.ok).toBe(true);
      if (result.ok) {
        rows.push({
          attempt,
          artifactId: art.id,
          fileId: result.action.fileId,
          webViewLink: result.action.webViewLink,
          latencyMs,
          retryCount: result.action.retryCount,
          duplicate: result.action.duplicatePrevented,
          verification: "verified",
          finalStatus: "success",
        });
      }
    }

    expect(rows).toHaveLength(10);
    expect(new Set(rows.map((row) => row.fileId)).size).toBe(10);
    expect(rows.every((row) => row.duplicate === false)).toBe(true);
    expect(getUploads()).toBe(10);

    const metrics = getGoogleDriveLiveMetrics();
    expect(metrics.uploadSuccessRate).toBe(1);
    expect(metrics.duplicatePreventedCount).toBe(0);
    expect(metrics.averageLatencyMs).toBeGreaterThanOrEqual(0);
    expect(metrics.p95LatencyMs).toBeGreaterThanOrEqual(metrics.averageLatencyMs);
  });
});
