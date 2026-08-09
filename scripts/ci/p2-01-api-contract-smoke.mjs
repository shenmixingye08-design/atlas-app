#!/usr/bin/env node
/**
 * P2-01 Production / staging HTTP smoke for API contracts.
 * Never prints secrets. Soft-success forbidden.
 */
import { CRITICAL_SMOKE_PATH } from "./p2-01-api-contract-smoke-paths.mjs";

const PROD_URL = (process.env.PROD_URL || "https://atlasapp.jp").replace(/\/$/, "");

async function main() {
  console.log(`p2_01_smoke_target=${PROD_URL}`);
  const probeUrl = `${PROD_URL}/api/health/api-contracts?force=1`;
  const res = await fetch(probeUrl, {
    headers: { Accept: "application/json", "Cache-Control": "no-store" },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    console.error("::error::P2-01 smoke: non-JSON response");
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      httpStatus: res.status,
      ok: body.ok,
      contractsDefined: body.contractsDefined,
      contractsPassed: body.contractsPassed,
      allCriticalCovered: body.allCriticalCovered,
      memoryNotSot: body.memoryNotSot,
      multiInstanceSafe: body.multiInstanceSafe,
      failClosed: body.failClosed,
      commitShaShort: body.commitShaShort,
      error: body.error,
      failed: Array.isArray(body.results)
        ? body.results.filter((r) => r && r.ok === false).map((r) => r.id)
        : [],
    }),
  );

  const failures = [];
  if (res.status !== 200) failures.push(`http!=200 (${res.status})`);
  if (body.ok !== true) failures.push("ok!=true");
  if (body.allCriticalCovered !== true) failures.push("allCriticalCovered!=true");
  if (body.memoryNotSot !== true) failures.push("memoryNotSot!=true");
  if (body.multiInstanceSafe !== true) failures.push("multiInstanceSafe!=true");
  if (
    typeof body.contractsPassed !== "number" ||
    typeof body.contractsDefined !== "number" ||
    body.contractsPassed !== body.contractsDefined
  ) {
    failures.push("contractsPassed!=contractsDefined");
  }
  // Ensure smoke script stays wired to the critical path constant.
  if (!CRITICAL_SMOKE_PATH.includes("api-contracts")) {
    failures.push("smoke_path_constant_invalid");
  }

  if (failures.length) {
    console.error("::error::P2-01 Production API contract smoke failed:", failures.join(", "));
    process.exit(1);
  }
  console.log("p2_01_production_api_contracts_smoke=pass");
}

main().catch((err) => {
  console.error("::error::P2-01 smoke crashed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
