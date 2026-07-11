/** Operator-facing external service catalog for /owner. */
export type OwnerExternalServiceId =
  | "google"
  | "gmail"
  | "calendar"
  | "drive"
  | "dropbox"
  | "line"
  | "stripe"
  | "github"
  | "slack"
  | "discord"
  | "notion"
  | "microsoft";

export type OwnerExternalConnectionStatus = "connected" | "disconnected";

export type OwnerExternalServiceSnapshot = {
  serviceId: OwnerExternalServiceId;
  label: string;
  connectionStatus: OwnerExternalConnectionStatus;
  envConfigured: boolean;
  oauthConfigured: boolean | null;
  webhookConfigured: boolean | null;
  apiEnabled: boolean;
  lastConnectedAt: string | null;
  reconnectAvailable: boolean;
  settingsHref: string;
  /** OAuth reconnect target for shared Google account flows. */
  reconnectServiceId: "google" | "dropbox" | null;
  connectedUserCount: number;
};

export type OwnerExternalServicesSnapshot = {
  services: OwnerExternalServiceSnapshot[];
  connectedCount: number;
  generatedAt: string;
};
