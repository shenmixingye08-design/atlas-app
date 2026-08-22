/**
 * Safe X OAuth return path. Open redirects are rejected.
 * Only /workspace/x and /settings/x (plus a tight query allowlist) are kept.
 */

export const X_OAUTH_DEFAULT_RETURN_PATH = "/settings/x";
export const X_OAUTH_WORKSPACE_SETUP_RETURN = "/workspace/x?onboarding=1";

const ALLOWED_PATHS = new Set(["/workspace/x", "/settings/x"]);

const ALLOWED_QUERY_KEYS = new Set([
  "onboarding",
  "setup",
  "connected",
  "username",
  "x_error",
  "plan",
  "historyId",
  "trial",
]);

const SAFE_QUERY_VALUE = /^[\w.@-]{0,80}$/;

export function sanitizeXOAuthReturnTo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.includes("\\") || trimmed.includes("://")) return null;
  if (/%2f/i.test(trimmed) || /%5c/i.test(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed, "https://minervot.invalid");
  } catch {
    return null;
  }

  if (parsed.origin !== "https://minervot.invalid") return null;
  if (parsed.username || parsed.password || parsed.hash) return null;
  if (!ALLOWED_PATHS.has(parsed.pathname)) return null;

  const next = new URLSearchParams();
  for (const [key, raw] of parsed.searchParams) {
    if (!ALLOWED_QUERY_KEYS.has(key)) continue;
    if (!SAFE_QUERY_VALUE.test(raw)) continue;
    next.set(key, raw);
  }

  const qs = next.toString();
  return qs ? `${parsed.pathname}?${qs}` : parsed.pathname;
}

export function resolveXOAuthReturnPath(value: unknown): string {
  return sanitizeXOAuthReturnTo(value) ?? X_OAUTH_DEFAULT_RETURN_PATH;
}

export function withXOAuthResultParams(
  returnPath: string,
  params: Record<string, string>,
): string {
  const safe = resolveXOAuthReturnPath(returnPath);
  const url = new URL(safe, "https://minervot.invalid");
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    if (!ALLOWED_QUERY_KEYS.has(key)) continue;
    if (!SAFE_QUERY_VALUE.test(value) && key !== "username") continue;
    if (key === "username" && !/^[\w.@-]{0,80}$/.test(value)) continue;
    url.searchParams.set(key, value);
  }
  const qs = url.searchParams.toString();
  return qs ? `${url.pathname}?${qs}` : url.pathname;
}
