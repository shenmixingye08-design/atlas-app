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
import {
  analyzeGmailMessages,
  createGmailReplyDraft,
  extractImportantMessages,
} from "@/lib/integrations/google/gmail/ai-assistant";
import {
  normalizeGmailMessage,
} from "@/lib/integrations/google/gmail/api-client";
import { isGmailFilterId, resolveGmailSearchQuery } from "@/lib/integrations/google/gmail/filters";
import {
  listGmailReplyDrafts,
  resetGmailReplyDraftStore,
  saveGmailReplyDraft,
} from "@/lib/integrations/google/gmail/reply-draft-store";
import { getGmailMessagesForUser } from "@/lib/integrations/google/gmail/service";

const TEST_USER_ID = "user_google_gmail_test";

describe("Google Gmail integration", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetFeatureFlagStore();
    resetGmailReplyDraftStore();
    setFeatureFlagState("google", "on");
    vi.stubEnv("ATLAS_MOCK_LLM", "true");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("normalizes Gmail messages with headers and labels", () => {
    const message = normalizeGmailMessage({
      id: "msg-1",
      labelIds: ["INBOX", "UNREAD", "IMPORTANT"],
      internalDate: "1720500000000",
      payload: {
        headers: [
          { name: "Subject", value: "見積依頼" },
          { name: "From", value: "Tanaka Taro <tanaka@example.com>" },
        ],
        mimeType: "text/plain",
        body: {
          data: Buffer.from("見積書を送付ください。", "utf8").toString("base64"),
        },
      },
    });

    expect(message).toMatchObject({
      id: "msg-1",
      subject: "見積依頼",
      sender: "Tanaka Taro",
      bodyText: "見積書を送付ください。",
      isUnread: true,
    });
    expect(message?.labels).toContain("受信トレイ");
  });

  it("resolves Gmail search filters", () => {
    expect(isGmailFilterId("unread")).toBe(true);
    expect(isGmailFilterId("invalid")).toBe(false);

    const unread = resolveGmailSearchQuery("unread");
    expect(unread.query).toContain("is:unread");

    const today = resolveGmailSearchQuery(
      "today",
      new Date("2026-07-09T03:00:00.000Z"),
    );
    expect(today.label).toBe("今日");
    expect(today.query).toContain("after:");
  });

  it("returns google_not_connected when account is missing", async () => {
    const result = await getGmailMessagesForUser({
      userId: TEST_USER_ID,
      filter: "unread",
      context: { email: "test@example.com", isOwner: false, isBetaUser: true },
    });

    expect(result.status).toBe("google_not_connected");
  });

  it("fetches Gmail messages for connected users", async () => {
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
      scope: "gmail.readonly",
      updatedAt: new Date().toISOString(),
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ messages: [{ id: "msg-1" }] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: "msg-1",
          labelIds: ["INBOX", "UNREAD"],
          internalDate: "1720500000000",
          payload: {
            headers: [
              { name: "Subject", value: "Hello" },
              { name: "From", value: "Sender <sender@example.com>" },
            ],
            mimeType: "text/plain",
            body: {
              data: Buffer.from("Body text", "utf8").toString("base64"),
            },
          },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await getGmailMessagesForUser({
      userId: TEST_USER_ID,
      filter: "unread",
      context: { email: "beta@example.com", isOwner: false, isBetaUser: true },
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.snapshot.messages).toHaveLength(1);
      expect(result.snapshot.messages[0]?.subject).toBe("Hello");
      expect(result.snapshot.messages[0]?.bodyText).toBe("Body text");
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("analyzes messages and extracts important ones with mock LLM", async () => {
    const analyses = await analyzeGmailMessages([
      {
        id: "msg-1",
        subject: "契約更新のご相談",
        sender: "Client",
        receivedAt: new Date().toISOString(),
        bodyText: "来週までに返信ください。",
        isUnread: true,
        labels: ["受信トレイ"],
      },
    ]);

    expect(analyses[0]?.summaryLines).toHaveLength(3);
    expect(extractImportantMessages(analyses).length).toBeGreaterThan(0);
  });

  it("creates and saves reply drafts without sending", async () => {
    const draft = await createGmailReplyDraft({
      id: "msg-1",
      subject: "見積依頼",
      sender: "Client",
      receivedAt: new Date().toISOString(),
      bodyText: "見積書をください。",
      isUnread: true,
      labels: [],
    });

    expect(draft.subject).toContain("Re:");
    expect(draft.body.length).toBeGreaterThan(0);

    const saved = saveGmailReplyDraft(TEST_USER_ID, draft);
    expect(listGmailReplyDrafts(TEST_USER_ID)).toHaveLength(1);
    expect(saved.id).toBeTruthy();
  });
});
