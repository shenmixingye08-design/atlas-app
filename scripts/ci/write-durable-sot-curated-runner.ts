import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildDurableSotAuditReport,
  summarizeDurableSotAudit,
} from "@/lib/persistence/durable-sot-audit";

const out =
  process.env.DURABLE_SOT_OUT_DIR?.trim() || "artifacts/durable-sot-audit";
const docs = "docs/development/durable-sot-audit";

mkdirSync(out, { recursive: true });
mkdirSync(docs, { recursive: true });

const report = buildDurableSotAuditReport();
const summary = summarizeDurableSotAudit();
const payload = { summary, report };

writeFileSync(join(out, "curated-report.json"), JSON.stringify(payload, null, 2));
writeFileSync(join(docs, "curated-report.json"), JSON.stringify(payload, null, 2));
copyFileSync(join(docs, "migration-plan.md"), join(out, "migration-plan.md"));

console.log(JSON.stringify(summary, null, 2));
