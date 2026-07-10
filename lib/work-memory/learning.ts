import type { WorkMemorySourceType, WorkMemoryType } from "./types";
import { sanitizeMemoryText, sanitizeStructuredData } from "./security";
import { buildAssignmentFingerprint } from "./search";

export type MemoryTrigger =
  | "repeated_request"
  | "explicit_save"
  | "continuity_phrase"
  | "user_correction"
  | "reference_material"
  | "repeated_workflow";

export type DetectedMemorySignal = {
  trigger: MemoryTrigger;
  type: WorkMemoryType;
  title: string;
  summary: string;
  structuredData: Record<string, unknown>;
  sourceType: WorkMemorySourceType;
  confidence: number;
  reason: string;
};

const EXPLICIT_SAVE_PATTERN =
  /覚えて|保存して|記憶して|次からも|いつもの形式|いつも通り|同じ形式|同じフォーマット/i;

const CONTINUITY_PATTERN =
  /次回も|今後も|毎回|いつもの|前回と同じ|以前と同じ/i;

const REFERENCE_PATTERN =
  /参考|添付|前回|過去|以前の|この資料|以下の資料/i;

export function detectMemorySignals(input: {
  assignment: string;
  metadata?: Readonly<Record<string, unknown>>;
  repeatCount?: number;
}): DetectedMemorySignal[] {
  const assignment = input.assignment.trim();
  if (!assignment) return [];

  const signals: DetectedMemorySignal[] = [];
  const lower = assignment.toLowerCase();

  if (EXPLICIT_SAVE_PATTERN.test(assignment)) {
    const safeSummary = sanitizeMemoryText(assignment.slice(0, 200));
    if (safeSummary) {
      signals.push({
        trigger: "explicit_save",
        type: inferTypeFromAssignment(assignment),
        title: "依頼内容の記憶",
        summary: safeSummary,
        structuredData: { assignmentPattern: buildAssignmentFingerprint(assignment) },
        sourceType: "user_explicit",
        confidence: 0.85,
        reason: "お客様が明示的に記憶・保存を依頼されました",
      });
    }
  }

  if (CONTINUITY_PATTERN.test(assignment)) {
    const safeSummary = sanitizeMemoryText(assignment.slice(0, 200));
    if (safeSummary) {
      signals.push({
        trigger: "continuity_phrase",
        type: inferTypeFromAssignment(assignment),
        title: "継続利用の形式",
        summary: safeSummary,
        structuredData: { continuityRequested: true },
        sourceType: "user_explicit",
        confidence: 0.75,
        reason: "「次からも」「いつもの形式」などの継続指定がありました",
      });
    }
  }

  if (REFERENCE_PATTERN.test(assignment)) {
    signals.push({
      trigger: "reference_material",
      type: "template",
      title: "参考資料の利用",
      summary: sanitizeMemoryText(assignment.slice(0, 160)) ?? "参考資料に基づく作業",
      structuredData: { usesReferenceMaterial: true },
      sourceType: "reference_material",
      confidence: 0.65,
      reason: "過去の資料や参考情報の利用が示唆されました",
    });
  }

  if ((input.repeatCount ?? 0) >= 2) {
    signals.push({
      trigger: "repeated_request",
      type: inferTypeFromAssignment(assignment),
      title: "繰り返し依頼のパターン",
      summary: sanitizeMemoryText(assignment.slice(0, 160)) ?? assignment.slice(0, 80),
      structuredData: {
        fingerprint: buildAssignmentFingerprint(assignment),
        repeatCount: input.repeatCount,
      },
      sourceType: "repeated_request",
      confidence: Math.min(0.9, 0.5 + (input.repeatCount ?? 0) * 0.1),
      reason: `同種の依頼が${input.repeatCount}回確認されました`,
    });
  }

  if (/毎日|毎週|毎月|定期|ルーティン/.test(assignment)) {
    signals.push({
      trigger: "repeated_workflow",
      type: "habit",
      title: "定期作業の習慣",
      summary: sanitizeMemoryText(assignment.slice(0, 160)) ?? "定期作業",
      structuredData: { cadenceHint: extractCadenceHint(assignment) },
      sourceType: "orchestration",
      confidence: 0.7,
      reason: "定期・習慣的な作業パターンが検出されました",
    });
  }

  if (/修正|直して|変更して|こうして/.test(assignment)) {
    signals.push({
      trigger: "user_correction",
      type: "correction",
      title: "修正指示",
      summary: sanitizeMemoryText(assignment.slice(0, 160)) ?? "修正指示",
      structuredData: { correctionRequested: true },
      sourceType: "user_edit",
      confidence: 0.6,
      reason: "修正・変更の指示がありました",
    });
  }

  if (/営業|資料|sales/.test(lower)) {
    signals.push({
      trigger: "repeated_workflow",
      type: "workflow",
      title: "営業資料の進め方",
      summary: "営業資料作成の依頼パターン",
      structuredData: { deliverableType: "sales_material" },
      sourceType: "orchestration",
      confidence: 0.55,
      reason: "営業資料に関する作業手順の候補です",
    });
  }

  return dedupeSignals(signals);
}

function inferTypeFromAssignment(assignment: string): WorkMemoryType {
  const lower = assignment.toLowerCase();
  if (/毎日|毎週|毎月|定期/.test(assignment)) return "habit";
  if (/修正|直して|変更/.test(assignment)) return "correction";
  if (/反応|再生|クリック|支出|成果/.test(assignment)) return "outcome";
  if (/口調|文体|トーン|敬語/.test(assignment)) return "preference";
  if (/テンプレ|形式|フォーマット/.test(assignment)) return "template";
  if (/手順|流れ|進め方|ステップ/.test(assignment)) return "workflow";
  if (/sns|投稿|ブログ|メール|資料/.test(lower)) return "result";
  return "workflow";
}

function extractCadenceHint(assignment: string): string {
  if (/毎日/.test(assignment)) return "daily";
  if (/毎週/.test(assignment)) return "weekly";
  if (/毎月/.test(assignment)) return "monthly";
  return "recurring";
}

function dedupeSignals(signals: DetectedMemorySignal[]): DetectedMemorySignal[] {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = `${signal.type}:${signal.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type CorrectionInsight = {
  preferredExpressions: string[];
  avoidedExpressions: string[];
  lengthDelta: "shorter" | "longer" | "unchanged";
  structureHints: string[];
  toneHints: string[];
};

export function extractCorrectionInsights(
  before: string,
  after: string,
): CorrectionInsight | null {
  const safeBefore = sanitizeMemoryText(before);
  const safeAfter = sanitizeMemoryText(after);
  if (!safeBefore || !safeAfter || safeBefore === safeAfter) return null;

  const beforeLines = safeBefore.split("\n").map((line) => line.trim()).filter(Boolean);
  const afterLines = safeAfter.split("\n").map((line) => line.trim()).filter(Boolean);

  const removed = beforeLines.filter((line) => !afterLines.includes(line));
  const added = afterLines.filter((line) => !beforeLines.includes(line));

  const lengthDelta =
    safeAfter.length < safeBefore.length * 0.9
      ? "shorter"
      : safeAfter.length > safeBefore.length * 1.1
        ? "longer"
        : "unchanged";

  const toneHints: string[] = [];
  if (/です|ます|ございます/.test(safeAfter) && !/です|ます/.test(safeBefore)) {
    toneHints.push("敬語を強めた表現");
  }
  if (!/！|!/.test(safeAfter) && /！|!/.test(safeBefore)) {
    toneHints.push("感嘆符を控えめに");
  }

  const structureHints: string[] = [];
  if (afterLines.length !== beforeLines.length) {
    structureHints.push(
      afterLines.length > beforeLines.length ? "段落を増やす構成" : "段落を減らす構成",
    );
  }

  const structured = sanitizeStructuredData({
    preferredExpressions: added.slice(0, 5),
    avoidedExpressions: removed.slice(0, 5),
    lengthDelta,
    structureHints,
    toneHints,
  });

  if (!structured) return null;

  return {
    preferredExpressions: added.slice(0, 5),
    avoidedExpressions: removed.slice(0, 5),
    lengthDelta,
    structureHints,
    toneHints,
  };
}

export function buildCorrectionCandidate(
  before: string,
  after: string,
): DetectedMemorySignal | null {
  const insights = extractCorrectionInsights(before, after);
  if (!insights) return null;

  const summaryParts = [
    insights.preferredExpressions.length > 0
      ? `好む表現: ${insights.preferredExpressions.slice(0, 2).join("、")}`
      : null,
    insights.avoidedExpressions.length > 0
      ? `避ける表現: ${insights.avoidedExpressions.slice(0, 2).join("、")}`
      : null,
    insights.lengthDelta !== "unchanged"
      ? insights.lengthDelta === "shorter"
        ? "文章を短くする傾向"
        : "文章を長くする傾向"
      : null,
  ].filter(Boolean);

  const structuredData = sanitizeStructuredData({
    ...insights,
    beforeLength: before.length,
    afterLength: after.length,
  });

  if (!structuredData || summaryParts.length === 0) return null;

  return {
    trigger: "user_correction",
    type: "correction",
    title: "修正から読み取れる好み",
    summary: summaryParts.join(" · "),
    structuredData,
    sourceType: "correction_diff",
    confidence: 0.55,
    reason: "修正前後の差分から好みの傾向を読み取りました",
  };
}

export function buildOrchestrationResultCandidate(input: {
  assignment: string;
  deliverableType?: string;
  finalResponse?: string;
}): DetectedMemorySignal | null {
  const safeSummary = sanitizeMemoryText(input.finalResponse?.slice(0, 200) ?? "");
  if (!safeSummary) return null;

  const structuredData = sanitizeStructuredData({
    assignmentFingerprint: buildAssignmentFingerprint(input.assignment),
    deliverableType: input.deliverableType ?? "generic",
  });

  if (!structuredData) return null;

  return {
    trigger: "repeated_workflow",
    type: "result",
    title: "完成した成果物",
    summary: safeSummary,
    structuredData,
    sourceType: "orchestration",
    confidence: 0.5,
    reason: "仕事完了時の成果物履歴です",
  };
}
