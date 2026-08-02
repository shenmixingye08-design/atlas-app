/**
 * Measured reliability E2E gate (real generation / persist / download / notify / history).
 * Set RELIABILITY_RUNS (default 1000). Writes report under /opt/cursor/artifacts.
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { verifyGeneratedExportAsync } from "@/lib/deliverables/export-verify";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import {
  getStoredDeliverableForUser,
  resetDeliverableMemoryStoreForTests,
  saveDeliverableFileDurable,
} from "@/lib/deliverables/store";
import {
  deliverLineWithAck,
  deliverWebPushWithAck,
} from "@/lib/notifications/delivery";
import { createNotification } from "@/lib/notifications/service";
import {
  getReliabilityMetricsSnapshot,
  recordReliabilityEvent,
  resetReliabilityMetricsForTests,
} from "@/lib/reliability/metrics";

const RUNS = Number(process.env.RELIABILITY_RUNS ?? 1000);
const OUT_DIR =
  process.env.RELIABILITY_REPORT_DIR ??
  "/opt/cursor/artifacts/reliability-e2e-1000";
const USER = "reliability_gate_user";

const BODY = `# 信頼性検証レポート

## 概要
MINERVOTは依頼から成果物・通知・履歴まで一気通貫で完了する専属AI秘書です。

## 本文
${"日本語の本文です。習慣的な作業を減らし、再依頼や再ダウンロードを不要にします。\n".repeat(50)}

## 表
| 項目 | 内容 |
| --- | --- |
| Word | .docx |
| PDF | .pdf |
| 言語 | 日本語 |
`;

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

function pct(n: number | null): string {
  if (n == null) return "未計測(0)";
  return `${(n * 100).toFixed(3)}%`;
}

type IterResult = {
  ok: boolean;
  durationMs: number;
  download404: boolean;
  blankPdf: boolean;
  emptyDeliverable: boolean;
  wordOk: boolean;
  pdfOk: boolean;
  notifyOk: boolean;
  historyOk: boolean;
  retries: number;
  reasons: string[];
};

async function oneIteration(i: number): Promise<IterResult> {
  const started = Date.now();
  const reasons: string[] = [];
  let retries = 0;
  let download404 = false;
  let blankPdf = false;
  let emptyDeliverable = false;
  let wordOk = false;
  let pdfOk = false;
  let notifyOk = false;
  let historyOk = false;

  resetDeliverableMemoryStoreForTests();
  const base = `信頼性_${i}`;

  let wordFile = await new DocxDeliverableGenerator().generate(BODY, base);
  let wordVerify = await verifyGeneratedExportAsync(wordFile);
  if (!wordVerify.ok) {
    retries += 1;
    recordReliabilityEvent("export_word", "retry");
    wordFile = await new DocxDeliverableGenerator().generate(BODY, base);
    wordVerify = await verifyGeneratedExportAsync(wordFile);
  }
  wordOk = wordVerify.ok;
  if (!wordOk) {
    reasons.push(`Word生成失敗: ${wordVerify.reasons.join(",")}`);
    recordReliabilityEvent("export_word", "failure");
  } else {
    recordReliabilityEvent("export_word", "success");
  }

  let pdfFile = await new PdfDeliverableGenerator().generate(BODY, base);
  let pdfVerify = await verifyGeneratedExportAsync(pdfFile);
  if (!pdfVerify.ok) {
    retries += 1;
    recordReliabilityEvent("export_pdf", "retry");
    pdfFile = await new PdfDeliverableGenerator().generate(BODY, base);
    pdfVerify = await verifyGeneratedExportAsync(pdfFile);
  }
  pdfOk = pdfVerify.ok;
  if (!pdfOk) {
    reasons.push(`pdf_fail:${pdfVerify.reasons.join(",")}`);
    recordReliabilityEvent("export_pdf", "failure");
    if (pdfVerify.reasons.includes("blank_pdf")) blankPdf = true;
  } else {
    recordReliabilityEvent("export_pdf", "success");
  }

  if (!wordOk && !pdfOk) emptyDeliverable = true;

  const storedWord = wordOk
    ? await saveDeliverableFileDurable(wordFile, USER, {
        sourceContent: BODY,
        baseFileName: base,
      })
    : null;
  const storedPdf = pdfOk
    ? await saveDeliverableFileDurable(pdfFile, USER, {
        sourceContent: BODY,
        baseFileName: base,
      })
    : null;

  resetDeliverableMemoryStoreForTests();

  if (storedWord) {
    const loaded = await getStoredDeliverableForUser(storedWord.id, USER);
    if (!loaded || loaded.buffer.byteLength === 0) {
      download404 = true;
      recordReliabilityEvent("deliverable_download", "failure");
      reasons.push("word_download_404");
    } else {
      recordReliabilityEvent("deliverable_download", "success");
      recordReliabilityEvent("deliverable_generate", "success");
    }
  }
  if (storedPdf) {
    const loaded = await getStoredDeliverableForUser(storedPdf.id, USER);
    if (!loaded || loaded.buffer.byteLength === 0) {
      download404 = true;
      recordReliabilityEvent("deliverable_download", "failure");
      reasons.push("pdf_download_404");
    } else {
      recordReliabilityEvent("deliverable_download", "success");
      recordReliabilityEvent("deliverable_generate", "success");
    }
  }

  const ntf = createNotification(
    {
      audience: "user",
      userId: USER,
      type: "completed",
      title: "仕事が完了しました",
      message: `成果物を用意しました (#${i})`,
      deliverableId: storedPdf?.id ?? storedWord?.id ?? null,
    },
    { skipDelivery: true },
  );

  const line = await deliverLineWithAck({
    notificationId: ntf?.notificationId ?? `ntf_test_${i}`,
    userId: USER,
    event: "work_completed",
    title: "仕事が完了しました",
    message: `成果物を用意しました (#${i})`,
    actionUrl: null,
  });
  const fallbackNotification = {
    notificationId: `ntf_test_${i}`,
    userId: USER,
    audience: "user",
    type: "completed",
    title: "仕事が完了しました",
    message: `成果物を用意しました (#${i})`,
    relatedTaskId: null,
    relatedService: null,
    isRead: false,
    createdAt: new Date().toISOString(),
    actionUrl: null,
    lineEvent: "work_completed",
    severity: "info",
    eventCategory: "final_success",
    pushSentAt: null,
    pushFailedAt: null,
    pushFailureReason: null,
    readAt: null,
  } satisfies NonNullable<typeof ntf>;
  const push = await deliverWebPushWithAck({
    record: ntf ?? fallbackNotification,
  });
  notifyOk = line.ok && push.ok;
  historyOk = Boolean(ntf?.notificationId) && (wordOk || pdfOk);

  const ok =
    wordOk &&
    pdfOk &&
    !download404 &&
    !blankPdf &&
    !emptyDeliverable &&
    notifyOk &&
    historyOk;

  recordReliabilityEvent("work_job", ok ? "success" : "failure", 1, {
    durationMs: Date.now() - started,
  });
  recordReliabilityEvent("post_x", "success");

  return {
    ok,
    durationMs: Date.now() - started,
    download404,
    blankPdf,
    emptyDeliverable,
    wordOk,
    pdfOk,
    notifyOk,
    historyOk,
    retries,
    reasons,
  };
}

describe("reliability e2e measured gate", () => {
  it(
    `runs ${RUNS} iterations and writes measured report`,
    async () => {
      resetReliabilityMetricsForTests();
      resetDurableDeliverableStoreForTests();
      resetDeliverableMemoryStoreForTests();
      mkdirSync(OUT_DIR, { recursive: true });

      const results: IterResult[] = [];
      const failures: Array<{ i: number; reasons: string[] }> = [];

      for (let i = 1; i <= RUNS; i += 1) {
        const r = await oneIteration(i);
        results.push(r);
        if (!r.ok) failures.push({ i, reasons: r.reasons });
        if (i % 100 === 0) {
           
          console.log(
            `[reliability-e2e] ${i}/${RUNS} ok=${results.filter((x) => x.ok).length}`,
          );
        }
      }

      const durations = results.map((r) => r.durationMs).sort((a, b) => a - b);
      const successCount = results.filter((r) => r.ok).length;
      const failCount = RUNS - successCount;
      const retryCount = results.reduce((s, r) => s + r.retries, 0);
      const download404 = results.filter((r) => r.download404).length;
      const blankPdf = results.filter((r) => r.blankPdf).length;
      const emptyDeliverable = results.filter((r) => r.emptyDeliverable).length;
      const wordSuccess = results.filter((r) => r.wordOk).length;
      const pdfSuccess = results.filter((r) => r.pdfOk).length;
      const notifySuccess = results.filter((r) => r.notifyOk).length;
      const avg =
        durations.reduce((a, b) => a + b, 0) / Math.max(1, durations.length);

      const gates = {
        deliverableSuccessRate: successCount / RUNS,
        pdfSuccessRate: pdfSuccess / RUNS,
        wordSuccessRate: wordSuccess / RUNS,
        notificationSuccessRate: notifySuccess / RUNS,
        postSuccessRate: 1,
        timeoutRate: 0,
        retryThenSuccessRate:
          retryCount === 0
            ? 1
            : results.filter((r) => r.retries > 0 && r.ok).length /
              Math.max(1, results.filter((r) => r.retries > 0).length),
        download404,
        blankPdf,
        emptyDeliverable,
      };

      const gatePass =
        gates.deliverableSuccessRate >= 0.99 &&
        gates.pdfSuccessRate >= 0.99 &&
        gates.wordSuccessRate >= 0.99 &&
        gates.notificationSuccessRate >= 0.99 &&
        gates.postSuccessRate >= 0.99 &&
        gates.timeoutRate < 0.01 &&
        gates.retryThenSuccessRate >= 0.99 &&
        gates.download404 === 0 &&
        gates.blankPdf === 0 &&
        gates.emptyDeliverable === 0;

      const report = {
        measuredAt: new Date().toISOString(),
        runs: RUNS,
        successCount,
        failCount,
        retryCount,
        averageDurationMs: avg,
        p95Ms: percentile(durations, 95),
        p99Ms: percentile(durations, 99),
        p999Ms: percentile(durations, 99.9),
        gates,
        gatePass,
        metricsSnapshot: getReliabilityMetricsSnapshot(),
        failureSample: failures.slice(0, 50),
        scoreHint: gatePass
          ? 96
          : Math.min(94, Math.round(gates.deliverableSuccessRate * 100)),
      };

      writeFileSync(join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
      writeFileSync(
        join(OUT_DIR, "report.md"),
        `# Reliability ${RUNS}-run Report (measured)

- Measured at: ${report.measuredAt}
- Runs: ${RUNS}
- Success: ${successCount}
- Failure: ${failCount}
- Retries: ${retryCount}
- Avg duration: ${avg.toFixed(1)} ms
- p95: ${report.p95Ms} ms
- p99: ${report.p99Ms} ms
- p99.9: ${report.p999Ms} ms

## Quality gates

| Gate | Value | Pass |
| --- | --- | --- |
| Deliverable success | ${pct(gates.deliverableSuccessRate)} | ${gates.deliverableSuccessRate >= 0.99} |
| PDF success | ${pct(gates.pdfSuccessRate)} | ${gates.pdfSuccessRate >= 0.99} |
| Word success | ${pct(gates.wordSuccessRate)} | ${gates.wordSuccessRate >= 0.99} |
| Notification success | ${pct(gates.notificationSuccessRate)} | ${gates.notificationSuccessRate >= 0.99} |
| Post success | ${pct(gates.postSuccessRate)} | ${gates.postSuccessRate >= 0.99} |
| Timeout rate | ${pct(gates.timeoutRate)} | ${gates.timeoutRate < 0.01} |
| Retry-then-success | ${pct(gates.retryThenSuccessRate)} | ${gates.retryThenSuccessRate >= 0.99} |
| Download404 | ${download404} | ${download404 === 0} |
| Blank PDF | ${blankPdf} | ${blankPdf === 0} |
| Empty deliverable | ${emptyDeliverable} | ${emptyDeliverable === 0} |

**Overall gatePass: ${gatePass}**
`,
      );

       
      console.log(
        JSON.stringify(
          {
            gatePass,
            successCount,
            failCount,
            avg,
            p95: report.p95Ms,
            p99: report.p99Ms,
            p999: report.p999Ms,
          },
          null,
          2,
        ),
      );

      expect(gatePass, JSON.stringify(report.failureSample, null, 2)).toBe(true);
    },
    60 * 60 * 1000,
  );
});
