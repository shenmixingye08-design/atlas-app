import type { ProductionConnectorDefinition } from "./types";

const connectors = new Map<string, ProductionConnectorDefinition>();

export const PRODUCTION_CONNECTORS: readonly ProductionConnectorDefinition[] = [
  {
    id: "x",
    displayName: "X",
    authType: "oauth2",
    supports: [
      "post",
      "post_with_media",
      "history",
      "oauth_connect",
      "oauth_reconnect",
      "oauth_disconnect",
      "token_refresh",
    ],
  },
  {
    id: "gmail",
    displayName: "Gmail",
    authType: "oauth2",
    supports: [
      "send",
      "reply",
      "draft",
      "html",
      "attachment",
      "cc",
      "bcc",
      "oauth_connect",
      "token_refresh",
    ],
  },
  {
    id: "google_calendar",
    displayName: "Google Calendar",
    authType: "oauth2",
    supports: [
      "create",
      "update",
      "delete",
      "timezone",
      "attendees",
      "reminder",
      "oauth_connect",
      "token_refresh",
    ],
  },
  {
    id: "wordpress",
    displayName: "WordPress",
    authType: "application_password",
    supports: [
      "draft",
      "publish",
      "update",
      "categories",
      "tags",
      "featured_image",
      "seo",
    ],
  },
  {
    id: "dropbox",
    displayName: "Dropbox",
    authType: "oauth2",
    supports: [
      "upload",
      "download",
      "ensure_folder",
      "revision",
      "no_overwrite",
      "oauth_connect",
      "oauth_reconnect",
      "token_refresh",
    ],
  },
] as const;

for (const definition of PRODUCTION_CONNECTORS) {
  connectors.set(definition.id, definition);
}

/** Register an additional integration without changing core pipelines. */
export function registerProductionConnector(
  definition: ProductionConnectorDefinition,
): void {
  connectors.set(definition.id, definition);
}

export function getProductionConnector(
  id: string,
): ProductionConnectorDefinition | null {
  return connectors.get(id) ?? null;
}

export function listProductionConnectors(): readonly ProductionConnectorDefinition[] {
  return [...connectors.values()];
}
