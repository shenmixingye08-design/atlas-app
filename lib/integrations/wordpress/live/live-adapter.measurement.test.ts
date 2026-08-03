/**
 * Contract measurement: 10 draft + 5 publish + 5 update with mocked WordPress API.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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

const OWNER = "user_wp_measure";
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

describe("WordPress Live Adapter measurement (mocked provider)", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetWordPressCredentialStore();
    resetWordPressIdempotencyForTests();
    resetWordPressLiveMetricsForTests();
    vi.stubEnv(
      "ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY",
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
    connectedWordPress();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("records 10 drafts, 5 publishes, 5 updates with duplicate prevention", async () => {
    const draftCreates = new Map<number, number>();
    const publishUpdates = new Map<number, number>();
    const updateCalls = new Map<number, number>();
    const postState = new Map<
      number,
      { status: string; title: string; content: string }
    >();
    let nextId = 1;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const body =
          typeof init?.body === "string" ? JSON.parse(init.body) : null;

        if (url.includes("/posts") && init?.method === "POST" && !url.match(/\/posts\/\d+/)) {
          const id = nextId;
          nextId += 1;
          draftCreates.set(id, (draftCreates.get(id) ?? 0) + 1);
          const title = typeof body?.title === "string" ? body.title : "measure";
          const content =
            typeof body?.content === "string" ? body.content : "body";
          postState.set(id, {
            status: body?.status ?? "draft",
            title,
            content,
          });
          return new Response(
            JSON.stringify({
              id,
              link: `https://example.com/?p=${id}`,
              status: body?.status ?? "draft",
              title: { rendered: title },
              content: { rendered: content },
            }),
            { status: 201 },
          );
        }

        const postMatch = url.match(/\/posts\/(\d+)/);
        if (postMatch) {
          const postId = Number.parseInt(postMatch[1]!, 10);
          const existing = postState.get(postId);
          if (init?.method === "POST" && body) {
            const title =
              typeof body.title === "string"
                ? body.title
                : existing?.title ?? "measure";
            const content =
              typeof body.content === "string"
                ? body.content
                : existing?.content ?? "body";
            if (body.status === "publish") {
              publishUpdates.set(
                postId,
                (publishUpdates.get(postId) ?? 0) + 1,
              );
            } else {
              updateCalls.set(postId, (updateCalls.get(postId) ?? 0) + 1);
            }
            postState.set(postId, {
              status: body.status ?? existing?.status ?? "draft",
              title,
              content,
            });
          }
          const state = postState.get(postId) ?? {
            status: "draft",
            title: "measure",
            content: "body",
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

    const draftResults = [];
    for (let i = 0; i < 10; i += 1) {
      const result = await wordpressLiveAdapter.execute({
        ownerId: OWNER,
        runId: `run_d_${i}`,
        stepId: "step_d",
        configuration: {
          mode: "draft",
          title: "measure",
          content: "body",
          idempotencyKey: `draft_key_${i}`,
        },
        inputBindings: {},
        approved: false,
      });
      draftResults.push(result);
      const dup = await wordpressLiveAdapter.execute({
        ownerId: OWNER,
        runId: `run_d_${i}`,
        stepId: "step_d",
        configuration: {
          mode: "draft",
          title: "measure",
          content: "body",
          idempotencyKey: `draft_key_${i}`,
        },
        inputBindings: {},
        approved: false,
      });
      expect(dup.ok).toBe(true);
      if (dup.ok) expect(dup.action.duplicatePrevented).toBe(true);
    }

    const publishResults = [];
    for (let i = 0; i < 5; i += 1) {
      const waiting = await wordpressLiveAdapter.execute({
        ownerId: OWNER,
        runId: `run_p_${i}`,
        stepId: "step_p",
        configuration: {
          publishMode: "publish",
          title: "measure",
          content: "body",
          idempotencyKey: `publish_key_${i}`,
        },
        inputBindings: {},
        approved: false,
      });
      expect(waiting.ok).toBe(true);
      if (waiting.ok) expect(waiting.awaitingApproval).toBe(true);

      const result = await wordpressLiveAdapter.execute({
        ownerId: OWNER,
        runId: `run_p_${i}`,
        stepId: "step_p",
        configuration: {
          publishMode: "publish",
          title: "measure",
          content: "body",
          idempotencyKey: `publish_key_${i}`,
        },
        inputBindings: {},
        approved: true,
      });
      publishResults.push(result);

      const dup = await wordpressLiveAdapter.execute({
        ownerId: OWNER,
        runId: `run_p_${i}`,
        stepId: "step_p",
        configuration: {
          publishMode: "publish",
          title: "measure",
          content: "body",
          idempotencyKey: `publish_key_${i}`,
        },
        inputBindings: {},
        approved: true,
      });
      expect(dup.ok).toBe(true);
      if (dup.ok) expect(dup.action.duplicatePrevented).toBe(true);
    }

    const updateResults = [];
    for (let i = 0; i < 5; i += 1) {
      const create = await wordpressLiveAdapter.execute({
        ownerId: OWNER,
        runId: `run_u_seed_${i}`,
        stepId: "step_u",
        configuration: {
          mode: "draft",
          title: "measure",
          content: "body",
          idempotencyKey: `update_seed_${i}`,
        },
        inputBindings: {},
        approved: false,
      });
      expect(create.ok).toBe(true);
      if (!create.ok) throw new Error("seed failed");
      const postId = create.action.postId;

      const result = await wordpressLiveAdapter.execute({
        ownerId: OWNER,
        runId: `run_u_${i}`,
        stepId: "step_u",
        configuration: {
          mode: "update",
          postId,
          title: "measure updated",
          content: "body updated",
          idempotencyKey: `update_key_${i}`,
        },
        inputBindings: {},
        approved: false,
      });
      updateResults.push(result);

      const dup = await wordpressLiveAdapter.execute({
        ownerId: OWNER,
        runId: `run_u_${i}`,
        stepId: "step_u",
        configuration: {
          mode: "update",
          postId,
          title: "measure updated",
          content: "body updated",
          idempotencyKey: `update_key_${i}`,
        },
        inputBindings: {},
        approved: false,
      });
      expect(dup.ok).toBe(true);
      if (dup.ok) expect(dup.action.duplicatePrevented).toBe(true);
    }

    expect(draftResults.every((item) => item.ok)).toBe(true);
    expect(publishResults.every((item) => item.ok)).toBe(true);
    expect(updateResults.every((item) => item.ok)).toBe(true);
    expect(draftCreates.size).toBe(20);
    expect(publishUpdates.size).toBe(5);
    expect(updateCalls.size).toBe(5);

    const metrics = getWordPressAdapterMetrics();
    expect(metrics.draftCount).toBeGreaterThanOrEqual(10);
    expect(metrics.publishCount).toBeGreaterThanOrEqual(5);
    expect(metrics.updateCount).toBeGreaterThanOrEqual(5);
    expect(metrics.duplicatePreventedCount).toBeGreaterThanOrEqual(20);
    expect(metrics.successRate).toBeGreaterThan(0.9);
  });
});
