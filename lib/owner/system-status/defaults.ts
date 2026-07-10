import type { SystemServiceId } from "./types";

/** Estimated monthly uptime when no live probe data exists yet. */
export const ESTIMATED_UPTIME_PERCENT: Record<SystemServiceId, number> = {
  atlas: 99.9,
  openai: 99.7,
  stripe: 99.9,
  google: 99.8,
  x: 99.5,
  wordpress: 99.6,
  server: 99.95,
};

export const OUTAGE_UPTIME_PERCENT = 95.0;
export const MAINTENANCE_UPTIME_PERCENT = 98.0;
