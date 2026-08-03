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
import { googleGmailLiveAdapter } from "@/lib/integrations/google/gmail/live/adapter";
import {
  getGmailAdapterMetrics,
  resetGmailLiveMetricsForTests,
} from "@/lib/integrations/google/gmail/live/metrics";
import { resetGmailIdempotencyForTests } from "@/lib/integrations/google/gmail/live/idempotency";
import { classifyGmailProviderError } from "@/lib/integrations/google/gmail/live/retry";
import { resolveGmailRecipients } from "@/lib/integrations/google/gmail/live/recipients";
import { buildRfc822MimeMessage } from "@/lib/integrations/google/gmail/live/mime";
import {
  encryptGoogleSecret,
  decryptGoogleSecret,
} from "@/lib/integrations/google/crypto";
import { buildGoogleAccountAuthorizeUrl } from "@/lib/integrations/google/oauth";
import {
  hasGmailScopesForAction,
  getMissingGmailScopesForAction,
} from "@/lib/integrations/google/scopes";
import { isLiveAdapterWired } from "@/lib/automation-platform/execution/production-step-registry";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";
import { saveDeliverableFile } from "@/lib/deliverables/store";

const OWNER = "user_gmail_live_owner";

function connectedGoogle(
  scope = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.compose",
  ].join(" "),
) {
  saveExternalServiceCredentials({
    userId: OWNER,
    serviceId: "google",
    accessToken: "access-gmail-live",
    refreshToken: "refresh-gmail-live",
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
    account: {
      email: "owner@example.com",
      name: "Owner",
      pictureUrl: null,
    },
  });
}

function encodeBody(text: string): string {
  return Buffer.from(text, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function messageResource(input: {
  id: string;
  threadId: string;
  subject: string;
  to: string;
  cc?: string;
  body: string;
  attachmentCount?: number;
  labelIds?: string[];
}) {
  const parts =
    (input.attachmentCount ?? 0) > 0
      ? [
          {
            mimeType: "multipart/mixed",
            parts: [
              {
                mimeType: "text/plain",
                body: { data: encodeBody(input.body) },
              },
              ...Array.from({ length: input.attachmentCount ?? 0 }, (_, i) => ({
                mimeType: "application/pdf",
                filename: `file-${i}.pdf`,
                body: { attachmentId: `att_${i}`, size: 10 },
              })),
            ],
          },
        ]
      : undefined;

  return {
    id: input.id,
    threadId: input.threadId,
    labelIds: input.labelIds ?? ["DRAFT"],
    payload: {
      mimeType: parts ? "multipart/mixed" : "text/plain",
      headers: [
        { name: "Subject", value: input.subject },
        { name: "To", value: input.to },
        ...(input.cc ? [{ name: "Cc", value: input.cc }] : []),
      ],
      body: parts ? undefined : { data: encodeBody(input.body) },
      parts: parts?.[0]?.parts,
    },
  };
}

describe("Gmail Production Live Adapter", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetGmailIdempotencyForTests();
    resetGmailLiveMetricsForTests();
    vi.stubEnv("OAUTH_STATE_SECRET", "test-oauth-state-secret-gmail-live");
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

  it("registers google_gmail in Production registry", () => {
    expect(isLiveAdapterWired("google_gmail")).toBe(true);
    expect(isLiveAdapterWired("google_drive")).toBe(true);
    expect(getCapability("gmail")?.enabled).toBe(true);
  });

  it("uses PKCE on Google authorize URL", () => {
    const url = buildGoogleAccountAuthorizeUrl("http://localhost:3000", OWNER);
    expect(url).toContain("code_challenge=");
    expect(url).toContain("code_challenge_method=S256");
    expect(url).toContain(
      encodeURIComponent("https://www.googleapis.com/auth/gmail.compose"),
    );
  });

  it("encrypts Google secrets", () => {
    const cipher = encryptGoogleSecret("refresh-token-plain");
    expect(cipher).not.toContain("refresh-token-plain");
    expect(decryptGoogleSecret(cipher)).toBe("refresh-token-plain");
  });

  it("validates recipients and blocks header injection", () => {
    const ok = resolveGmailRecipients({
      to: "a@example.com, a@example.com",
      cc: "b@example.com",
      bcc: "b@example.com; c@example.com",
    });
    expect(ok.to).toEqual(["a@example.com"]);
    expect(ok.cc).toEqual(["b@example.com"]);
    expect(ok.bcc).toEqual(["c@example.com"]);
    expect(() =>
      resolveGmailRecipients({ to: "evil@example.com\nBcc: x@x.com" }),
    ).toThrow(/injection/i);
  });

  it("builds MIME with UTF-8 subject, html alternative, and attachment", () => {
    const raw = buildRfc822MimeMessage({
      to: ["to@example.com"],
      cc: ["cc@example.com"],
      bcc: ["bcc@example.com"],
      subject: "日本語件名",
      textBody: "本文",
      htmlBody: "<p>本文</p>",
      attachments: [
        {
          fileName: "見積.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4"),
        },
      ],
      inReplyTo: "<msg1@mail>",
      references: "<msg1@mail>",
    });
    expect(raw).toContain("multipart/mixed");
    expect(raw).toContain("multipart/alternative");
    expect(raw).toContain("In-Reply-To:");
    expect(raw).toContain("Cc: cc@example.com");
    expect(raw).toContain("Bcc: bcc@example.com");
    expect(raw).toContain("=?UTF-8?B?");
  });

  it("distinguishes draft vs send scopes", () => {
    expect(
      hasGmailScopesForAction(
        "https://www.googleapis.com/auth/gmail.compose",
        "draft",
      ),
    ).toBe(true);
    expect(
      hasGmailScopesForAction(
        "https://www.googleapis.com/auth/gmail.compose",
        "send",
      ),
    ).toBe(false);
    expect(
      getMissingGmailScopesForAction(
        "https://www.googleapis.com/auth/gmail.compose",
        "send",
      ),
    ).toContain("https://www.googleapis.com/auth/gmail.send");
  });

  it("fails closed on missing connection", async () => {
    const result = await googleGmailLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_1",
      stepId: "step_gmail",
      configuration: {
        mode: "draft",
        to: "a@example.com",
        subject: "s",
        textBody: "b",
      },
      inputBindings: {},
      approved: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("gmail_not_connected");
      expect(result.retryable).toBe(false);
    }
  });

  it("fails closed on missing scope for send", async () => {
    connectedGoogle("https://www.googleapis.com/auth/gmail.compose");
    const result = await googleGmailLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_1",
      stepId: "step_gmail",
      configuration: {
        mode: "send",
        to: "a@example.com",
        subject: "s",
        textBody: "b",
        approvalRequired: false,
      },
      inputBindings: {},
      approved: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("gmail_missing_scope");
      expect(result.connectionHealth).toBe("missing_scope");
    }
    expect(getGmailAdapterMetrics().scopeErrorCount).toBeGreaterThan(0);
  });

  it("creates draft with re-fetch verification and prevents duplicate", async () => {
    connectedGoogle();
    let draftCreates = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/users/me/drafts") && init?.method === "POST" && !url.includes("send")) {
        draftCreates += 1;
        return new Response(
          JSON.stringify({
            id: "draft_1",
            message: { id: "msg_draft_1", threadId: "thread_1" },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/users/me/drafts/draft_1")) {
        return new Response(
          JSON.stringify({
            id: "draft_1",
            message: messageResource({
              id: "msg_draft_1",
              threadId: "thread_1",
              subject: "件名A",
              to: "to@example.com",
              body: "本文A",
            }),
          }),
          { status: 200 },
        );
      }
      if (url.includes("/users/me/messages/msg_draft_1")) {
        return new Response(
          JSON.stringify(
            messageResource({
              id: "msg_draft_1",
              threadId: "thread_1",
              subject: "件名A",
              to: "to@example.com",
              body: "本文A",
            }),
          ),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await googleGmailLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_draft",
      stepId: "step_gmail",
      configuration: {
        mode: "draft",
        to: "to@example.com",
        subject: "件名A",
        textBody: "本文A",
        idempotencyKey: "idem_draft_1",
      },
      inputBindings: {},
      approved: false,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("expected ok");
    expect(first.action.draftId).toBe("draft_1");
    expect(first.action.messageId).toBe("msg_draft_1");
    expect(first.awaitingApproval).toBe(false);

    const second = await googleGmailLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_draft",
      stepId: "step_gmail",
      configuration: {
        mode: "draft",
        to: "to@example.com",
        subject: "件名A",
        textBody: "本文A",
        idempotencyKey: "idem_draft_1",
      },
      inputBindings: {},
      approved: false,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("expected ok");
    expect(second.action.duplicatePrevented).toBe(true);
    expect(draftCreates).toBe(1);
    expect(getGmailAdapterMetrics().duplicatePreventedCount).toBeGreaterThan(0);
  });

  it("approval gate: draft without send, then send once after approve", async () => {
    connectedGoogle();
    let sendCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/users/me/drafts") && init?.method === "POST" && !url.includes("send")) {
        return new Response(
          JSON.stringify({
            id: "draft_appr",
            message: { id: "msg_appr_draft", threadId: "thread_appr" },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/users/me/drafts/draft_appr") && !url.includes("send")) {
        return new Response(
          JSON.stringify({
            id: "draft_appr",
            message: messageResource({
              id: "msg_appr_draft",
              threadId: "thread_appr",
              subject: "承認テスト",
              to: "to@example.com",
              body: "body",
            }),
          }),
          { status: 200 },
        );
      }
      if (url.includes("/users/me/messages/msg_appr_draft")) {
        return new Response(
          JSON.stringify(
            messageResource({
              id: "msg_appr_draft",
              threadId: "thread_appr",
              subject: "承認テスト",
              to: "to@example.com",
              body: "body",
            }),
          ),
          { status: 200 },
        );
      }
      if (url.includes("/users/me/drafts/send")) {
        sendCount += 1;
        return new Response(
          JSON.stringify({ id: "msg_sent_1", threadId: "thread_appr" }),
          { status: 200 },
        );
      }
      if (url.includes("/users/me/messages/msg_sent_1")) {
        return new Response(
          JSON.stringify(
            messageResource({
              id: "msg_sent_1",
              threadId: "thread_appr",
              subject: "承認テスト",
              to: "to@example.com",
              body: "body",
              labelIds: ["SENT"],
            }),
          ),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: { message: url } }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const waiting = await googleGmailLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_appr",
      stepId: "step_gmail",
      configuration: {
        mode: "send",
        to: "to@example.com",
        subject: "承認テスト",
        textBody: "body",
        approvalRequired: true,
        idempotencyKey: "idem_appr_1",
      },
      inputBindings: {},
      approved: false,
    });
    expect(waiting.ok).toBe(true);
    if (!waiting.ok) throw new Error("expected ok");
    expect(waiting.awaitingApproval).toBe(true);
    expect(waiting.action.draftId).toBe("draft_appr");
    expect(waiting.action.messageId).not.toBe("msg_sent_1");
    expect(sendCount).toBe(0);

    const sent = await googleGmailLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_appr",
      stepId: "step_gmail",
      configuration: {
        mode: "send",
        to: "to@example.com",
        subject: "承認テスト",
        textBody: "body",
        approvalRequired: true,
        idempotencyKey: "idem_appr_1",
      },
      inputBindings: {},
      approved: true,
      approvalId: "approval_1",
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) throw new Error("expected ok");
    expect(sent.awaitingApproval).toBe(false);
    expect(sent.action.messageId).toBe("msg_sent_1");
    expect(sendCount).toBe(1);

    const dup = await googleGmailLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_appr",
      stepId: "step_gmail",
      configuration: {
        mode: "send",
        to: "to@example.com",
        subject: "承認テスト",
        textBody: "body",
        approvalRequired: true,
        idempotencyKey: "idem_appr_1",
      },
      inputBindings: {},
      approved: true,
    });
    expect(dup.ok).toBe(true);
    if (!dup.ok) throw new Error("expected ok");
    expect(dup.action.duplicatePrevented).toBe(true);
    expect(sendCount).toBe(1);
  });

  it("rejects foreign artifact attachments", async () => {
    connectedGoogle();
    const stored = saveDeliverableFile(
      {
        fileName: "secret.docx",
        format: "docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: Buffer.from("secret"),
        isPlaceholder: false,
      },
      "other_user",
      { sourceContent: "x", baseFileName: "secret" },
    );

    const result = await googleGmailLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_att",
      stepId: "step_gmail",
      configuration: {
        mode: "draft",
        to: "to@example.com",
        subject: "att",
        textBody: "body",
        attachmentArtifactIds: [stored.id],
      },
      inputBindings: {},
      approved: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("gmail_attachment_failed");
    }
    expect(getGmailAdapterMetrics().attachmentFailureCount).toBeGreaterThan(0);
  });

  it("classifies retryable vs non-retryable errors", () => {
    expect(classifyGmailProviderError(new Error("429 rate limit")).retryable).toBe(
      true,
    );
    expect(
      classifyGmailProviderError(new Error("403 insufficient permissions"))
        .retryable,
    ).toBe(false);
    expect(
      classifyGmailProviderError(new Error("invalid recipient")).retryable,
    ).toBe(false);
  });

  it("maintains reply thread headers in MIME", () => {
    const raw = buildRfc822MimeMessage({
      to: ["to@example.com"],
      cc: [],
      bcc: [],
      subject: "Re: thread",
      textBody: "reply",
      htmlBody: null,
      attachments: [],
      inReplyTo: "<parent@mail>",
      references: "<root@mail> <parent@mail>",
    });
    expect(raw).toContain("In-Reply-To: <parent@mail>");
    expect(raw).toContain("References: <root@mail> <parent@mail>");
  });
});
