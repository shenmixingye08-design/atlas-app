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
import { buildTweetUrl } from "@/lib/integrations/x/post/api-client";
import { resetXPostHistoryStore } from "@/lib/integrations/x/post/history-store";
import {
  resetXScheduledPostsStore,
  saveXScheduledPost,
} from "@/lib/integrations/x/post/schedule-store";
import {
  getXPostHistoryForUser,
  postTweetNowForUser,
  processDueScheduledXPosts,
  scheduleTweetForUser,
} from "@/lib/integrations/x/post/service";
import {
  isTweetTextValid,
  validateTweetText,
  X_TWEET_MAX_CHARS,
} from "@/lib/integrations/x/post/validate";

const TEST_USER_ID = "user_x_post_test";
const TEST_CONTEXT = { email: "test@example.com", isOwner: false, isBetaUser: true };

function connectXAccount(): void {
  const connection = getExternalServiceConnection(TEST_USER_ID, "x");
  saveExternalServiceConnection(TEST_USER_ID, {
    ...connection,
    status: "connected",
    connectedAt: new Date().toISOString(),
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
    scope: "tweet.write",
    updatedAt: new Date().toISOString(),
  });
}

describe("X post validation", () => {
  it("validates character count, urls, mentions, and hashtags", () => {
    const valid = validateTweetText("Hello @atlas_user #ATLAS https://example.com");
    expect(valid.errors).toHaveLength(0);
    expect(valid.mentions).toEqual(["@atlas_user"]);
    expect(valid.hashtags).toEqual(["#ATLAS"]);
    expect(valid.urls).toEqual(["https://example.com"]);
    expect(isTweetTextValid("Hello")).toBe(true);
  });

  it("rejects empty and over-limit text", () => {
    const empty = validateTweetText("   ");
    expect(empty.errors).toContain("投稿文が空です");

    const tooLong = validateTweetText("あ".repeat(X_TWEET_MAX_CHARS + 1));
    expect(tooLong.errors.some((error) => error.includes("文字数"))).toBe(true);
  });

  it("rejects invalid mentions and hashtags", () => {
    const invalidMention = validateTweetText("Hi @this_is_way_too_long_username");
    expect(invalidMention.errors.some((error) => error.includes("メンション"))).toBe(
      true,
    );
  });
});

describe("X post service", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetFeatureFlagStore();
    resetXPostHistoryStore();
    resetXScheduledPostsStore();
    setFeatureFlagState("x", "on");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns feature_disabled when X flag is off", async () => {
    setFeatureFlagState("x", "off");

    const result = await postTweetNowForUser({
      userId: TEST_USER_ID,
      text: "Hello",
      context: TEST_CONTEXT,
    });

    expect(result.status).toBe("feature_disabled");
  });

  it("returns x_not_connected when account is missing", async () => {
    const result = await postTweetNowForUser({
      userId: TEST_USER_ID,
      text: "Hello",
      context: TEST_CONTEXT,
    });

    expect(result.status).toBe("x_not_connected");
  });

  it("posts a tweet and stores history", async () => {
    connectXAccount();

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: { id: "999", text: "Hello X" },
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await postTweetNowForUser({
      userId: TEST_USER_ID,
      text: "Hello X",
      context: TEST_CONTEXT,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.history?.tweetId).toBe("999");
    expect(result.history?.tweetUrl).toBe(buildTweetUrl("atlas_user", "999"));
    expect(result.history?.status).toBe("success");

    const history = await getXPostHistoryForUser({
      userId: TEST_USER_ID,
      context: TEST_CONTEXT,
    });
    expect(history.status).toBe("ready");
    if (history.status !== "ready") return;
    expect(history.records).toHaveLength(1);
  });

  it("schedules a post for future processing", async () => {
    connectXAccount();

    const scheduledFor = new Date(Date.now() + 60_000).toISOString();
    const result = await scheduleTweetForUser({
      userId: TEST_USER_ID,
      text: "Scheduled tweet",
      scheduledFor,
      context: TEST_CONTEXT,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.scheduled?.status).toBe("pending");
  });

  it("processes due scheduled posts", async () => {
    connectXAccount();

    const scheduled = saveXScheduledPost({
      userId: TEST_USER_ID,
      text: "Due tweet",
      scheduledFor: new Date(Date.now() - 1000).toISOString(),
    });

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: { id: "555", text: "Due tweet" },
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const processed = await processDueScheduledXPosts({
      resolveContext: async () => TEST_CONTEXT,
    });

    expect(processed).toHaveLength(1);
    expect(processed[0]?.scheduledId).toBe(scheduled.id);
    expect(processed[0]?.result.status).toBe("ready");
  });
});
