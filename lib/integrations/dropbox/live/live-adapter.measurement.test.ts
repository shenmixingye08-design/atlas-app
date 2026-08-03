/**
 * Simulated 10-run measurement against mocked Dropbox API.
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
import { dropboxServiceDefinition } from "@/lib/integrations/dropbox/definition";
import { dropboxLiveAdapter } from "@/lib/integrations/dropbox/live/adapter";
import {
  getDropboxLiveMetrics,
  resetDropboxLiveMetrics,
} from "@/lib/integrations/dropbox/live/metrics";
import { resetDropboxUploadIdempotencyForTests } from "@/lib/integrations/dropbox/live/idempotency";
import type { StoredDeliverable } from "@/lib/deliverables/store";
import { dropboxContentHash } from "@/lib/integrations/dropbox/live/upload";

const OWNER = "user_dropbox_measure";

function installDropboxMeasurementMock() {
  let uploads = 0;
  const metaById = new Map<
    string,
    { size: number; hash: string; path: string; rev: string }
  >();

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/files/list_folder")) {
      return new Response(
        JSON.stringify({ entries: [], has_more: false }),
        { status: 200 },
      );
    }
    if (url.includes("/files/create_folder_v2")) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const folderPath =
        typeof body.path === "string" ? body.path : "/Measure";
      return new Response(
        JSON.stringify({
          metadata: {
            ".tag": "folder",
            id: "id:folder_measure",
            name: folderPath.split("/").pop() ?? "Measure",
            path_display: folderPath.startsWith("/") ? folderPath : `/${folderPath}`,
            path_lower: folderPath.toLowerCase(),
          },
        }),
        { status: 200 },
      );
    }
    if (url.includes("/files/get_metadata")) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const lookup = typeof body.path === "string" ? body.path : "";
      if (!lookup.includes("id:file")) {
        return new Response(
          JSON.stringify({ error_summary: "path_lookup/not_found" }),
          { status: 409 },
        );
      }
      const id = lookup;
      if (!metaById.has(id)) {
        return new Response(JSON.stringify({ error_summary: "not_found" }), {
          status: 409,
        });
      }
      const meta = metaById.get(id)!;
      return new Response(
        JSON.stringify({
          ".tag": "file",
          id,
          name: meta.path.split("/").pop(),
          path_display: meta.path,
          path_lower: meta.path.toLowerCase(),
          rev: meta.rev,
          size: meta.size,
          content_hash: meta.hash,
        }),
        { status: 200 },
      );
    }
    if (url.includes("content.dropboxapi.com/2/files/upload")) {
      uploads += 1;
      const id = `id:file_m_${uploads}`;
      const argHeader = init?.headers
        ? (init.headers as Record<string, string>)["Dropbox-API-Arg"]
        : undefined;
      const arg = argHeader ? JSON.parse(argHeader) : { path: `/measure-${uploads}.docx` };
      const path = typeof arg.path === "string" ? arg.path : `/measure-${uploads}.docx`;
      let buffer = Buffer.alloc(0);
      const body = init?.body;
      if (body instanceof Uint8Array) {
        buffer = Buffer.from(body);
      } else if (body instanceof ArrayBuffer) {
        buffer = Buffer.from(body);
      }
      const size = buffer.byteLength;
      const hash = dropboxContentHash(buffer);
      metaById.set(id, { size, hash, path, rev: `rev_m_${uploads}` });
      return new Response(
        JSON.stringify({
          ".tag": "file",
          id,
          name: path.split("/").pop(),
          path_display: path,
          path_lower: path.toLowerCase(),
          rev: `rev_m_${uploads}`,
          size,
          content_hash: hash,
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ error_summary: url }), { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return () => uploads;
}

describe("Dropbox Live Adapter measurements (mocked provider)", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetDropboxUploadIdempotencyForTests();
    resetDropboxLiveMetrics();
    saveExternalServiceCredentials({
      userId: OWNER,
      serviceId: "dropbox",
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      scope: "files.content.write files.content.read",
      updatedAt: new Date().toISOString(),
    });
    saveExternalServiceConnection(OWNER, {
      ...createDefaultConnection(dropboxServiceDefinition),
      status: "connected",
      connectedAt: new Date().toISOString(),
      lastUsedAt: null,
      scopes: ["files.content.write", "files.content.read"],
      features: [...dropboxServiceDefinition.plannedFeatures],
      errorMessage: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("records 10 consecutive unique uploads without duplicates", async () => {
    const getUploads = installDropboxMeasurementMock();
    const rows: Array<{
      attempt: number;
      artifactId: string;
      fileId: string;
      duplicate: boolean;
    }> = [];

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const buffer = Buffer.from(`measure-payload-${attempt}-xxxx`);
      const contentHash = dropboxContentHash(buffer);
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
        contentSha256: contentHash,
      };
      const result = await dropboxLiveAdapter.uploadFile({
        ownerId: OWNER,
        runId: `run_m_${attempt}`,
        stepId: "step_dropbox",
        configuration: {
          saveTarget: "/Measure",
          conflictPolicy: "fail",
        },
        inputBindings: {},
        artifact: art,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        rows.push({
          attempt,
          artifactId: art.id,
          fileId: result.action.fileId,
          duplicate: result.action.duplicatePrevented,
        });
      }
    }

    expect(rows).toHaveLength(10);
    expect(new Set(rows.map((row) => row.fileId)).size).toBe(10);
    expect(rows.every((row) => row.duplicate === false)).toBe(true);
    expect(getUploads()).toBe(10);

    const metrics = getDropboxLiveMetrics();
    expect(metrics.uploadSuccessRate).toBe(1);
    expect(metrics.duplicatePreventedCount).toBe(0);
  });

  it("prevents duplicate when same idempotency key is reused", async () => {
    const getUploads = installDropboxMeasurementMock();
    const buffer = Buffer.from("same-key-payload");
    const contentHash = dropboxContentHash(buffer);
    const art: StoredDeliverable = {
      id: "art_same_key",
      userId: OWNER,
      fileName: "same.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      format: "docx",
      buffer,
      isPlaceholder: false,
      generatedAt: new Date().toISOString(),
      sourceContent: "# same",
      baseFileName: "same",
      contentSha256: contentHash,
    };

    const first = await dropboxLiveAdapter.uploadFile({
      ownerId: OWNER,
      runId: "run_same",
      stepId: "step_dropbox",
      configuration: { saveTarget: "/Measure", conflictPolicy: "fail" },
      inputBindings: {},
      artifact: art,
    });
    const second = await dropboxLiveAdapter.uploadFile({
      ownerId: OWNER,
      runId: "run_same",
      stepId: "step_dropbox",
      configuration: { saveTarget: "/Measure", conflictPolicy: "fail" },
      inputBindings: {},
      artifact: art,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.action.duplicatePrevented).toBe(true);
      expect(second.action.fileId).toBe(first.action.fileId);
    }
    expect(getUploads()).toBe(1);
    expect(getDropboxLiveMetrics().duplicatePreventedCount).toBe(1);
  });
});
