import type {
  ConnectorProviderId,
  ConnectorServiceId,
} from "@/lib/connectors";
import type { ActionPermissionStatus } from "@/lib/connections";

export type ActionStatus =
  | "waiting"
  | "ready"
  | "executing"
  | "completed"
  | "failed";

export type ActionDepartmentId =
  | "ceo"
  | "research"
  | "planner"
  | "worker"
  | "qa"
  | "pr"
  | "marketing"
  | "growth"
  | "learning"
  | "automation";

/** @deprecated Use connectorProviderId — kept for compatibility. */
export type ActionProviderId = ConnectorProviderId | "atlas";

/** A single queued action request from a department (planning only). */
export type ActionRequest = {
  id: string;
  requestedBy: string;
  departmentId: ActionDepartmentId;
  action: string;
  /** Connector provider display name. */
  providerName: string;
  /** Connector provider id. */
  providerId: ConnectorProviderId | "atlas";
  /** Service within the provider. */
  serviceId: ConnectorServiceId;
  /** Service display name. */
  targetService: string;
  requiredPermissions: readonly string[];
  permissionStatus: ActionPermissionStatus;
  missingPermissions: readonly string[];
  status: ActionStatus;
  readyForExecution: boolean;
};

type ExtensionStub = { enabled: false; note: string };

/** Action Engine queue produced after company report (no real execution yet). */
export type ActionEngineQueue = {
  actions: readonly ActionRequest[];
  summary: string;
  extensions: ActionEngineExtensions;
};

/** Future-ready capability flags — not implemented yet. */
export type ActionEngineExtensions = {
  oauth: ExtensionStub;
  apiExecution: ExtensionStub;
  retries: ExtensionStub;
  logs: ExtensionStub;
  executionHistory: ExtensionStub;
};

export const ACTION_EXTENSION_STUBS: ActionEngineExtensions = {
  oauth: { enabled: false, note: "OAuth連携（将来対応）" },
  apiExecution: { enabled: false, note: "API実行（将来対応）" },
  retries: { enabled: false, note: "リトライ（将来対応）" },
  logs: { enabled: false, note: "実行ログ（将来対応）" },
  executionHistory: { enabled: false, note: "実行履歴（将来対応）" },
};
