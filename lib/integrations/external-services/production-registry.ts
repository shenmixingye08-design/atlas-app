/**
 * External Production Registry — formal cutover list.
 *
 * Only adapters with a real Production Live path may be registered as
 * `available`. Unfinished services stay `preparing` and must NOT appear in
 * `isLiveAdapterWired`.
 */

import { isLiveAdapterWired } from "@/lib/automation-platform/execution/production-step-registry";

export const EXTERNAL_AVAILABILITY = [
  "available",
  "beta",
  "preparing",
  "unsupported",
] as const;

export type ExternalAvailability = (typeof EXTERNAL_AVAILABILITY)[number];

/** Japanese UI labels — must match product copy. */
export const EXTERNAL_AVAILABILITY_LABEL: Record<ExternalAvailability, string> =
  {
    available: "利用可能",
    beta: "ベータ",
    preparing: "準備中",
    unsupported: "未対応",
  };

export type ProductionExternalAdapterId =
  | "google_drive"
  | "google_gmail"
  | "google_calendar"
  | "dropbox"
  | "wordpress";

export type ExternalProductionRegistryEntry = {
  adapterId: string;
  serviceLabel: string;
  stepType: string | null;
  availability: ExternalAvailability;
  mode: "production" | null;
  configuredCheck: "env" | "credentials" | "none";
  requiresLiveWiring: boolean;
};

/**
 * Formal Production cutover registry.
 * Incomplete adapters (X, Slack, Discord, Notion, LINE, Teams, Outlook, …)
 * are listed as preparing / unsupported and must remain unwired.
 */
export const EXTERNAL_PRODUCTION_REGISTRY: readonly ExternalProductionRegistryEntry[] =
  [
    {
      adapterId: "google_drive",
      serviceLabel: "Google Drive",
      stepType: "google_drive",
      availability: "available",
      mode: "production",
      configuredCheck: "env",
      requiresLiveWiring: true,
    },
    {
      adapterId: "google_gmail",
      serviceLabel: "Gmail",
      stepType: "gmail",
      availability: "available",
      mode: "production",
      configuredCheck: "env",
      requiresLiveWiring: true,
    },
    {
      adapterId: "google_calendar",
      serviceLabel: "Google Calendar",
      stepType: "google_calendar",
      availability: "available",
      mode: "production",
      configuredCheck: "env",
      requiresLiveWiring: true,
    },
    {
      adapterId: "dropbox",
      serviceLabel: "Dropbox",
      stepType: "dropbox",
      availability: "available",
      mode: "production",
      configuredCheck: "env",
      requiresLiveWiring: true,
    },
    {
      adapterId: "wordpress",
      serviceLabel: "WordPress",
      stepType: "wordpress",
      availability: "available",
      mode: "production",
      configuredCheck: "credentials",
      requiresLiveWiring: true,
    },
    // Explicitly NOT production-wired — keep preparing / unsupported.
    {
      adapterId: "x",
      serviceLabel: "X",
      stepType: "x_post",
      availability: "preparing",
      mode: null,
      configuredCheck: "env",
      requiresLiveWiring: false,
    },
    {
      adapterId: "slack",
      serviceLabel: "Slack",
      stepType: null,
      availability: "preparing",
      mode: null,
      configuredCheck: "none",
      requiresLiveWiring: false,
    },
    {
      adapterId: "discord",
      serviceLabel: "Discord",
      stepType: null,
      availability: "preparing",
      mode: null,
      configuredCheck: "none",
      requiresLiveWiring: false,
    },
    {
      adapterId: "notion",
      serviceLabel: "Notion",
      stepType: null,
      availability: "preparing",
      mode: null,
      configuredCheck: "none",
      requiresLiveWiring: false,
    },
    {
      adapterId: "line",
      serviceLabel: "LINE",
      stepType: null,
      availability: "unsupported",
      mode: null,
      configuredCheck: "none",
      requiresLiveWiring: false,
    },
    {
      adapterId: "teams",
      serviceLabel: "Microsoft Teams",
      stepType: null,
      availability: "unsupported",
      mode: null,
      configuredCheck: "none",
      requiresLiveWiring: false,
    },
    {
      adapterId: "outlook",
      serviceLabel: "Outlook",
      stepType: null,
      availability: "unsupported",
      mode: null,
      configuredCheck: "none",
      requiresLiveWiring: false,
    },
  ] as const;

export const PRODUCTION_WIRED_ADAPTER_IDS: readonly ProductionExternalAdapterId[] =
  [
    "google_drive",
    "google_gmail",
    "google_calendar",
    "dropbox",
    "wordpress",
  ];

export function getExternalAvailability(
  adapterId: string,
): ExternalAvailability {
  const entry = EXTERNAL_PRODUCTION_REGISTRY.find(
    (item) => item.adapterId === adapterId,
  );
  return entry?.availability ?? "unsupported";
}

export function getExternalAvailabilityLabel(adapterId: string): string {
  return EXTERNAL_AVAILABILITY_LABEL[getExternalAvailability(adapterId)];
}

export function listAvailableProductionAdapters(): ExternalProductionRegistryEntry[] {
  return EXTERNAL_PRODUCTION_REGISTRY.filter(
    (item) => item.availability === "available" && item.mode === "production",
  );
}

/**
 * Fail-closed consistency check: every available production adapter must be
 * wired; preparing/unsupported adapters must NOT be wired.
 */
export function assertProductionRegistryConsistency(): string[] {
  const issues: string[] = [];
  for (const entry of EXTERNAL_PRODUCTION_REGISTRY) {
    const wired = isLiveAdapterWired(entry.adapterId);
    if (entry.availability === "available" && entry.requiresLiveWiring && !wired) {
      issues.push(
        `${entry.adapterId}: marked available but isLiveAdapterWired=false`,
      );
    }
    if (
      (entry.availability === "preparing" ||
        entry.availability === "unsupported") &&
      wired
    ) {
      issues.push(
        `${entry.adapterId}: marked ${entry.availability} but isLiveAdapterWired=true`,
      );
    }
  }
  for (const id of PRODUCTION_WIRED_ADAPTER_IDS) {
    if (!isLiveAdapterWired(id)) {
      issues.push(`${id}: required Production adapter is not wired`);
    }
  }
  return issues;
}
