import { getPlanDefinition } from "@/lib/billing/plans/registry";
import { FIRST_USECASES } from "@/lib/growth/revenue-max/usecases";
import type { FirstUsecaseId, PainChoice } from "@/lib/growth/revenue-max/types";

import { DIAGNOSIS_QUESTIONS } from "./questions";
import type {
  DiagnosisAnswers,
  DiagnosisArchetype,
  DiagnosisResult,
  FirstCutAnswer,
  FrequencyAnswer,
  RepeatWorkAnswer,
  ToolAnswer,
} from "./types";

export { DIAGNOSIS_QUESTIONS };

const ARCHETYPE_COPY: Record<
  DiagnosisArchetype,
  { label: string; burden: string; pain: PainChoice; firstJob: FirstUsecaseId }
> = {
  broadcast: {
    label: "発信継続型",
    burden: "投稿を続ける判断と文章化に時間が寄っています。",
    pain: "sns_posting",
    firstJob: "sns",
  },
  documents: {
    label: "資料作成負担型",
    burden: "構成をゼロから考える作業が残っています。",
    pain: "documents",
    firstJob: "document",
  },
  schedule: {
    label: "スケジュール管理型",
    burden: "今日やることの並べ替えに手間が残っています。",
    pain: "schedule",
    firstJob: "schedule",
  },
  admin: {
    label: "定期事務作業型",
    burden: "同じ手順を毎回やり直しています。",
    pain: "repeat_work",
    firstJob: "automation",
  },
  mixed: {
    label: "複数業務混在型",
    burden: "複数の繰り返し作業が同時に残っています。最初の1件だけに絞ります。",
    pain: "repeat_work",
    firstJob: "automation",
  },
};

function firstJobFromCut(cut: FirstCutAnswer): FirstUsecaseId {
  if (cut === "sns") return "sns";
  if (cut === "documents") return "document";
  if (cut === "schedule") return "schedule";
  return "automation";
}

export function resolveArchetype(answers: DiagnosisAnswers): DiagnosisArchetype {
  if (answers.firstCut === "sns" || (answers.repeatWork === "sns" && answers.tool === "x")) {
    return "broadcast";
  }
  if (answers.firstCut === "documents" || answers.heaviest === "documents") {
    return "documents";
  }
  if (answers.firstCut === "schedule" || answers.repeatWork === "schedule") {
    return "schedule";
  }
  if (answers.firstCut === "admin" || answers.frequency === "monthly") {
    return "admin";
  }
  if (answers.repeatWork === "mixed" || answers.heaviest === "mixed") {
    return "mixed";
  }
  return "admin";
}

export function availableFeatureLines(): string[] {
  return FIRST_USECASES.map((row) => `${row.label}（${row.note}）`);
}

export function unavailableFeatureLines(): string[] {
  return [
    "PowerPoint の自動生成エンジンは提供していません。",
    "Googleカレンダー連携は Standard 以上です。無料診断では今日のタスク整理までです。",
    "WordPress への公開は Standard 以上です。",
    "未連携の媒体への自動投稿はしません。",
  ];
}

export function buildDiagnosisResult(answers: DiagnosisAnswers): DiagnosisResult {
  const archetype = resolveArchetype(answers);
  const copy = ARCHETYPE_COPY[archetype];
  const firstJob = firstJobFromCut(answers.firstCut) || copy.firstJob;
  const usecase = FIRST_USECASES.find((row) => row.id === firstJob) ?? FIRST_USECASES[0];
  const free = getPlanDefinition("free");
  const light = getPlanDefinition("light");
  return {
    archetype,
    label: copy.label,
    burden: copy.burden,
    firstJob,
    pain: copy.pain,
    availableFeatures: availableFeatureLines(),
    unavailable: unavailableFeatureLines(),
    firstRequestExample: usecase
      ? `${usecase.label}：${usecase.note}`
      : "X投稿案を1件作る",
    planNote: `${free.name}は月額${free.monthlyPriceJpy}円。${light.name}は月額${light.monthlyPriceJpy}円（税込表示）。表示と請求は既存プラン定義に従います。`,
  };
}

export function isDiagnosisAnswers(value: unknown): value is DiagnosisAnswers {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const repeat: RepeatWorkAnswer[] = ["sns", "documents", "schedule", "admin", "mixed"];
  const tools: ToolAnswer[] = ["x", "office", "calendar", "email", "mixed"];
  const freq: FrequencyAnswer[] = ["daily", "weekly", "monthly"];
  const cut: FirstCutAnswer[] = ["sns", "documents", "schedule", "admin"];
  return (
    repeat.includes(row.repeatWork as RepeatWorkAnswer) &&
    repeat.includes(row.heaviest as RepeatWorkAnswer) &&
    tools.includes(row.tool as ToolAnswer) &&
    freq.includes(row.frequency as FrequencyAnswer) &&
    cut.includes(row.firstCut as FirstCutAnswer)
  );
}

export function containsPersonalFields(body: Record<string, unknown>): boolean {
  const banned = ["name", "email", "company", "phone", "address", "氏名", "会社"];
  return Object.keys(body).some((key) =>
    banned.some((word) => key.toLowerCase().includes(word.toLowerCase())),
  );
}
