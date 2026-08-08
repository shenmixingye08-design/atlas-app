import "server-only";

/**
 * P0-03 ownership helpers.
 * Prefer 404 over 403 for cross-user resource access to avoid existence leaks.
 */

export function isResourceOwnedByUser(
  resourceOwnerId: string | null | undefined,
  authenticatedUserId: string,
): boolean {
  return (
    typeof resourceOwnerId === "string" &&
    resourceOwnerId.length > 0 &&
    resourceOwnerId === authenticatedUserId
  );
}

/** Stable denial body — never include foreign user/path/token details. */
export function ownershipDeniedResponse(
  status: 401 | 403 | 404 = 404,
): Response {
  const error =
    status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Not found";
  return Response.json(
    { ok: false, error },
    {
      status,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}

/**
 * Ignore client-supplied identity fields. Returns only the authenticated userId.
 */
export function rejectClientIdentityOverride(input: {
  authenticatedUserId: string;
  bodyUserId?: unknown;
  queryUserId?: unknown;
  paramUserId?: unknown;
}): { ok: true; userId: string } | { ok: false; response: Response } {
  const candidates = [input.bodyUserId, input.queryUserId, input.paramUserId];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    if (candidate.trim() !== input.authenticatedUserId) {
      return { ok: false, response: ownershipDeniedResponse(403) };
    }
  }
  return { ok: true, userId: input.authenticatedUserId };
}
