import type { OwnerExternalServiceId } from "./types";

export type OwnerExternalServiceDefinition = {
  serviceId: OwnerExternalServiceId;
  label: string;
  settingsHref: string;
  reconnectServiceId: "google" | "dropbox" | null;
  /** When true, OAuth column applies. */
  supportsOauth: boolean;
  /** When true, Webhook column applies. */
  supportsWebhook: boolean;
  /** Parent connection store id for user OAuth aggregation. */
  connectionServiceId: "google" | "dropbox" | "notion" | null;
  implementation: "live" | "stub" | "planned";
};

export const OWNER_EXTERNAL_SERVICE_DEFINITIONS: readonly OwnerExternalServiceDefinition[] =
  [
    {
      serviceId: "google",
      label: "Google",
      settingsHref: "/settings",
      reconnectServiceId: "google",
      supportsOauth: true,
      supportsWebhook: false,
      connectionServiceId: "google",
      implementation: "live",
    },
    {
      serviceId: "gmail",
      label: "Gmail",
      settingsHref: "/settings/google/gmail",
      reconnectServiceId: "google",
      supportsOauth: true,
      supportsWebhook: false,
      connectionServiceId: "google",
      implementation: "live",
    },
    {
      serviceId: "calendar",
      label: "Calendar",
      settingsHref: "/settings/google/calendar",
      reconnectServiceId: "google",
      supportsOauth: true,
      supportsWebhook: false,
      connectionServiceId: "google",
      implementation: "live",
    },
    {
      serviceId: "drive",
      label: "Drive",
      settingsHref: "/settings/google/drive",
      reconnectServiceId: "google",
      supportsOauth: true,
      supportsWebhook: false,
      connectionServiceId: "google",
      implementation: "live",
    },
    {
      serviceId: "dropbox",
      label: "Dropbox",
      settingsHref: "/settings",
      reconnectServiceId: "dropbox",
      supportsOauth: true,
      supportsWebhook: false,
      connectionServiceId: "dropbox",
      implementation: "live",
    },
    {
      serviceId: "line",
      label: "LINE",
      settingsHref: "/settings/notifications",
      reconnectServiceId: null,
      supportsOauth: false,
      supportsWebhook: true,
      connectionServiceId: null,
      implementation: "live",
    },
    {
      serviceId: "stripe",
      label: "Stripe",
      settingsHref: "/owner/billing-webhook",
      reconnectServiceId: null,
      supportsOauth: false,
      supportsWebhook: true,
      connectionServiceId: null,
      implementation: "live",
    },
    {
      serviceId: "github",
      label: "GitHub",
      settingsHref: "/settings",
      reconnectServiceId: null,
      supportsOauth: true,
      supportsWebhook: true,
      connectionServiceId: null,
      implementation: "planned",
    },
    {
      serviceId: "slack",
      label: "Slack",
      settingsHref: "/settings",
      reconnectServiceId: null,
      supportsOauth: true,
      supportsWebhook: true,
      connectionServiceId: null,
      implementation: "planned",
    },
    {
      serviceId: "discord",
      label: "Discord",
      settingsHref: "/settings",
      reconnectServiceId: null,
      supportsOauth: true,
      supportsWebhook: true,
      connectionServiceId: null,
      implementation: "planned",
    },
    {
      serviceId: "notion",
      label: "Notion",
      settingsHref: "/settings",
      reconnectServiceId: null,
      supportsOauth: true,
      supportsWebhook: false,
      connectionServiceId: "notion",
      implementation: "stub",
    },
    {
      serviceId: "microsoft",
      label: "Microsoft",
      settingsHref: "/settings",
      reconnectServiceId: null,
      supportsOauth: true,
      supportsWebhook: false,
      connectionServiceId: null,
      implementation: "planned",
    },
  ] as const;

export function isOwnerExternalServiceId(
  value: string,
): value is OwnerExternalServiceId {
  return OWNER_EXTERNAL_SERVICE_DEFINITIONS.some(
    (definition) => definition.serviceId === value,
  );
}
