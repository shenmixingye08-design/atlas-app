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
import { resetExternalAuthHydration } from "@/lib/integrations/external-services/durable";
import { resetXPostHistoryStore } from "@/lib/integrations/x/post/history-store";
import {
  hasXPublishIntent,
  maybeAutoPostToXAfterCommander,
  resolveTweetTextForPublish,
} from "@/lib/integrations/x/post/automation";
import {
  emptyDeliverable,
  type Deliverable,
} from "@/lib/orchestration/deliverable-types";

const TEST_USER_ID = "user_commander_autopost";
const TEST_CONTEXT = { email: "test@example.com", isOwner: false, isBetaUser: true };
const X_TWEETS_API_URL = "https://api.twitter.com/2/tweets";

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

function snsDeliverable(post: string): Deliverable {
  const deliverable = emptyDeliverable("social_post");
  deliverable.title = "SNS投稿";
  deliverable.content = post;
  deliverable.markdown = post;
  deliverable.plainText = post;
  deliverable.metadata = { ...deliverable.metadata, posts: [post], snsPost: post };
  return deliverable;
}

describe("commander X auto-post intent + text resolution", () => {
  it("detects publish intent and skips draft-only requests", () => {
    expect(hasXPublishIntent("Xに投稿して")).toBe(true);
    expect(hasXPublishIntent("ツイートして")).toBe(true);
    expect(hasXPublishIntent("Xの投稿文の下書きを作成して")).toBe(false);
    expect(hasXPublishIntent("ブログ記事を書いて")).toBe(false);
  });

  it("prefers the clean social post card over the raw final response", () => {
    const text = resolveTweetTextForPublish({
      deliverable: snsDeliverable("本日の投稿です #ATLAS"),
      finalResponse: "長い最終レスポンス本文...",
    });
    expect(text).toBe("本日の投稿です #ATLAS");
  });
});

describe("maybeAutoPostToXAfterCommander", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetExternalAuthHydration();
    resetFeatureFlagStore();
    resetXPostHistoryStore();
    setFeatureFlagState("x", "on");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not touch X for non-SNS work", async () => {
    connectXAccount();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await maybeAutoPostToXAfterCommander({
      userId: TEST_USER_ID,
      templateId: "blog",
      assignment: "ブログを書いて投稿して",
      deliverable: snsDeliverable("post"),
      context: TEST_CONTEXT,
    });

    expect(result.attempted).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not post when the request is draft-only", async () => {
    connectXAccount();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await maybeAutoPostToXAfterCommander({
      userId: TEST_USER_ID,
      templateId: "sns_post",
      assignment: "Xの投稿文の下書きだけ作成して",
      deliverable: snsDeliverable("post"),
      context: TEST_CONTEXT,
    });

    expect(result.attempted).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("actually posts to X and returns a real tweet id for a one-off SNS request", async () => {
    connectXAccount();

    const captured: { url: string; body: unknown }[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      captured.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return new Response(
        JSON.stringify({ data: { id: "1978551234567890", text: "本日の投稿です #ATLAS" } }),
        { status: 201 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await maybeAutoPostToXAfterCommander({
      userId: TEST_USER_ID,
      templateId: "sns_post",
      assignment: "Xに投稿して",
      deliverable: snsDeliverable("本日の投稿です #ATLAS"),
      context: TEST_CONTEXT,
    });

    expect(result.attempted).toBe(true);
    if (!result.attempted) return;
    expect(result.mode).toBe("publish");
    expect(result.result.status).toBe("ready");
    if (result.result.status !== "ready") return;
    expect(result.result.history?.status).toBe("success");
    expect(result.result.history?.tweetId).toBe("1978551234567890");
    expect(result.result.history?.tweetUrl).toContain("1978551234567890");

    // Proves the X create-tweet endpoint was actually hit with the post text.
    const createCall = captured.find((call) => call.url === X_TWEETS_API_URL);
    expect(createCall).toBeDefined();
    expect((createCall?.body as { text?: string })?.text).toBe("本日の投稿です #ATLAS");
  });

  it("surfaces a reason when X is not connected instead of faking success", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await maybeAutoPostToXAfterCommander({
      userId: TEST_USER_ID,
      templateId: "sns_post",
      assignment: "Xに投稿して",
      deliverable: snsDeliverable("本日の投稿です"),
      context: TEST_CONTEXT,
    });

    expect(result.attempted).toBe(true);
    if (!result.attempted) return;
    expect(result.result.status).toBe("x_not_connected");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the API error reason on a failed post", async () => {
    connectXAccount();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ errors: [{ detail: "Your account is temporarily locked" }] }),
          { status: 403 },
        ),
      ),
    );

    const result = await maybeAutoPostToXAfterCommander({
      userId: TEST_USER_ID,
      templateId: "sns_post",
      assignment: "Xに投稿して",
      deliverable: snsDeliverable("本日の投稿です"),
      context: TEST_CONTEXT,
    });

    expect(result.attempted).toBe(true);
    if (!result.attempted) return;
    expect(result.result.status).toBe("error");
    if (result.result.status !== "error") return;
    expect(result.result.message).toContain("temporarily locked");
  });
});
