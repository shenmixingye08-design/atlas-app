import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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
import { normalizeDropboxEntry } from "@/lib/integrations/dropbox/api-client";
import { getDropboxFilesForUser } from "@/lib/integrations/dropbox/service";

const TEST_USER_ID = "user_dropbox_test";

describe("Dropbox integration", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetFeatureFlagStore();
    setFeatureFlagState("dropbox", "on");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes Dropbox metadata entries", () => {
    const file = normalizeDropboxEntry({
      ".tag": "file",
      id: "id:abc",
      name: "proposal.pdf",
      path_display: "/ATLAS/proposal.pdf",
      path_lower: "/atlas/proposal.pdf",
      server_modified: "2026-07-10T00:00:00Z",
      size: 2048,
    });

    expect(file?.kind).toBe("pdf");
    expect(file?.isFolder).toBe(false);
    expect(file?.name).toBe("proposal.pdf");
  });

  it("returns dropbox_not_connected when account is missing", async () => {
    const result = await getDropboxFilesForUser({
      userId: TEST_USER_ID,
      context: { email: "test@example.com", isOwner: false, isBetaUser: true },
    });

    expect(result.status).toBe("dropbox_not_connected");
  });

  it("lists Dropbox folder entries", async () => {
    const connection = getExternalServiceConnection(TEST_USER_ID, "dropbox");
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
      serviceId: "dropbox",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: "files.content.read",
      updatedAt: new Date().toISOString(),
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/files/list_folder")) {
        return Response.json({
          entries: [
            {
              ".tag": "folder",
              id: "id:folder",
              name: "ATLAS",
              path_display: "/ATLAS",
              path_lower: "/atlas",
            },
            {
              ".tag": "file",
              id: "id:file",
              name: "notes.docx",
              path_display: "/notes.docx",
              path_lower: "/notes.docx",
              server_modified: "2026-07-10T01:00:00Z",
              size: 100,
            },
          ],
        });
      }
      return Response.json({});
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await getDropboxFilesForUser({
      userId: TEST_USER_ID,
      context: { email: "beta@example.com", isOwner: false, isBetaUser: true },
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.snapshot.folders[0]?.name).toBe("ATLAS");
      expect(result.snapshot.files[0]?.kind).toBe("word");
    }
  });
});
