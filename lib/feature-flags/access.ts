import { isAtlasOwnerEmail } from "@/lib/auth/is-atlas-owner";
import {
  isEffectiveBetaUserEmail,
  parseAtlasBetaUserEmailsFromEnv,
} from "@/lib/owner/beta-users/emails";

import { getFeatureFlagState } from "./store";
import type {
  FeatureAccessContext,
  FeatureAvailabilityMap,
  FeatureFlagId,
  FeatureFlagState,
} from "./types";
import { FEATURE_FLAG_IDS } from "./registry";

/** Parse ATLAS_BETA_USER_EMAILS env (comma-separated, case-insensitive). */
export function parseAtlasBetaUserEmails(): readonly string[] {
  return parseAtlasBetaUserEmailsFromEnv();
}

export function isAtlasBetaUserEmail(
  email: string | null | undefined,
): boolean {
  return isEffectiveBetaUserEmail(email);
}

export function buildFeatureAccessContext(
  email: string | null | undefined,
): FeatureAccessContext {
  return {
    email: email ?? null,
    isOwner: isAtlasOwnerEmail(email),
    isBetaUser: isAtlasBetaUserEmail(email),
  };
}

export function isFeatureAvailableForContext(
  state: FeatureFlagState,
  context: FeatureAccessContext,
): boolean {
  switch (state) {
    case "on":
      return true;
    case "off":
      return false;
    case "beta":
      return context.isOwner || context.isBetaUser;
    default:
      return false;
  }
}

export function isFeatureEnabled(
  id: FeatureFlagId,
  context: FeatureAccessContext,
): boolean {
  // N-01: Media generation is not a Production-offered capability.
  // Keep a hard closed gate for non-owners even if an owner toggles the flag
  // on a single instance (flags are not a durable SoT).
  if (
    (id === "video_generation" || id === "image_generation") &&
    !context.isOwner
  ) {
    return false;
  }
  const state = getFeatureFlagState(id);
  return isFeatureAvailableForContext(state, context);
}

export function buildFeatureAvailabilityMap(
  context: FeatureAccessContext,
): FeatureAvailabilityMap {
  return FEATURE_FLAG_IDS.reduce<FeatureAvailabilityMap>((map, id) => {
    map[id] = isFeatureEnabled(id, context);
    return map;
  }, {} as FeatureAvailabilityMap);
}
