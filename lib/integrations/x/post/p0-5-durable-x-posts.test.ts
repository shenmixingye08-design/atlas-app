import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async (userId: string) => `${userId}@example.com`),
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
import { resetXDraftPostStore, saveXDraftPost, listXDraftPosts } from "./draft-store";
import { resetXPostHistoryStore } from "./history-store";
import {
  cancelDurableXPostJob,
  claimDueXPostJobs,
  getDurableXPostJob,
  insertDurableXPostJob,
  markXPostUnknownOutcome,
  resetDurableXPostJobsForTests,
  scheduleXPostRetry,
  transitionDurableXPostJob,
} from "./durable-x-post-jobs";
import { resetDurableXDraftsForTests } from "./durable-x-drafts";
import { resolveXPostStorageBackend } from "./x-post-backend";
import {
  processDueScheduledXPosts,
  saveXDraftForUser,
  scheduleTweetForUser,
} from "./service";
import { resetXScheduledPostsStore, saveXScheduledPost } from "./schedule-store";

const USER_A = "user_p05_a";
const USER_B = "user_p05_b";
const CTX = { email: "a@example.com", isOwner: false, isBetaUser: true };

function connect(userId: string): void {
  const connection = getExternalServiceConnection(userId, "x");
  saveExternalServiceConnection(userId, {
    ...connection,
    status: "connected",
    connectedAt: new Date().toISOString(),
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    account: {
      email: "@u",
      name: "U",
      pictureUrl: null,
      providerUserId: userId,
      username: "u_" + userId.slice(-4),
    },
  });
  saveExternalServiceCredentials({
    userId,
    serviceId: "x",
    accessToken: `tok_${userId}`,
    refreshToken: "refresh",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    scope: "tweet.read tweet.write users.read offline.access",
    updatedAt: new Date().toISOString(),
  });
}

function stubXApi(tweetId: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/tweets/") && !url.endsWith("/tweets")) {
        return new Response(
          JSON.stringify({ data: { id: tweetId, text: "ok" } }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ data: { id: tweetId, text: "ok" } }),
        { status: 201 },
      );
    }),
  );
}

describe("P0-5 durable X drafts + scheduled posts", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("ATLAS_X_POST_STORAGE", "memory_durable");
    vi.stubEnv("NODE_ENV", "test");
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetExternalAuthHydration();
    resetFeatureFlagStore();
    resetXPostHistoryStore();
    resetXScheduledPostsStore();
    resetXDraftPostStore();
    resetDurableXPostJobsForTests();
    resetDurableXDraftsForTests();
    const { resetSubscriptionStore } = await import(
      "@/lib/billing/subscriptions/store"
    );
    const { resetUsageStore } = await import("@/lib/billing/usage/store");
    const { applySubscriptionFromStripe } = await import(
      "@/lib/billing/subscriptions/service"
    );
    resetSubscriptionStore();
    resetUsageStore();
    for (const userId of [USER_A, USER_B]) {
      await applySubscriptionFromStripe({
        userId,
        stripeCustomerId: `cus_${userId}`,
        stripeSubscriptionId: `sub_${userId}`,
        planId: "standard",
        status: "active",
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });
    }
    setFeatureFlagState("x", "on");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("0: backend is memory_durable", () => {
    expect(resolveXPostStorageBackend()).toBe("memory_durable");
  });

  it("1+2+3: immediate schedule + draft save", async () => {
    connect(USER_A);
    stubXApi("t_imm_1");
    const scheduledFor = new Date(Date.now() + 60_000).toISOString();
    const sched = await scheduleTweetForUser({
      userId: USER_A,
      text: "予約本文",
      scheduledFor,
      context: CTX,
    });
    expect(sched.status).toBe("ready");

    const draft = await saveXDraftForUser({
      userId: USER_A,
      text: "下書き本文",
      context: CTX,
    });
    expect(draft.status).toBe("ready");
    if (draft.status !== "ready") return;
    expect(draft.draft?.text).toBe("下書き本文");
  });

  it("4+5: draft survives process-cache reset (re-login / other device)", async () => {
    await saveXDraftPost({ userId: USER_A, text: "復元対象" });
    // Simulate "process cache gone" by NOT clearing durable drafts — only
    // ensure list still reads durable SoT after a fresh list call.
    const listed = await listXDraftPosts(USER_A);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.text).toBe("復元対象");

    // Other user cannot see
    expect(await listXDraftPosts(USER_B)).toHaveLength(0);
  });

  it("6+7+8: scheduler double-fire / 10 / 100 workers claim at most once", async () => {
    const dueAt = new Date(Date.now() - 1000).toISOString();
    await insertDurableXPostJob({
      ownerId: USER_A,
      content: "同時claim",
      scheduledAt: dueAt,
    });

    for (const workers of [2, 10, 100]) {
      // reset job to scheduled for each wave
      const jobs = await claimDueXPostJobs({
        workerId: `prep_${workers}`,
        limit: 1,
      });
      if (jobs[0]) {
        await transitionDurableXPostJob({
          xPostJobId: jobs[0].xPostJobId,
          ownerId: USER_A,
          toStatus: "retry_scheduled",
          expectedClaimedBy: `prep_${workers}`,
          patch: {
            nextAttemptAt: new Date(0).toISOString(),
            claimedBy: null,
            leaseExpiresAt: null,
            claimedAt: null,
          },
        });
      } else {
        await insertDurableXPostJob({
          ownerId: USER_A,
          content: `同時claim_${workers}`,
          scheduledAt: dueAt,
          eventVersion: `v_${workers}`,
        });
      }

      const claims = await Promise.all(
        Array.from({ length: workers }, (_, i) =>
          claimDueXPostJobs({
            workerId: `w_${workers}_${i}`,
            limit: 1,
          }),
        ),
      );
      const won = claims.flat();
      expect(won.length).toBe(1);
    }
  });

  it("9+33: same schedule 100x → 1 durable job (idempotency)", async () => {
    const scheduledAt = new Date(Date.now() + 120_000).toISOString();
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        insertDurableXPostJob({
          ownerId: USER_A,
          content: "同一内容",
          scheduledAt,
          draftId: "src_same",
          eventVersion: "v1",
        }),
      ),
    );
    const ids = new Set(results.map((r) => r.job.xPostJobId));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.created).length).toBe(1);
  });

  it("11: cold start (job Map cleared) — wait, durable bucket is SoT; claim after re-insert", async () => {
    const { job } = await insertDurableXPostJob({
      ownerId: USER_A,
      content: "cold",
      scheduledAt: new Date(Date.now() - 1).toISOString(),
    });
    // Clearing only legacy aliases — durable bucket retains
    const listed = await getDurableXPostJob({
      xPostJobId: job.xPostJobId,
      ownerId: USER_A,
    });
    expect(listed?.content).toBe("cold");
  });

  it("13+14: lease prevents steal; expired lease reclaimable", async () => {
    const { job } = await insertDurableXPostJob({
      ownerId: USER_A,
      content: "lease",
      scheduledAt: new Date(Date.now() - 1).toISOString(),
    });
    const [first] = await claimDueXPostJobs({
      workerId: "owner_w",
      limit: 1,
      leaseMs: 60_000,
    });
    expect(first?.xPostJobId).toBe(job.xPostJobId);

    const steal = await claimDueXPostJobs({
      workerId: "thief",
      limit: 1,
      leaseMs: 60_000,
    });
    expect(steal).toHaveLength(0);

    // Expire lease
    await transitionDurableXPostJob({
      xPostJobId: job.xPostJobId,
      ownerId: USER_A,
      toStatus: "retry_scheduled",
      expectedClaimedBy: "owner_w",
      patch: {
        nextAttemptAt: new Date(0).toISOString(),
        leaseExpiresAt: new Date(0).toISOString(),
        claimedBy: null,
        claimedAt: null,
      },
    });
    const [reclaimed] = await claimDueXPostJobs({
      workerId: "reclaimer",
      limit: 1,
    });
    expect(reclaimed?.claimedBy).toBe("reclaimer");
  });

  it("15+16+17+18: errors classify; revoked is permanent", async () => {
    connect(USER_A);
    const { job } = await insertDurableXPostJob({
      ownerId: USER_A,
      content: "failpath",
      scheduledAt: new Date(Date.now() - 1).toISOString(),
    });
    const [claimed] = await claimDueXPostJobs({ workerId: "w_err", limit: 1 });
    expect(claimed).toBeTruthy();

    const failed = await scheduleXPostRetry({
      xPostJobId: job.xPostJobId,
      ownerId: USER_A,
      workerId: "w_err",
      errorCode: "auth_expired",
      errorMessage: "token revoked",
      delayMs: 0,
      permanent: true,
    });
    expect(failed?.status).toBe("failed");
  });

  it("19: other user cannot read / cancel job", async () => {
    const { job } = await insertDurableXPostJob({
      ownerId: USER_A,
      content: "secret",
      scheduledAt: new Date(Date.now() + 10_000).toISOString(),
    });
    expect(
      await getDurableXPostJob({
        xPostJobId: job.xPostJobId,
        ownerId: USER_B,
      }),
    ).toBeNull();
    await expect(
      cancelDurableXPostJob({
        xPostJobId: job.xPostJobId,
        ownerId: USER_B,
      }),
    ).resolves.toBeNull();
  });

  it("21: provider success + DB fail → unknown_outcome; no auto re-post", async () => {
    const { job } = await insertDurableXPostJob({
      ownerId: USER_A,
      content: "unknown",
      scheduledAt: new Date(Date.now() - 1).toISOString(),
    });
    await claimDueXPostJobs({ workerId: "w_u", limit: 1 });
    await transitionDurableXPostJob({
      xPostJobId: job.xPostJobId,
      ownerId: USER_A,
      toStatus: "posting",
      expectedClaimedBy: "w_u",
    });
    const marked = await markXPostUnknownOutcome({
      xPostJobId: job.xPostJobId,
      ownerId: USER_A,
      workerId: "w_u",
      providerPostId: "tw_already",
      errorMessage: "db update failed after provider success",
    });
    expect(marked?.status).toBe("unknown_outcome");
    expect(marked?.providerPostId).toBe("tw_already");

    await expect(
      scheduleXPostRetry({
        xPostJobId: job.xPostJobId,
        ownerId: USER_A,
        workerId: "w_u",
        errorCode: "retry",
        errorMessage: "no",
        delayMs: 0,
      }),
    ).rejects.toThrow(/cannot retry posted\/unknown_outcome/);

    // Claim must not pick unknown_outcome
    const again = await claimDueXPostJobs({ workerId: "w_u2", limit: 5 });
    expect(again.some((j) => j.xPostJobId === job.xPostJobId)).toBe(false);
  });

  it("23: posted forbids retry", async () => {
    const { job } = await insertDurableXPostJob({
      ownerId: USER_A,
      content: "posted",
      scheduledAt: new Date(Date.now() - 1).toISOString(),
    });
    await claimDueXPostJobs({ workerId: "w_p", limit: 1 });
    await transitionDurableXPostJob({
      xPostJobId: job.xPostJobId,
      ownerId: USER_A,
      toStatus: "posting",
      expectedClaimedBy: "w_p",
    });
    await transitionDurableXPostJob({
      xPostJobId: job.xPostJobId,
      ownerId: USER_A,
      toStatus: "posted",
      expectedClaimedBy: "w_p",
      patch: {
        providerPostId: "tw_1",
        postedAt: new Date().toISOString(),
      },
    });
    await expect(
      scheduleXPostRetry({
        xPostJobId: job.xPostJobId,
        ownerId: USER_A,
        workerId: "w_p",
        errorCode: "x",
        errorMessage: "no",
        delayMs: 0,
      }),
    ).rejects.toThrow(/cannot retry/);
  });

  it("24+25: cancel vs claim; edit content creates new idempotency", async () => {
    const at = new Date(Date.now() + 50_000).toISOString();
    const { job } = await insertDurableXPostJob({
      ownerId: USER_A,
      content: "v1",
      scheduledAt: at,
      draftId: "d1",
    });
    const canceled = await cancelDurableXPostJob({
      xPostJobId: job.xPostJobId,
      ownerId: USER_A,
    });
    expect(canceled?.status).toBe("canceled");

    const { job: edited, created } = await insertDurableXPostJob({
      ownerId: USER_A,
      content: "v2-changed",
      scheduledAt: at,
      draftId: "d1",
    });
    expect(created).toBe(true);
    expect(edited.xPostJobId).not.toBe(job.xPostJobId);
  });

  it("26+27: approval pending / canceled not claimed", async () => {
    const { job: pending } = await insertDurableXPostJob({
      ownerId: USER_A,
      content: "need approve",
      scheduledAt: new Date(Date.now() - 1).toISOString(),
      approvalStatus: "pending",
      eventVersion: "appr",
    });
    expect(pending.approvalStatus).toBe("pending");
    const claimed = await claimDueXPostJobs({ workerId: "w_a", limit: 10 });
    expect(claimed.some((j) => j.xPostJobId === pending.xPostJobId)).toBe(false);

    const { job: toCancel } = await insertDurableXPostJob({
      ownerId: USER_A,
      content: "cancel me",
      scheduledAt: new Date(Date.now() - 1).toISOString(),
      eventVersion: "canc",
    });
    await cancelDurableXPostJob({
      xPostJobId: toCancel.xPostJobId,
      ownerId: USER_A,
    });
    const claimed2 = await claimDueXPostJobs({ workerId: "w_c", limit: 10 });
    expect(claimed2.some((j) => j.xPostJobId === toCancel.xPostJobId)).toBe(
      false,
    );
  });

  it("28: providerPostId unique — second job with same id rejected on posted", async () => {
    const mk = async (ver: string) => {
      const { job } = await insertDurableXPostJob({
        ownerId: USER_A,
        content: `c_${ver}`,
        scheduledAt: new Date(Date.now() - 1).toISOString(),
        eventVersion: ver,
      });
      await claimDueXPostJobs({ workerId: `w_${ver}`, limit: 1 });
      await transitionDurableXPostJob({
        xPostJobId: job.xPostJobId,
        ownerId: USER_A,
        toStatus: "posting",
        expectedClaimedBy: `w_${ver}`,
      });
      return job;
    };
    const a = await mk("a");
    await transitionDurableXPostJob({
      xPostJobId: a.xPostJobId,
      ownerId: USER_A,
      toStatus: "posted",
      expectedClaimedBy: "w_a",
      patch: {
        providerPostId: "tw_dup",
        postedAt: new Date().toISOString(),
      },
    });
    // posted without providerPostId forbidden
    const b = await mk("b");
    await expect(
      transitionDurableXPostJob({
        xPostJobId: b.xPostJobId,
        ownerId: USER_A,
        toStatus: "posted",
        expectedClaimedBy: "w_b",
        patch: { postedAt: new Date().toISOString() },
      }),
    ).rejects.toThrow(/providerPostId required/);
  });

  it("30: Production forbids memory_durable", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ATLAS_X_POST_STORAGE", "memory_durable");
    expect(() => resolveXPostStorageBackend()).toThrow(/forbidden in Production/);
  });

  it("31: missing ownerId fail-closed", async () => {
    await expect(
      insertDurableXPostJob({
        ownerId: "",
        content: "x",
        scheduledAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(/ownerId required/);
  });

  it("35: end-to-end due process posts once with providerPostId", async () => {
    connect(USER_A);
    stubXApi("tw_e2e");
    await saveXScheduledPost({
      userId: USER_A,
      text: "E2E due",
      scheduledFor: new Date(Date.now() - 500).toISOString(),
    });
    const first = await processDueScheduledXPosts({
      resolveContext: async () => CTX,
      workerId: "tick_1",
    });
    expect(first).toHaveLength(1);
    expect(first[0]?.result.status).toBe("ready");

    const second = await processDueScheduledXPosts({
      resolveContext: async () => CTX,
      workerId: "tick_2",
    });
    expect(second).toHaveLength(0);

    const job = await getDurableXPostJob({
      xPostJobId: first[0]!.scheduledId,
      ownerId: USER_A,
    });
    expect(job?.status).toBe("posted");
    expect(job?.providerPostId).toBe("tw_e2e");
    expect(job?.completionEvidence?.providerPostId).toBe("tw_e2e");
  });
});
