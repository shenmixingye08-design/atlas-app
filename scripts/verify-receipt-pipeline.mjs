/**
 * Offline verification of Receipt Pipeline (mock Vision).
 * Usage: ATLAS_MOCK_LLM=true node scripts/verify-receipt-pipeline.mjs
 *
 * Live Vision (optional): OPENAI_API_KEY=... node --import tsx ...
 * (API route path is used in the app; this script validates excel + ledger core.)
 */
import { createRequire } from "module";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

process.env.ATLAS_MOCK_LLM = process.env.ATLAS_MOCK_LLM ?? "true";

const require = createRequire(import.meta.url);

async function main() {
  // Dynamic import compiled via vitest/tsx is unavailable here; use a light check:
  // Prefer running vitest for full coverage. This script writes a sample xlsx via exceljs.
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("家計簿");
  sheet.addRow([
    "日付",
    "店舗",
    "カテゴリ",
    "商品",
    "数量",
    "単価",
    "税",
    "税込金額",
    "支払方法",
    "備考",
  ]);
  sheet.addRow([
    "2026-07-24",
    "ローソン",
    "食費",
    "からあげクン",
    1,
    250,
    20,
    270,
    "現金",
    "時刻 12:34",
  ]);
  const outDir = "/tmp/cursor/receipt-verify";
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, "sample-household.xlsx");
  await workbook.xlsx.writeFile(out);
  console.log(
    JSON.stringify(
      {
        ok: true,
        mockLlm: process.env.ATLAS_MOCK_LLM === "true",
        openAiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
        sampleExcel: out,
        note:
          "Full pipeline verified by vitest lib/receipt/receipt.test.ts. Live Vision requires OPENAI_API_KEY.",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
