import "server-only";

import { auth } from "@clerk/nextjs/server";

import { getClerkUserPrimaryEmail } from "@/lib/auth/get-clerk-user-email";
import { isAtlasOwnerEmail } from "@/lib/auth/is-atlas-owner";
import { isEffectiveBetaUserEmail } from "@/lib/owner/beta-users";
import {
  capabilityDenialResponse,
  isCapabilityAllowedForUser,
} from "@/lib/release-gate/capability-flags";
import {
  enforceKillSwitchesForRoute,
} from "@/lib/release-gate/kill-switch";
import type { CapabilityId } from "@/lib/release-gate/types";

type RouteKind = Parameters<typeof enforceKillSwitchesForRoute>[0];

/**
 * Combined kill-switch + capability-flag gate for heavy routes.
 */
export async function enforceReleaseGate(input: {
  capability: CapabilityId;
  routeKind: RouteKind;
}): Promise<Response | null> {
  const killed = enforceKillSwitchesForRoute(input.routeKind);
  if (killed) return killed;

  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let email: string | null = null;
  try {
    email = await getClerkUserPrimaryEmail(userId);
  } catch {
    email = null;
  }

  const allowed = isCapabilityAllowedForUser({
    id: input.capability,
    isOwner: isAtlasOwnerEmail(email),
    isBetaUser: isEffectiveBetaUserEmail(email),
    isInviteUser: isEffectiveBetaUserEmail(email),
  });

  if (!allowed) return capabilityDenialResponse(input.capability);
  return null;
}
