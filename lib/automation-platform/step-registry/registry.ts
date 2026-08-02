import type {
  AutomationCapabilityId,
  StepRiskLevel,
} from "@/lib/automation-platform/types";

/**
 * Capability Registry — contracts for invoking engines later.
 * Phase 1 does not reimplement Word/Excel/PDF/Vision engines.
 */

export type CapabilityHandlerKind =
  | "internal_engine"
  | "external_integration"
  | "control_flow"
  | "notification";

export type CapabilityDefinition = {
  id: AutomationCapabilityId;
  name: string;
  description: string;
  riskLevel: StepRiskLevel;
  handlerKind: CapabilityHandlerKind;
  /** Feature flag id that must be on when applicable */
  requiredFeatureFlag: string | null;
  /** Connector provider id when external */
  requiredConnector: string | null;
  /** Whether system forces approval regardless of user policy */
  systemRequiresApproval: boolean;
  /** Stable interface key for future invokers */
  invokeContract: string;
  enabled: boolean;
};

export const CAPABILITY_REGISTRY: readonly CapabilityDefinition[] = [
  {
    id: "vision_analysis",
    name: "Vision解析",
    description: "画像・資料の視覚解析",
    riskLevel: "low",
    handlerKind: "internal_engine",
    requiredFeatureFlag: "image_generation",
    requiredConnector: null,
    systemRequiresApproval: false,
    invokeContract: "engines.vision.analyze",
    enabled: true,
  },
  {
    id: "ocr",
    name: "OCR",
    description: "文字認識",
    riskLevel: "low",
    handlerKind: "internal_engine",
    requiredFeatureFlag: null,
    requiredConnector: null,
    systemRequiresApproval: false,
    invokeContract: "engines.ocr.extract",
    enabled: true,
  },
  {
    id: "word_generate",
    name: "Word生成",
    description: "Word成果物生成",
    riskLevel: "low",
    handlerKind: "internal_engine",
    requiredFeatureFlag: null,
    requiredConnector: null,
    systemRequiresApproval: false,
    invokeContract: "engines.deliverable.word",
    enabled: true,
  },
  {
    id: "excel_generate",
    name: "Excel生成",
    description: "Excel成果物生成",
    riskLevel: "low",
    handlerKind: "internal_engine",
    requiredFeatureFlag: null,
    requiredConnector: null,
    systemRequiresApproval: false,
    invokeContract: "engines.deliverable.excel",
    enabled: true,
  },
  {
    id: "pdf_generate",
    name: "PDF生成",
    description: "PDF成果物生成",
    riskLevel: "low",
    handlerKind: "internal_engine",
    requiredFeatureFlag: null,
    requiredConnector: null,
    systemRequiresApproval: false,
    invokeContract: "engines.deliverable.pdf",
    enabled: true,
  },
  {
    id: "powerpoint_generate",
    name: "PowerPoint生成",
    description: "PowerPoint成果物生成",
    riskLevel: "low",
    handlerKind: "internal_engine",
    requiredFeatureFlag: null,
    requiredConnector: null,
    systemRequiresApproval: false,
    invokeContract: "engines.deliverable.powerpoint",
    enabled: true,
  },
  {
    id: "file_convert",
    name: "ファイル変換",
    description: "ファイル形式変換",
    riskLevel: "low",
    handlerKind: "internal_engine",
    requiredFeatureFlag: null,
    requiredConnector: null,
    systemRequiresApproval: false,
    invokeContract: "engines.file.convert",
    enabled: true,
  },
  {
    id: "data_extract",
    name: "データ抽出",
    description: "構造化データ抽出",
    riskLevel: "low",
    handlerKind: "internal_engine",
    requiredFeatureFlag: null,
    requiredConnector: null,
    systemRequiresApproval: false,
    invokeContract: "engines.data.extract",
    enabled: true,
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "メール送信・下書き",
    riskLevel: "high",
    handlerKind: "external_integration",
    requiredFeatureFlag: "google",
    requiredConnector: "google",
    systemRequiresApproval: true,
    invokeContract: "connectors.google.gmail",
    enabled: true,
  },
  {
    id: "x_post",
    name: "X投稿",
    description: "Xへの公開投稿",
    riskLevel: "high",
    handlerKind: "external_integration",
    requiredFeatureFlag: "x",
    requiredConnector: "x",
    systemRequiresApproval: true,
    invokeContract: "connectors.x.post",
    enabled: true,
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    description: "カレンダー作成・更新・削除",
    riskLevel: "high",
    handlerKind: "external_integration",
    requiredFeatureFlag: "google",
    requiredConnector: "google",
    systemRequiresApproval: true,
    invokeContract: "connectors.google.calendar",
    enabled: true,
  },
  {
    id: "wordpress",
    name: "WordPress",
    description: "WordPress公開",
    riskLevel: "high",
    handlerKind: "external_integration",
    requiredFeatureFlag: "wordpress",
    requiredConnector: "wordpress",
    systemRequiresApproval: true,
    invokeContract: "connectors.wordpress.publish",
    enabled: true,
  },
  {
    id: "dropbox",
    name: "Dropbox",
    description: "Dropbox保存・共有",
    riskLevel: "medium",
    handlerKind: "external_integration",
    requiredFeatureFlag: "dropbox",
    requiredConnector: "dropbox",
    systemRequiresApproval: false,
    invokeContract: "connectors.dropbox.upload",
    enabled: true,
  },
  {
    id: "notify",
    name: "通知",
    description: "ユーザー通知",
    riskLevel: "low",
    handlerKind: "notification",
    requiredFeatureFlag: null,
    requiredConnector: null,
    systemRequiresApproval: false,
    invokeContract: "notifications.emit",
    enabled: true,
  },
  {
    id: "await_approval",
    name: "承認待ち",
    description: "ユーザー承認ゲート",
    riskLevel: "low",
    handlerKind: "control_flow",
    requiredFeatureFlag: "automation_approval_enabled",
    requiredConnector: null,
    systemRequiresApproval: false,
    invokeContract: "control.await_approval",
    enabled: true,
  },
  {
    id: "condition",
    name: "条件判定",
    description: "条件分岐",
    riskLevel: "low",
    handlerKind: "control_flow",
    requiredFeatureFlag: null,
    requiredConnector: null,
    systemRequiresApproval: false,
    invokeContract: "control.condition",
    enabled: true,
  },
  {
    id: "wait",
    name: "待機",
    description: "指定時間待機",
    riskLevel: "low",
    handlerKind: "control_flow",
    requiredFeatureFlag: null,
    requiredConnector: null,
    systemRequiresApproval: false,
    invokeContract: "control.wait",
    enabled: true,
  },
  {
    id: "orchestrate",
    name: "仕事の遂行",
    description: "既存オーケストレーション呼び出し",
    riskLevel: "medium",
    handlerKind: "internal_engine",
    requiredFeatureFlag: "ai_employees",
    requiredConnector: null,
    systemRequiresApproval: false,
    invokeContract: "engines.orchestrate",
    enabled: true,
  },
  {
    id: "deliverable_generate",
    name: "成果物生成",
    description: "汎用成果物生成ブリッジ",
    riskLevel: "low",
    handlerKind: "internal_engine",
    requiredFeatureFlag: null,
    requiredConnector: null,
    systemRequiresApproval: false,
    invokeContract: "engines.deliverable.generate",
    enabled: true,
  },
] as const;

const BY_ID = new Map(
  CAPABILITY_REGISTRY.map((entry) => [entry.id, entry] as const),
);

export function getCapability(
  id: AutomationCapabilityId,
): CapabilityDefinition | undefined {
  return BY_ID.get(id);
}

export function requireCapability(
  id: string,
): CapabilityDefinition {
  const found = BY_ID.get(id as AutomationCapabilityId);
  if (!found || !found.enabled) {
    throw new Error(`Unsupported or disabled capability: ${id}`);
  }
  return found;
}

export function isKnownCapabilityId(
  value: string,
): value is AutomationCapabilityId {
  return BY_ID.has(value as AutomationCapabilityId);
}

export function listHighRiskCapabilities(): CapabilityDefinition[] {
  return CAPABILITY_REGISTRY.filter(
    (entry) => entry.riskLevel === "high" || entry.systemRequiresApproval,
  );
}

export function stepRequiresSystemApproval(
  capabilityId: AutomationCapabilityId,
): boolean {
  const capability = getCapability(capabilityId);
  return Boolean(capability?.systemRequiresApproval);
}
