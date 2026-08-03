#!/usr/bin/env node
/**
 * CI gate: Production Blocker #5 first-value experience invariants.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
let failed = 0;

function mustExist(rel) {
  if (!existsSync(join(ROOT, rel))) {
    console.error(`FAIL missing file: ${rel}`);
    failed += 1;
  }
}

function mustContain(rel, re, msg) {
  const text = readFileSync(join(ROOT, rel), "utf8");
  if (!re.test(text)) {
    console.error(`FAIL ${rel}: ${msg}`);
    failed += 1;
  }
}

mustExist("lib/first-value/feature-evaluation.ts");
mustExist("app/api/first-value/run/route.ts");
mustExist("app/automations/quick-start/page.tsx");
mustExist("app/first-value/complete/page.tsx");
mustExist("components/first-value/quick-start.tsx");
mustExist("components/first-value/job-complete.tsx");
mustExist("components/first-value/empty-first-job.tsx");
mustExist("docs/development/first-value-blocker5-report.md");

mustContain(
  "components/onboarding/welcome-wizard.tsx",
  /\/automations\/quick-start/,
  "Welcome wizard must route to Quick Start (not end at wizard)",
);
mustContain(
  "components/automation-first/automation-first-home.tsx",
  /AI秘書ダッシュボード/,
  "Home must show AI secretary dashboard",
);
mustContain(
  "components/automation-first/automation-first-home.tsx",
  /EmptyFirstJob/,
  "Home empty state must use EmptyFirstJob",
);
mustContain(
  "components/first-value/quick-start.tsx",
  /\/api\/first-value\/run/,
  "Quick Start must immediate-run via first-value API",
);
mustContain(
  "components/first-value/job-complete.tsx",
  /仕事完了/,
  "Completion UI must be job-complete journey",
);
mustContain(
  "lib/first-value/proposal.ts",
  /selectSingleAiProposal/,
  "AI proposal must be single-select",
);
mustContain(
  "lib/notifications/types.ts",
  /recommendationEnabled:\s*false/,
  "Recommendation/ad notifications must be off by default",
);
mustContain(
  "components/home/proactive-suggestions-panel.tsx",
  /\.slice\(0,\s*1\)/,
  "Proactive UI must cap to 1 suggestion",
);
mustContain(
  "app/api/first-value/run/route.ts",
  /generateDeliverables/,
  "First-value run must produce real deliverables",
);

if (failed > 0) {
  console.error(`assert-first-value: ${failed} violation(s)`);
  process.exit(1);
}
console.log("assert-first-value CI gate PASS");
