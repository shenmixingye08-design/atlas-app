import {
  consumeSignedOAuthState,
  createSignedOAuthState,
} from "@/lib/integrations/oauth-state/signed-oauth-state";
import { sanitizeXOAuthReturnTo } from "@/lib/integrations/x/oauth-return-to";

/** Create durable X OAuth CSRF state (multi-instance safe, PKCE verifier embedded). */
export function createXOAuthState(
  userId: string,
  codeVerifier: string,
  options?: { returnTo?: string },
): string {
  const returnTo = sanitizeXOAuthReturnTo(options?.returnTo);
  return createSignedOAuthState(userId, {
    codeVerifier,
    ...(returnTo ? { returnTo } : {}),
  });
}

export function consumeXOAuthState(state: string): {
  userId: string;
  codeVerifier: string;
  returnTo?: string;
} | null {
  const parsed = consumeSignedOAuthState(state);
  if (!parsed?.codeVerifier) return null;
  const returnTo = sanitizeXOAuthReturnTo(parsed.returnTo);
  return {
    userId: parsed.subject,
    codeVerifier: parsed.codeVerifier,
    ...(returnTo ? { returnTo } : {}),
  };
}

/** @deprecated Signed state has no in-memory store to reset. */
export function resetXOAuthStateStore(): void {
  // no-op — kept for test compatibility
}
