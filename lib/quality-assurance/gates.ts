import type {
  CriticalFinding,
  EvidenceSuiteSummary,
  QualityGateThresholds,
  QualityGatesEvaluation,
  QualityMetricSection,
  QualityRate,
} from "@/lib/quality-assurance/types";

/** Phase3: Release Ready に必要な最低成功率（未満または未計測なら不合格） */
export const QUALITY_GATE_THRESHOLDS: QualityGateThresholds = {
  wordSuccessRate: 0.99,
  excelSuccessRate: 0.99,
  pdfSuccessRate: 0.99,
  powerpointSuccessRate: 0.99,
  visionSuccessRate: 0.95,
  notificationSuccessRate: 0.99,
  storageSuccessRate: 0.999,
  jobSuccessRate: 0.99,
};

export type GateCheckInput = {
  rates: Record<string, QualityRate | null | undefined>;
  criticalFindings: CriticalFinding[];
  evidence: EvidenceSuiteSummary | null;
  productionE2eVerified: boolean;
};

function ratePasses(
  rate: QualityRate | null | undefined,
  min: number
): { pass: boolean; reason: string } {
  if (!rate || !rate.measured || rate.rate == null) {
    return { pass: false, reason: "未計測のためゲート不合格（自己採点不可）" };
  }
  if (rate.rate < min) {
    return {
      pass: false,
      reason: `実測 ${(rate.rate * 100).toFixed(2)}% < 目標 ${(min * 100).toFixed(1)}%`,
    };
  }
  return {
    pass: true,
    reason: `実測 ${(rate.rate * 100).toFixed(2)}% ≥ 目標 ${(min * 100).toFixed(1)}% (n=${rate.total})`,
  };
}

/**
 * Phase3 + Phase4: Release Ready 判定。
 * 未計測・閾値未達・Critical 1件・本番E2E未検証のいずれかで NO。
 */
export function evaluateQualityGates(input: GateCheckInput): QualityGatesEvaluation {
  const t = QUALITY_GATE_THRESHOLDS;
  const checks = [
    {
      id: "word_success",
      label: "Word成功率 ≥ 99%",
      ...ratePasses(input.rates.wordSuccessRate, t.wordSuccessRate),
    },
    {
      id: "excel_success",
      label: "Excel成功率 ≥ 99%",
      ...ratePasses(input.rates.excelSuccessRate, t.excelSuccessRate),
    },
    {
      id: "pdf_success",
      label: "PDF成功率 ≥ 99%",
      ...ratePasses(input.rates.pdfSuccessRate, t.pdfSuccessRate),
    },
    {
      id: "powerpoint_success",
      label: "PowerPoint成功率 ≥ 99%",
      ...ratePasses(input.rates.powerpointSuccessRate, t.powerpointSuccessRate),
    },
    {
      id: "vision_success",
      label: "Vision成功率 ≥ 95%",
      ...ratePasses(input.rates.visionSuccessRate, t.visionSuccessRate),
    },
    {
      id: "notification_success",
      label: "通知成功率 ≥ 99%",
      ...ratePasses(input.rates.notificationSuccessRate, t.notificationSuccessRate),
    },
    {
      id: "storage_success",
      label: "Storage成功率 ≥ 99.9%",
      ...ratePasses(input.rates.storageSuccessRate, t.storageSuccessRate),
    },
    {
      id: "job_success",
      label: "ジョブ成功率 ≥ 99%",
      ...ratePasses(input.rates.jobSuccessRate, t.jobSuccessRate),
    },
  ];

  const blockingCriticals = input.criticalFindings.filter((c) => c.blocksRelease);
  const hasCritical = blockingCriticals.length > 0;
  const thresholdsMet = checks.every((c) => c.pass);
  const evidenceOk =
    Boolean(input.evidence) &&
    input.evidence!.failed === 0 &&
    input.evidence!.totalCases > 0;
  const productionOk = input.productionE2eVerified === true;

  const releaseReady =
    thresholdsMet && !hasCritical && evidenceOk && productionOk;

  const reasons: string[] = [];
  for (const c of checks) {
    if (!c.pass) reasons.push(`${c.label}: ${c.reason}`);
  }
  if (hasCritical) {
    reasons.push(
      `Critical Gate: ${blockingCriticals.length}件のブロッカー（${blockingCriticals
        .map((c) => c.id)
        .join(", ")}）`
    );
  }
  if (!evidenceOk) {
    reasons.push(
      input.evidence
        ? `証拠スイート未完了: failed=${input.evidence.failed}/${input.evidence.totalCases}`
        : "証拠スイート未実行"
    );
  }
  if (!productionOk) {
    reasons.push(
      "本番E2E未検証（PRODUCTION_E2E_BASE_URL 等での実測が必要。未検証のまま Release Ready 不可）"
    );
  }

  return {
    releaseReady,
    thresholdsMet,
    hasCriticalFindings: hasCritical,
    productionE2eVerified: productionOk,
    evidenceSuitePassed: evidenceOk,
    checks,
    reasons,
  };
}

export function findRateInSections(
  sections: QualityMetricSection[],
  metricId: string
): QualityRate | null {
  for (const section of sections) {
    const m = section.metrics.find((x) => x.id === metricId);
    if (m) return m.value;
  }
  return null;
}
