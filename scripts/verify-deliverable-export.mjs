/**
 * Real-file verification entrypoint.
 * Delegates to vitest gates that generate Word/PDF/Web and assert:
 * - 1000+ Japanese compact chars
 * - Word reopen match
 * - PDF extract ≥95%
 * - Word/PDF/Web match ≥95%
 * - pdftoppm page images for vision review
 */
import { spawnSync } from "child_process"
import { existsSync, readFileSync } from "fs"
import { join } from "path"

const root = process.cwd()
const reportPath = join(
  root,
  "artifacts/deliverable-export-verify/verification-report.json",
)

const result = spawnSync(
  "npx",
  ["vitest", "run", "lib/deliverables/export/real-file-verify.test.ts"],
  { cwd: root, stdio: "inherit", env: process.env },
)

if (result.status !== 0) {
  console.error("Real-file verification FAILED")
  process.exit(result.status ?? 1)
}

if (!existsSync(reportPath)) {
  console.error("Missing verification-report.json")
  process.exit(1)
}

const report = JSON.parse(readFileSync(reportPath, "utf8"))
console.log(JSON.stringify(report, null, 2))

const ok =
  report.sourceCompactChars >= 1000 &&
  report.pdfExtractionRecall >= 0.95 &&
  report.tripleMatchRate >= 0.95 &&
  report.wordExtractionRecall >= 0.95

if (!ok) {
  console.error("Completion gates not met")
  process.exit(1)
}

console.log("Real-file verification PASSED")
