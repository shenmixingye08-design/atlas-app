/**
 * Facts that must never become confirmed Memory without explicit user confirm.
 * Company achievements, money, address, phone, licenses, law, subsidies,
 * medical/finance, PII, and credentials stay as candidates.
 */

export const SENSITIVE_FACT_KINDS = [
  "company_achievement",
  "money",
  "address",
  "phone",
  "license",
  "law",
  "subsidy",
  "medical_finance",
  "pii",
  "credential",
] as const;

export type SensitiveFactKind = (typeof SENSITIVE_FACT_KINDS)[number];

const PATTERNS: Array<{ kind: SensitiveFactKind; re: RegExp }> = [
  { kind: "company_achievement", re: /実績|導入社数|導入企業|売上高|受賞|認定事業者/ },
  { kind: "money", re: /[¥￥]\s*[\d,]+|円|万円|億円|手数料|報酬|価格|料金/ },
  { kind: "address", re: /〒\s*\d{3}-?\d{4}|東京都|大阪府|北海道|県.+市|.+区.+丁目/ },
  { kind: "phone", re: /0\d{1,4}-\d{1,4}-\d{3,4}|\+81[-.\s]?\d{1,4}/ },
  { kind: "license", re: /資格|免許|登録番号|宅建|社労士|税理士|行政書士/ },
  { kind: "law", re: /法律|法令|条項|コンプライアンス|個人情報保護法/ },
  { kind: "subsidy", re: /補助金|助成金|給付金|補助制度/ },
  { kind: "medical_finance", re: /診療|処方箋|保険金|融資|口座番号|金利|与信/ },
  { kind: "pii", re: /生年月日|マイナンバー|パスポート|免許証番号/ },
  {
    kind: "credential",
    re: /api[_-]?key|access[_-]?token|refresh[_-]?token|password|cookie/i,
  },
];

export function detectSensitiveFacts(text: string): SensitiveFactKind[] {
  const hits = new Set<SensitiveFactKind>();
  for (const pattern of PATTERNS) {
    if (pattern.re.test(text)) hits.add(pattern.kind);
  }
  return [...hits];
}

export function containsSensitiveFacts(text: string): boolean {
  return detectSensitiveFacts(text).length > 0;
}

export function sensitiveFactUserMessage(kinds: readonly SensitiveFactKind[]): string {
  if (kinds.length === 0) return "";
  return "会社実績・金額・住所・連絡先などの事実は、確認するまで記憶しません。";
}
