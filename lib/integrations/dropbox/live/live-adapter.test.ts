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
import { classifyDropboxProviderError } from "@/lib/integrations/dropbox/live/retry";
import { validateDropboxUploadInputRuntime } from "@/lib/integrations/dropbox/live/input";
import {
  encryptDropboxSecret,
  decryptDropboxSecret,
} from "@/lib/integrations/dropbox/crypto";
import { isLiveAdapterWired } from "@/lib/automation-platform/execution/production-step-registry";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";
import type { StoredDeliverable } from "@/lib/deliverables/store";
import { dropboxContentHash } from "@/lib/integrations/dropbox/live/upload";

const OWNER = "user_dropbox_live_owner";

function connectedDropbox(scope = "files.content.write files.content.read account_info.read") {
  saveExternalServiceCredentials({
    userId: OWNER,
    serviceId: "dropbox",
    accessToken: "access-live",
    refreshToken: "refresh-live",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    scope,
    updatedAt: new Date().toISOString(),
  });
  saveExternalServiceConnection(OWNER, {
    ...createDefaultConnection(dropboxServiceDefinition),
    status: "connected",
    connectedAt: new Date().toISOString(),
    lastUsedAt: null,
    scopes: scope.split(" "),
    features: [...dropboxServiceDefinition.plannedFeatures],
    errorMessage: null,
  });
}

function artifact(overrides: Partial<StoredDeliverable> = {}): StoredDeliverable {
  const buffer = Buffer.from("hello-dropbox-live-adapter");
  const contentHash = dropboxContentHash(buffer);
  return {
    id: "art_dropbox_1",
    userId: OWNER,
    fileName: "report.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    format: "docx",
    buffer,
    isPlaceholder: false,
    generatedAt: new Date().toISOString(),
    sourceContent: "# report",
    baseFileName: "report",
    contentSha256: contentHash,
    ...overrides,
  };
}

function installDropboxMock(contentHash: string, size: number) {
  let uploadCount = 0;
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
        typeof body.path === "string" ? body.path : "/ATLAS";
      return new Response(
        JSON.stringify({
          metadata: {
            ".tag": "folder",
            id: "id:folder_atlas",
            name: folderPath.split("/").pop() ?? "ATLAS",
            path_display: folderPath.startsWith("/") ? folderPath : `/${folderPath}`,
            path_lower: folderPath.toLowerCase(),
          },
        }),
        { status: 200 },
      );
    }
    if (url.includes("/files/get_metadata")) {
      if (uploadCount === 0) {
        return new Response(
          JSON.stringify({ error_summary: "path_lookup/not_found" }),
          { status: 409 },
        );
      }
      return new Response(
        JSON.stringify({
          ".tag": "file",
          id: "id:file_dropbox_abc",
          name: "report.docx",
          path_display: "/ATLAS/report.docx",
          path_lower: "/atlas/report.docx",
          rev: "rev_live_1",
          size,
          content_hash: contentHash,
        }),
        { status: 200 },
      );
    }
    if (url.includes("content.dropboxapi.com/2/files/upload")) {
      uploadCount += 1;
      return new Response(
        JSON.stringify({
          ".tag": "file",
          id: "id:file_dropbox_abc",
          name: "report.docx",
          path_display: "/ATLAS/report.docx",
          path_lower: "/atlas/report.docx",
          rev: "rev_live_1",
          size,
          content_hash: contentHash,
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ error_summary: url }), { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return () => uploadCount;
}

describe("Dropbox Production Live Adapter", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetDropboxUploadIdempotencyForTests();
    resetDropboxLiveMetrics();
    vi.stubEnv(
      "ATLAS_DROPBOX_CREDENTIALS_ENCRYPTION_KEY",
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("registers dropbox in Production registry and capability registry", () => {
    expect(isLiveAdapterWired("dropbox")).toBe(true);
    expect(getCapability("dropbox")?.enabled).toBe(true);
  });

  it("encrypts and decrypts Dropbox secrets", () => {
    const cipher = encryptDropboxSecret("refresh-token-plain");
    expect(cipher).not.toContain("refresh-token-plain");
    expect(decryptDropboxSecret(cipher)).toBe("refresh-token-plain");
  });

  it("fails closed on missing connection", async () => {
    const result = await dropboxLiveAdapter.uploadFile({
      ownerId: OWNER,
      runId: "run_1",
      stepId: "step_dropbox",
      configuration: { saveTarget: "/ATLAS" },
      inputBindings: {},
      artifact: artifact(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("dropbox_not_connected");
      expect(result.retryable).toBe(false);
    }
  });

  it("fails closed on missing scope", async () => {
    connectedDropbox("account_info.read");
    const result = await dropboxLiveAdapter.uploadFile({
      ownerId: OWNER,
      runId: "run_1",
      stepId: "step_dropbox",
      configuration: { saveTarget: "/ATLAS" },
      inputBindings: {},
      artifact: artifact(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("dropbox_missing_scope");
      expect(result.connectionHealth).toBe("missing_scope");
    }
    expect(getDropboxLiveMetrics().scopeErrorCount).toBeGreaterThan(0);
  });

  it("uploads, verifies, and prevents duplicate on retry", async () => {
    connectedDropbox();
    const buffer = Buffer.from("hello-dropbox-live-adapter");
    const hash = dropboxContentHash(buffer);
    const getUploads = installDropboxMock(hash, buffer.byteLength);

    const first = await dropboxLiveAdapter.uploadFile({
      ownerId: OWNER,
      runId: "run_dup",
      stepId: "step_dropbox",
      configuration: {
        saveTarget: "/ATLAS",
        conflictPolicy: "fail",
      },
      inputBindings: {},
      artifact: artifact({ contentSha256: hash }),
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.action.fileId).toBe("id:file_dropbox_abc");
      expect(first.action.pathDisplay).toContain("report.docx");
      expect(first.action.rev).toBe("rev_live_1");
      expect(first.action.adapterMode).toBe("production");
      expect(first.action.duplicatePrevented).toBe(false);
    }

    const second = await dropboxLiveAdapter.uploadFile({
      ownerId: OWNER,
      runId: "run_dup",
      stepId: "step_dropbox",
      configuration: {
        saveTarget: "/ATLAS",
        conflictPolicy: "fail",
      },
      inputBindings: {},
      artifact: artifact({ contentSha256: hash }),
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.action.duplicatePrevented).toBe(true);
      expect(second.action.fileId).toBe("id:file_dropbox_abc");
    }
    expect(getUploads()).toBe(1);
    expect(getDropboxLiveMetrics().duplicatePreventedCount).toBeGreaterThan(0);
  });

  it("classifies retryable and non-retryable errors", () => {
    expect(classifyDropboxProviderError(new Error("429 rate limit")).retryable).toBe(
      true,
    );
    expect(classifyDropboxProviderError(new Error("503 unavailable")).retryable).toBe(
      true,
    );
    expect(classifyDropboxProviderError(new Error("401 unauthorized")).retryable).toBe(
      false,
    );
    expect(classifyDropboxProviderError(new Error("403 forbidden")).retryable).toBe(
      false,
    );
  });

  it("validates runtime input schema", () => {
    expect(() =>
      validateDropboxUploadInputRuntime({
        artifactId: "a",
        fileName: "x.docx",
        mimeType: "application/docx",
        size: 10,
        contentHash: "abc",
        targetPath: "/folder/x.docx",
        folderPath: "/folder",
        conflictPolicy: "fail",
        createFolderIfMissing: true,
        createSharedLink: false,
        idempotencyKey: "key",
        ownerId: OWNER,
        organizationId: null,
        runId: "r",
        stepId: "s",
        diagnosticId: "d",
      }),
    ).not.toThrow();
    expect(() => validateDropboxUploadInputRuntime({ artifactId: "a" })).toThrow();
  });

  it("never falls back to sandbox/mock adapter mode", () => {
    expect(dropboxLiveAdapter.mode).toBe("production");
  });
});
