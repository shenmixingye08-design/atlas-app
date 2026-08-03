/**
 * Contract measurement: 10 draft + 10 send with mocked Gmail API.
 * Real Live E2E requires secrets (GOOGLE_GMAIL_LIVE_E2E=true).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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

const OWNER = "user_gmail_measure";

function encodeBody(text: string): string {
  return Buffer.from(text, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

describe("Gmail Live Adapter measurement (mocked provider)", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetGmailIdempotencyForTests();
    resetGmailLiveMetricsForTests();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-secret");
    vi.stubEnv(
      "ATLAS_GOOGLE_CREDENTIALS_ENCRYPTION_KEY",
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );

    const scope = [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.compose",
    ].join(" ");
    saveExternalServiceCredentials({
      userId: OWNER,
      serviceId: "google",
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
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
      account: { email: "owner@example.com", name: "O", pictureUrl: null },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("records 10 drafts and 10 sends with duplicate prevention", async () => {
    const sendCalls = new Map<string, number>();
    const draftCalls = new Map<string, number>();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/users/me/drafts") && init?.method === "POST" && !url.includes("send")) {
          const id = `draft_${draftCalls.size + 1}`;
          draftCalls.set(id, (draftCalls.get(id) ?? 0) + 1);
          return new Response(
            JSON.stringify({
              id,
              message: { id: `msg_${id}`, threadId: `thr_${id}` },
            }),
            { status: 200 },
          );
        }
        if (url.includes("/users/me/drafts/draft_")) {
          const draftId = url.match(/drafts\/(draft_[^?/]+)/)?.[1] ?? "draft_x";
          const subject = "measure";
          return new Response(
            JSON.stringify({
              id: draftId,
              message: {
                id: `msg_${draftId}`,
                threadId: `thr_${draftId}`,
                labelIds: ["DRAFT"],
                payload: {
                  mimeType: "text/plain",
                  headers: [
                    { name: "Subject", value: subject },
                    { name: "To", value: "to@example.com" },
                  ],
                  body: { data: encodeBody("body") },
                },
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes("/users/me/messages/send") && init?.method === "POST") {
          const id = `sent_${sendCalls.size + 1}`;
          sendCalls.set(id, (sendCalls.get(id) ?? 0) + 1);
          return new Response(
            JSON.stringify({ id, threadId: `thr_${id}` }),
            { status: 200 },
          );
        }
        if (url.includes("/users/me/messages/msg_") || url.includes("/users/me/messages/sent_")) {
          const messageId =
            url.match(/messages\/([^?/]+)/)?.[1] ?? "msg_unknown";
          return new Response(
            JSON.stringify({
              id: messageId,
              threadId: `thr_${messageId}`,
              labelIds: messageId.startsWith("sent_") ? ["SENT"] : ["DRAFT"],
              payload: {
                mimeType: "text/plain",
                headers: [
                  { name: "Subject", value: "measure" },
                  { name: "To", value: "to@example.com" },
                ],
                body: { data: encodeBody("body") },
              },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ error: { message: url } }), {
          status: 500,
        });
      }),
    );

    const draftResults = [];
    for (let i = 0; i < 10; i += 1) {
      const result = await googleGmailLiveAdapter.execute({
        ownerId: OWNER,
        runId: `run_d_${i}`,
        stepId: "step_d",
        configuration: {
          mode: "draft",
          to: "to@example.com",
          subject: "measure",
          textBody: "body",
          idempotencyKey: `draft_key_${i}`,
        },
        inputBindings: {},
        approved: false,
      });
      draftResults.push(result);
      // duplicate attempt
      const dup = await googleGmailLiveAdapter.execute({
        ownerId: OWNER,
        runId: `run_d_${i}`,
        stepId: "step_d",
        configuration: {
          mode: "draft",
          to: "to@example.com",
          subject: "measure",
          textBody: "body",
          idempotencyKey: `draft_key_${i}`,
        },
        inputBindings: {},
        approved: false,
      });
      expect(dup.ok).toBe(true);
      if (dup.ok) expect(dup.action.duplicatePrevented).toBe(true);
    }

    const sendResults = [];
    for (let i = 0; i < 10; i += 1) {
      const result = await googleGmailLiveAdapter.execute({
        ownerId: OWNER,
        runId: `run_s_${i}`,
        stepId: "step_s",
        configuration: {
          mode: "send",
          to: "to@example.com",
          subject: "measure",
          textBody: "body",
          approvalRequired: false,
          idempotencyKey: `send_key_${i}`,
        },
        inputBindings: {},
        approved: true,
      });
      sendResults.push(result);
      const dup = await googleGmailLiveAdapter.execute({
        ownerId: OWNER,
        runId: `run_s_${i}`,
        stepId: "step_s",
        configuration: {
          mode: "send",
          to: "to@example.com",
          subject: "measure",
          textBody: "body",
          approvalRequired: false,
          idempotencyKey: `send_key_${i}`,
        },
        inputBindings: {},
        approved: true,
      });
      expect(dup.ok).toBe(true);
      if (dup.ok) expect(dup.action.duplicatePrevented).toBe(true);
    }

    expect(draftResults.every((item) => item.ok)).toBe(true);
    expect(sendResults.every((item) => item.ok)).toBe(true);
    expect(draftCalls.size).toBe(10);
    expect(sendCalls.size).toBe(10);

    const metrics = getGmailAdapterMetrics();
    expect(metrics.draftCount).toBeGreaterThanOrEqual(10);
    expect(metrics.sendCount).toBeGreaterThanOrEqual(10);
    expect(metrics.duplicatePreventedCount).toBeGreaterThanOrEqual(20);
    expect(metrics.successRate).toBeGreaterThan(0.9);
  });
});
