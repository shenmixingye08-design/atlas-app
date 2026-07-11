import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  consumeSignedOAuthState,
  createSignedOAuthState,
} from "./signed-oauth-state";

describe("signed oauth state", () => {
  beforeEach(() => {
    vi.stubEnv("OAUTH_STATE_SECRET", "test-oauth-state-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips user id across consume", () => {
    const state = createSignedOAuthState("user_abc");
    expect(consumeSignedOAuthState(state)).toEqual({ subject: "user_abc" });
    // Signature still valid; TTL-based (no one-time memory store).
    expect(consumeSignedOAuthState(state)?.subject).toBe("user_abc");
  });

  it("includes code verifier for Dropbox PKCE", () => {
    const state = createSignedOAuthState("user_abc", {
      codeVerifier: "verifier-123",
    });
    expect(consumeSignedOAuthState(state)).toEqual({
      subject: "user_abc",
      codeVerifier: "verifier-123",
    });
  });

  it("rejects tampered state", () => {
    const state = createSignedOAuthState("user_abc");
    const [body] = state.split(".");
    expect(consumeSignedOAuthState(`${body}.deadbeef`)).toBeNull();
  });
});
