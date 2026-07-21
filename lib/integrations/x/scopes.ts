/** Parse OAuth scope strings stored on credentials / connections. */
export function parseXGrantedScopes(raw: string | readonly string[]): string[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((scope) => scope.split(/[\s,]+/)).filter(Boolean);
  }
  return String(raw)
    .split(/[\s,]+/)
    .filter(Boolean);
}

export function hasXWriteScope(scopes: readonly string[]): boolean {
  return scopes.includes("tweet.write");
}

export const X_REQUIRED_POST_SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "offline.access",
] as const;
