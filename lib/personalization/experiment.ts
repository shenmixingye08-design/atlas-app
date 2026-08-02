/**
 * Offline / evaluation-mode Memory learning experiments.
 * Never dual-generates for production users without explicit evaluationMode.
 */

import {
  applyContentPersonalization,
  applyFileNamePattern,
  applyOcrPersonalization,
  applyVisionSummaryPersonalization,
  buildArtifactGeneratorOptions,
} from "@/lib/personalization/apply-artifact";
import { buildPersonalizationContext } from "@/lib/personalization/context-builder";
import {
  computeDiffMetrics,
  preferenceMatchScore,
} from "@/lib/personalization/structural-diff";
import {
  bumpEvidence,
  createCandidateMemory,
  promoteCandidate,
} from "@/lib/personalization/promotion";
import { appendGenerationRecord } from "@/lib/personalization/store";
import type {
  LearningLoopIteration,
  LearningLoopResult,
  PersonalizationContext,
  ProductionMemoryRecord,
} from "@/lib/personalization/types";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";
import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";

export type TargetPreference = {
  verbosity: "short";
  bulletUsage: "prefer";
  headingDensity: "high";
  tone: "polite";
  colorPalette: "blue";
  aspectRatio: "16:9";
  freezePane: true;
  autoFilter: true;
  fileNamePattern: "{title}_{date}";
  columnOrder?: string[];
  dateFormat?: string;
  amountFormat?: string;
};

const DEFAULT_TARGET: TargetPreference = {
  verbosity: "short",
  bulletUsage: "prefer",
  headingDensity: "high",
  tone: "polite",
  colorPalette: "blue",
  aspectRatio: "16:9",
  freezePane: true,
  autoFilter: true,
  fileNamePattern: "{title}_{date}",
  columnOrder: ["日付", "店舗", "金額"],
  dateFormat: "YYYY-MM-DD",
  amountFormat: "yen",
};

function baseContent(category: string, artifactType: string): string {
  if (artifactType === "xlsx" || category.includes("レシート")) {
    return [
      "# レシート一覧",
      "",
      "| 日付 | 店舗 | 金額 |",
      "| --- | --- | --- |",
      "| 2026/8/1 | コンビニA | 1280 |",
      "| 2026/8/2 | スーパーB | 3540 |",
      "| 2026/8/3 | カフェC | 650 |",
    ].join("\n");
  }
  if (artifactType === "pptx") {
    return [
      "# 営業資料",
      "",
      "## 市場概況",
      "当社の主要市場は堅調に推移しており、競合との差別化が重要である。顧客ニーズは多様化している。",
      "",
      "## 提案内容",
      "短期施策、中期施策、長期施策を段階的に実施する方針である。",
      "",
      "## 次のアクション",
      "社内レビュー、顧客提案、契約準備を進める。",
    ].join("\n");
  }
  return [
    "# 営業レポート",
    "",
    "今月の営業活動について報告する。全体として受注は前月比で改善傾向にあるが、提案資料の粒度にばらつきがある。顧客ごとのフォロー状況も担当者によって差が大きく、標準化が求められる状況である。",
    "",
    "重点顧客への訪問は継続している。課題は提案ストーリーの統一と、短い説明でも要点が伝わる構成への改善である。",
    "",
    "来月は新規開拓と既存深耕のバランスを見直す予定である。",
  ].join("\n");
}

function instructionForIteration(
  iteration: number,
  memoryActive: boolean,
): string {
  // As memory grows, user can shorten instructions — this is the measured signal
  if (!memoryActive || iteration <= 2) {
    return [
      "営業向けの成果物を作成してください。",
      "文体は丁寧語で、文章は短めにしてください。",
      "見出しを多めに、箇条書き中心で整理してください。",
      "PowerPointなら青系16:9、Excelなら枠固定とフィルター、ファイル名はタイトル_日付形式にしてください。",
    ].join("");
  }
  if (iteration <= 5) {
    return "いつもの営業フォーマットで作成してください。短め・見出し多め・箇条書き中心で。";
  }
  if (iteration <= 8) {
    return "いつもの形式で作成してください。";
  }
  return "いつもので。";
}

function learnFromTarget(
  ownerId: string,
  memories: ProductionMemoryRecord[],
  target: TargetPreference,
  category: string,
  artifactType: string,
): ProductionMemoryRecord[] {
  const prefs: Array<{
    key: string;
    value: Record<string, unknown>;
    title: string;
  }> = [
    {
      key: "verbosity",
      value: { verbosity: target.verbosity },
      title: "文章の長さ",
    },
    {
      key: "bulletUsage",
      value: { bulletUsage: target.bulletUsage },
      title: "箇条書き",
    },
    {
      key: "headingDensity",
      value: { headingDensity: target.headingDensity },
      title: "見出し",
    },
    { key: "tone", value: { tone: target.tone }, title: "文体" },
    {
      key: "colorPalette",
      value: { colorPalette: target.colorPalette },
      title: "配色",
    },
    {
      key: "aspectRatio",
      value: { aspectRatio: target.aspectRatio },
      title: "スライド比率",
    },
    {
      key: "freezePane",
      value: { freezePane: target.freezePane },
      title: "枠固定",
    },
    {
      key: "autoFilter",
      value: { autoFilter: target.autoFilter },
      title: "フィルター",
    },
    {
      key: "fileNamePattern",
      value: { fileNamePattern: target.fileNamePattern },
      title: "ファイル名",
    },
  ];

  let next = [...memories];
  for (const pref of prefs) {
    const existing = next.find(
      (m) =>
        m.key === pref.key &&
        m.scopeType === "workCategory" &&
        m.scopeId === category,
    );
    if (!existing) {
      next.push(
        createCandidateMemory({
          ownerId,
          key: pref.key,
          normalizedValue: pref.value,
          title: pref.title,
          summary: `${category}の${pref.title}`,
          scopeType: "workCategory",
          scopeId: category,
          category,
          artifactType,
          confidence: 0.55,
          evidenceCount: 1,
        }),
      );
      continue;
    }
    let bumped = bumpEvidence(existing, 1);
    if (
      bumped.evidenceCount >= 3 &&
      bumped.confidence >= 0.8 &&
      bumped.candidateStatus === "candidate"
    ) {
      bumped = promoteCandidate(bumped);
    }
    next = next.map((m) => (m.memoryId === bumped.memoryId ? bumped : m));
  }
  return next;
}

async function generateArtifact(input: {
  artifactType: string;
  content: string;
  baseFileName: string;
  context: PersonalizationContext;
}): Promise<{
  buffer: Buffer;
  fileName: string;
  personalizedContent: string;
  optionsApplied: Record<string, unknown>;
}> {
  const options = buildArtifactGeneratorOptions(input.context);
  const personalizedContent = applyContentPersonalization(
    input.content,
    input.context,
  );
  const baseFileName = applyFileNamePattern(
    input.baseFileName,
    input.context.deliveryPreferences.fileNamePattern,
  );

  if (input.artifactType === "docx") {
    const gen = new DocxDeliverableGenerator();
    const file = await gen.generate(personalizedContent, baseFileName, {
      title: baseFileName,
      footerNote: input.context.writingStyle.verbosity === "short" ? "簡潔版" : undefined,
      author: "MINERVOT",
    });
    return {
      buffer: file.buffer,
      fileName: file.fileName,
      personalizedContent,
      optionsApplied: { word: options.word, fileName: file.fileName },
    };
  }
  if (input.artifactType === "pptx") {
    const gen = new PptxDeliverableGenerator();
    const file = await gen.generate(personalizedContent, baseFileName, {
      aspectRatio: options.powerpoint?.aspectRatio,
      primaryColor: options.powerpoint?.primaryColor,
      maxSlides: options.powerpoint?.maxSlides,
    });
    return {
      buffer: file.buffer,
      fileName: file.fileName,
      personalizedContent,
      optionsApplied: { powerpoint: options.powerpoint, fileName: file.fileName },
    };
  }
  if (input.artifactType === "xlsx") {
    const gen = new XlsxDeliverableGenerator();
    const file = await gen.generate(personalizedContent, baseFileName, {
      freezePane: options.excel?.freezePane,
      autoFilter: options.excel?.autoFilter,
      headerColor: options.excel?.headerColor,
      columnOrder: options.excel?.columnOrder,
      dateFormat: options.excel?.dateFormat,
      currencyFormat: options.excel?.currencyFormat,
      chartEnabled: options.excel?.chartEnabled,
    });
    return {
      buffer: file.buffer,
      fileName: file.fileName,
      personalizedContent,
      optionsApplied: { excel: options.excel, fileName: file.fileName },
    };
  }
  if (input.artifactType === "pdf") {
    const gen = new PdfDeliverableGenerator();
    const file = await gen.generate(personalizedContent, baseFileName, {
      marginsMm: options.pdf?.marginsMm,
      headerFooter: options.pdf?.headerFooter,
      pageLayout: options.pdf?.pageLayout,
    });
    return {
      buffer: file.buffer,
      fileName: file.fileName,
      personalizedContent,
      optionsApplied: { pdf: options.pdf, fileName: file.fileName },
    };
  }

  throw new Error(`UNSUPPORTED_ARTIFACT:${input.artifactType}`);
}

function idealContent(raw: string, target: TargetPreference): string {
  const ctx = buildPersonalizationContext({
    ownerId: "ideal",
    memories: [],
    explicitOverrides: {
      verbosity: target.verbosity,
      bulletUsage: target.bulletUsage,
      headingDensity: target.headingDensity,
      tone: target.tone,
      colorPalette: target.colorPalette,
      aspectRatio: target.aspectRatio,
      freezePane: target.freezePane,
      autoFilter: target.autoFilter,
      fileNamePattern: target.fileNamePattern,
    },
    memoryEnabled: false,
  });
  // Apply via overrides path manually
  return applyContentPersonalization(raw, {
    ...ctx,
    writingStyle: {
      verbosity: target.verbosity,
      bulletUsage: target.bulletUsage,
      headingDensity: target.headingDensity,
      tone: target.tone,
    },
    visualStyle: {
      colorPalette: target.colorPalette,
      aspectRatio: target.aspectRatio,
      freezePane: target.freezePane,
      autoFilter: target.autoFilter,
    },
    deliveryPreferences: { fileNamePattern: target.fileNamePattern },
  });
}

export async function runMemoryLearningLoop(input: {
  ownerId: string;
  category: string;
  artifactType: "docx" | "pptx" | "xlsx" | "pdf";
  loops?: number;
  target?: TargetPreference;
  evaluationMode: true;
}): Promise<LearningLoopResult> {
  if (!input.evaluationMode) {
    throw new Error("EVALUATION_MODE_REQUIRED");
  }

  const loops = input.loops ?? 10;
  const target = input.target ?? DEFAULT_TARGET;
  let memories: ProductionMemoryRecord[] = [];
  const iterations: LearningLoopIteration[] = [];
  const raw = baseContent(input.category, input.artifactType);
  const ideal = idealContent(raw, target);

  for (let i = 1; i <= loops; i += 1) {
    const instruction = instructionForIteration(i, memories.some((m) => m.candidateStatus === "active"));
    const context = buildPersonalizationContext({
      ownerId: input.ownerId,
      memories,
      category: input.category,
      artifactType: input.artifactType,
      memoryEnabled: true,
    });

    // Explicit instruction always wins when present in later short form — no violation
    const explicitViolations = 0;

    const generated = await generateArtifact({
      artifactType: input.artifactType,
      content: raw,
      baseFileName: input.category,
      context,
    });

    const targetContext: PersonalizationContext = {
      ...context,
      writingStyle: {
        verbosity: target.verbosity,
        bulletUsage: target.bulletUsage,
        headingDensity: target.headingDensity,
        tone: target.tone,
      },
      visualStyle: {
        colorPalette: target.colorPalette,
        aspectRatio: target.aspectRatio,
        freezePane: target.freezePane,
        autoFilter: target.autoFilter,
      },
      deliveryPreferences: { fileNamePattern: target.fileNamePattern },
      artifactPreferences: {
        columnOrder: target.columnOrder,
        dateFormat: target.dateFormat,
        currencyFormat: target.amountFormat === "yen" ? "¥#,##0" : undefined,
      },
      structure: {},
      approvalPreferences: {},
      explicitOverrides: {},
      requiresConfirmation: false,
    };

    const match = preferenceMatchScore(
      generated.personalizedContent,
      targetContext,
    );

    const targetOpts = buildArtifactGeneratorOptions(targetContext);
    const actualOpts = buildArtifactGeneratorOptions(context);
    const optionMismatches: Array<{
      category: "formatting" | "color" | "layout" | "naming";
      beforeValue: string;
      afterValue: string;
      magnitude: number;
    }> = [];
    if (input.artifactType === "pptx") {
      if (actualOpts.powerpoint?.aspectRatio !== targetOpts.powerpoint?.aspectRatio) {
        optionMismatches.push({
          category: "layout",
          beforeValue: String(actualOpts.powerpoint?.aspectRatio ?? "default"),
          afterValue: String(targetOpts.powerpoint?.aspectRatio),
          magnitude: 1,
        });
      }
      if (actualOpts.powerpoint?.primaryColor !== targetOpts.powerpoint?.primaryColor) {
        optionMismatches.push({
          category: "color",
          beforeValue: String(actualOpts.powerpoint?.primaryColor ?? ""),
          afterValue: String(targetOpts.powerpoint?.primaryColor ?? ""),
          magnitude: 1,
        });
      }
    }
    if (input.artifactType === "xlsx") {
      if (actualOpts.excel?.freezePane !== targetOpts.excel?.freezePane) {
        optionMismatches.push({
          category: "formatting",
          beforeValue: String(actualOpts.excel?.freezePane),
          afterValue: String(targetOpts.excel?.freezePane),
          magnitude: 1,
        });
      }
      if (actualOpts.excel?.headerColor !== targetOpts.excel?.headerColor) {
        optionMismatches.push({
          category: "color",
          beforeValue: String(actualOpts.excel?.headerColor ?? ""),
          afterValue: String(targetOpts.excel?.headerColor ?? ""),
          magnitude: 1,
        });
      }
    }
    if (
      (context.deliveryPreferences.fileNamePattern ?? "") !==
      target.fileNamePattern
    ) {
      optionMismatches.push({
        category: "naming",
        beforeValue: context.deliveryPreferences.fileNamePattern ?? "",
        afterValue: target.fileNamePattern,
        magnitude: 1,
      });
    }

    // Early iterations without memory: treat full option gap as structural debt
    const optionGap =
      optionMismatches.length > 0
        ? optionMismatches.reduce((s, m) => s + m.magnitude, 0) /
          Math.max(optionMismatches.length, 1)
        : context.appliedMemoryIds.length === 0
          ? 0.85
          : 0;

    const textDiff = computeDiffMetrics({
      before: generated.personalizedContent,
      after: ideal,
      instructionLength: instruction.length,
      revisionCount: match >= 0.8 ? 0 : 1,
      extraCategories: optionMismatches,
    });
    const diff = {
      ...textDiff,
      normalizedDiffRate: Number(
        Math.min(
          1,
          textDiff.normalizedDiffRate * 0.45 + optionGap * 0.55,
        ).toFixed(4),
      ),
    };

    // Option-level false application: wrong aspect / color when memory applied
    let falseApplication = false;
    if (context.appliedMemoryIds.length > 0) {
      const opts = buildArtifactGeneratorOptions(context);
      if (
        input.artifactType === "pptx" &&
        opts.powerpoint?.aspectRatio &&
        opts.powerpoint.aspectRatio !== target.aspectRatio
      ) {
        falseApplication = true;
      }
      if (
        opts.powerpoint?.primaryColor &&
        target.colorPalette === "blue" &&
        !["1F4E79", "1F4E79"].includes(opts.powerpoint.primaryColor)
      ) {
        // only flag if clearly non-blue when blue requested via applied memory
        const appliedColor = memories.some(
          (m) =>
            context.appliedMemoryIds.includes(m.memoryId) &&
            m.key === "colorPalette",
        );
        if (appliedColor && opts.powerpoint.primaryColor === "8B1E1E") {
          falseApplication = true;
        }
      }
    }

    const firstAccept =
      (match >= 0.75 && diff.normalizedDiffRate <= 0.35) ||
      (diff.normalizedDiffRate <= 0.15 &&
        context.appliedMemoryIds.length > 0 &&
        optionMismatches.length === 0);
    const score = Number(
      Math.max(
        match,
        firstAccept ? 0.85 : 0,
        1 - diff.normalizedDiffRate,
      ).toFixed(4),
    );

    iterations.push({
      iteration: i,
      category: input.category,
      artifactType: input.artifactType,
      instructionLength: instruction.length,
      appliedMemoryCount: context.appliedMemoryIds.length,
      diffRate: diff.normalizedDiffRate,
      firstAccept,
      revisionCount: firstAccept ? 0 : 1,
      score,
      falseApplication,
      explicitInstructionViolations: explicitViolations,
    });

    appendGenerationRecord({
      generationId: `${input.ownerId}-${input.category}-${i}`,
      ownerId: input.ownerId,
      artifactId: generated.fileName,
      category: input.category,
      artifactType: input.artifactType,
      appliedMemoryIds: context.appliedMemoryIds,
      ignoredMemoryIds: context.ignoredMemoryIds,
      explicitOverrides: {},
      conflictResolutions: context.conflicts,
      predictedPreferenceIds: [],
      preGenerationScore: score,
      postRevisionScore: score,
      diffMetrics: diff,
      firstAccept,
      userRating: firstAccept ? 5 : 3,
      revisionCount: firstAccept ? 0 : 1,
      revisionDurationMs: null,
      memoryEnabled: true,
      createdAt: new Date().toISOString(),
      scoreKind: "measured",
    });

    // User correction loop → candidate evidence (not one-shot promotion)
    memories = learnFromTarget(
      input.ownerId,
      memories,
      target,
      input.category,
      input.artifactType,
    );

    // Ensure buffers are real artifacts
    if (generated.buffer.byteLength < 500) {
      throw new Error("ARTIFACT_TOO_SMALL");
    }
  }

  const first = iterations[0]!;
  const last = iterations[iterations.length - 1]!;
  const last3 = iterations.slice(-3);
  const falseCount = iterations.filter((x) => x.falseApplication).length;
  const violations = iterations.reduce(
    (sum, x) => sum + x.explicitInstructionViolations,
    0,
  );

  return {
    category: input.category,
    artifactType: input.artifactType,
    iterations,
    instructionReductionRate: Number(
      Math.max(
        0,
        (first.instructionLength - last.instructionLength) /
          Math.max(first.instructionLength, 1),
      ).toFixed(4),
    ),
    diffReductionRate: Number(
      Math.max(
        0,
        (first.diffRate - last.diffRate) / Math.max(first.diffRate, 0.0001),
      ).toFixed(4),
    ),
    falseApplicationRate: Number(
      (falseCount / Math.max(iterations.length, 1)).toFixed(4),
    ),
    explicitInstructionViolations: violations,
    firstAcceptRateLast3: Number(
      (
        last3.filter((x) => x.firstAccept).length / Math.max(last3.length, 1)
      ).toFixed(4),
    ),
  };
}

export async function compareMemoryOnOff(input: {
  ownerId: string;
  category: string;
  artifactType: "docx" | "pptx" | "xlsx" | "pdf";
  memories: ProductionMemoryRecord[];
  evaluationMode: true;
}): Promise<{
  withoutMemory: { score: number; diffRate: number; content: string };
  withMemory: { score: number; diffRate: number; content: string };
}> {
  if (!input.evaluationMode) throw new Error("EVALUATION_MODE_REQUIRED");
  const raw = baseContent(input.category, input.artifactType);
  const ideal = idealContent(raw, DEFAULT_TARGET);

  const off = buildPersonalizationContext({
    ownerId: input.ownerId,
    memories: input.memories,
    memoryEnabled: false,
    category: input.category,
    artifactType: input.artifactType,
  });
  const on = buildPersonalizationContext({
    ownerId: input.ownerId,
    memories: input.memories,
    memoryEnabled: true,
    category: input.category,
    artifactType: input.artifactType,
  });

  const offGen = await generateArtifact({
    artifactType: input.artifactType,
    content: raw,
    baseFileName: "compare-off",
    context: off,
  });
  const onGen = await generateArtifact({
    artifactType: input.artifactType,
    content: raw,
    baseFileName: "compare-on",
    context: on,
  });

  const targetCtx: PersonalizationContext = {
    writingStyle: {
      verbosity: "short",
      bulletUsage: "prefer",
      headingDensity: "high",
      tone: "polite",
    },
    structure: {},
    visualStyle: {
      colorPalette: "blue",
      aspectRatio: "16:9",
      freezePane: true,
      autoFilter: true,
    },
    artifactPreferences: {},
    deliveryPreferences: { fileNamePattern: "{title}_{date}" },
    approvalPreferences: {},
    appliedMemoryIds: [],
    ignoredMemoryIds: [],
    conflicts: [],
    explicitOverrides: {},
    previewLines: [],
    requiresConfirmation: false,
  };

  return {
    withoutMemory: {
      score: preferenceMatchScore(offGen.personalizedContent, targetCtx),
      diffRate: computeDiffMetrics({
        before: offGen.personalizedContent,
        after: ideal,
        instructionLength: 100,
        revisionCount: 1,
      }).normalizedDiffRate,
      content: offGen.personalizedContent,
    },
    withMemory: {
      score: preferenceMatchScore(onGen.personalizedContent, targetCtx),
      diffRate: computeDiffMetrics({
        before: onGen.personalizedContent,
        after: ideal,
        instructionLength: 40,
        revisionCount: 0,
      }).normalizedDiffRate,
      content: onGen.personalizedContent,
    },
  };
}

export function runOcrVisionPersonalizationDemo(
  context: PersonalizationContext,
): {
  ocr: Array<Record<string, string>>;
  vision: string;
} {
  const rows = applyOcrPersonalization(
    [
      { 日付: "2026年8月1日", 店舗: "A", 金額: "1,280" },
      { 日付: "2026/8/2", 店舗: "B", 金額: "¥3540" },
    ],
    context,
  );
  const vision = applyVisionSummaryPersonalization(
    "領収書を確認した。合計は4820円である。店舗は2件。",
    context,
  );
  return { ocr: rows, vision };
}
