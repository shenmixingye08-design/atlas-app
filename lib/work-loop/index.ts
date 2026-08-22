export {
  classifyWorkKind,
  isAutomatableKind,
  kindHasExternalSideEffect,
  stripVolatileTokens,
  workFingerprint,
} from "./kinds";
export type { AutomatableKind, WorkKind } from "./kinds";

export {
  MIN_REPEAT_FOR_PROPOSAL,
  detectRepeatedWork,
  shouldProposeAutomation,
} from "./repeat-detection";
export type { SuccessfulJob, WorkProposal } from "./repeat-detection";

export {
  dismissProposal,
  isProposalDismissed,
  listDismissedKeys,
  resetDismissStoreForTests,
  restoreAfterColdStart,
  restoreDismissState,
  snapshotDismissState,
} from "./dismiss-store";

export {
  assertConvertEntitlement,
  buildWorkCreateInput,
  convertSuccessfulJobToWork,
  workNeedsReinstruction,
} from "./convert";
export type { ConvertSchedule, ConvertWorkResult } from "./convert";

export {
  buildExecutionReceipt,
  receiptHasProviderProof,
} from "./receipt";
export type { ExecutionReceipt, ReceiptEvidence } from "./receipt";

export {
  DELEGATION_LABELS,
  countHumanInterventions,
  fromDelegationLevel,
  mayAutoSend,
  shouldAskApprovalEveryRun,
  toDelegationLevel,
} from "./delegation";
export type { DelegationLevel } from "./delegation";

export { detectCurrentOverride, resolveEffectiveDelegation } from "./override";

export { projectToSuccessfulJob } from "./from-project";
export { partitionByUser, simulateManyUsers } from "./isolation";
export { measureWorkLoop } from "./metrics";
export { classifyWorkLoopException } from "./exceptions";
export {
  DELEGATION_HEADING,
  DISMISS_PROPOSAL,
  ENTRUST_CTA,
  ENTRUST_FROM_SUCCESS,
  ENTRUST_SECTION_HEADING,
  RECEIPT_HEADING,
} from "./messaging";
