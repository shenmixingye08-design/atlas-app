import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyWebhook = vi.fn();
const recordAuditLogSafe = vi.fn();

vi.mock("@clerk/nextjs/webhooks", () => ({
  verifyWebhook: (...args: unknown[]) => verifyWebhook(...args),
}));

vi.mock("@/lib/owner/audit-log", () => ({
  recordAuditLogSafe: (...args: unknown[]) => recordAuditLogSafe(...args),
}));

describe("Clerk webhook route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 503 when webhook secret is missing", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "");
    const { POST } = await import("@/app/api/webhooks/clerk/route");
    const response = await POST(new Request("http://localhost/api/webhooks/clerk", {
      method: "POST",
    }) as never);
    expect(response.status).toBe(503);
    expect(verifyWebhook).not.toHaveBeenCalled();
  });

  it("returns 400 when signature verification fails", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "whsec_test");
    verifyWebhook.mockRejectedValue(new Error("bad signature"));
    const { POST } = await import("@/app/api/webhooks/clerk/route");
    const response = await POST(new Request("http://localhost/api/webhooks/clerk", {
      method: "POST",
    }) as never);
    expect(response.status).toBe(400);
    expect(recordAuditLogSafe).not.toHaveBeenCalled();
  });

  it("records login on session.created", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "whsec_test");
    verifyWebhook.mockResolvedValue({
      type: "session.created",
      data: { user_id: "user_1", id: "sess_1" },
    });
    const { POST } = await import("@/app/api/webhooks/clerk/route");
    const response = await POST(new Request("http://localhost/api/webhooks/clerk", {
      method: "POST",
    }) as never);
    expect(response.status).toBe(200);
    expect(recordAuditLogSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        action: "login",
        reason: "Clerk session.created",
      }),
    );
  });

  it("records logout on session.ended", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "whsec_test");
    verifyWebhook.mockResolvedValue({
      type: "session.ended",
      data: { user_id: "user_1", id: "sess_1" },
    });
    const { POST } = await import("@/app/api/webhooks/clerk/route");
    const response = await POST(new Request("http://localhost/api/webhooks/clerk", {
      method: "POST",
    }) as never);
    expect(response.status).toBe(200);
    expect(recordAuditLogSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        action: "logout",
        reason: "Clerk session.ended",
      }),
    );
  });
});
