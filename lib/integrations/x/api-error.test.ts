import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  parseXApiErrorResponse,
  resolveXApiError,
} from "@/lib/integrations/x/api-error";

describe("X API error mapper", () => {
  it("maps duplicate tweet (403 + code 187) to Japanese duplicate message", () => {
    const parsed = parseXApiErrorResponse(403, {
      title: "Forbidden",
      status: 403,
      detail: "Forbidden",
      errors: [
        {
          message: "Status is a duplicate.",
          code: 187,
        },
      ],
    });

    const resolution = resolveXApiError(parsed);
    expect(resolution.userMessage).toContain("重複");
    expect(resolution.reconnectRequired).toBe(false);
    expect(resolution.errorCodes).toEqual([187]);
  });

  it("maps generic forbidden 403 with detail to write-permission guidance", () => {
    const parsed = parseXApiErrorResponse(403, {
      title: "Forbidden",
      detail: "The client application is not permitted to perform this action.",
      type: "about:blank",
      status: 403,
    });

    const resolution = resolveXApiError(parsed);
    expect(resolution.userMessage).toContain("Write");
    expect(resolution.reconnectRequired).toBe(true);
  });

  it("maps unauthorized client / invalid token to reconnect message", () => {
    const parsed = parseXApiErrorResponse(401, {
      title: "Unauthorized",
      detail: "Unauthorized",
      status: 401,
      errors: [{ message: "Invalid or expired token", code: 89 }],
    });

    const resolution = resolveXApiError(parsed);
    expect(resolution.userMessage).toContain("トークンが失効");
    expect(resolution.reconnectRequired).toBe(true);
  });

  it("maps insufficient OAuth scope to write-permission reconnect guidance", () => {
    const parsed = parseXApiErrorResponse(403, {
      title: "Forbidden",
      detail: "Missing required OAuth2 scope: tweet.write",
      status: 403,
    });

    const resolution = resolveXApiError(parsed);
    expect(resolution.userMessage).toContain("Write");
    expect(resolution.userMessage).toContain("Read and write");
    expect(resolution.reconnectRequired).toBe(true);
  });

  it("maps developer portal access level (453) to portal setup guidance", () => {
    const parsed = parseXApiErrorResponse(403, {
      errors: [
        {
          message:
            "You currently have access to a subset of X API V2 endpoints and limited v1.1 endpoints (e.g. media post, oauth) only. If you need access to this endpoint, you may need a different access level.",
          code: 453,
        },
      ],
      title: "Forbidden",
      detail: "Forbidden",
      type: "about:blank",
      status: 403,
    });

    const resolution = resolveXApiError(parsed);
    expect(resolution.userMessage).toContain("Developer Portal");
    expect(resolution.reconnectRequired).toBe(false);
    expect(resolution.errorCodes).toEqual([453]);
  });

  it("maps rate limit responses to Japanese rate-limit message", () => {
    const parsed = parseXApiErrorResponse(429, {
      title: "Too Many Requests",
      detail: "Rate limit exceeded",
      status: 429,
      errors: [{ message: "Rate limit exceeded", code: 88 }],
    });

    const resolution = resolveXApiError(parsed);
    expect(resolution.userMessage).toContain("利用上限");
    expect(resolution.reconnectRequired).toBe(false);
  });

  it("never returns only the HTTP status code as the message", () => {
    const parsed = parseXApiErrorResponse(403, {});
    const resolution = resolveXApiError(parsed);
    expect(resolution.userMessage).not.toBe("403");
    expect(resolution.userMessage).not.toMatch(/^X API error \(403\)$/);
    expect(resolution.userMessage.length).toBeGreaterThan(10);
  });
});
