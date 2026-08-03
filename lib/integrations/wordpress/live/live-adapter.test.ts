import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "memory"),
  loadDurableDomain: vi.fn(async () => null),
}));

import {
  resetExternalServiceStore,
  saveExternalServiceConnection,
} from "@/lib/integrations/external-services/store";
import { createDefaultConnection } from "@/lib/integrations/external-services/registry";
import { wordpressServiceDefinition } from "@/lib/integrations/wordpress/definition";
import {
  resetWordPressCredentialStore,
  saveWordPressCredentials,
} from "@/lib/integrations/wordpress/credential-store";
import { wordpressLiveAdapter } from "@/lib/integrations/wordpress/live/adapter";
import {
  getWordPressAdapterMetrics,
  resetWordPressLiveMetricsForTests,
} from "@/lib/integrations/wordpress/live/metrics";
import { resetWordPressIdempotencyForTests } from "@/lib/integrations/wordpress/live/idempotency";
import { classifyWordPressProviderError } from "@/lib/integrations/wordpress/live/retry";
import {
  decryptWordPressSecret,
  encryptWordPressSecret,
} from "@/lib/integrations/wordpress/crypto";
import { isLiveAdapterWired } from "@/lib/automation-platform/execution/production-step-registry";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";
import { isStepHighRisk } from "@/lib/automation-platform/execution/high-risk";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";

const OWNER = "user_wp_live_owner";
const SITE = "https://example.com";

function connectedWordPress() {
  saveWordPressCredentials({
    userId: OWNER,
    siteUrl: SITE,
    username: "editor",
    applicationPassword: "abcd efgh ijkl mnop qrst uvwx",
    updatedAt: new Date().toISOString(),
  });
  saveExternalServiceConnection(OWNER, {
    ...createDefaultConnection(wordpressServiceDefinition),
    status: "connected",
    connectedAt: new Date().toISOString(),
    lastUsedAt: null,
    scopes: [...wordpressServiceDefinition.plannedScopes],
    features: [...wordpressServiceDefinition.plannedFeatures],
    errorMessage: null,
    account: {
      email: SITE,
      name: "Editor",
      pictureUrl: null,
      username: "editor",
    },
  });
}

function wpStep(
  configuration: Record<string, unknown>,
): AutomationWorkflowStep {
  return {
    id: "step_wp",
    type: "wordpress",
    name: "WP",
    order: 1,
    inputBindings: {},
    configuration,
    requiresApproval: false,
    retryPolicy: { maxAttempts: 1, backoffMs: [] },
    timeoutMs: 60000,
    onSuccess: null,
    onFailure: null,
    enabled: true,
  };
}

describe("WordPress Production Live Adapter", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetWordPressCredentialStore();
    resetWordPressIdempotencyForTests();
    resetWordPressLiveMetricsForTests();
    vi.stubEnv(
      "ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY",
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("registers wordpress in Production registry", () => {
    expect(isLiveAdapterWired("wordpress")).toBe(true);
    expect(getCapability("wordpress")?.enabled).toBe(true);
  });

  it("encrypts WordPress secrets", () => {
    const cipher = encryptWordPressSecret("app-password-plain");
    expect(cipher).not.toContain("app-password-plain");
    expect(decryptWordPressSecret(cipher)).toBe("app-password-plain");
  });

  it("classifies auth errors as non-retryable", () => {
    const classified = classifyWordPressProviderError(
      new Error("WordPress認証に失敗しました 401"),
    );
    expect(classified.retryable).toBe(false);
    expect(classified.errorCode).toBe("wordpress_auth_failed");
  });

  it("draft is not high-risk; publish is", () => {
    expect(
      isStepHighRisk(
        wpStep({ publishMode: "draft", title: "t", content: "c" }),
      ),
    ).toBe(false);
    expect(
      isStepHighRisk(
        wpStep({ publishMode: "publish", title: "t", content: "c" }),
      ),
    ).toBe(true);
  });

  it("creates draft with provider re-fetch verification", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/posts") && init?.method === "POST" && !url.match(/\/posts\/\d+/)) {
          return new Response(
            JSON.stringify({
              id: 101,
              link: "https://example.com/?p=101",
              status: "draft",
              title: { rendered: "Draft Title" },
              content: { rendered: "Draft Body" },
            }),
            { status: 201 },
          );
        }
        if (url.match(/\/posts\/101/)) {
          return new Response(
            JSON.stringify({
              id: 101,
              link: "https://example.com/?p=101",
              status: "draft",
              title: { rendered: "Draft Title" },
              content: { rendered: "Draft Body" },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ code: "rest_no_route" }), {
          status: 404,
        });
      }),
    );

    connectedWordPress();
    const result = await wordpressLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_draft",
      stepId: "step_wp",
      configuration: {
        mode: "draft",
        title: "Draft Title",
        content: "Draft Body",
        idempotencyKey: "draft_key_1",
      },
      inputBindings: {},
      approved: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.awaitingApproval).toBe(false);
    expect(result.action.postId).toBe(101);
    expect(result.action.postStatus).toBe("draft");
    expect(result.action.link).toContain("example.com");
    expect(result.action.editLink).toContain("post.php?post=101");
    expect(result.action.adapterMode).toBe("production");
  });

  it("publish without approval creates draft only — zero publishes", async () => {
    let publishCount = 0;
    const postState = new Map<number, { status: string; title: string; content: string }>();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const body =
          typeof init?.body === "string" ? JSON.parse(init.body) : null;
        if (url.includes("/posts") && init?.method === "POST" && !url.match(/\/posts\/\d+/)) {
          if (body?.status === "publish") publishCount += 1;
          const id = 202;
          postState.set(id, {
            status: body?.status ?? "draft",
            title: body?.title ?? "Pub Title",
            content: body?.content ?? "Pub Body",
          });
          return new Response(
            JSON.stringify({
              id,
              link: "https://example.com/?p=202",
              status: body?.status ?? "draft",
              title: { rendered: body?.title ?? "Pub Title" },
              content: { rendered: body?.content ?? "Pub Body" },
            }),
            { status: 201 },
          );
        }
        const postMatch = url.match(/\/posts\/(\d+)/);
        if (postMatch) {
          const postId = Number.parseInt(postMatch[1]!, 10);
          const existing = postState.get(postId);
          if (init?.method === "POST" && body) {
            if (body.status === "publish") publishCount += 1;
            postState.set(postId, {
              status: body.status ?? existing?.status ?? "draft",
              title: body.title ?? existing?.title ?? "Pub Title",
              content: body.content ?? existing?.content ?? "Pub Body",
            });
          }
          const state = postState.get(postId) ?? {
            status: "draft",
            title: "Pub Title",
            content: "Pub Body",
          };
          return new Response(
            JSON.stringify({
              id: postId,
              link: `https://example.com/?p=${postId}`,
              status: state.status,
              title: { rendered: state.title },
              content: { rendered: state.content },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ code: "rest_no_route" }), {
          status: 404,
        });
      }),
    );

    connectedWordPress();
    const waiting = await wordpressLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_pub",
      stepId: "step_wp",
      configuration: {
        publishMode: "publish",
        title: "Pub Title",
        content: "Pub Body",
        idempotencyKey: "pub_key_1",
      },
      inputBindings: {},
      approved: false,
    });

    expect(waiting.ok).toBe(true);
    if (!waiting.ok) throw new Error("expected ok");
    expect(waiting.awaitingApproval).toBe(true);
    expect(waiting.action.postStatus).toBe("draft");
    expect(publishCount).toBe(0);

    const sent = await wordpressLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_pub",
      stepId: "step_wp",
      configuration: {
        publishMode: "publish",
        title: "Pub Title",
        content: "Pub Body",
        idempotencyKey: "pub_key_1",
      },
      inputBindings: {},
      approved: true,
      approvalId: "approval_1",
    });

    expect(sent.ok).toBe(true);
    if (!sent.ok) throw new Error("expected ok");
    expect(sent.action.postStatus).toBe("publish");
    expect(publishCount).toBe(1);
  });

  it("prevents duplicate draft execution via idempotency", async () => {
    let createCount = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/posts") && init?.method === "POST" && !url.match(/\/posts\/\d+/)) {
          createCount += 1;
          return new Response(
            JSON.stringify({
              id: 303,
              link: "https://example.com/?p=303",
              status: "draft",
              title: { rendered: "Dup" },
              content: { rendered: "Body" },
            }),
            { status: 201 },
          );
        }
        if (url.match(/\/posts\/303/)) {
          return new Response(
            JSON.stringify({
              id: 303,
              link: "https://example.com/?p=303",
              status: "draft",
              title: { rendered: "Dup" },
              content: { rendered: "Body" },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ code: "rest_no_route" }), {
          status: 404,
        });
      }),
    );

    connectedWordPress();
    const first = await wordpressLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_dup",
      stepId: "step_wp",
      configuration: {
        mode: "draft",
        title: "Dup",
        content: "Body",
        idempotencyKey: "dup_key",
      },
      inputBindings: {},
      approved: false,
    });
    expect(first.ok).toBe(true);

    const second = await wordpressLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_dup",
      stepId: "step_wp",
      configuration: {
        mode: "draft",
        title: "Dup",
        content: "Body",
        idempotencyKey: "dup_key",
      },
      inputBindings: {},
      approved: false,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("expected ok");
    expect(second.action.duplicatePrevented).toBe(true);
    expect(createCount).toBe(1);

    const metrics = getWordPressAdapterMetrics();
    expect(metrics.duplicatePreventedCount).toBeGreaterThanOrEqual(1);
  });
});
