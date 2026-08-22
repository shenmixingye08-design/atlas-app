import { describe, expect, it } from "vitest";

import {
  sanitizeXOAuthReturnTo,
  resolveXOAuthReturnPath,
  withXOAuthResultParams,
  X_OAUTH_DEFAULT_RETURN_PATH,
  X_OAUTH_WORKSPACE_SETUP_RETURN,
} from "./oauth-return-to";

describe("X OAuth returnTo allowlist", () => {
  it("keeps the workspace onboarding path", () => {
    expect(sanitizeXOAuthReturnTo(X_OAUTH_WORKSPACE_SETUP_RETURN)).toBe(
      "/workspace/x?onboarding=1",
    );
  });

  it("rejects open redirects", () => {
    expect(sanitizeXOAuthReturnTo("https://evil.example/phish")).toBeNull();
    expect(sanitizeXOAuthReturnTo("//evil.example")).toBeNull();
    expect(sanitizeXOAuthReturnTo("/\\evil")).toBeNull();
    expect(sanitizeXOAuthReturnTo("/workspace/x/../admin")).toBeNull();
    expect(sanitizeXOAuthReturnTo("/settings/billing")).toBeNull();
  });

  it("falls back to settings when missing", () => {
    expect(resolveXOAuthReturnPath(undefined)).toBe(X_OAUTH_DEFAULT_RETURN_PATH);
  });

  it("preserves onboarding state after cancel/success params", () => {
    const cancelled = withXOAuthResultParams(
      "/workspace/x?onboarding=1",
      { x_error: "1" },
    );
    expect(cancelled).toContain("/workspace/x");
    expect(cancelled).toContain("onboarding=1");
    expect(cancelled).toContain("x_error=1");

    const ok = withXOAuthResultParams("/workspace/x?onboarding=1", {
      connected: "x",
      username: "atlas_user",
    });
    expect(ok).toContain("connected=x");
    expect(ok).toContain("onboarding=1");
  });
});
