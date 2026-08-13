import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildSideEffectIdempotencyKey,
  executeIdempotentSideEffect,
  forceSideEffectProcessingForTests,
  getSideEffectClaimByKeyForUser,
  resetSideEffectStoreForTests,
  SideEffectFailClosedError,
  SideEffectLostRaceError,
} from "@/lib/side-effects";

describe("P1-04 side-effect idempotency", () => {
  beforeEach(() => {
    resetSideEffectStoreForTests();
  });

  it("A: concurrent workers → single side effect", async () => {
    let calls = 0;
    const ctx = {
      userId: "user_a",
      provider: "x" as const,
      actionType: "post" as const,
      destination: "@atlas",
      automationId: "auto_1",
      runId: "run_1",
      occurrenceKey: "occ_1",
      discriminator: "hello",
    };
    const action = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return {
        providerResourceId: `tw_${calls}`,
        result: { tweetId: `tw_${calls}` },
      };
    };
    const [a, b] = await Promise.allSettled([
      executeIdempotentSideEffect(ctx, action, { leaseOwner: "w1" }),
      executeIdempotentSideEffect(ctx, action, { leaseOwner: "w2" }),
    ]);
    const fulfilled = [a, b].filter((r) => r.status === "fulfilled");
    const rejected = [a, b].filter((r) => r.status === "rejected");
    expect(calls).toBe(1);
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    // Loser is either LostRace (still processing) or reuse after winner success.
    for (const row of rejected) {
      if (row.status === "rejected") {
        expect(row.reason).toBeInstanceOf(SideEffectLostRaceError);
      }
    }
    const executedCount = fulfilled.filter(
      (row) => row.status === "fulfilled" && row.value.executed,
    ).length;
    expect(executedCount).toBe(1);
    // Retry after winner succeeded → reuse, no second call
    const reused = await executeIdempotentSideEffect(ctx, action, {
      leaseOwner: "w3",
    });
    expect(reused.reused).toBe(true);
    expect(reused.executed).toBe(false);
    expect(calls).toBe(1);
  });

  it("B: crash-after-success (stale processing, no resource id) → no re-exec", async () => {
    let calls = 0;
    const ctx = {
      userId: "user_a",
      provider: "gmail" as const,
      actionType: "send" as const,
      destination: "a@example.com",
      automationId: "auto_1",
      runId: "run_b",
      occurrenceKey: "occ_b",
    };
    const first = await executeIdempotentSideEffect(ctx, async () => {
      calls += 1;
      return { providerResourceId: "msg_1", result: { id: "msg_1" } };
    });
    // Simulate crash after provider success but before durable success write:
    // force processing without resource id (ambiguous).
    await forceSideEffectProcessingForTests({
      claimId: first.claim.id,
      userId: "user_a",
      providerResourceId: null,
      leaseExpiredMsAgo: 120_000,
    });
    await expect(
      executeIdempotentSideEffect(ctx, async () => {
        calls += 1;
        return { providerResourceId: "msg_2", result: { id: "msg_2" } };
      }),
    ).rejects.toBeInstanceOf(SideEffectFailClosedError);
    expect(calls).toBe(1);
    const claim = await getSideEffectClaimByKeyForUser(
      "user_a",
      buildSideEffectIdempotencyKey(ctx),
    );
    expect(claim?.status).toBe("unknown_outcome");
  });

  it("C: timeout after send → unknown_outcome, retry does not re-send", async () => {
    let calls = 0;
    const ctx = {
      userId: "user_a",
      provider: "gmail" as const,
      actionType: "send" as const,
      destination: "b@example.com",
      runId: "run_c",
      occurrenceKey: "occ_c",
    };
    await expect(
      executeIdempotentSideEffect(ctx, async () => {
        calls += 1;
        throw new Error("TimeoutError: upstream timed out");
      }),
    ).rejects.toBeInstanceOf(SideEffectFailClosedError);
    expect(calls).toBe(1);
    await expect(
      executeIdempotentSideEffect(ctx, async () => {
        calls += 1;
        return { providerResourceId: "x", result: { id: "x" } };
      }),
    ).rejects.toBeInstanceOf(SideEffectFailClosedError);
    expect(calls).toBe(1);
  });

  it("D: 429 retry → failed then retry succeeds once", async () => {
    let calls = 0;
    const ctx = {
      userId: "user_a",
      provider: "x" as const,
      actionType: "post" as const,
      destination: "x",
      runId: "run_d",
      occurrenceKey: "occ_d",
    };
    await expect(
      executeIdempotentSideEffect(ctx, async () => {
        calls += 1;
        throw new Error("HTTP 429 rate limited");
      }),
    ).rejects.toThrow(/429/);
    expect(calls).toBe(1);
    const second = await executeIdempotentSideEffect(ctx, async () => {
      calls += 1;
      return { providerResourceId: "tw_ok", result: { id: "tw_ok" } };
    });
    expect(second.executed).toBe(true);
    expect(calls).toBe(2);
    const third = await executeIdempotentSideEffect(ctx, async () => {
      calls += 1;
      return { providerResourceId: "tw_dup", result: { id: "tw_dup" } };
    });
    expect(third.reused).toBe(true);
    expect(calls).toBe(2);
  });

  it("E: 500 retry → failed then single success", async () => {
    let calls = 0;
    const ctx = {
      userId: "user_a",
      provider: "wordpress" as const,
      actionType: "publish" as const,
      destination: "https://example.com",
      runId: "run_e",
      occurrenceKey: "occ_e",
    };
    await expect(
      executeIdempotentSideEffect(ctx, async () => {
        calls += 1;
        throw new Error("HTTP 500 server error");
      }),
    ).rejects.toThrow(/500/);
    const ok = await executeIdempotentSideEffect(ctx, async () => {
      calls += 1;
      return { providerResourceId: "wp_1", result: { id: 1 } };
    });
    expect(ok.executed).toBe(true);
    expect(calls).toBe(2);
  });

  it("F: stale processing reclaim without evidence → fail-closed", async () => {
    const ctx = {
      userId: "user_a",
      provider: "dropbox" as const,
      actionType: "upload" as const,
      destination: "/Atlas/a.pdf",
      runId: "run_f",
      occurrenceKey: "occ_f",
    };
    const ensured = await executeIdempotentSideEffect(ctx, async () => ({
      providerResourceId: "dbx_1",
      result: { id: "dbx_1" },
    }));
    await forceSideEffectProcessingForTests({
      claimId: ensured.claim.id,
      userId: "user_a",
      providerResourceId: null,
      leaseExpiredMsAgo: 90_000,
    });
    let calls = 0;
    await expect(
      executeIdempotentSideEffect(ctx, async () => {
        calls += 1;
        return { providerResourceId: "dbx_2", result: { id: "dbx_2" } };
      }),
    ).rejects.toBeInstanceOf(SideEffectFailClosedError);
    expect(calls).toBe(0);
  });

  it("G: same occurrence re-enqueue → no duplicate side effect", async () => {
    let calls = 0;
    const ctx = {
      userId: "user_a",
      provider: "google_calendar" as const,
      actionType: "create_event" as const,
      destination: "primary",
      automationId: "auto_g",
      runId: "run_g",
      occurrenceKey: "auto_g:2026-08-01T09:00:00.000Z",
      discriminator: "Meeting",
    };
    await executeIdempotentSideEffect(ctx, async () => {
      calls += 1;
      return { providerResourceId: "ev_1", result: { id: "ev_1" } };
    });
    await executeIdempotentSideEffect(ctx, async () => {
      calls += 1;
      return { providerResourceId: "ev_2", result: { id: "ev_2" } };
    });
    expect(calls).toBe(1);
  });

  it("H: cross-user isolation — same payload does not interfere", async () => {
    let aCalls = 0;
    let bCalls = 0;
    const base = {
      provider: "notification" as const,
      actionType: "notify" as const,
      destination: "in_app",
      automationId: "auto_h",
      runId: "run_shared_shape",
      occurrenceKey: "occ_shared_shape",
    };
    await executeIdempotentSideEffect(
      { ...base, userId: "user_a" },
      async () => {
        aCalls += 1;
        return { providerResourceId: "n_a", result: { id: "n_a" } };
      },
    );
    await executeIdempotentSideEffect(
      { ...base, userId: "user_b" },
      async () => {
        bCalls += 1;
        return { providerResourceId: "n_b", result: { id: "n_b" } };
      },
    );
    expect(aCalls).toBe(1);
    expect(bCalls).toBe(1);
    const keyA = buildSideEffectIdempotencyKey({ ...base, userId: "user_a" });
    const keyB = buildSideEffectIdempotencyKey({ ...base, userId: "user_b" });
    expect(keyA).not.toBe(keyB);
    expect(await getSideEffectClaimByKeyForUser("user_a", keyB)).toBeNull();
    expect(await getSideEffectClaimByKeyForUser("user_b", keyA)).toBeNull();
  });

  it("I: provider response unknown → unknown_outcome fail-closed", async () => {
    const ctx = {
      userId: "user_a",
      provider: "x" as const,
      actionType: "post" as const,
      destination: "x",
      runId: "run_i",
      occurrenceKey: "occ_i",
    };
    await expect(
      executeIdempotentSideEffect(ctx, async () => {
        throw new Error("network fetch failed ECONNRESET");
      }),
    ).rejects.toMatchObject({ code: "side_effect_unknown_outcome" });
    const claim = await getSideEffectClaimByKeyForUser(
      "user_a",
      buildSideEffectIdempotencyKey(ctx),
    );
    expect(claim?.status).toBe("unknown_outcome");
  });

  it("J: notify/upload/post/send each provider at-most-once", async () => {
    const providers = [
      { provider: "notification" as const, actionType: "notify" as const },
      { provider: "drive" as const, actionType: "upload" as const },
      { provider: "dropbox" as const, actionType: "upload" as const },
      { provider: "x" as const, actionType: "post" as const },
      { provider: "gmail" as const, actionType: "send" as const },
      { provider: "wordpress" as const, actionType: "publish" as const },
      { provider: "google_calendar" as const, actionType: "create_event" as const },
    ];
    for (const [index, p] of providers.entries()) {
      let calls = 0;
      const ctx = {
        userId: "user_a",
        provider: p.provider,
        actionType: p.actionType,
        destination: `dest_${index}`,
        runId: `run_j_${index}`,
        occurrenceKey: `occ_j_${index}`,
      };
      await executeIdempotentSideEffect(ctx, async () => {
        calls += 1;
        return { providerResourceId: `res_${index}`, result: { ok: true } };
      });
      await executeIdempotentSideEffect(ctx, async () => {
        calls += 1;
        return { providerResourceId: `res_${index}_dup`, result: { ok: true } };
      });
      expect(calls).toBe(1);
    }
  });

  it("stable key across retries (same logical execution)", () => {
    const a = buildSideEffectIdempotencyKey({
      userId: "u1",
      provider: "x",
      actionType: "post",
      destination: "x",
      automationId: "a1",
      runId: "r1",
      occurrenceKey: "o1",
      discriminator: "d1",
    });
    const b = buildSideEffectIdempotencyKey({
      userId: "u1",
      provider: "x",
      actionType: "post",
      destination: "x",
      automationId: "a1",
      runId: "r1",
      occurrenceKey: "o1",
      discriminator: "d1",
    });
    expect(a).toBe(b);
  });

  it("Phase 5: occurrence-stable key ignores runId", () => {
    const a = buildSideEffectIdempotencyKey({
      userId: "u1",
      provider: "google_calendar",
      actionType: "create_event",
      destination: "primary",
      automationId: "a1",
      runId: "run_old",
      occurrenceKey: "occ_shared",
      discriminator: "google_calendar",
    });
    const b = buildSideEffectIdempotencyKey({
      userId: "u1",
      provider: "google_calendar",
      actionType: "create_event",
      destination: "primary",
      automationId: "a1",
      runId: "run_new",
      occurrenceKey: "occ_shared",
      discriminator: "google_calendar",
    });
    expect(a).toBe(b);
  });
});
