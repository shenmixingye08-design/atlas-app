export {
  AI_EXECUTIVE_ASSISTANT_FEATURE_EVALUATION,
} from "./feature-evaluation";
export type {
  AutomationScoreBand,
  AutomationStarRating,
  ExecutiveAssistantInput,
  ExecutiveDashboard,
  ExecutiveMemoryChain,
  ExecutiveProposal,
  ExecutiveProposalKind,
  SecretaryMode,
  WorkStyleTrait,
} from "./types";
export {
  bandLabel,
  computeAutomationScore,
  scoreToBand,
  scoreToStars,
  starsLabel,
} from "./scoring";
export {
  discoverFileAndDeliveryHabits,
  discoverMemoryStandards,
  discoverRecurringWork,
  discoverRepeatedCorrections,
} from "./discovery";
export {
  detectDeadlines,
  detectReplyMiss,
  predictNextWork,
} from "./prediction";
export { buildExecutiveMemoryChains } from "./executive-memory";
export {
  buildExecutiveDashboard,
  inferWorkStyle,
} from "./dashboard";
export {
  SECRETARY_MODE_LABELS,
  dismissExecutiveProposal,
  loadExecutiveAssistantSettings,
  recordWorkStyleTrait,
  saveExecutiveAssistantSettings,
  snoozeExecutiveProposal,
  updateSecretaryMode,
} from "./settings";
export type { ExecutiveAssistantSettings } from "./settings";
export {
  applySecretaryModeCopy,
  canFullAutoComplete,
  requiresHumanApproval,
  secretaryModeAllowsProposals,
} from "./secretary-mode";
