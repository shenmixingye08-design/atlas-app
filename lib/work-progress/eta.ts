/**
 * Estimate completion time from request content — rule-based, no AI.
 * Buckets: ~30s / ~2min / ~5min (and longer when clearly heavy).
 */

export type WorkEtaBucket = "30s" | "2m" | "5m" | "10m";

export type WorkEtaEstimate = {
  bucket: WorkEtaBucket;
  etaMs: number;
  label: string;
  reasons: string[];
};

const BUCKET_MS: Record<WorkEtaBucket, number> = {
  "30s": 30_000,
  "2m": 120_000,
  "5m": 300_000,
  "10m": 600_000,
};

const BUCKET_LABEL: Record<WorkEtaBucket, string> = {
  "30s": "約30秒",
  "2m": "約2分",
  "5m": "約5分",
  "10m": "約10分",
};

function scoreAssignment(assignment: string): { score: number; reasons: string[] } {
  const text = assignment.trim();
  const lower = text.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  if (text.length > 400) {
    score += 2;
    reasons.push("依頼文が長い");
  } else if (text.length > 160) {
    score += 1;
    reasons.push("依頼文がやや長い");
  }

  if (/画像|イラスト|図解|サムネ|バナー|image|イラスト生成/.test(text)) {
    score += 3;
    reasons.push("画像生成を含む");
  }
  if (/動画|video|ムービー/.test(text)) {
    score += 4;
    reasons.push("動画処理を含む");
  }
  if (/調査|リサーチ|競合|市場|research/.test(lower)) {
    score += 2;
    reasons.push("調査・分析を含む");
  }
  if (/資料|スライド|pptx|pdf|提案書|企画書|レポート/.test(lower)) {
    score += 2;
    reasons.push("資料作成を含む");
  }
  if (/メール|gmail|営業文|返信/.test(lower)) {
    score += 1;
    reasons.push("メール文面作成を含む");
  }
  if (/投稿|x\b|twitter|sns|ツイート/.test(lower)) {
    score += 1;
    reasons.push("SNS投稿作成を含む");
  }
  if (/予約|スケジュール|自動化|毎日|毎週/.test(text)) {
    score += 1;
    reasons.push("予約・自動化を含む");
  }
  if (/そして|その後|次に|さらに|あと|および|,|、/.test(text) && text.length > 40) {
    score += 1;
    reasons.push("複数工程の依頼");
  }

  if (reasons.length === 0) {
    reasons.push("標準的な文章作成");
  }

  return { score, reasons };
}

function bucketFromScore(score: number): WorkEtaBucket {
  if (score <= 1) return "30s";
  if (score <= 3) return "2m";
  if (score <= 6) return "5m";
  return "10m";
}

/** Estimate ETA from assignment text (and optional template hints). */
export function estimateWorkEta(
  assignment: string,
  hints?: { hasImage?: boolean; hasResearch?: boolean; hasDocument?: boolean },
): WorkEtaEstimate {
  const { score: baseScore, reasons } = scoreAssignment(assignment);
  let score = baseScore;
  if (hints?.hasImage) {
    score += 2;
    reasons.push("画像工程あり");
  }
  if (hints?.hasResearch) {
    score += 1;
    reasons.push("調査工程あり");
  }
  if (hints?.hasDocument) {
    score += 1;
    reasons.push("資料工程あり");
  }

  const bucket = bucketFromScore(score);
  return {
    bucket,
    etaMs: BUCKET_MS[bucket],
    label: BUCKET_LABEL[bucket],
    reasons: [...new Set(reasons)].slice(0, 4),
  };
}

export function formatEtaLabel(etaMs: number): string {
  if (etaMs <= 45_000) return "約30秒";
  if (etaMs <= 150_000) return "約2分";
  if (etaMs <= 360_000) return "約5分";
  return "約10分";
}
