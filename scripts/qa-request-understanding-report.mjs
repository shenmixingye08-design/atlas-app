/**
 * Prints request-understanding accuracy report for QA.
 * Usage: node --import tsx scripts/qa-request-understanding-report.mjs
 * (or via vitest harness — this file is documentation companion)
 */
console.log(
  "Run: npm test -- lib/request-understanding/evaluation-100.test.ts\n" +
    "Targets: mode>=95%, format>=95%, falseExternal=0, unnecessaryClarify<10%, missingMiss<=2%",
);
