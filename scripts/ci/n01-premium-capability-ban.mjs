#!/usr/bin/env node
/**
 * CI gate (N-01): Unoffered media generation must not be sold/shown as available.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const required = [
  "lib/billing/plans/offered-capabilities.ts",
  "lib/billing/plans/plan-capability-honesty-probe.ts",
  "lib/billing/plans/n01-premium-capability-honesty.test.ts",
  "app/api/health/plan-capability/route.ts",
  "docs/development/feature-evaluation-n01-premium-capability-honesty.md",
  ".github/workflows/verify-plan-capability-production.yml",
];

for (const f of required) {
  if (!existsSync(join(root, f))) violations.push(`${f}: missing`);
}

const registry = read("lib/billing/plans/registry.ts");
if (/PREMIUM_FEATURES[\s\S]*video_generation/.test(registry)) {
  violations.push("registry.ts: PREMIUM_FEATURES must not include video_generation");
}
if (/PREMIUM_FEATURES[\s\S]*image_generation/.test(registry)) {
  violations.push("registry.ts: PREMIUM_FEATURES must not include image_generation");
}
if (/planId:\s*"premium"[\s\S]*videoGeneration:\s*true/.test(registry)) {
  violations.push("registry.ts: premium.videoGeneration must be false");
}
if (/planId:\s*"premium"[\s\S]*imageGeneration:\s*true/.test(registry)) {
  violations.push("registry.ts: premium.imageGeneration must be false");
}

const presets = read("lib/workspace/quick-request-presets.ts");
if (/label:\s*"画像生成"/.test(presets)) {
  violations.push("quick-request-presets.ts: must not expose 画像生成 preset");
}

const terms = read("lib/legal/terms-content.ts");
if (terms.includes("画像生成 —") || terms.includes("動画生成 —")) {
  violations.push("terms-content.ts: must not list media generation as offered");
}

const landing = read("lib/landing/content.ts");
if (/id:\s*"video"/.test(landing)) {
  violations.push("landing/content.ts: must not advertise video request card");
}

const store = read("lib/feature-flags/store.ts");
if (!/video_generation:\s*"off"/.test(store) || !/image_generation:\s*"off"/.test(store)) {
  violations.push("feature-flags/store.ts: media flags must default off");
}

const access = read("lib/feature-flags/access.ts");
if (!/video_generation/.test(access) || !/image_generation/.test(access)) {
  violations.push("feature-flags/access.ts: must hard-close media flags for non-owners");
}

const vision = read("lib/automation-platform/step-registry/registry.ts");
if (/id:\s*"vision_analysis"[\s\S]{0,240}requiredFeatureFlag:\s*"image_generation"/.test(vision)) {
  violations.push("step-registry: vision must not require image_generation");
}

const qg = read(".github/workflows/quality-gate.yml");
if (!/n01-premium-capability-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: must run n01 ban");
}
if (!/test:plan-capability/.test(qg)) {
  violations.push("quality-gate.yml: must run n01 tests");
}

const publicRoutes = read("lib/auth/public-routes.ts");
if (!/plan-capability/.test(publicRoutes)) {
  violations.push("public-routes.ts: must allow /api/health/plan-capability");
}

if (violations.length) {
  console.error("n01_premium_capability_ban=fail");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("n01_premium_capability_ban=pass");
