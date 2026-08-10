#!/usr/bin/env node
/**
 * CI gate (N-03): PowerPoint must be discoverable and route to real pptx.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const required = [
  "lib/deliverables/n03-powerpoint-product-surface-probe.ts",
  "lib/deliverables/n03-powerpoint-product-surface.test.ts",
  "app/api/health/n03-powerpoint-product-surface/route.ts",
  "docs/development/feature-evaluation-n03-powerpoint-product-surface.md",
  ".github/workflows/verify-n03-powerpoint-product-surface-production.yml",
  "public/samples/sales-deck.pptx",
];

for (const f of required) {
  if (!existsSync(join(root, f))) violations.push(`${f}: missing`);
}

const probe = read("lib/deliverables/n03-powerpoint-product-surface-probe.ts");
for (const key of [
  "powerpointCapabilityOk",
  "powerpointRoutingOk",
  "pptxGenerationOk",
  "pptxMimeOk",
  "pptxDownloadOk",
  "artifactPersistenceOk",
  "mobileExposureOk",
  "failClosedOk",
  "crossUserIsolatedOk",
  "secretsRedactedOk",
]) {
  if (!probe.includes(key)) {
    violations.push(`n03 probe: missing ${key}`);
  }
}

const health = read("app/api/health/n03-powerpoint-product-surface/route.ts");
if (/authorizeHealthProbe/.test(health)) {
  violations.push("health/n03: must be public probe");
}
if (!/probeN03PowerpointProductSurface/.test(health)) {
  violations.push("health/n03: must call probeN03PowerpointProductSurface");
}

const detect = read("lib/deliverables/detect-formats.ts");
if (!/id:\s*"powerpoint"/.test(detect)) {
  violations.push("detect-formats: missing powerpoint rule");
}
if (!/assignmentRequestsPowerpoint/.test(detect)) {
  violations.push("detect-formats: missing assignmentRequestsPowerpoint");
}
if (!/パワポ/.test(detect) || !/powerpoint/.test(detect)) {
  violations.push("detect-formats: must include PowerPoint / パワポ keywords");
}

const presets = read("lib/workspace/quick-request-presets.ts");
if (!/PowerPoint/.test(presets)) {
  violations.push("quick-request-presets: must expose PowerPoint");
}

const home = read("lib/home/frequent-work-presets.ts");
if (!/PowerPoint/.test(home)) {
  violations.push("frequent-work-presets: must expose PowerPoint");
}

const homeChat = read("components/home/home-chat-bar.tsx");
if (!/value="pptx"/.test(homeChat)) {
  violations.push("home-chat-bar: missing pptx option");
}

const workForm = read("components/workspace/work-request-form.tsx");
if (!/value="pptx"/.test(workForm)) {
  violations.push("work-request-form: missing pptx option");
}

const proof = read("lib/landing/proof-samples.ts");
if (!/kind:\s*"pptx"/.test(proof) || !/PROOF_PPTX_BODY/.test(proof)) {
  violations.push("proof-samples: missing pptx proof definition");
}

const objection = read("components/landing/landing-objection-killers.tsx");
if (!/PowerPoint/.test(objection)) {
  violations.push("landing-objection-killers: must mention PowerPoint");
}

const qg = read(".github/workflows/quality-gate.yml");
if (!/n03-powerpoint-product-surface-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: must run n03 ban");
}
if (!/test:n03-powerpoint-product-surface/.test(qg)) {
  violations.push("quality-gate.yml: must run n03 tests");
}
for (const keep of [
  "n01-premium-capability-ban",
  "n02-unproven-speed-claims-ban",
  "n04-stub-exposure-ban",
  "n05-memory-apply-ban",
  "n07-soft-success-ban",
  "n08-automation-unify-ban",
]) {
  if (!qg.includes(keep)) {
    violations.push(`quality-gate.yml: ${keep} must remain`);
  }
}

const publicRoutes = read("lib/auth/public-routes.ts");
if (!/n03-powerpoint-product-surface/.test(publicRoutes)) {
  violations.push("public-routes.ts: must allow n03 health route");
}

const pkg = read("package.json");
if (!/ci:n03-powerpoint-product-surface-ban/.test(pkg)) {
  violations.push("package.json: missing ci:n03-powerpoint-product-surface-ban");
}
if (!/test:n03-powerpoint-product-surface/.test(pkg)) {
  violations.push("package.json: missing test:n03-powerpoint-product-surface");
}

if (violations.length) {
  console.error("n03_powerpoint_product_surface_ban=fail");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("n03_powerpoint_product_surface_ban=pass");
