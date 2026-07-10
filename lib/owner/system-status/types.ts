export type SystemServiceId =
  | "atlas"
  | "openai"
  | "stripe"
  | "google"
  | "x"
  | "wordpress"
  | "server";

export type SystemServiceStatus =
  | "operational"
  | "outage"
  | "maintenance";

export type SystemServiceDefinition = {
  id: SystemServiceId;
  label: string;
};

export type SystemServiceSnapshot = {
  serviceId: SystemServiceId;
  label: string;
  status: SystemServiceStatus;
  uptimePercent: number;
  isEstimated: boolean;
  isManualOverride: boolean;
  lastCheckedAt: string | null;
};

export type SystemStatusSnapshot = {
  services: readonly SystemServiceSnapshot[];
  operationalCount: number;
  issueCount: number;
  generatedAt: string;
};

export type HealthProbeEvent = {
  serviceId: SystemServiceId;
  success: boolean;
  timestamp: string;
  source: string;
};
