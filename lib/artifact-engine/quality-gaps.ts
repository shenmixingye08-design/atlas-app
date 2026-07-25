import type { ArtifactMissingField } from "./document";
import type { ArtifactType } from "./types";
import type { OrgAssistProfile } from "./org-assist-store";

const FIELD_CATALOG: ArtifactMissingField[] = [
  {
    key: "companyName",
    label: "会社名",
    placeholder: "株式会社〇〇",
    requiredFor: ["sales_material", "proposal", "invoice", "contract", "presentation"],
  },
  {
    key: "contactName",
    label: "担当者名",
    placeholder: "山田 太郎",
    requiredFor: ["sales_material", "proposal", "presentation"],
  },
  {
    key: "contactPhone",
    label: "担当電話",
    placeholder: "090-0000-0000",
    requiredFor: ["sales_material", "proposal", "presentation"],
  },
  {
    key: "companyPhone",
    label: "会社電話",
    placeholder: "03-0000-0000",
    requiredFor: ["sales_material", "invoice", "presentation"],
  },
  {
    key: "companyIntro",
    label: "会社紹介",
    placeholder: "一言で会社の強み",
    requiredFor: ["sales_material", "proposal"],
  },
  {
    key: "logo",
    label: "会社ロゴ",
    placeholder: "ロゴ有無（登録済みならOK）",
    requiredFor: ["sales_material", "proposal", "presentation"],
  },
  {
    key: "serviceArea",
    label: "営業エリア",
    placeholder: "例：関東一都三県",
    requiredFor: ["sales_material"],
  },
  {
    key: "serviceDescription",
    label: "サービス内容",
    placeholder: "提供サービスの概要",
    requiredFor: ["sales_material", "proposal"],
  },
  {
    key: "companyAddress",
    label: "会社住所",
    placeholder: "東京都…",
    requiredFor: ["invoice", "contract"],
  },
  {
    key: "invoiceRegistrationNumber",
    label: "登録番号（インボイス）",
    placeholder: "T1234567890123",
    requiredFor: ["invoice"],
  },
  {
    key: "bankAccount",
    label: "振込先",
    placeholder: "〇〇銀行 △△支店 普通 1234567",
    requiredFor: ["invoice"],
  },
  {
    key: "paymentDue",
    label: "支払期限",
    placeholder: "翌月末",
    requiredFor: ["invoice"],
  },
  {
    key: "channelName",
    label: "チャンネル名",
    placeholder: "YouTubeチャンネル名",
    requiredFor: ["youtube_script"],
  },
  {
    key: "tone",
    label: "口調",
    placeholder: "丁寧 / カジュアル など",
    requiredFor: ["youtube_script", "sns"],
  },
  {
    key: "targetAudience",
    label: "ターゲット",
    placeholder: "想定視聴者・読者",
    requiredFor: ["youtube_script", "sns", "blog"],
  },
  {
    key: "cta",
    label: "CTA",
    placeholder: "チャンネル登録 / お問い合わせ など",
    requiredFor: ["youtube_script", "sns", "sales_material"],
  },
];

function profileHas(profile: OrgAssistProfile | null | undefined, key: string): boolean {
  if (!profile) return false;
  const value = profile[key as keyof OrgAssistProfile];
  if (typeof value === "boolean") return value;
  return typeof value === "string" && value.trim().length > 0;
}

function contentMentions(content: string, key: string): boolean {
  const patterns: Record<string, RegExp> = {
    companyName: /株式会社|有限会社|合同会社/,
    contactName: /担当\s*[:：]/,
    contactPhone: /0\d{1,4}-\d{1,4}-\d{3,4}/,
    companyPhone: /TEL|電話/,
    bankAccount: /振込先|銀行|口座/,
    invoiceRegistrationNumber: /登録番号|T\d{13}/,
    paymentDue: /支払期限|お支払期限/,
    companyAddress: /〒\d{3}/,
  };
  const pattern = patterns[key];
  return pattern ? pattern.test(content) : false;
}

/**
 * Detect missing quality fields for learning assist.
 * Does not mutate User Profile core.
 */
export function detectQualityGaps(input: {
  artifactType: ArtifactType;
  content: string;
  profile?: OrgAssistProfile | null;
}): ArtifactMissingField[] {
  return FIELD_CATALOG.filter((field) => {
    if (!field.requiredFor.includes(input.artifactType)) return false;
    if (profileHas(input.profile, field.key)) return false;
    if (contentMentions(input.content, field.key)) return false;
    return true;
  });
}
