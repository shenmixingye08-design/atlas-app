import {
  consumeSignedOAuthState,
  createSignedOAuthState,
} from "@/lib/integrations/oauth-state/signed-oauth-state";

/** Create durable X OAuth CSRF state (multi-instance safe, PKCE verifier embedded). */
export function createXOAuthState(
  userId: string,
  codeVerifier: string,
): string {
  return createSignedOAuthState(userId, { codeVerifier });
}

export function consumeXOAuthState(state: string): {
  userId: string;
  codeVerifier: string;
} | null {
  const parsed = consumeSignedOAuthState(state);
  if (!parsed?.codeVerifier) return null;
  return { userId: parsed.subject, codeVerifier: parsed.codeVerifier };
}

/** @deprecated Signed state has no in-memory store to reset. */
export function resetXOAuthStateStore(): void {
  // no-op — kept for test compatibility
}
