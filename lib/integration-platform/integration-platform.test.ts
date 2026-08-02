import { beforeEach, describe, expect, it } from "vitest";

import { runIntegrationBenchmark100 } from "@/lib/integration-platform/benchmark";
import {
  evaluateIntegrationCompletionGate,
  requiredServicesForAutomation,
} from "@/lib/integration-platform/completion-gate";
import { catalogAudit } from "@/lib/integration-platform/connection-manager";
import { resetConnectionStoreForTests } from "@/lib/integration-platform/connection-manager";
import { resetIntegrationMetricsForTests } from "@/lib/integration-platform/metrics";
import {
  postVerificationOk,
  verifyWordPressPost,
  verifyXPost,
} from "@/lib/integration-platform/post-verify";
import {
  IntegrationHttpError,
  classifyError,
  executeWithRetryPolicy,
  isRetryable,
} from "@/lib/integration-platform/retry-policy";
import {
  getAdapter,
  resetAdapterRegistryForTests,
} from "@/lib/integration-platform/registry";
import { createSandboxAdapter } from "@/lib/integration-platform/sandbox-adapter";
import {
  resetTokenStoreForTests,
  openSecret,
  sealSecret,
  upsertTokenRecord,
  rotateAccessToken,
} from "@/lib/integration-platform/token-store";
import {
  sha256Buffer,
  uploadVerificationOk,
  verifyUploadRoundTrip,
} from "@/lib/integration-platform/upload-verify";
import { evaluateCompletionEvidence } from "@/lib/jobs/completion-evidence";
import { notifyXPostSuccess } from "@/lib/notifications/emitters";

beforeEach(() => {
  resetConnectionStoreForTests();
  resetTokenStoreForTests();
  resetIntegrationMetricsForTests();
  resetAdapterRegistryForTests();
});

describe("integration catalog audit", () => {
  it("classifies all required services", () => {
    const catalog = catalogAudit();
    const byId = Object.fromEntries(
      catalog.map((row) => [row.serviceId, row.classification]),
    );
    expect(byId.google_drive).toBe("live");
    expect(byId.dropbox).toBe("live");
    expect(byId.x).toBe("live");
    expect(byId.wordpress).toBe("live");
    expect(byId.gmail).toBe("live");
    expect(byId.google_calendar).toBe("live");
    expect(byId.line).toBe("live");
    expect(byId.supabase_storage).toBe("live");
    expect(byId.notion).toBe("mock");
    expect(byId.slack).toBe("partial");
    expect(byId.discord).toBe("partial");
    expect(byId.webhook).toBe("partial");
    expect(byId.outlook).toBe("unwired");
    expect(byId.teams).toBe("unwired");
    expect(byId.cloudflare_r2).toBe("unwired");
    expect(byId.s3).toBe("unwired");
  });
});

describe("retry policy", () => {
  it("retries 429/5xx/timeout/network only — not 4xx", async () => {
    expect(isRetryable(new IntegrationHttpError(429, "rate"))).toBe(true);
    expect(isRetryable(new IntegrationHttpError(503, "down"))).toBe(true);
    expect(isRetryable(new Error("ETIMEDOUT"))).toBe(true);
    expect(isRetryable(new Error("fetch failed"))).toBe(true);
    expect(isRetryable(new IntegrationHttpError(400, "bad"))).toBe(false);
    expect(isRetryable(new IntegrationHttpError(401, "auth"))).toBe(false);
    expect(classifyError(new IntegrationHttpError(404, "missing"))).toBe(
      "non_retryable_4xx",
    );

    let attempts = 0;
    const ok = await executeWithRetryPolicy(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new IntegrationHttpError(503, "tmp");
        return "done";
      },
      { maxAttempts: 3, baseDelayMs: 1 },
    );
    expect(ok.value).toBe("done");
    expect(ok.retried).toBe(true);
    expect(ok.attempts).toBe(3);

    await expect(
      executeWithRetryPolicy(
        async () => {
          throw new IntegrationHttpError(400, "nope");
        },
        { maxAttempts: 5, baseDelayMs: 1 },
      ),
    ).rejects.toThrow(/nope/);
  });
});

describe("token seal / rotation", () => {
  it("seals secrets and rotates access tokens", () => {
    const sealed = sealSecret("super-secret-token");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed.includes("super-secret-token")).toBe(false);
    expect(openSecret(sealed)).toBe("super-secret-token");

    const record = upsertTokenRecord({
      ownerId: "u1",
      serviceId: "dropbox",
      accessTokenEnc: "access-1",
      refreshTokenEnc: "refresh-1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      scopes: ["files.content.write"],
      lastUsedAt: null,
      failureCount: 0,
    });
    expect(record.accessTokenEnc?.startsWith("v1.")).toBe(true);
    const rotated = rotateAccessToken(
      "u1",
      "dropbox",
      "access-2",
      new Date(Date.now() + 120_000).toISOString(),
    );
    expect(rotated.rotationVersion).toBeGreaterThan(record.rotationVersion);
    expect(openSecret(rotated.accessTokenEnc)).toBe("access-2");
  });
});

describe("upload / post verification", () => {
  it("requires checksum download match for upload proof", () => {
    const original = Buffer.from("word-bytes-proof");
    const bad = verifyUploadRoundTrip({
      original,
      downloaded: Buffer.from("tampered"),
      externalId: "id1",
      externalUrl: "https://example.com/f",
      remoteMetadata: { id: "id1", size: original.byteLength },
    });
    expect(uploadVerificationOk(bad)).toBe(false);

    const good = verifyUploadRoundTrip({
      original,
      downloaded: Buffer.from(original),
      externalId: "id1",
      externalUrl: "https://example.com/f",
      remoteMetadata: {
        id: "id1",
        name: "a.docx",
        expectedName: "a.docx",
        size: original.byteLength,
      },
    });
    expect(uploadVerificationOk(good)).toBe(true);
    expect(good.checksumSha256).toBe(sha256Buffer(original));
  });

  it("requires WordPress post id+url+fetch and X tweet id+url+fetch", () => {
    expect(
      postVerificationOk(
        verifyWordPressPost({
          postId: 9,
          link: "https://blog.example/p/9",
          status: "publish",
          fetched: { id: 9, link: "https://blog.example/p/9", status: "publish" },
        }),
      ),
    ).toBe(true);
    expect(
      postVerificationOk(
        verifyWordPressPost({
          postId: 9,
          link: null,
          status: "publish",
        }),
      ),
    ).toBe(false);

    expect(
      postVerificationOk(
        verifyXPost({
          tweetId: "1",
          tweetUrl: "https://x.com/i/status/1",
          fetchedExists: true,
        }),
      ),
    ).toBe(true);
    expect(
      postVerificationOk(
        verifyXPost({
          tweetId: "1",
          tweetUrl: "https://x.com/i/status/1",
          fetchedExists: false,
        }),
      ),
    ).toBe(false);
  });
});

describe("fail closed completion gate", () => {
  it("blocks completed on Dropbox/WordPress/X mid-success", () => {
    const required = requiredServicesForAutomation({
      steps: ["dropbox_upload", "wordpress_post", "x_post"],
    });
    expect(required).toEqual(
      expect.arrayContaining(["dropbox", "wordpress", "x"]),
    );

    const blocked = evaluateIntegrationCompletionGate({
      artifactReady: true,
      requiredServices: ["dropbox"],
      results: [
        {
          ok: true,
          serviceId: "dropbox",
          action: "upload",
          externalId: "dbx",
          externalUrl: "https://www.dropbox.com/s/x",
          verified: false,
          attempts: 1,
          retried: false,
          durationMs: 10,
          errorCode: null,
          errorMessage: null,
          proofKind: "sandbox",
        },
      ],
    });
    expect(blocked.canComplete).toBe(false);

    const mockBlocked = evaluateIntegrationCompletionGate({
      artifactReady: true,
      requiredServices: ["x"],
      results: [
        {
          ok: true,
          serviceId: "x",
          action: "x_post",
          externalId: "1",
          externalUrl: "https://x.com/i/status/1",
          verified: true,
          attempts: 1,
          retried: false,
          durationMs: 10,
          errorCode: null,
          errorMessage: null,
          proofKind: "mock",
        },
      ],
    });
    expect(mockBlocked.canComplete).toBe(false);

    const ok = evaluateIntegrationCompletionGate({
      artifactReady: true,
      requiredServices: ["x", "wordpress", "dropbox"],
      results: [
        {
          ok: true,
          serviceId: "x",
          action: "x_post",
          externalId: "1",
          externalUrl: "https://x.com/i/status/1",
          verified: true,
          attempts: 1,
          retried: false,
          durationMs: 10,
          errorCode: null,
          errorMessage: null,
          proofKind: "sandbox",
        },
        {
          ok: true,
          serviceId: "wordpress",
          action: "wordpress_post",
          externalId: "9",
          externalUrl: "https://blog.example/?p=9",
          verified: true,
          attempts: 1,
          retried: false,
          durationMs: 10,
          errorCode: null,
          errorMessage: null,
          proofKind: "live",
        },
        {
          ok: true,
          serviceId: "dropbox",
          action: "upload",
          externalId: "dbx",
          externalUrl: "https://www.dropbox.com/s/x",
          verified: true,
          attempts: 1,
          retried: false,
          durationMs: 10,
          errorCode: null,
          errorMessage: null,
          proofKind: "sandbox",
        },
      ],
    });
    expect(ok.canComplete).toBe(true);
    expect(ok.proofs).toHaveLength(3);
  });

  it("job evidence fails closed without tweet/wordpress/dropbox proof", () => {
    expect(
      evaluateCompletionEvidence({
        templateId: "sns_post",
        orchestrationStatus: "completed",
        approved: true,
        deliverableCount: 0,
        snsPostFailure: null,
      }).status,
    ).toBe("failed");

    expect(
      evaluateCompletionEvidence({
        orchestrationStatus: "completed",
        approved: true,
        deliverableCount: 1,
        snsPostFailure: null,
        wordpressPostId: "1",
        wordpressUrl: null,
      }).status,
    ).toBe("failed");

    expect(
      evaluateCompletionEvidence({
        orchestrationStatus: "completed",
        approved: true,
        deliverableCount: 1,
        snsPostFailure: null,
        dropboxFileId: "id",
        dropboxUrl: "https://www.dropbox.com/s/x",
      }).status,
    ).toBe("completed");
  });
});

describe("sandbox adapter execute + verify", () => {
  it("uploads with checksum verification and posts with URLs", async () => {
    const drive = createSandboxAdapter("google_drive");
    await drive.connect("u1");
    const upload = await drive.execute({
      ownerId: "u1",
      action: "upload",
      payload: {
        fileName: "report.docx",
        buffer: Buffer.from("docx-bytes"),
      },
    });
    expect(upload.ok).toBe(true);
    expect(upload.verified).toBe(true);
    expect(upload.externalUrl).toMatch(/^https:\/\//);
    expect(upload.checksum).toBeTruthy();

    const x = getAdapter("x");
    await x.connect("u1");
    const post = await x.execute({
      ownerId: "u1",
      action: "x_post",
      payload: { text: "hello" },
    });
    expect(post.ok).toBe(true);
    expect(post.externalId).toBeTruthy();
    expect(post.externalUrl).toContain("x.com");
    expect(post.proofKind).toBe("sandbox");
  });

  it("retries sandbox 503 then succeeds", async () => {
    const adapter = createSandboxAdapter("dropbox", {
      failOnCalls: [1],
      failStatus: 503,
      baseLatencyMs: 0,
    });
    await adapter.connect("u1");
    const result = await adapter.execute({
      ownerId: "u1",
      action: "upload",
      payload: { buffer: Buffer.from("a"), fileName: "a.bin" },
    });
    expect(result.ok).toBe(true);
    expect(result.retried).toBe(true);
  });
});

describe("notification includes remote URL", () => {
  it("X success notification actionUrl is tweet URL", () => {
    const record = notifyXPostSuccess("user_1", "hi", {
      historyId: "h1",
      tweetUrl: "https://x.com/i/status/99",
    });
    expect(record?.actionUrl).toBe("https://x.com/i/status/99");
    expect(record?.message).toContain("https://x.com/i/status/99");
  });
});

describe("100-call sandbox benchmark", () => {
  it("measures success/latency/p95/p99/429/retry for core services", async () => {
    const report = await runIntegrationBenchmark100({
      ownerId: "bench",
      callsPerService: 100,
      services: [
        "google_drive",
        "dropbox",
        "x",
        "wordpress",
        "gmail",
        "google_calendar",
        "line",
        "supabase_storage",
      ],
    });
    expect(report.kind).toBe("measured");
    expect(report.sandbox).toBe(true);
    expect(report.callsPerService).toBe(100);
    for (const metrics of report.services) {
      expect(metrics.sampleSize).toBe(100);
      expect(metrics.successRate).toBeGreaterThanOrEqual(0.95);
      expect(metrics.avgMs).toBeGreaterThanOrEqual(0);
      expect(metrics.p95Ms).toBeGreaterThanOrEqual(metrics.avgMs - 1);
      expect(metrics.p99Ms).toBeGreaterThanOrEqual(metrics.p95Ms - 1);
      expect(metrics.kind).toBe("measured");
    }
  }, 120_000);
});
