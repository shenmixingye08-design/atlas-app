function resolveOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

/**
 * Legacy Drive-only callback — no longer exchanges codes.
 * Redirect to the unified Google account OAuth authorize path.
 */
export async function GET(request: Request): Promise<Response> {
  const origin = resolveOrigin(request).replace(/\/$/, "");
  return Response.redirect(
    `${origin}/api/external-services/google/oauth/authorize`,
    302,
  );
}
