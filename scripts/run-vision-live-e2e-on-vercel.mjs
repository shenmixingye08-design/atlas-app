#!/usr/bin/env node
/**
 * Vercel build hook: run real OpenAI Vision live E2E when OPENAI_API_KEY is present.
 * Writes evidence to public/__atlas/vision-live-e2e.json (fetched after Preview deploy).
 *
 * Skip when:
 * - ATLAS_VISION_LIVE_E2E=0 / false
 * - OPENAI_API_KEY missing (local builds must not break)
 *
 * On Vercel Preview/Production with a key: require pass (exit 1 on failure).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const disabled =
  process.env.ATLAS_VISION_LIVE_E2E === "0" ||
  process.env.ATLAS_VISION_LIVE_E2E === "false";
const apiKey = process.env.OPENAI_API_KEY?.trim();
const onVercel = process.env.VERCEL === "1";
const outDir = path.join(process.cwd(), ".atlas-vision-live-e2e");
const publicOut = path.join(process.cwd(), "public", "__atlas", "vision-live-e2e.json");

if (disabled) {
  console.log("[vision-live-e2e] skipped (ATLAS_VISION_LIVE_E2E disabled)");
  process.exit(0);
}

if (!apiKey) {
  console.log(
    "[vision-live-e2e] skipped (OPENAI_API_KEY missing — cannot prove real Vision here)",
  );
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
const result = spawnSync(process.execPath, ["scripts/vision-live-e2e.mjs"], {
  env: {
    ...process.env,
    ATLAS_MOCK_LLM: "false",
    ATLAS_LIVE_E2E_OUT: outDir,
  },
  encoding: "utf8",
});

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");

const resultPath = path.join(outDir, "result.json");
if (existsSync(resultPath)) {
  mkdirSync(path.dirname(publicOut), { recursive: true });
  copyFileSync(resultPath, publicOut);
  // Also keep a tiny summary for build logs (no image bytes).
  const parsed = JSON.parse(readFileSync(resultPath, "utf8"));
  const summary = {
    ok: parsed.ok,
    model: parsed.model ?? null,
    responseId: parsed.responseId ?? null,
    companyOk: parsed.companyOk ?? null,
    phoneOk: parsed.phoneOk ?? null,
    extracted: parsed.extracted ?? null,
  };
  console.log("[vision-live-e2e] SUMMARY " + JSON.stringify(summary));
  writeFileSync(
    path.join(process.cwd(), "public", "__atlas", "vision-live-e2e.summary.json"),
    JSON.stringify(summary, null, 2),
  );
}

if (result.status !== 0) {
  console.error("[vision-live-e2e] FAILED — real OpenAI Vision extraction did not pass");
  // Fail the Vercel build so Preview cannot ship a broken vision path unnoticed.
  if (onVercel || process.env.ATLAS_VISION_LIVE_E2E === "1") {
    process.exit(result.status ?? 1);
  }
  process.exit(result.status ?? 1);
}

console.log("[vision-live-e2e] PASSED — OpenAI read company/phone from the image");
process.exit(0);
