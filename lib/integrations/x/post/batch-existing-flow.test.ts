import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async () => "test@example.com"),
}));

vi.mock("@/lib/auth/is-atlas-owner", () => ({
  isAtlasOwnerEmail: () => false,
}));

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
import { resetExternalAuthHydration } from "@/lib/integrations/external-services/durable";
import { resetXDraftPostStore } from "./draft-store";
import { resetXPostHistoryStore } from "./history-store";
import { resetXScheduledPostsStore } from "./schedule-store";
import { resetDurableXPostJobsForTests } from "./durable-x-post-jobs";
import { resetXPostBatchStoreForTests } from "./batch-store";
import { saveXDraftForUser, scheduleTweetForUser } from "./service";

const TEST_USER_ID = "user_x_post_existing_flow";
const TEST_CONTEXT = { email: "test@example.com", isOwner: false, isBetaUser: true };

function connectXAccount(): void {
  const connection = getExternalServiceConnection(TEST_USER_ID, "x");
  saveExternalServiceConnection(TEST_USER_ID, {
    ...connection,
    status: "connected",
    connectedAt: new Date().toISOString(),
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    account: {
      email: "@atlas_user",
      name: "ATLAS User",
      pictureUrl: null,
      providerUserId: "123",
      username: "atlas_user",
    },
  });
  saveExternalServiceCredentials({
    userId: TEST_USER_ID,
    serviceId: "x",
    accessToken: "x-access-token",
    refreshToken: "x-refresh-token",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    scope: "tweet.read tweet.write users.read offline.access",
    updatedAt: new Date().toISOString(),
  });
}

describe("existing single X post flow after batch feature", () => {
  beforeEach(() => {
    resetXPostBatchStoreForTests();
    resetDurableXPostJobsForTests();
    resetXDraftPostStore();
    resetXPostHistoryStore();
    resetXScheduledPostsStore();
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetExternalAuthHydration();
    resetFeatureFlagStore();
    setFeatureFlagState("x", "on");
    connectXAccount();
  });

  afterEach(() => {
    resetXPostBatchStoreForTests();
    resetDurableXPostJobsForTests();
  });

  it("still saves a single draft", async () => {
    const result = await saveXDraftForUser({
      userId: TEST_USER_ID,
      text: "既存の1件下書きです。",
      context: TEST_CONTEXT,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.draft?.text).toBe("既存の1件下書きです。");
  });

  it("still schedules a single future post", async () => {
    const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const result = await scheduleTweetForUser({
      userId: TEST_USER_ID,
      text: "既存の1件予約です。",
      scheduledFor,
      context: TEST_CONTEXT,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.scheduled?.text).toBe("既存の1件予約です。");
    expect(result.scheduled?.status).toBe("pending");
  });
});
