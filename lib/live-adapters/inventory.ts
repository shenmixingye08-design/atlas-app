import type { AdapterClassification } from "./types";

export type AdapterAuditRow = {
  service: string;
  classification: AdapterClassification;
  implementationFiles: string[];
  registry: string;
  callers: string[];
  notes: string;
};

/**
 * Static audit inventory — Production Live Adapter phase baseline.
 * Unsupported services must not appear as connectable Live adapters.
 */
export const ADAPTER_AUDIT_INVENTORY: readonly AdapterAuditRow[] = [
  {
    service: "Google Drive",
    classification: "production_live",
    implementationFiles: [
      "lib/live-adapters/adapters/google-drive-adapter.ts",
      "lib/integrations/google/drive/service.ts",
    ],
    registry: "createProductionAdapterRegistry",
    callers: ["strictStepInvoker", "V1 deliverable upload"],
    notes: "fileId + webViewLink required",
  },
  {
    service: "Gmail",
    classification: "production_live",
    implementationFiles: [
      "lib/live-adapters/adapters/gmail-adapter.ts",
      "lib/integrations/google/gmail/service.ts",
      "lib/integrations/google/gmail/api-client.ts",
    ],
    registry: "createProductionAdapterRegistry",
    callers: ["strictStepInvoker"],
    notes: "compose draft/send with messageId/draftId",
  },
  {
    service: "Google Calendar",
    classification: "production_live",
    implementationFiles: [
      "lib/live-adapters/adapters/google-calendar-adapter.ts",
      "lib/integrations/google/calendar/service.ts",
    ],
    registry: "createProductionAdapterRegistry",
    callers: ["strictStepInvoker"],
    notes: "eventId + htmlLink required",
  },
  {
    service: "Dropbox",
    classification: "production_live",
    implementationFiles: [
      "lib/live-adapters/adapters/dropbox-adapter.ts",
      "lib/integrations/dropbox/service.ts",
    ],
    registry: "createProductionAdapterRegistry",
    callers: ["strictStepInvoker"],
    notes: "file id/path + shared link when available",
  },
  {
    service: "WordPress",
    classification: "production_live",
    implementationFiles: [
      "lib/live-adapters/adapters/wordpress-adapter.ts",
      "lib/integrations/wordpress/post/service.ts",
    ],
    registry: "createProductionAdapterRegistry",
    callers: ["strictStepInvoker"],
    notes: "postId + link for publish",
  },
  {
    service: "X",
    classification: "production_live",
    implementationFiles: [
      "lib/live-adapters/adapters/x-adapter.ts",
      "lib/integrations/x/post/service.ts",
    ],
    registry: "createProductionAdapterRegistry",
    callers: ["strictStepInvoker", "V1 automation", "Commander"],
    notes: "tweetId + tweetUrl required",
  },
  {
    service: "Supabase Storage",
    classification: "partial",
    implementationFiles: ["lib/deliverables/object-storage.ts"],
    registry: "unregistered (internal)",
    callers: ["deliverables engine"],
    notes: "internal object store, not user connector",
  },
  {
    service: "Push",
    classification: "partial",
    implementationFiles: ["lib/push/", "lib/notifications/delivery.ts"],
    registry: "unregistered (notifications)",
    callers: ["notification delivery"],
    notes: "live when VAPID configured",
  },
  {
    service: "LINE",
    classification: "partial",
    implementationFiles: ["lib/integrations/line/"],
    registry: "unregistered (notifications)",
    callers: ["notification delivery"],
    notes: "notification path only",
  },
  {
    service: "Email delivery",
    classification: "partial",
    implementationFiles: ["lib/live-adapters/adapters/gmail-adapter.ts"],
    registry: "via gmail",
    callers: ["strictStepInvoker"],
    notes: "Gmail compose path",
  },
  {
    service: "Webhook",
    classification: "unsupported",
    implementationFiles: [],
    registry: "unregistered",
    callers: [],
    notes: "not registered as Live Adapter",
  },
  {
    service: "S3 / R2",
    classification: "unsupported",
    implementationFiles: [],
    registry: "unregistered",
    callers: [],
    notes: "no implementation",
  },
  {
    service: "Slack",
    classification: "unsupported",
    implementationFiles: [],
    registry: "unregistered",
    callers: ["UI catalog only"],
    notes: "must not appear as available Live Adapter",
  },
  {
    service: "Discord",
    classification: "unsupported",
    implementationFiles: [],
    registry: "unregistered",
    callers: ["UI catalog only"],
    notes: "unsupported",
  },
  {
    service: "Notion",
    classification: "stub",
    implementationFiles: ["lib/integrations/notion/index.ts"],
    registry: "external-services (removed from connectable in production UI)",
    callers: ["settings catalog"],
    notes: "stubConnect — marked unsupported for activation",
  },
  {
    service: "YouTube",
    classification: "stub",
    implementationFiles: ["lib/integrations/youtube/index.ts"],
    registry: "external-services (removed from connectable in production UI)",
    callers: ["settings catalog"],
    notes: "stubConnect — marked unsupported",
  },
  {
    service: "Teams",
    classification: "unsupported",
    implementationFiles: [],
    registry: "unregistered",
    callers: ["connectors coming_soon"],
    notes: "unsupported",
  },
  {
    service: "defaultStepInvoker external drafts",
    classification: "sandbox",
    implementationFiles: [
      "lib/automation-platform/execution/step-invoker.ts",
    ],
    registry: "forbidden in production dispatch",
    callers: ["tests / soft paths only"],
    notes: "Production dispatch uses strictStepInvoker + Live Registry only",
  },
];
