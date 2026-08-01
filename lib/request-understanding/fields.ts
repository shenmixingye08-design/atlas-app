import type { DocumentKind, RequiredFieldSpec } from "./types";

/** Document-kind field catalogs — not all are hard_required. */
const CATALOGS: Record<Exclude<DocumentKind, null>, RequiredFieldSpec[]> = {
  estimate: [
    { key: "addressee", label: "宛名", level: "editable_later" },
    { key: "issuer", label: "発行者", level: "editable_later" },
    { key: "line_items", label: "品目・数量・単価", level: "hard_required" },
    { key: "total", label: "金額", level: "never_assume" },
    { key: "valid_until", label: "有効期限", level: "safe_assume" },
    { key: "payment_terms", label: "支払条件", level: "optional" },
  ],
  invoice: [
    { key: "bill_to", label: "請求先", level: "editable_later" },
    { key: "bill_from", label: "請求元", level: "editable_later" },
    { key: "line_items", label: "請求内容", level: "hard_required" },
    { key: "amount", label: "金額", level: "never_assume" },
    { key: "due_date", label: "支払期限", level: "editable_later" },
    { key: "bank", label: "振込先", level: "never_assume" },
  ],
  contract: [
    { key: "parties", label: "契約当事者", level: "never_assume" },
    { key: "subject", label: "契約対象", level: "hard_required" },
    { key: "terms", label: "主要条件", level: "never_assume" },
    { key: "dates", label: "契約期間", level: "editable_later" },
  ],
  minutes: [
    { key: "meeting_title", label: "会議名", level: "safe_assume" },
    { key: "date", label: "日時", level: "editable_later" },
    { key: "attendees", label: "出席者", level: "optional" },
    { key: "decisions", label: "決定事項", level: "editable_later" },
  ],
  report: [
    { key: "topic", label: "報告テーマ", level: "hard_required" },
    { key: "period", label: "対象期間", level: "safe_assume" },
    { key: "findings", label: "結果・所見", level: "editable_later" },
  ],
  proposal: [
    { key: "customer", label: "対象顧客", level: "editable_later" },
    { key: "offer", label: "商品・サービス", level: "hard_required" },
    { key: "purpose", label: "目的", level: "safe_assume" },
    { key: "strengths", label: "強み", level: "editable_later" },
    { key: "pricing", label: "料金", level: "never_assume" },
    { key: "cta", label: "次のアクション", level: "safe_assume" },
  ],
  sales_deck: [
    { key: "customer", label: "対象顧客", level: "editable_later" },
    { key: "offer", label: "商品・サービス", level: "hard_required" },
    { key: "purpose", label: "発表目的", level: "safe_assume" },
    { key: "pricing", label: "料金", level: "never_assume" },
  ],
  household: [
    { key: "period", label: "対象期間", level: "safe_assume" },
    { key: "entries", label: "支出・収入項目", level: "hard_required" },
    { key: "currency", label: "通貨", level: "safe_assume" },
  ],
  attendance: [
    { key: "period", label: "対象期間", level: "hard_required" },
    { key: "person", label: "対象者", level: "editable_later" },
    { key: "hours", label: "勤務時間", level: "editable_later" },
    { key: "holidays", label: "休日ルール", level: "safe_assume" },
  ],
  resume: [
    { key: "name", label: "氏名", level: "never_assume" },
    { key: "history", label: "経歴", level: "hard_required" },
  ],
  blog: [
    { key: "topic", label: "テーマ", level: "hard_required" },
    { key: "audience", label: "読者", level: "safe_assume" },
  ],
  email_draft: [
    { key: "purpose", label: "メールの目的", level: "editable_later" },
    { key: "recipient", label: "宛先", level: "optional" },
  ],
  sns_draft: [
    { key: "topic", label: "投稿テーマ", level: "editable_later" },
    { key: "tone", label: "トーン", level: "safe_assume" },
  ],
  generic: [
    { key: "topic", label: "依頼の主題", level: "editable_later" },
  ],
};

export function fieldsForDocumentKind(kind: DocumentKind): RequiredFieldSpec[] {
  if (!kind) return CATALOGS.generic;
  return CATALOGS[kind] ?? CATALOGS.generic;
}

/** Detect which field values appear present in free text (heuristic, not OCR). */
export function detectPresentFields(
  assignment: string,
  fields: readonly RequiredFieldSpec[],
): Set<string> {
  const present = new Set<string>();
  const text = assignment;

  const detectors: Record<string, RegExp> = {
    addressee: /宛名[:：]?\s*\S+|株式会社|御中/,
    issuer: /発行者|当社|発行元[:：]/,
    bill_to: /請求先|御中/,
    bill_from: /請求元|発行者/,
    line_items: /品目[:：]|単価|数量\s*\d|明細[:：]|¥\s*\d|\d+円/,
    total: /合計|総額|¥\s*\d{2,}|\d{3,}円/,
    amount: /金額[:：]|合計|¥\s*\d{2,}|\d{3,}円/,
    valid_until: /有効期限|まで有効/,
    payment_terms: /支払条件|振込|月末/,
    due_date: /支払期限|支払期日|due/i,
    bank: /振込先|銀行|口座/,
    parties: /甲|乙|当事者/,
    subject: /契約対象|件名|目的物/,
    terms: /契約条件|条項|違約/,
    dates: /\d{4}年|\d{1,2}\/\d{1,2}|契約期間/,
    meeting_title: /会議|打合|ミーティング|定例/,
    date: /\d{4}年|\d{1,2}月\d{1,2}日|本日|昨日/,
    attendees: /出席|参加者/,
    decisions: /決定|合意|アクション/,
    topic: /について|テーマ|題名|報告|売上|議事|見積|請求/,
    period: /今月|先月|週次|月次|\d{4}年\d{1,2}月|期間/,
    findings: /結果|所見|まとめ/,
    customer: /顧客|クライアント|向け/,
    offer: /サービス|商品|プラン|製品/,
    purpose: /目的|のため|提案|紹介/,
    strengths: /強み|メリット|差別化/,
    pricing: /料金|価格|月額|年額|¥|円/,
    cta: /ご連絡|お申込|次のステップ|CTA/i,
    entries: /支出|収入|レシート|家計|経費/,
    currency: /円|JPY|¥/,
    person: /氏名|さん|様/,
    hours: /\d+時|勤務|シフト/,
    holidays: /休|有給|祝日/,
    name: /氏名[:：]|名前[:：]/,
    history: /経歴|職歴|学歴/,
    audience: /読者|ターゲット/,
    recipient: /宛先|To:|へ送/,
    tone: /丁寧|カジュアル|フォーマル/,
  };

  for (const field of fields) {
    const re = detectors[field.key];
    if (re && re.test(text)) present.add(field.key);
  }

  // Short create requests often have topic via document nouns.
  if (!present.has("topic") && /作って|作成|まとめ|生成/.test(text)) {
    if (/議事録|報告書|見積|請求|契約|提案|売上|家計|勤務|営業/.test(text)) {
      present.add("topic");
      present.add("offer");
      present.add("subject");
      present.add("meeting_title");
    }
  }

  return present;
}

export function computeMissingFields(
  assignment: string,
  kind: DocumentKind,
): {
  required_fields: RequiredFieldSpec[];
  missing_required_fields: string[];
  optional_fields: string[];
  assumptions: string[];
  canDraft: boolean;
} {
  const required_fields = fieldsForDocumentKind(kind);
  const present = detectPresentFields(assignment, required_fields);

  const hardMissing = required_fields
    .filter((f) => f.level === "hard_required" && !present.has(f.key))
    .map((f) => f.key);

  // Contract/personal identity must not be invented — surface as missing.
  const neverAssumeBlocking = required_fields
    .filter(
      (f) =>
        f.level === "never_assume" &&
        !present.has(f.key) &&
        (f.key === "parties" || f.key === "terms" || f.key === "name"),
    )
    .map((f) => f.key);

  const optional_fields = required_fields
    .filter((f) => f.level === "optional" || f.level === "editable_later")
    .map((f) => f.key);

  const assumptions: string[] = [];
  for (const field of required_fields) {
    if (field.level === "safe_assume" && !present.has(field.key)) {
      assumptions.push(`${field.label}は標準値で仮定します（後から編集できます）`);
    }
    if (
      field.level === "never_assume" &&
      !present.has(field.key) &&
      !neverAssumeBlocking.includes(field.key)
    ) {
      assumptions.push(
        `${field.label}は未記入のままドラフト化し、後から確認してください`,
      );
    }
  }

  assumptions.push("言語は日本語");
  assumptions.push("用紙サイズはA4（文書の場合）");
  assumptions.push("通貨は円（金額がある場合）");

  const canDraft = hardMissing.length === 0;

  return {
    required_fields,
    missing_required_fields: [...hardMissing, ...neverAssumeBlocking],
    optional_fields,
    assumptions: [...new Set(assumptions)],
    canDraft,
  };
}
