#!/usr/bin/env node
/**
 * CI gate (N-04): Notion / YouTube stubs must not look Production-available.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const required = [
  "lib/integrations/production-capability.ts",
  "lib/integrations/n04-stub-exposure-production-probe.ts",
  "lib/integrations/n04-stub-exposure.test.ts",
  "app/api/health/n04-stub-exposure/route.ts",
  "docs/development/feature-evaluation-n04-notion-youtube-stub-exposure.md",
  ".github/workflows/verify-n04-stub-exposure-production.yml",
];

for (const f of required) {
  if (!existsSync(join(root, f))) violations.push(`${f}: missing`);
}

const probe = read("lib/integrations/n04-stub-exposure-production-probe.ts");
for (const key of [
  "canonicalCapabilityOk",
  "notionCapabilityTruthfulOk",
  "youtubeCapabilityTruthfulOk",
  "notionUiExposureOk",
  "youtubeUiExposureOk",
  "notionAutomationExposureOk",
  "youtubeAutomationExposureOk",
  "pricingExposureOk",
  "landingExposureOk",
  "onboardingExposureOk",
  "unsupportedApiFailClosedOk",
  "stubCannotReturnSuccessOk",
  "existingAutomationSafeOk",
  "crossUserIsolatedOk",
  "secretsRedactedOk",
]) {
  if (!probe.includes(key)) {
    violations.push(`n04 probe: missing ${key}`);
  }
}

const health = read("app/api/health/n04-stub-exposure/route.ts");
if (/authorizeHealthProbe/.test(health)) {
  violations.push("health/n04: must be public probe (no authorizeHealthProbe)");
}
if (!/probeN04StubExposureProduction/.test(health)) {
  violations.push("health/n04: must call probeN04StubExposureProduction");
}

const capability = read("lib/integrations/production-capability.ts");
if (!/PRODUCTION_UNOFFERED_EXTERNAL_SERVICES/.test(capability)) {
  violations.push("production-capability: missing unoffered list");
}
if (!/notion/.test(capability) || !/youtube/.test(capability)) {
  violations.push("production-capability: must classify notion and youtube");
}

const notion = read("lib/integrations/notion/index.ts");
if (/stubConnectService/.test(notion)) {
  violations.push("notion connector: must not use stubConnectService");
}
if (!/unsupportedConnectService/.test(notion)) {
  violations.push("notion connector: must use unsupportedConnectService");
}

const youtube = read("lib/integrations/youtube/index.ts");
if (/stubConnectService/.test(youtube)) {
  violations.push("youtube connector: must not use stubConnectService");
}
if (!/unsupportedConnectService/.test(youtube)) {
  violations.push("youtube connector: must use unsupportedConnectService");
}

const connectors = read("lib/connectors/definitions.ts");
if (!/id:\s*"notion"[\s\S]{0,400}defaultStatus:\s*"coming_soon"/.test(connectors)) {
  violations.push("connectors: notion must be coming_soon");
}

const workflow = read("lib/automations/workflow-templates.ts");
if (/YouTube投稿/.test(workflow)) {
  violations.push("workflow-templates: must not claim YouTube投稿");
}
if (/integration:\s*"youtube"/.test(workflow)) {
  violations.push("workflow-templates: must not use youtube integration");
}

const service = read("lib/integrations/external-services/service.ts");
if (!/isExternalServiceUserVisible/.test(service)) {
  violations.push("external-services/service: must filter by capability visibility");
}
if (!/isExternalServiceConnectable/.test(service)) {
  violations.push("external-services/service: must fail-closed on connect");
}

const qg = read(".github/workflows/quality-gate.yml");
if (!/n04-stub-exposure-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: must run n04 ban");
}
if (!/test:n04-stub-exposure/.test(qg)) {
  violations.push("quality-gate.yml: must run n04 tests");
}
if (!/n07-soft-success-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: N-07 ban must remain");
}
if (!/n08-automation-unify-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: N-08 ban must remain");
}
if (!/n05-memory-apply-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: N-05 ban must remain");
}
if (!/n01-premium-capability-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: N-01 ban must remain");
}
if (!/n02-unproven-speed-claims-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: N-02 ban must remain");
}

const publicRoutes = read("lib/auth/public-routes.ts");
if (!/n04-stub-exposure/.test(publicRoutes)) {
  violations.push("public-routes.ts: must allow /api/health/n04-stub-exposure");
}

const pkg = read("package.json");
if (!/ci:n04-stub-exposure-ban/.test(pkg)) {
  violations.push("package.json: missing ci:n04-stub-exposure-ban");
}
if (!/test:n04-stub-exposure/.test(pkg)) {
  violations.push("package.json: missing test:n04-stub-exposure");
}

if (violations.length) {
  console.error("n04_stub_exposure_ban=fail");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("n04_stub_exposure_ban=pass");
