#!/usr/bin/env node
/**
 * CI gate (N-02): Unproven job-completion speed guarantees must not ship.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const required = [
  "lib/marketing/unproven-speed-claims.ts",
  "lib/marketing/unproven-speed-claims-probe.ts",
  "lib/marketing/n02-unproven-speed-claims.test.ts",
  "app/api/health/unproven-speed-claims/route.ts",
  "docs/development/feature-evaluation-n02-unproven-speed-claims.md",
  ".github/workflows/verify-unproven-speed-claims-production.yml",
];

for (const f of required) {
  if (!existsSync(join(root, f))) violations.push(`${f}: missing`);
}

const patterns = [
  /60\s*秒/,
  /60\s*seconds?/i,
  /\bone\s*minute\b/i,
  /秒以内に\s*1\s*件/,
  /1\s*分以内/,
  /1\s*分で\s*(完成|1件|終わ)/,
  /業界最速/,
  /瞬時に/,
  /数秒で\s*(完成|1件|終わ)/,
  /数分で開始/,
  /sixtySecondWin/,
];

const surfaces = [
  "lib/seo/site.ts",
  "lib/i18n/ja.ts",
  "lib/landing/demo-data.ts",
  "lib/landing/content.ts",
  "components/landing/landing-hero-section.tsx",
  "components/landing/landing-cta-section.tsx",
  "components/landing/landing-page.tsx",
  "components/onboarding/first-success-experience.tsx",
  "app/sign-up/[[...sign-up]]/page.tsx",
  "app/pricing/page.tsx",
  "app/page.tsx",
  "app/layout.tsx",
  "lib/legal/terms-content.ts",
  "lib/legal/privacy-content.ts",
];

for (const rel of surfaces) {
  if (!existsSync(join(root, rel))) {
    violations.push(`${rel}: missing`);
    continue;
  }
  const src = read(rel);
  for (const pattern of patterns) {
    if (pattern.test(src)) {
      violations.push(`${rel}: matches forbidden speed claim ${pattern}`);
    }
  }
}

const qg = read(".github/workflows/quality-gate.yml");
if (!/n02-unproven-speed-claims-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: must run n02 ban");
}
if (!/test:unproven-speed-claims/.test(qg)) {
  violations.push("quality-gate.yml: must run n02 tests");
}

const publicRoutes = read("lib/auth/public-routes.ts");
if (!/unproven-speed-claims/.test(publicRoutes)) {
  violations.push("public-routes.ts: must allow /api/health/unproven-speed-claims");
}

const pkg = read("package.json");
if (!/ci:n02-unproven-speed-claims-ban/.test(pkg)) {
  violations.push("package.json: missing ci:n02-unproven-speed-claims-ban script");
}
if (!/test:unproven-speed-claims/.test(pkg)) {
  violations.push("package.json: missing test:unproven-speed-claims script");
}

// N-01 must remain wired (regression guard for this gate file set).
if (!/n01-premium-capability-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: N-01 ban must remain");
}
if (!/test:plan-capability/.test(qg)) {
  violations.push("quality-gate.yml: N-01 tests must remain");
}

if (violations.length) {
  console.error("n02_unproven_speed_claims_ban=fail");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("n02_unproven_speed_claims_ban=pass");
