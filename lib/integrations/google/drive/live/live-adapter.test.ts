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
import { classifyDriveProviderError } from "@/lib/integrations/google/drive/live/retry";
import { validateDriveUploadInputRuntime } from "@/lib/integrations/google/drive/live/input";
import { encryptGoogleSecret, decryptGoogleSecret } from "@/lib/integrations/google/crypto";
import { buildGoogleAccountAuthorizeUrl } from "@/lib/integrations/google/oauth";
import { isLiveAdapterWired } from "@/lib/automation-platform/execution/production-step-registry";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";
import type { StoredDeliverable } from "@/lib/deliverables/store";

const OWNER = "user_drive_live_owner";

function connectedGoogle(scope = "https://www.googleapis.com/auth/drive.file") {
  saveExternalServiceCredentials({
    userId: OWNER,
    serviceId: "google",
    accessToken: "access-live",
    refreshToken: "refresh-live",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    scope,
    updatedAt: new Date().toISOString(),
  });
  saveExternalServiceConnection(OWNER, {
    ...createDefaultConnection(googleServiceDefinition),
    status: "connected",
    connectedAt: new Date().toISOString(),
    lastUsedAt: null,
    scopes: scope.split(" "),
    features: [...googleServiceDefinition.plannedFeatures],
    errorMessage: null,
  });
}

function artifact(overrides: Partial<StoredDeliverable> = {}): StoredDeliverable {
  const buffer = Buffer.from("hello-drive-live-adapter");
  return {
    id: "art_drive_1",
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
    contentSha256:
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    ...overrides,
  };
}

describe("Google Drive Production Live Adapter", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetGoogleDriveUploadIdempotencyForTests();
    resetGoogleDriveLiveMetrics();
    vi.stubEnv("OAUTH_STATE_SECRET", "test-oauth-state-secret-drive-live");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-secret");
    vi.stubEnv(
      "ATLAS_GOOGLE_CREDENTIALS_ENCRYPTION_KEY",
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("registers google_drive in Production registry and capability registry", () => {
    expect(isLiveAdapterWired("google_drive")).toBe(true);
    expect(isLiveAdapterWired("gmail")).toBe(false);
    expect(getCapability("google_drive")?.enabled).toBe(true);
  });

  it("uses PKCE on Google authorize URL and drive.file scope", () => {
    const url = buildGoogleAccountAuthorizeUrl("http://localhost:3000", OWNER);
    expect(url).toContain("code_challenge=");
    expect(url).toContain("code_challenge_method=S256");
    expect(url).toContain(
      encodeURIComponent("https://www.googleapis.com/auth/drive.file"),
    );
    expect(url).not.toContain(
      encodeURIComponent("https://www.googleapis.com/auth/drive%20"),
    );
  });

  it("encrypts and decrypts Google secrets", () => {
    const cipher = encryptGoogleSecret("refresh-token-plain");
    expect(cipher).not.toContain("refresh-token-plain");
    expect(decryptGoogleSecret(cipher)).toBe("refresh-token-plain");
  });

  it("fails closed on missing connection", async () => {
    const result = await googleDriveLiveAdapter.uploadFile({
      ownerId: OWNER,
      runId: "run_1",
      stepId: "step_drive",
      configuration: {},
      inputBindings: {},
      artifact: artifact(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("drive_not_connected");
      expect(result.retryable).toBe(false);
    }
  });

  it("fails closed on missing scope", async () => {
    connectedGoogle("email profile");
    const result = await googleDriveLiveAdapter.uploadFile({
      ownerId: OWNER,
      runId: "run_1",
      stepId: "step_drive",
      configuration: {},
      inputBindings: {},
      artifact: artifact(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("drive_missing_scope");
      expect(result.connectionHealth).toBe("missing_scope");
    }
    expect(getGoogleDriveLiveMetrics().scopeErrorCount).toBeGreaterThan(0);
  });

  it("fails closed on owner isolation mismatch", async () => {
    connectedGoogle();
    await expect(
      googleDriveLiveAdapter.uploadFile({
        ownerId: OWNER,
        runId: "run_1",
        stepId: "step_drive",
        configuration: {},
        inputBindings: {},
        artifact: artifact({ userId: "other_user" }),
      }),
    ).resolves.toMatchObject({ ok: false });
  });

  it("uploads, verifies, and prevents duplicate on retry", async () => {
    connectedGoogle();
    let uploadCount = 0;
    const size = String(Buffer.from("hello-drive-live-adapter").byteLength);
    const mime =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/drive/v3/files/folder_atlas")) {
        return new Response(
          JSON.stringify({
            id: "folder_atlas",
            name: "ATLAS",
            mimeType: "application/vnd.google-apps.folder",
            trashed: false,
            webViewLink: "https://drive.google.com/drive/folders/folder_atlas",
          }),
          { status: 200 },
        );
      }
      if (url.includes("/drive/v3/files?") && init?.method !== "POST") {
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      }
      if (url.includes("/upload/drive/v3/files") && init?.method === "POST") {
        uploadCount += 1;
        return new Response(
          JSON.stringify({
            id: "file_abc",
            name: "report.docx",
            mimeType: mime,
            size,
            webViewLink: "https://drive.google.com/file/d/file_abc/view",
            parents: ["folder_atlas"],
            trashed: false,
          }),
          {
            status: 200,
            headers: { "x-guploader-uploadid": "req_1" },
          },
        );
      }
      if (url.includes("/drive/v3/files/file_abc")) {
        return new Response(
          JSON.stringify({
            id: "file_abc",
            name: "report.docx",
            mimeType: mime,
            size,
            webViewLink: "https://drive.google.com/file/d/file_abc/view",
            parents: ["folder_atlas"],
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

    const first = await googleDriveLiveAdapter.uploadFile({
      ownerId: OWNER,
      runId: "run_dup",
      stepId: "step_drive",
      configuration: { targetFolderId: "folder_atlas", conflictPolicy: "fail" },
      inputBindings: {},
      artifact: artifact({
        contentSha256:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.action.fileId).toBe("file_abc");
      expect(first.action.webViewLink).toContain("file_abc");
      expect(first.action.adapterMode).toBe("production");
      expect(first.action.duplicatePrevented).toBe(false);
    }

    const second = await googleDriveLiveAdapter.uploadFile({
      ownerId: OWNER,
      runId: "run_dup",
      stepId: "step_drive",
      configuration: { targetFolderId: "folder_atlas", conflictPolicy: "fail" },
      inputBindings: {},
      artifact: artifact({
        contentSha256:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.action.duplicatePrevented).toBe(true);
      expect(second.action.fileId).toBe("file_abc");
    }
    expect(uploadCount).toBe(1);
    expect(getGoogleDriveLiveMetrics().duplicatePreventedCount).toBeGreaterThan(
      0,
    );
  });

  it("classifies retryable and non-retryable errors", () => {
    expect(classifyDriveProviderError(new Error("429 rate limit")).retryable).toBe(
      true,
    );
    expect(classifyDriveProviderError(new Error("503 unavailable")).retryable).toBe(
      true,
    );
    expect(classifyDriveProviderError(new Error("timeout")).retryable).toBe(true);
    expect(classifyDriveProviderError(new Error("401 unauthorized")).retryable).toBe(
      false,
    );
    expect(classifyDriveProviderError(new Error("403 forbidden")).retryable).toBe(
      false,
    );
    expect(
      classifyDriveProviderError(new Error("400 invalid filename")).retryable,
    ).toBe(false);
  });

  it("validates runtime input schema", () => {
    expect(() =>
      validateDriveUploadInputRuntime({
        artifactId: "a",
        fileName: "x.docx",
        mimeType: "application/docx",
        size: 10,
        checksum: "abc",
        targetFolderId: "folder",
        folderPath: null,
        conflictPolicy: "fail",
        createFolderIfMissing: true,
        idempotencyKey: "key",
        ownerId: OWNER,
        organizationId: null,
        runId: "r",
        stepId: "s",
        diagnosticId: "d",
      }),
    ).not.toThrow();
    expect(() => validateDriveUploadInputRuntime({ artifactId: "a" })).toThrow();
  });

  it("accepts legacy full drive scope for existing connections", async () => {
    connectedGoogle("https://www.googleapis.com/auth/drive");
    const validation = await googleDriveLiveAdapter.validateConnection(OWNER);
    expect(validation.ready).toBe(true);
    expect(validation.health).toBe("connected");
  });

  it("never falls back to sandbox/mock adapter mode", () => {
    expect(googleDriveLiveAdapter.mode).toBe("production");
  });
});
