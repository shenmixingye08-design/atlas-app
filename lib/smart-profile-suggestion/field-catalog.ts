import type {
  SmartProfileFieldGroup,
  SmartProfileFieldKey,
} from "./types";

export type FieldCatalogEntry = {
  key: SmartProfileFieldKey;
  label: string;
  group: SmartProfileFieldGroup;
  benefit: string;
  /** High impact on deliverable quality when missing. */
  qualityImpact: boolean;
};

export const FIELD_CATALOG: Record<SmartProfileFieldKey, FieldCatalogEntry> = {
  company_name: {
    key: "company_name",
    label: "会社名",
    group: "company",
    benefit: "次回から資料・メールへ自動入力できます",
    qualityImpact: true,
  },
  company_address: {
    key: "company_address",
    label: "住所",
    group: "company",
    benefit: "請求書や会社案内の修正が減ります",
    qualityImpact: true,
  },
  company_phone: {
    key: "company_phone",
    label: "電話番号",
    group: "company",
    benefit: "担当連絡先を毎回書かなくてよくなります",
    qualityImpact: true,
  },
  company_fax: {
    key: "company_fax",
    label: "FAX",
    group: "company",
    benefit: "帳票の差し込みが自動化できます",
    qualityImpact: false,
  },
  company_email: {
    key: "company_email",
    label: "メールアドレス",
    group: "company",
    benefit: "署名や問い合わせ欄へ自動入力できます",
    qualityImpact: true,
  },
  company_website: {
    key: "company_website",
    label: "ホームページ",
    group: "company",
    benefit: "資料フッターへ自動入力できます",
    qualityImpact: false,
  },
  contact_name: {
    key: "contact_name",
    label: "担当者名",
    group: "company",
    benefit: "営業資料・メールの担当欄を自動化できます",
    qualityImpact: true,
  },
  department: {
    key: "department",
    label: "部署",
    group: "company",
    benefit: "署名と会社案内の修正が減ります",
    qualityImpact: false,
  },
  job_title: {
    key: "job_title",
    label: "役職",
    group: "company",
    benefit: "署名の自動入力に使えます",
    qualityImpact: false,
  },
  logo: {
    key: "logo",
    label: "会社ロゴ",
    group: "company",
    benefit: "資料の見た目が安定し、差し替え作業が減ります",
    qualityImpact: true,
  },
  company_intro: {
    key: "company_intro",
    label: "会社紹介",
    group: "sales",
    benefit: "営業資料の導入文を毎回書かなくてよくなります",
    qualityImpact: true,
  },
  personal_name: {
    key: "personal_name",
    label: "氏名",
    group: "personal",
    benefit: "署名や連絡先へ自動入力できます",
    qualityImpact: true,
  },
  signature: {
    key: "signature",
    label: "署名",
    group: "personal",
    benefit: "メール作成の修正時間を短縮できます",
    qualityImpact: true,
  },
  personal_address: {
    key: "personal_address",
    label: "住所（個人）",
    group: "personal",
    benefit: "帳票への差し込みが自動化できます",
    qualityImpact: false,
  },
  personal_phone: {
    key: "personal_phone",
    label: "電話番号（個人）",
    group: "personal",
    benefit: "連絡先の再入力が不要になります",
    qualityImpact: false,
  },
  x_account: {
    key: "x_account",
    label: "Xアカウント",
    group: "sns",
    benefit: "投稿文の署名・誘導を自動化できます",
    qualityImpact: false,
  },
  instagram: {
    key: "instagram",
    label: "Instagram",
    group: "sns",
    benefit: "SNS投稿の誘導を自動化できます",
    qualityImpact: false,
  },
  youtube: {
    key: "youtube",
    label: "YouTube",
    group: "sns",
    benefit: "チャンネル誘導を自動化できます",
    qualityImpact: false,
  },
  tiktok: {
    key: "tiktok",
    label: "TikTok",
    group: "sns",
    benefit: "SNS投稿の誘導を自動化できます",
    qualityImpact: false,
  },
  channel_name: {
    key: "channel_name",
    label: "チャンネル名",
    group: "creator",
    benefit: "動画・投稿の表記が統一されます",
    qualityImpact: true,
  },
  tone: {
    key: "tone",
    label: "口調",
    group: "creator",
    benefit: "次回からあなたの話し方に寄せた文面になります",
    qualityImpact: true,
  },
  brand_color: {
    key: "brand_color",
    label: "ブランドカラー",
    group: "creator",
    benefit: "資料・投稿のトーンが安定します",
    qualityImpact: false,
  },
  cta: {
    key: "cta",
    label: "CTA（呼びかけ）",
    group: "creator",
    benefit: "いつも使う誘導文を自動入力できます",
    qualityImpact: true,
  },
  sales_area: {
    key: "sales_area",
    label: "営業エリア",
    group: "sales",
    benefit: "営業資料の基本情報を自動化できます",
    qualityImpact: true,
  },
  specialty: {
    key: "specialty",
    label: "得意分野",
    group: "sales",
    benefit: "提案書の強み説明を自動化できます",
    qualityImpact: true,
  },
  service_description: {
    key: "service_description",
    label: "サービス内容",
    group: "sales",
    benefit: "提案・紹介文の再入力が減ります",
    qualityImpact: true,
  },
  invoice_number: {
    key: "invoice_number",
    label: "登録番号",
    group: "company",
    benefit: "請求書の必須項目を自動入力できます",
    qualityImpact: true,
  },
  bank_info: {
    key: "bank_info",
    label: "口座情報",
    group: "company",
    benefit: "請求書の振込先を毎回書かなくてよくなります",
    qualityImpact: true,
  },
};

export function getFieldEntry(key: SmartProfileFieldKey): FieldCatalogEntry {
  return FIELD_CATALOG[key];
}
