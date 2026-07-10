import { buildGoogleAuthorizeUrl } from "@/lib/integrations/google-drive/oauth";

function resolveOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const origin = resolveOrigin(request);
    const authorizeUrl = buildGoogleAuthorizeUrl(origin);
    return Response.redirect(authorizeUrl, 302);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start Google OAuth";

    const origin = resolveOrigin(request);
    const redirectUrl = new URL("/integrations", origin);
    redirectUrl.searchParams.set("error", message);

    return Response.redirect(redirectUrl.toString(), 302);
  }
}
