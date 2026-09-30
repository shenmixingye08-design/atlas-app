import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.fn();
const consume = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "u1" }) }));
vi.mock("@/lib/feature-flags/resolve-context", () => ({
  resolveFeatureAccessContext: async () => ({}),
}));
vi.mock("@/lib/feature-flags/access", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/integrations/x/post/autopost-generator", () => ({
  generateAutoPostText: (...args: unknown[]) => generate(...args),
}));
vi.mock("@/lib/http/rate-limit", () => ({
  consumeDistributedRateLimit: (...args: unknown[]) => consume(...args),
}));

import { POST } from "@/app/api/x/autopost/sample/route";

function request(body: unknown) {
  return new Request("http://localhost/api/x/autopost/sample", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const buckets = () => consume.mock.calls.map((call) => (call[1] as { bucket: string }).bucket);

describe("POST /api/x/autopost/sample", () => {
  beforeEach(() => {
    generate.mockReset();
    consume.mockReset();
    consume.mockResolvedValue({ allowed: true, remaining: 2 });
  });

  it("returns a strong-tier tip sample and counts it", async () => {
    generate.mockResolvedValue({ text: "本文", usedFallback: false, postType: "knowhow" });
    const res = await POST(request({ theme: "美容室の集客", audience: "30代" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ready", text: "本文" });
    const call = generate.mock.calls[0]![0] as { postType: string; aiTaskType: string; settings: { audience: string } };
    expect(call.postType).toBe("knowhow");
    expect(call.aiTaskType).toBe("worker_deliverable");
    expect(call.settings.audience).toBe("30代");
    expect(buckets()).toEqual(["x-sample-attempt", "x-sample"]);
  });

  it("never shows the fallback template and does not count it as a sample", async () => {
    generate.mockResolvedValue({ text: "テンプレ", usedFallback: true, postType: "knowhow" });
    const res = await POST(request({ theme: "美容室の集客" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(JSON.stringify(body)).not.toContain("テンプレ");
    expect(buckets()).toEqual(["x-sample-attempt"]);
  });

  it("stops before generating once the attempt ceiling is hit", async () => {
    consume.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const res = await POST(request({ theme: "美容室の集客" }));
    expect(res.status).toBe(429);
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects an empty theme without spending anything", async () => {
    const res = await POST(request({ theme: "" }));
    expect(res.status).toBe(400);
    expect(consume).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
});
