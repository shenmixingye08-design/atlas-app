/**
 * Permanent CI guard: Production Google Drive must not collapse to generic 500.
 *
 * CASE A: connected + Drive API OK → 200 / ready
 * CASE B: WordPress encryption key missing → Drive still ready
 * CASE C: X / Dropbox unset → Drive still ready
 * CASE D: stale access token → durable reload / force refresh then success
 * CASE E: missing Drive scope → reconnect_required (not 500)
 * CASE F: Drive API 403 → keep reason, safe fail
 * CASE G: Drive API 500 → no fake success
 * CASE H: first user → create MINERVOT folder
 * CASE I: existing folder → do not duplicate
 * CASE J: other user credential never used
 * CASE K: Gmail / Calendar gates still work after Drive changes
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/billing/access", () => ({
  getBillingFeatureDenial: vi.fn(async () => null),
}));

vi.mock("@/lib/integrations/google/oauth", () => ({
  refreshGoogleAccountAccessToken: vi.fn(),
  exchangeGoogleAccountAuthCode: vi.fn(),
  fetchGoogleAccountUserInfo: vi.fn(),
  revokeGoogleAccountToken: vi.fn(),
  buildGoogleAccountAuthorizeUrl: vi.fn(() => "https://accounts.google.com"),
}));

import { getBillingFeatureDenial } from "@/lib/billing/access";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import {
  resetFeatureFlagStore,
  setFeatureFlagState,
} from "@/lib/feature-flags/store";
import {
  resetExternalServiceCredentialStore,
  saveExternalServiceCredentials,
} from "@/lib/integrations/external-services/credential-store";
import { resetExternalAuthHydration } from "@/lib/integrations/external-services/durable";
import { createDefaultConnection } from "@/lib/integrations/external-services/registry";
import {
  resetExternalServiceStore,
  saveExternalServiceConnection,
} from "@/lib/integrations/external-services/store";
import {
  classifyDriveHttpStatus,
  driveErrorHttpStatus,
} from "@/lib/integrations/google/drive/errors";
import { resetDriveFolderStore } from "@/lib/integrations/google/drive/folder-store";
import { getGoogleDriveFilesForUser } from "@/lib/integrations/google/drive/service";
import { googleServiceDefinition } from "@/lib/integrations/google/definition";
import { refreshGoogleAccountAccessToken } from "@/lib/integrations/google/oauth";
import { requireGoogleIntegrationAccess } from "@/lib/integrations/google/require-access";

const USER_A = "user_drive_prod_a";
const USER_B = "user_drive_prod_b";
const CTX = buildFeatureAccessContext("owner@example.com");
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

function seedGoogle(userId: string, input?: { scope?: string; accessToken?: string }) {
  const accessToken = input?.accessToken ?? `${userId}-access`;
  const scope =
    input?.scope ??
    `${DRIVE_SCOPE} ${GMAIL_SCOPE} ${CALENDAR_SCOPE} openid email profile`;
  saveExternalServiceCredentials({
    userId,
    serviceId: "google",
    accessToken,
    refreshToken: `${userId}-refresh`,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    scope,
    updatedAt: new Date().toISOString(),
  });
  saveExternalServiceConnection(userId, {
    ...createDefaultConnection(googleServiceDefinition),
    status: "connected",
    connectedAt: new Date().toISOString(),
    scopes: scope.split(/\s+/),
    account: {
      email: `${userId}@example.com`,
      name: userId,
      pictureUrl: null,
    },
  });
}

function decodeDriveUrl(input: RequestInfo | URL) {
  return decodeURIComponent(String(input));
}

function googleError(status: number, reason: string, message: string) {
  return Response.json(
    {
      error: {
        code: status,
        message,
        status: reason,
        errors: [{ reason, message }],
      },
    },
    { status },
  );
}

function mockHealthyDrive(options?: {
  existingRootName?: "MINERVOT" | "ATLAS" | null;
  onCreate?: (name: string) => void;
  unauthorizedOnce?: { token: string; refreshedToken: string };
}) {
  let sawUnauthorized = false;
  const created: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = decodeDriveUrl(input);
    const auth = new Headers(init?.headers).get("Authorization") ?? "";

    if (
      options?.unauthorizedOnce &&
      !sawUnauthorized &&
      auth.includes(options.unauthorizedOnce.token)
    ) {
      sawUnauthorized = true;
      return googleError(401, "AUTH_ERROR", "Invalid Credentials");
    }

    if (url.includes("mimeType='application/vnd.google-apps.folder'")) {
      if (url.includes("name='MINERVOT'") && options?.existingRootName === "MINERVOT") {
        return Response.json({
          files: [{ id: "root-minervot", name: "MINERVOT" }],
        });
      }
      if (url.includes("name='ATLAS'") && options?.existingRootName === "ATLAS") {
        return Response.json({ files: [{ id: "root-atlas", name: "ATLAS" }] });
      }
      if (url.includes(" in parents") && !url.includes("'root' in parents")) {
        return Response.json({ files: [] });
      }
      return Response.json({ files: [] });
    }

    if (url.includes("/files?fields=id,name,webViewLink") && init?.method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}")) as { name?: string };
      const name = body.name ?? "folder";
      created.push(name);
      options?.onCreate?.(name);
      return Response.json({
        id: `created-${name}`,
        name,
        webViewLink: `https://drive.google.com/folder/${name}`,
      });
    }

    if (url.includes("/drive/v3/files/") && !url.includes("q=") && !url.includes("/upload/")) {
      const id = url.split("/files/")[1]?.split("?")[0];
      return Response.json({
        id,
        name: "folder",
        mimeType: "application/vnd.google-apps.folder",
        trashed: false,
      });
    }

    if (url.includes("/files?q=")) {
      return Response.json({
        files: [
          {
            id: "file-1",
            name: "proposal.pdf",
            mimeType: "application/pdf",
            modifiedTime: "2026-08-23T00:00:00.000Z",
            size: "1024",
            webViewLink: "https://drive.google.com/file/d/file-1/view",
          },
        ],
      });
    }

    return Response.json({ files: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, created };
}

describe("Google Drive production 500 regression", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetExternalAuthHydration();
    resetFeatureFlagStore();
    resetDriveFolderStore();
    setFeatureFlagState("google", "on");
    vi.mocked(getBillingFeatureDenial).mockResolvedValue(null);
    vi.mocked(refreshGoogleAccountAccessToken).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("CASE A: Google connected + Drive healthy → ready", async () => {
    seedGoogle(USER_A);
    mockHealthyDrive({ existingRootName: "MINERVOT" });

    const result = await getGoogleDriveFilesForUser({
      userId: USER_A,
      category: "all",
      context: CTX,
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.snapshot.files[0]?.name).toBe("proposal.pdf");
      expect(result.snapshot.folders.rootFolderId).toBe("root-minervot");
    }
  });

  it("CASE B: WordPress encryption key missing does not break Drive", async () => {
    vi.stubEnv("ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY", "");
    seedGoogle(USER_A);
    mockHealthyDrive({ existingRootName: "MINERVOT" });

    const result = await getGoogleDriveFilesForUser({
      userId: USER_A,
      category: "sales_material",
      context: CTX,
    });
    expect(result.status).toBe("ready");
  });

  it("CASE C: X / Dropbox unset does not break Drive", async () => {
    seedGoogle(USER_A);
    mockHealthyDrive({ existingRootName: "MINERVOT" });

    const result = await getGoogleDriveFilesForUser({
      userId: USER_A,
      category: "blog",
      context: CTX,
    });
    expect(result.status).toBe("ready");
  });

  it("CASE D: stale access token refreshes then succeeds", async () => {
    seedGoogle(USER_A, { accessToken: "stale-drive-token" });
    vi.mocked(refreshGoogleAccountAccessToken).mockResolvedValue({
      access_token: "fresh-drive-token",
      expires_in: 3600,
      refresh_token: `${USER_A}-refresh`,
      scope: DRIVE_SCOPE,
      token_type: "Bearer",
    });
    const { fetchMock } = mockHealthyDrive({
      existingRootName: "MINERVOT",
      unauthorizedOnce: {
        token: "stale-drive-token",
        refreshedToken: "fresh-drive-token",
      },
    });

    const result = await getGoogleDriveFilesForUser({
      userId: USER_A,
      category: "all",
      context: CTX,
    });

    expect(result.status).toBe("ready");
    expect(refreshGoogleAccountAccessToken).toHaveBeenCalled();
    const auths = fetchMock.mock.calls.map(
      (call) => new Headers(call[1]?.headers).get("Authorization") ?? "",
    );
    expect(auths.some((value) => value.includes("fresh-drive-token"))).toBe(true);
  });

  it("CASE E: missing Drive scope → insufficient_permission / reconnect, not 500", async () => {
    seedGoogle(USER_A, { scope: `${GMAIL_SCOPE} ${CALENDAR_SCOPE}` });

    const result = await getGoogleDriveFilesForUser({
      userId: USER_A,
      category: "all",
      context: CTX,
    });
    expect(result.status).toBe("insufficient_permission");
    expect(result.status).not.toBe("ready");
    expect(driveErrorHttpStatus(result.status)).toBe(403);

    seedGoogle(USER_A, { scope: DRIVE_FILE_SCOPE });
    mockHealthyDrive({ existingRootName: "MINERVOT" });
    const withFileScope = await getGoogleDriveFilesForUser({
      userId: USER_A,
      category: "all",
      context: CTX,
    });
    expect(withFileScope.status).toBe("ready");
  });

  it("CASE F: Drive API 403 keeps a safe permission failure", async () => {
    seedGoogle(USER_A);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        googleError(403, "insufficientPermissions", "The user does not have sufficient permissions"),
      ),
    );

    const result = await getGoogleDriveFilesForUser({
      userId: USER_A,
      category: "all",
      context: CTX,
    });
    expect(result.status).toBe("insufficient_permission");
    expect(result.message).not.toMatch(/access token|refresh token|Bearer /i);
    if (result.status !== "ready") {
      expect(result.failedStage).toBeTruthy();
      expect(result.diagnosticId).toBeTruthy();
    }
    expect(driveErrorHttpStatus("insufficient_permission")).toBe(403);
    expect(classifyDriveHttpStatus(403, "insufficientPermissions")).toBe(
      "insufficient_permission",
    );
  });

  it("CASE G: Drive API 500 is provider_error, never fake ready", async () => {
    seedGoogle(USER_A);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => googleError(500, "INTERNAL", "Backend Error")),
    );

    const result = await getGoogleDriveFilesForUser({
      userId: USER_A,
      category: "all",
      context: CTX,
    });
    expect(result.status).toBe("provider_error");
    expect(result.status).not.toBe("ready");
    expect(driveErrorHttpStatus("provider_error")).toBe(502);
  });

  it("CASE H: first user creates a MINERVOT root folder", async () => {
    seedGoogle(USER_A);
    const created: string[] = [];
    mockHealthyDrive({
      existingRootName: null,
      onCreate: (name) => created.push(name),
    });

    const result = await getGoogleDriveFilesForUser({
      userId: USER_A,
      category: "other",
      context: CTX,
    });
    expect(result.status).toBe("ready");
    expect(created.filter((name) => name === "MINERVOT")).toHaveLength(1);
    expect(created.filter((name) => name === "ATLAS")).toHaveLength(0);
  });

  it("CASE I: existing ATLAS or MINERVOT folder is reused", async () => {
    seedGoogle(USER_A);
    const created: string[] = [];
    mockHealthyDrive({
      existingRootName: "ATLAS",
      onCreate: (name) => created.push(name),
    });

    const result = await getGoogleDriveFilesForUser({
      userId: USER_A,
      category: "other",
      context: CTX,
    });
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.snapshot.folders.rootFolderId).toBe("root-atlas");
    }
    expect(created).not.toContain("MINERVOT");
    expect(created).not.toContain("ATLAS");
  });

  it("CASE J: other user's credential is never used", async () => {
    seedGoogle(USER_A, { accessToken: "aaa-token" });
    seedGoogle(USER_B, { accessToken: "bbb-token" });
    const { fetchMock } = mockHealthyDrive({ existingRootName: "MINERVOT" });

    const result = await getGoogleDriveFilesForUser({
      userId: USER_A,
      category: "all",
      context: CTX,
    });
    expect(result.status).toBe("ready");

    const auths = fetchMock.mock.calls.map(
      (call) => new Headers(call[1]?.headers).get("Authorization") ?? "",
    );
    expect(auths.every((value) => value.includes("aaa-token"))).toBe(true);
    expect(auths.some((value) => value.includes("bbb-token"))).toBe(false);
  });

  it("CASE K: Gmail / Calendar access still works after Drive changes", async () => {
    seedGoogle(USER_A, {
      scope: `${GMAIL_SCOPE} ${CALENDAR_SCOPE} ${DRIVE_SCOPE}`,
    });

    const gmail = await requireGoogleIntegrationAccess({
      userId: USER_A,
      context: CTX,
      capability: "gmail",
    });
    const calendar = await requireGoogleIntegrationAccess({
      userId: USER_A,
      context: CTX,
      capability: "calendar",
    });
    expect("accessToken" in gmail).toBe(true);
    expect("accessToken" in calendar).toBe(true);
  });
});
