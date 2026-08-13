export { resolvePresentationIntent, type PresentationIntent } from "./intent";
export { buildSlideStoryboard, type SlidePlan } from "./storyboard";
export { verifyPptxDeck, type PptxVerifyResult } from "./verify";
export {
  estimatePresentationPipelineCost,
  evaluatePptPlanSafety,
  pptCostShareOfPlan,
  type PptxCostEstimate,
} from "./cost-estimate";
export { tableToChartSpec } from "./charts";
export { PPT_LABEL, sanitizeSlideTitle } from "./copy";
