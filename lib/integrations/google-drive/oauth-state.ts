import {
  consumeSignedOAuthState,
  createSignedOAuthState,
} from "@/lib/integrations/oauth-state/signed-oauth-state";

/** Create durable Google OAuth CSRF state (multi-instance safe). */
export function createOAuthState(
  userId: string,
  options?: { codeVerifier?: string },
): string {
  return createSignedOAuthState(userId, options);
}

export function consumeOAuthState(
  state: string,
): { userId: string; codeVerifier?: string } | null {
  const parsed = consumeSignedOAuthState(state);
  if (!parsed) return null;
  return {
    userId: parsed.subject,
    codeVerifier: parsed.codeVerifier,
  };
}

/** @deprecated Signed state has no in-memory store to reset. */
export function resetOAuthStateStore(): void {
  // no-op — kept for test compatibility
}
