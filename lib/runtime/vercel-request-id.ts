import "server-only";

/**
 * Best-effort Vercel request id for cross-system diagnostics.
 * Available in Route Handlers / Server Components via next/headers.
 */
export async function readVercelRequestId(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return (
      h.get("x-vercel-id") ??
      h.get("x-vercel-request-id") ??
      h.get("x-request-id") ??
      null
    );
  } catch {
    return null;
  }
}
