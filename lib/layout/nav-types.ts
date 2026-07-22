/** Page identifiers used for sidebar / shell active-state highlighting. */
export type AtlasNavPage =
  | "projects"
  | "commander"
  | "history"
  | "automations"
  | "deliverables"
  | "settings"
  | "x-autopost"
  | "workspace"
  | "work-memory"
  | "learning"
  | "billing"
  | "contact"
  | "help"
  /** Legacy page ids — kept for existing routes; not shown in general nav. */
  | "mihon"
  | "company"
  | "integrations"
  | "connectors"
  | "connections"
  | "chat";
