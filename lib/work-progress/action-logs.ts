/**
 * User-facing action log lines ("AIが何をしているか").
 * Rule-based from assignment + stage — no AI calls.
 */

import type { WorkProgressStageId } from "./stages";

export type WorkActionLogEntry = {
  id: string;
  at: string;
  message: string;
  stage: WorkProgressStageId;
  level: "info" | "warn" | "error";
};

function detectWorkKinds(assignment: string): {
  sns: boolean;
  image: boolean;
  email: boolean;
  research: boolean;
  document: boolean;
} {
  const text = assignment.toLowerCase();
  return {
    sns: /投稿|x\b|twitter|sns|ツイート/.test(text),
    image: /画像|イラスト|サムネ|バナー|image/.test(text),
    email: /メール|gmail|営業文|返信/.test(text),
    research: /調査|リサーチ|競合|市場|research/.test(text),
    document: /資料|スライド|pptx|pdf|提案|企画|レポート/.test(text),
  };
}

/** Default log messages for each stage, personalized by request kind. */
export function defaultMessagesForStage(
  stage: WorkProgressStageId,
  assignment: string,
): string[] {
  const kinds = detectWorkKinds(assignment);

  switch (stage) {
    case "accepted":
      return ["依頼を受け付けました", "仕事の内容を確認しています"];
    case "analyzing":
      return [
        "依頼内容を分析しています",
        kinds.research ? "必要な調査範囲を整理しています" : "最適な進め方を決めています",
      ];
    case "executing":
      if (kinds.sns) return ["X投稿内容を生成しています", "トーンと構成を調整しています"];
      if (kinds.email) return ["メール文面を作成しています", "件名と本文を整えています"];
      if (kinds.research) return ["情報を調査しています", "要点を抽出しています"];
      if (kinds.document) return ["資料の構成を作成しています", "本文を執筆しています"];
      return ["仕事を実行しています", "内容を作成しています"];
    case "generating":
      if (kinds.image) return ["画像生成を開始しました", "成果物をまとめています"];
      if (kinds.sns) return ["投稿文を仕上げています", "成果物を整えています"];
      return ["成果物を生成しています", "出力形式を整えています"];
    case "reviewing":
      return ["最終確認をしています", "品質と抜け漏れをチェックしています"];
    case "delivered":
      if (kinds.sns && /予約/.test(assignment)) return ["投稿予約が完了しました", "納品が完了しました"];
      if (kinds.sns) return ["投稿準備が完了しました", "納品が完了しました"];
      return ["成果物の納品が完了しました"];
    default:
      return ["処理を進めています"];
  }
}

export function createActionLogEntry(input: {
  message: string;
  stage: WorkProgressStageId;
  at?: string;
  level?: "info" | "warn" | "error";
  id?: string;
}): WorkActionLogEntry {
  return {
    id:
      input.id ??
      `alog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    at: input.at ?? new Date().toISOString(),
    message: input.message,
    stage: input.stage,
    level: input.level ?? "info",
  };
}

/** Append stage default messages if not already present for that stage. */
export function ensureStageLogs(
  existing: readonly WorkActionLogEntry[],
  stage: WorkProgressStageId,
  assignment: string,
  at: string = new Date().toISOString(),
): WorkActionLogEntry[] {
  const hasStage = existing.some((entry) => entry.stage === stage);
  if (hasStage) return [...existing];
  const messages = defaultMessagesForStage(stage, assignment);
  const added = messages.map((message, index) =>
    createActionLogEntry({
      message,
      stage,
      at: new Date(new Date(at).getTime() + index * 1000).toISOString(),
    }),
  );
  return [...existing, ...added];
}

export function formatLogClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
