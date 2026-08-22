/**
 * Measurable work-loop metrics. Never invent UI time-saved numbers.
 */

export type WorkLoopMetrics = {
  firstRequestSpecCount: number;
  secondRequestSpecCount: number;
  humanInterventionCount: number;
  repeatedWorkDetection: number;
  workConversionRate: number;
  executionProofCoverage: number;
  sideEffectDuplication: number;
};

export function measureWorkLoop(input: {
  firstRequestSpecCount: number;
  secondRequestSpecCount: number;
  humanInterventionCount: number;
  proposals: number;
  conversions: number;
  receipts: number;
  receiptsWithProof: number;
  sideEffectDuplication: number;
}): WorkLoopMetrics {
  return {
    firstRequestSpecCount: input.firstRequestSpecCount,
    secondRequestSpecCount: input.secondRequestSpecCount,
    humanInterventionCount: input.humanInterventionCount,
    repeatedWorkDetection: input.proposals,
    workConversionRate: input.proposals === 0 ? 0 : input.conversions / input.proposals,
    executionProofCoverage:
      input.receipts === 0 ? 0 : input.receiptsWithProof / input.receipts,
    sideEffectDuplication: input.sideEffectDuplication,
  };
}
