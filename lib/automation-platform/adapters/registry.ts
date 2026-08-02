import type { AutomationCapabilityId } from "@/lib/automation-platform/types/step";
import type { AutomationStepAdapter } from "@/lib/automation-platform/adapters/types";
import { failResult } from "@/lib/automation-platform/adapters/types";
import {
  deliverableGenerateAdapter,
  excelGenerateAdapter,
  pdfGenerateAdapter,
  powerpointGenerateAdapter,
  wordGenerateAdapter,
} from "@/lib/automation-platform/adapters/deliverable-adapter";
import {
  calendarAdapter,
  dropboxAdapter,
  gmailAdapter,
  wordpressAdapter,
  xPostAdapter,
} from "@/lib/automation-platform/adapters/external-adapters";
import {
  awaitApprovalAdapter,
  conditionAdapter,
  waitAdapter,
} from "@/lib/automation-platform/adapters/control-adapter";
import { notifyAdapter } from "@/lib/automation-platform/adapters/notify-adapter";
import {
  dataExtractAdapter,
  ocrAdapter,
  visionAnalysisAdapter,
} from "@/lib/automation-platform/adapters/vision-adapter";
import { fileConvertAdapter } from "@/lib/automation-platform/adapters/file-convert-adapter";

const ADAPTERS: AutomationStepAdapter[] = [
  wordGenerateAdapter,
  excelGenerateAdapter,
  pdfGenerateAdapter,
  powerpointGenerateAdapter,
  deliverableGenerateAdapter,
  fileConvertAdapter,
  visionAnalysisAdapter,
  ocrAdapter,
  dataExtractAdapter,
  notifyAdapter,
  awaitApprovalAdapter,
  waitAdapter,
  conditionAdapter,
  xPostAdapter,
  gmailAdapter,
  calendarAdapter,
  wordpressAdapter,
  dropboxAdapter,
];

const BY_TYPE = new Map<AutomationCapabilityId, AutomationStepAdapter>(
  ADAPTERS.map((adapter) => [adapter.type, adapter]),
);

export function getLiveStepAdapter(
  type: AutomationCapabilityId,
): AutomationStepAdapter | null {
  return BY_TYPE.get(type) ?? null;
}

export function listLiveStepAdapterTypes(): AutomationCapabilityId[] {
  return [...BY_TYPE.keys()];
}

/** Capabilities that intentionally remain unwired (fail-closed). */
export const UNWIRED_LIVE_CAPABILITIES: readonly AutomationCapabilityId[] = [
  "orchestrate",
] as const;

export function missingAdapterResult(type: AutomationCapabilityId) {
  return failResult({
    status: "failed",
    summary: `${type} のライブアダプタは未接続です`,
    errorCode: "automation_unsupported_step",
    errorMessage: `${type}_live_adapter_not_wired`,
  });
}
