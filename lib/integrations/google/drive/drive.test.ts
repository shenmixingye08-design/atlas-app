import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/access", () => ({
  getBillingFeatureDenial: vi.fn(async () => null),
}));

vi.mock("@/lib/billing/access", () => ({
  getBillingFeatureDenial: vi.fn(async () => null),
}));

import { saveDeliverableFile } from "@/lib/deliverables/store";
import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";
import {
  resetExternalServiceCredentialStore,
  saveExternalServiceCredentials,
} from "@/lib/integrations/external-services/credential-store";
import {
  getExternalServiceConnection,
  resetExternalServiceStore,
  saveExternalServiceConnection,
} from "@/lib/integrations/external-services/store";
import { buildDriveAutomationSaveTrigger } from "@/lib/integrations/google/drive/automation-plan";
import {
  isDriveCategoryId,
  parseDriveCategoryParam,
} from "@/lib/integrations/google/drive/categories";
import { resetDriveFolderStore } from "@/lib/integrations/google/drive/folder-store";
import {
  getGoogleDriveFilesForUser,
  saveDeliverableToGoogleDriveForUser,
} from "@/lib/integrations/google/drive/service";

const TEST_USER_ID = "user_google_drive_test";

describe("Google Drive integration", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetFeatureFlagStore();
    resetDriveFolderStore();
    setFeatureFlagState("google", "on");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses drive category params", () => {
    expect(parseDriveCategoryParam("blog")).toBe("blog");
    expect(parseDriveCategoryParam("all")).toBe("all");
    expect(parseDriveCategoryParam("invalid")).toBeNull();
    expect(isDriveCategoryId("sns")).toBe(true);
  });

  it("returns google_not_connected when account is missing", async () => {
    const result = await getGoogleDriveFilesForUser({
      userId: TEST_USER_ID,
      category: "all",
      context: { email: "test@example.com", isOwner: false, isBetaUser: true },
    });

    expect(result.status).toBe("google_not_connected");
  });

  it("lists files and ensures ATLAS folder structure", async () => {
    const connection = getExternalServiceConnection(TEST_USER_ID, "google");
    saveExternalServiceConnection(TEST_USER_ID, {
      ...connection,
      status: "connected",
      connectedAt: new Date().toISOString(),
      account: {
        email: "user@example.com",
        name: "User",
        pictureUrl: null,
      },
    });

    saveExternalServiceCredentials({
      userId: TEST_USER_ID,
      serviceId: "google",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: "drive.file",
      updatedAt: new Date().toISOString(),
    });

    let folderCounter = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/files?q=") && url.includes("mimeType='application/vnd.google-apps.folder'")) {
        return Response.json({ files: [] });
      }

      if (url.includes("/files?fields=id,name,webViewLink") && !url.includes("/upload/")) {
        folderCounter += 1;
        return Response.json({
          id: `folder-${folderCounter}`,
          name: `Folder ${folderCounter}`,
          webViewLink: `https://drive.google.com/folder/folder-${folderCounter}`,
        });
      }

      if (url.includes("/files?q=")) {
        return Response.json({
          files: [
            {
              id: "file-1",
              name: "proposal.pdf",
              mimeType: "application/pdf",
              modifiedTime: "2026-07-09T00:00:00.000Z",
              size: "1024",
              webViewLink: "https://drive.google.com/file/d/file-1/view",
            },
          ],
        });
      }

      return Response.json({ files: [] });
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await getGoogleDriveFilesForUser({
      userId: TEST_USER_ID,
      category: "sales_material",
      context: { email: "beta@example.com", isOwner: false, isBetaUser: true },
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.snapshot.folders.rootFolderId).toBeTruthy();
      expect(result.snapshot.folders.categories.sales_material.label).toBe("営業資料");
      expect(result.snapshot.files[0]?.name).toBe("proposal.pdf");
    }
  });

  it("saves deliverables to drive and supports overwrite", async () => {
    const connection = getExternalServiceConnection(TEST_USER_ID, "google");
    saveExternalServiceConnection(TEST_USER_ID, {
      ...connection,
      status: "connected",
      connectedAt: new Date().toISOString(),
    });

    saveExternalServiceCredentials({
      userId: TEST_USER_ID,
      serviceId: "google",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: "drive.file",
      updatedAt: new Date().toISOString(),
    });

    const stored = saveDeliverableFile({
      format: "pdf",
      fileName: "report.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("pdf-content"),
      isPlaceholder: false,
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/upload/drive/v3/files") && init?.method === "POST") {
        return Response.json({
          id: "new-file",
          name: "report.pdf",
          mimeType: "application/pdf",
          modifiedTime: "2026-07-09T01:00:00.000Z",
          size: "11",
          webViewLink: "https://drive.google.com/file/d/new-file/view",
        });
      }

      if (url.includes("/upload/drive/v3/files/") && init?.method === "PATCH") {
        return Response.json({
          id: "existing-file",
          name: "report.pdf",
          mimeType: "application/pdf",
          modifiedTime: "2026-07-09T02:00:00.000Z",
          size: "11",
          webViewLink: "https://drive.google.com/file/d/existing-file/view",
        });
      }

      if (url.includes("mimeType='application/vnd.google-apps.folder'")) {
        return Response.json({ files: [{ id: "root", name: "ATLAS" }] });
      }

      if (url.includes("/files?fields=id,name,webViewLink")) {
        return Response.json({ id: "cat-folder", name: "その他" });
      }

      if (url.includes("/files?q=")) {
        return Response.json({ files: [] });
      }

      return Response.json({});
    });

    vi.stubGlobal("fetch", fetchMock);

    const created = await saveDeliverableToGoogleDriveForUser({
      userId: TEST_USER_ID,
      context: { email: "beta@example.com", isOwner: false, isBetaUser: true },
      deliverableId: stored.id,
      category: "other",
    });

    expect(created.status).toBe("ready");
    if (created.status === "ready") {
      expect(created.overwritten).toBe(false);
      expect(created.file.name).toBe("report.pdf");
    }

    const overwritten = await saveDeliverableToGoogleDriveForUser({
      userId: TEST_USER_ID,
      context: { email: "beta@example.com", isOwner: false, isBetaUser: true },
      deliverableId: stored.id,
      category: "other",
      overwriteFileId: "existing-file",
    });

    expect(overwritten.status).toBe("ready");
    if (overwritten.status === "ready") {
      expect(overwritten.overwritten).toBe(true);
    }
  });

  it("builds automation save trigger design", () => {
    const trigger = buildDriveAutomationSaveTrigger({
      category: "sales_material",
      format: "pptx",
    });

    expect(trigger.kind).toBe("post_deliverable_save");
    expect(trigger.notifyWithDriveUrl).toBe(true);
  });
});
