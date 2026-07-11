import {
  consumeSignedOAuthState,
  createSignedOAuthState,
} from "@/lib/integrations/oauth-state/signed-oauth-state";

/** Create durable Dropbox OAuth CSRF state (multi-instance safe). */
export function createDropboxOAuthState(
  userId: string,
  codeVerifier: string,
): string {
  return createSignedOAuthState(userId, { codeVerifier });
}

export function consumeDropboxOAuthState(state: string): {
  userId: string;
  codeVerifier: string;
} | null {
  const parsed = consumeSignedOAuthState(state);
  if (!parsed?.codeVerifier) return null;
  return { userId: parsed.subject, codeVerifier: parsed.codeVerifier };
}

/** @deprecated Signed state has no in-memory store to reset. */
export function resetDropboxOAuthStateStore(): void {
  // no-op — kept for test compatibility
}
