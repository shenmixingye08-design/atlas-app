/**
 * Offline cost simulation — compares pre-v1 vs post-v1 workflow economics.
 * Run: npx tsx scripts/cost-simulation.ts
 */

import { resolveTaskPolicy, decisionToModelPolicy } from "../lib/ai/policy-engine";
import { estimateTokens } from "../lib/ai/cost-meter";
import type { AiTaskType } from "../lib/ai/model-policy";

type Scenario = {
  name: string;
  tasks: number;
  research: boolean;
  revision: boolean;
  reviewerFallback: boolean;
};

const SCENARIOS: Scenario[] = [
  { name: "Blog request", tasks: 3, research: true, revision: false, reviewerFallback: false },
  { name: "Sales document", tasks: 2, research: false, revision: false, reviewerFallback: false },
  { name: "Market research", tasks: 4, research: true, revision: false, reviewerFallback: true },
  { name: "Simple email", tasks: 1, research: false, revision: false, reviewerFallback: false },
  { name: "Complex project", tasks: 5, research: true, revision: true, reviewerFallback: true },
];

/** Pre-v1: all steps on gpt-5.5 flagship pricing. */
function estimateBefore(scenario: Scenario): { calls: number; costUsd: number } {
  const N = scenario.tasks;
  const R = scenario.research ? 2 : 0;
  const baseCalls = 2 + R + 2 + N + N + 1 + 1; // CEO×2 + research + planner×2 + workers + reviewers + QA + CEO approval
  const revisionCalls = scenario.revision ? N + N + 1 : 0;
  const calls = baseCalls + revisionCalls;

  const flagship = decisionToModelPolicy(resolveTaskPolicy("worker_deliverable"));
  const avgInput = 5000;
  const avgOutput = 1500;
  const costPerCall =
    (avgInput / 1_000_000) * flagship.inputPricePerMillion +
    (avgOutput / 1_000_000) * flagship.outputPricePerMillion;

  return { calls, costUsd: calls * costPerCall };
}

/** Post-v1 optimized pipeline. */
function estimateAfter(scenario: Scenario): { calls: number; costUsd: number } {
  let calls = 0;
  let costUsd = 0;

  const addCall = (
    taskType: AiTaskType,
    inputChars: number,
    outputChars: number,
  ) => {
    calls += 1;
    const policy = decisionToModelPolicy(resolveTaskPolicy(taskType));
    const inputTokens = estimateTokens("x".repeat(inputChars));
    const outputTokens = estimateTokens("x".repeat(outputChars));
    costUsd +=
      (inputTokens / 1_000_000) * policy.inputPricePerMillion +
      (outputTokens / 1_000_000) * policy.outputPricePerMillion;
  };

  addCall("planner_unified", 2500, 1200);
  if (scenario.research) addCall("research_synthesis", 2000, 1500);
  addCall("worker_deliverable", 4000, 6000);
  if (scenario.revision) addCall("worker_revision", 3500, 5500);
  if (scenario.reviewerFallback) addCall("reviewer_fallback", 3000, 600);

  return { calls, costUsd };
}

function pct(before: number, after: number): string {
  if (before === 0) return "—";
  return `${(((before - after) / before) * 100).toFixed(1)}%`;
}

console.log("=".repeat(72));
console.log("ATLAS API Cost Optimization v1 — Simulation Report");
console.log("=".repeat(72));
console.log("");

let totalBeforeCalls = 0;
let totalAfterCalls = 0;
let totalBeforeCost = 0;
let totalAfterCost = 0;

console.log(
  "| Scenario".padEnd(22) +
    "| Before Calls | After Calls | Before Cost | After Cost | Reduction |",
);
console.log("|".padEnd(22) + "|-------------:|------------:|------------:|-----------:|----------:|");

for (const scenario of SCENARIOS) {
  const before = estimateBefore(scenario);
  const after = estimateAfter(scenario);
  totalBeforeCalls += before.calls;
  totalAfterCalls += after.calls;
  totalBeforeCost += before.costUsd;
  totalAfterCost += after.costUsd;

  console.log(
    `| ${scenario.name.padEnd(20)} | ${String(before.calls).padStart(11)} | ${String(after.calls).padStart(11)} | $${before.costUsd.toFixed(4).padStart(9)} | $${after.costUsd.toFixed(4).padStart(8)} | ${pct(before.costUsd, after.costUsd).padStart(9)} |`,
  );
}

console.log("");
console.log("Aggregate (5 scenarios):");
console.log(`  Avg calls BEFORE: ${(totalBeforeCalls / SCENARIOS.length).toFixed(1)}`);
console.log(`  Avg calls AFTER:  ${(totalAfterCalls / SCENARIOS.length).toFixed(1)}`);
console.log(`  Avg cost BEFORE:  $${(totalBeforeCost / SCENARIOS.length).toFixed(4)} / workflow`);
console.log(`  Avg cost AFTER:   $${(totalAfterCost / SCENARIOS.length).toFixed(4)} / workflow`);
console.log(`  Cost reduction:   ${pct(totalBeforeCost, totalAfterCost)}`);
console.log("");
console.log("Per 1,000 workflows (avg):");
console.log(`  BEFORE: $${((totalBeforeCost / SCENARIOS.length) * 1000).toFixed(2)}`);
console.log(`  AFTER:  $${((totalAfterCost / SCENARIOS.length) * 1000).toFixed(2)}`);
console.log(`  SAVINGS: $${(((totalBeforeCost - totalAfterCost) / SCENARIOS.length) * 1000).toFixed(2)}`);
console.log("");
