#!/usr/bin/env node
/**
 * CI gate: integrations must not claim stub/mock success in production paths.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
let failed = 0;

const required = [
  {
    file: "lib/live-adapters/registry/production.ts",
    re: /gmailLiveAdapter|xLiveAdapter|dropboxLiveAdapter/,
    msg: "Production registry must include live adapters",
  },
  {
    file: "lib/automation-platform/execution/strict-step-invoker.ts",
    re: /invokeLiveAdapterForStep/,
    msg: "strictStepInvoker must call Live Adapter Registry",
  },
  {
    file: "lib/automation-platform/execution/production-step-registry.ts",
    re: /google_gmail/,
    msg: "isLiveAdapterWired must include google_gmail",
  },
  {
    file: "lib/integrations/notion/index.ts",
    re: /未対応/,
    msg: "Notion stub connect success must be forbidden",
  },
  {
    file: "lib/integration-platform/retry-policy.ts",
    re: /non_retryable_4xx/,
    msg: "Retry policy must ban arbitrary 4xx retries",
  },
];

const forbidden = [
  {
    file: "lib/live-adapters/registry/production.ts",
    re: /classification:\s*["'](sandbox|mock|stub)["']/,
    msg: "Production registry must not register sandbox/mock/stub adapters",
  },
];

for (const rule of required) {
  const text = readFileSync(join(ROOT, rule.file), "utf8");
  if (!rule.re.test(text)) {
    console.error(`FAIL missing: ${rule.file}: ${rule.msg}`);
    failed += 1;
  }
}

for (const rule of forbidden) {
  const text = readFileSync(join(ROOT, rule.file), "utf8");
  if (rule.re.test(text)) {
    console.error(`FAIL forbidden: ${rule.file}: ${rule.msg}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`integrations-production-ban: ${failed} violation(s)`);
  process.exit(1);
}
console.log("integrations-production-ban CI gate PASS");
