import type { AspectRatio, PresentationKind } from "./types";
import { slideCountForDuration } from "./limits";

export type PptxIntent = {
  kind: PresentationKind;
  title: string;
  audience: string;
  purpose: string;
  durationMinutes: number;
  targetSlides: number;
  aspectRatio: AspectRatio;
  language: "ja-JP" | "en-US";
  needsPricing: boolean;
  needsMetrics: boolean;
  confidence: number;
};

const KIND_RULES: Array<{ kind: PresentationKind; keys: string[]; weight: number }> = [
  { kind: "sales_pitch", keys: ["営業提案", "営業資料", "提案資料", "MINERVOTの営業"], weight: 0.95 },
  { kind: "company_intro", keys: ["会社紹介", "企業紹介", "会社概要"], weight: 0.95 },
  { kind: "investor", keys: ["投資家", "ピッチ", "資金調達", "pitch"], weight: 0.93 },
  { kind: "business_plan", keys: ["新規事業", "企画書", "事業計画"], weight: 0.92 },
  { kind: "product", keys: ["商品説明", "製品紹介", "プロダクト"], weight: 0.9 },
  { kind: "service_intro", keys: ["サービス紹介", "太陽光発電", "施工計画"], weight: 0.9 },
  { kind: "training", keys: ["研修", "トレーニング", "教育資料"], weight: 0.93 },
  { kind: "seminar", keys: ["セミナー", "講演"], weight: 0.9 },
  { kind: "school", keys: ["学校", "授業", "発表資料"], weight: 0.88 },
  { kind: "monthly_report", keys: ["月次報告", "月次レビュー", "KPI報告"], weight: 0.93 },
  { kind: "internal_meeting", keys: ["社内会議", "会議資料", "定例"], weight: 0.9 },
  { kind: "proposal", keys: ["提案書", "企画提案"], weight: 0.88 },
];

export function detectPptxIntent(assignment: string): PptxIntent {
  const text = assignment.trim();
  let kind: PresentationKind = "generic";
  let confidence = 0.55;

  for (const rule of KIND_RULES) {
    if (rule.keys.some((k) => text.includes(k))) {
      kind = rule.kind;
      confidence = rule.weight;
      break;
    }
  }

  if (kind === "generic" && /スライド|プレゼン|powerpoint|pptx|資料を作/i.test(text)) {
    kind = "sales_pitch";
    confidence = 0.7;
  }

  const durationMinutes = detectDuration(text);
  const aspectRatio: AspectRatio = /4:3|4×3|スタンダード/.test(text) ? "4:3" : "16:9";
  const language = /english|英語|in english/i.test(text) ? "en-US" : "ja-JP";

  const title = deriveTitle(text, kind);
  const audience = deriveAudience(kind, text);
  const purpose = derivePurpose(kind);

  return {
    kind,
    title,
    audience,
    purpose,
    durationMinutes,
    targetSlides: slideCountForDuration(durationMinutes),
    aspectRatio,
    language,
    needsPricing: /料金|価格|費用|単価/.test(text),
    needsMetrics: /KPI|売上|実績|数値|グラフ/.test(text),
    confidence,
  };
}

function detectDuration(text: string): number {
  const m = text.match(/(\d+)\s*分/);
  if (m) return Math.min(60, Math.max(3, Number(m[1])));
  if (/3分|三分/.test(text)) return 3;
  if (/5分|五分/.test(text)) return 5;
  if (/10分/.test(text)) return 10;
  if (/15分/.test(text)) return 15;
  if (/30分/.test(text)) return 30;
  if (/60分|1時間/.test(text)) return 60;
  return 10;
}

function deriveTitle(text: string, kind: PresentationKind): string {
  const cleaned = text
    .replace(/を?作って|作成して|お願い|して$/g, "")
    .replace(/powerpoint|pptx|パワーポイント|スライド/gi, "")
    .trim();
  if (cleaned.length >= 2 && cleaned.length <= 40) return cleaned;
  const defaults: Record<PresentationKind, string> = {
    sales_pitch: "営業提案資料",
    company_intro: "会社紹介",
    business_plan: "新規事業企画",
    investor: "投資家向け資料",
    product: "商品説明資料",
    internal_meeting: "社内会議資料",
    training: "研修資料",
    seminar: "セミナー資料",
    school: "発表資料",
    monthly_report: "月次報告",
    proposal: "提案資料",
    service_intro: "サービス紹介",
    generic: "プレゼン資料",
  };
  return defaults[kind];
}

function deriveAudience(kind: PresentationKind, text: string): string {
  if (/顧客|お客様|クライアント/.test(text)) return "見込み顧客";
  if (/投資家|VC/.test(text)) return "投資家";
  if (/社員|社内|メンバー/.test(text)) return "社内メンバー";
  if (/学生|学校/.test(text)) return "学生・聴衆";
  const map: Partial<Record<PresentationKind, string>> = {
    sales_pitch: "見込み顧客・決裁者",
    company_intro: "取引先・採用候補者",
    investor: "投資家",
    training: "研修受講者",
    monthly_report: "経営・マネジメント",
    school: "クラス・審査員",
  };
  return map[kind] ?? "一般聴衆";
}

function derivePurpose(kind: PresentationKind): string {
  const map: Record<PresentationKind, string> = {
    sales_pitch: "課題を共有し、解決策への合意と次のアクションを得る",
    company_intro: "会社の信頼性・強み・提供価値を伝える",
    business_plan: "新規事業の方向性と実行計画を合意する",
    investor: "事業機会と成長性を伝え、関心検討を進める",
    product: "商品の価値と利用イメージを理解してもらう",
    internal_meeting: "現状共有と意思決定を進める",
    training: "手順と知識を定着させる",
    seminar: "テーマの理解と実践意欲を高める",
    school: "調査・考察を分かりやすく発表する",
    monthly_report: "実績と課題、次月計画を共有する",
    proposal: "提案内容の採択を促す",
    service_intro: "サービス内容と導入効果を伝える",
    generic: "要点を整理して伝える",
  };
  return map[kind];
}
