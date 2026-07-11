import {
  consumeSignedOAuthState,
  createSignedOAuthState,
} from "@/lib/integrations/oauth-state/signed-oauth-state";

/** Create durable Google OAuth CSRF state (multi-instance safe). */
export function createOAuthState(userId: string): string {
  return createSignedOAuthState(userId);
}

export function consumeOAuthState(state: string): { userId: string } | null {
  const parsed = consumeSignedOAuthState(state);
  if (!parsed) return null;
  return { userId: parsed.subject };
}

/** @deprecated Signed state has no in-memory store to reset. */
export function resetOAuthStateStore(): void {
  // no-op — kept for test compatibility
}
