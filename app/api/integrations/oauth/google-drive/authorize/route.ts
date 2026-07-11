function resolveOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

/**
 * Legacy Google Drive OAuth entry — redirects to the unified Google account
 * authorize flow (Gmail + Calendar + Drive).
 */
export async function GET(request: Request): Promise<Response> {
  const origin = resolveOrigin(request);
  return Response.redirect(
    `${origin.replace(/\/$/, "")}/api/external-services/google/oauth/authorize`,
    302,
  );
}
