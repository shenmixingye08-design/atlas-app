import { describe, expect, it } from "vitest";

import {
  classifyError,
  executeWithRetryPolicy,
  IntegrationHttpError,
  isRetryable,
  postVerificationOk,
  uploadVerificationOk,
  verifyUploadRoundTrip,
  verifyWordPressPost,
  verifyXPost,
} from "@/lib/integration-platform";

describe("integration retry policy", () => {
  it("retries 429 / 5xx / timeout / network only", () => {
    expect(classifyError(new IntegrationHttpError(429, "rate"))).toBe(
      "retryable_429",
    );
    expect(classifyError(new IntegrationHttpError(500, "boom"))).toBe(
      "retryable_5xx",
    );
    expect(classifyError(new Error("ETIMEDOUT"))).toBe("retryable_timeout");
    expect(classifyError(new Error("fetch failed network"))).toBe(
      "retryable_network",
    );
    expect(classifyError(new IntegrationHttpError(400, "bad"))).toBe(
      "non_retryable_4xx",
    );
    expect(classifyError(new IntegrationHttpError(401, "auth"))).toBe(
      "non_retryable_4xx",
    );
    expect(classifyError(new IntegrationHttpError(403, "perm"))).toBe(
      "non_retryable_4xx",
    );
    expect(isRetryable(new IntegrationHttpError(403, "perm"))).toBe(false);
  });

  it("does not retry non-retryable 4xx", async () => {
    let attempts = 0;
    await expect(
      executeWithRetryPolicy(
        async () => {
          attempts += 1;
          throw new IntegrationHttpError(400, "bad request");
        },
        { maxAttempts: 3, baseDelayMs: 1, sleep: async () => undefined },
      ),
    ).rejects.toThrow(/bad request/);
    expect(attempts).toBe(1);
  });

  it("retries 503 then succeeds", async () => {
    let attempts = 0;
    const outcome = await executeWithRetryPolicy(
      async () => {
        attempts += 1;
        if (attempts < 2) throw new IntegrationHttpError(503, "unavailable");
        return "ok";
      },
      { maxAttempts: 3, baseDelayMs: 1, sleep: async () => undefined },
    );
    expect(outcome.value).toBe("ok");
    expect(outcome.attempts).toBe(2);
    expect(outcome.retried).toBe(true);
  });
});

describe("post / upload verification", () => {
  it("WordPress requires id + link + fetchVerified", () => {
    const v = verifyWordPressPost({
      postId: 12,
      link: "https://example.com/?p=12",
      status: "publish",
      fetched: { id: 12, link: "https://example.com/?p=12", status: "publish" },
    });
    expect(postVerificationOk(v)).toBe(true);
    expect(
      postVerificationOk(
        verifyWordPressPost({
          postId: 12,
          link: null,
          status: "publish",
        }),
      ),
    ).toBe(false);
  });

  it("X requires tweetId + url", () => {
    expect(
      postVerificationOk(
        verifyXPost({
          tweetId: "123",
          tweetUrl: "https://x.com/i/status/123",
          fetchedExists: true,
        }),
      ),
    ).toBe(true);
    expect(
      postVerificationOk(
        verifyXPost({ tweetId: "123", tweetUrl: null, fetchedExists: true }),
      ),
    ).toBe(false);
  });

  it("upload checksum round-trip", () => {
    const buf = Buffer.from("hello-minervot");
    const ok = verifyUploadRoundTrip({
      original: buf,
      downloaded: Buffer.from(buf),
      externalId: "file_1",
      externalUrl: "https://drive.example/file_1",
      remoteMetadata: { id: "file_1", size: buf.byteLength },
    });
    expect(uploadVerificationOk(ok)).toBe(true);
    const bad = verifyUploadRoundTrip({
      original: buf,
      downloaded: Buffer.from("tampered"),
      externalId: "file_1",
      externalUrl: "https://drive.example/file_1",
    });
    expect(uploadVerificationOk(bad)).toBe(false);
  });
});
