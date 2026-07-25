import type {
  MissingInfoAssessment,
  MissingInfoQuestion,
  ResolvedMemoryBundle,
} from "./types";

type AssessInput = {
  assignment: string;
  deliverableHint?: string;
  resolved: ResolvedMemoryBundle;
};

function hasMemoryFor(resolved: ResolvedMemoryBundle, keys: string[]): boolean {
  const hay = [
    ...resolved.applied,
    ...resolved.temporary,
  ]
    .map((memory) => `${memory.key} ${memory.value} ${memory.category}`)
    .join("\n")
    .toLowerCase();
  return keys.some((key) => hay.includes(key.toLowerCase()));
}

function assignmentHas(assignment: string, pattern: RegExp): boolean {
  return pattern.test(assignment);
}

/**
 * Ask only truly missing critical questions (max 3).
 * Known memories / request text suppress re-asking.
 */
export function assessMissingInfo(input: AssessInput): MissingInfoAssessment {
  const assignment = input.assignment.trim();
  const questions: MissingInfoQuestion[] = [];
  const assumptions: string[] = [];

  const looksLikeExternalPost =
    /投稿|ツイート|tweet|xへ|sns|公開/i.test(assignment);
  const looksLikeLegal =
    /契約|合意|利用規約|NDA|法務|規約/i.test(assignment);
  const looksLikeInvoice =
    /請求|見積|金額|支払|invoice/i.test(assignment);
  const looksLikeAudienceDoc =
    /提案|営業|資料|メール|ブログ|レポート/i.test(assignment);

  if (looksLikeAudienceDoc) {
    const audienceKnown =
      assignmentHas(assignment, /向け|ターゲット|顧客|読者|宛先|様へ/) ||
      hasMemoryFor(input.resolved, ["audience", "ターゲット", "顧客", "宛先"]);
    if (!audienceKnown) {
      questions.push({
        id: "audience",
        key: "audience",
        severity: "critical",
        question: "どなた向けの文書ですか？（例: 既存顧客 / 新規リード）",
      });
    }
  }

  if (looksLikeInvoice) {
    const amountKnown =
      assignmentHas(assignment, /\d+\s*円|¥\d|金額/) ||
      hasMemoryFor(input.resolved, ["amount", "金額", "price"]);
    if (!amountKnown) {
      questions.push({
        id: "amount",
        key: "amount",
        severity: "critical",
        question: "金額や日付など、正確さが必要な数値はありますか？",
      });
    }
  }

  if (looksLikeExternalPost) {
    const destinationKnown =
      assignmentHas(assignment, /\bx\b|twitter|instagram|linkedin|投稿先/i) ||
      hasMemoryFor(input.resolved, ["x_account", "投稿先", "sns"]);
    if (!destinationKnown) {
      questions.push({
        id: "destination",
        key: "post_destination",
        severity: "critical",
        question: "どの媒体へ出す想定ですか？（例: X）",
      });
    }
  }

  if (looksLikeLegal) {
    const partyKnown =
      assignmentHas(assignment, /甲|乙|当事者|株式会社/) ||
      hasMemoryFor(input.resolved, ["company_name", "当事者", "会社名"]);
    if (!partyKnown) {
      questions.push({
        id: "parties",
        key: "legal_parties",
        severity: "critical",
        question: "契約の当事者（会社名など）を教えてください。",
      });
    }
  }

  const formatCritical =
    /excel|xlsx|powerpoint|pptx|pdf|word|形式を指定/i.test(assignment);
  if (formatCritical) {
    const formatKnown =
      assignmentHas(assignment, /\.xlsx|\.pptx|\.pdf|\.docx|16\s*:\s*9/) ||
      hasMemoryFor(input.resolved, ["excel_format", "pptx_format", "format"]);
    if (!formatKnown && /形式|ファイル/i.test(assignment)) {
      questions.push({
        id: "format",
        key: "output_format",
        severity: "critical",
        question: "納品形式はどれですか？（例: xlsx / pptx / pdf）",
      });
    }
  }

  // Minor gaps → assume and proceed
  if (
    /営業資料|提案/.test(assignment) &&
    !hasMemoryFor(input.resolved, ["tone", "敬語", "口調"]) &&
    !assignmentHas(assignment, /カジュアル|敬語|砕け/)
  ) {
    assumptions.push("文体は丁寧なビジネス敬語で進めます");
  }

  const critical = questions.filter((q) => q.severity === "critical").slice(0, 3);
  const canProceed = critical.length === 0;

  return {
    questions: critical,
    assumptions,
    canProceed,
    reason: canProceed
      ? assumptions.length > 0
        ? "軽微な不足は初期値で補い、生成を続行します"
        : "必須情報は揃っています"
      : "成果物の正確性に直結する情報が不足しています",
  };
}
