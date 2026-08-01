import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const recordAuditLogSafe = vi.fn();
const auditRequestContext = vi.fn();

vi.mock("@/lib/owner/audit-log", () => ({
  recordAuditLogSafe: (input: unknown) => recordAuditLogSafe(input),
  auditRequestContext: (request: Request) => auditRequestContext(request),
}));

vi.mock("@/lib/owner/error-monitoring/telemetry", () => ({
  recordXAuthFailure: vi.fn(),
}));

vi.mock("@/lib/notifications/emitters", () => ({
  notifyIntegrationError: vi.fn(),
}));

const completeXAccountOAuth = vi.fn();
const markXConnectionNeedsReconnect = vi.fn();

vi.mock("@/lib/integrations/x/oauth-service", () => ({
  completeXAccountOAuth: (
    userId: string,
    code: string,
    codeVerifier: string,
    origin: string,
  ) => completeXAccountOAuth(userId, code, codeVerifier, origin),
  markXConnectionNeedsReconnect: (userId: string, message: string) =>
    markXConnectionNeedsReconnect(userId, message),
}));

const consumeXOAuthState = vi.fn();

vi.mock("@/lib/integrations/x/oauth-state", () => ({
  consumeXOAuthState: (state: string) => consumeXOAuthState(state),
}));

describe("X OAuth callback audit logging", () => {
  beforeEach(() => {
    vi.resetModules();
    recordAuditLogSafe.mockClear();
    auditRequestContext.mockReset();
    auditRequestContext.mockImplementation(() => ({
      ip: "203.0.113.50",
      userAgent: "Vitest-X-OAuth/1.0",
    }));
    completeXAccountOAuth.mockReset();
    markXConnectionNeedsReconnect.mockReset();
    consumeXOAuthState.mockReset();
    consumeXOAuthState.mockReturnValue({
      userId: "user_x_1",
      codeVerifier: "verifier_test",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("records success with userId, action, category, targetId, result, and request context", async () => {
    completeXAccountOAuth.mockResolvedValue({
      serviceId: "x",
      account: { username: "minervot", email: null },
    });

    const { GET } = await import(
      "@/app/api/external-services/x/oauth/callback/route"
    );
    const request = new Request(
      "https://app.example.com/api/external-services/x/oauth/callback?code=ok&state=st",
      {
        headers: {
          "user-agent": "Vitest-X-OAuth/1.0",
          "x-forwarded-for": "203.0.113.50",
        },
      },
    );

    const response = await GET(request);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("connected=x");

    expect(recordAuditLogSafe).toHaveBeenCalledTimes(1);
    expect(recordAuditLogSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_x_1",
        category: "integration",
        action: "x_connect",
        targetId: "x",
        result: "success",
        ip: "203.0.113.50",
        userAgent: "Vitest-X-OAuth/1.0",
      }),
    );
    const payload = recordAuditLogSafe.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty("actorUserId");
    expect(payload).not.toHaveProperty("targetType");
    expect(payload).not.toHaveProperty("summary");
    expect(payload).not.toHaveProperty("metadata");
    expect(typeof payload.reason).toBe("string");
  });

  it("records failure with userId, failure result, and reason", async () => {
    completeXAccountOAuth.mockRejectedValue(new Error("token exchange failed"));

    const { GET } = await import(
      "@/app/api/external-services/x/oauth/callback/route"
    );
    const request = new Request(
      "https://app.example.com/api/external-services/x/oauth/callback?code=bad&state=st",
    );

    const response = await GET(request);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("x_error=1");

    expect(recordAuditLogSafe).toHaveBeenCalledTimes(1);
    expect(recordAuditLogSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_x_1",
        category: "integration",
        action: "x_connect",
        targetId: "x",
        result: "failure",
        reason: "token exchange failed",
        ip: "203.0.113.50",
        userAgent: "Vitest-X-OAuth/1.0",
      }),
    );
  });
});
