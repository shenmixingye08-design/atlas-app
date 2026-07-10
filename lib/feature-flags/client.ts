import type { FeatureAvailabilityMap } from "./types";

export type FeatureAvailabilityResponse = {
  flags: FeatureAvailabilityMap;
};

export async function fetchFeatureAvailability(): Promise<FeatureAvailabilityMap> {
  const response = await fetch("/api/feature-flags/availability", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to load feature availability");
  }

  const payload = (await response.json()) as FeatureAvailabilityResponse;
  return payload.flags;
}
