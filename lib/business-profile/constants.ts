import type {
  BuiltinBusinessCaseFieldKey,
  BuiltinBusinessContactFieldKey,
  BuiltinBusinessProfileFieldKey,
  BusinessCaseKind,
  BusinessContactKind,
  BusinessFieldUsageFlags,
  BusinessFieldValueType,
  BusinessProfileKind,
  TemplateVariableScope,
} from "./types";

export const PROFILE_KINDS: readonly BusinessProfileKind[] = [
  "company",
  "sole_proprietor",
  "organization",
  "department",
];

export const CONTACT_KINDS: readonly BusinessContactKind[] = [
  "client",
  "vendor",
  "partner",
  "internal",
  "billing",
  "other",
];

export const CASE_KINDS: readonly BusinessCaseKind[] = [
  "sales",
  "proposal",
  "contract",
  "support",
  "invoice",
  "other",
];

export const VALUE_TYPES: readonly BusinessFieldValueType[] = [
  "text",
  "email",
  "phone",
  "url",
  "number",
  "date",
  "boolean",
  "json",
  "bank_account",
];

export type ForbiddenFieldPattern = {
  id: string;
  pattern: RegExp;
  reasonJa: string;
};

export const FORBIDDEN_FIELD_PATTERNS: readonly ForbiddenFieldPattern[] = [
  {
    id: "password",
    pattern:
      /(?:password|passcode|passwd|ログインパスワード|暗証番号|パスワード|pwd)/i,
    reasonJa: "パスワードや暗証番号は保存できません。",
  },
  {
    id: "api_key",
    pattern:
      /(?:api[_\s-]?key|secret[_\s-]?key|access[_\s-]?key|private[_\s-]?key|client[_\s-]?secret|apiキー|シークレットキー)/i,
    reasonJa: "APIキーやシークレットキーは保存できません。",
  },
  {
    id: "oauth_token",
    pattern:
      /(?:oauth|refresh[_\s-]?token|access[_\s-]?token|bearer|id[_\s-]?token|認証トークン|アクセストークン|リフレッシュトークン)/i,
    reasonJa: "OAuthトークンや認証トークンは保存できません。",
  },
  {
    id: "credit_card",
    pattern:
      /(?:credit[_\s-]?card|card[_\s-]?number|クレジットカード|カード番号|creditcard)/i,
    reasonJa: "クレジットカード番号は保存できません。",
  },
  {
    id: "cvv",
    pattern: /(?:cvv|cvc|security[_\s-]?code|セキュリティコード)/i,
    reasonJa: "カードのセキュリティコードは保存できません。",
  },
  {
    id: "my_number",
    pattern: /(?:my[_\s-]?number|マイナンバー|個人番号)/i,
    reasonJa: "マイナンバーや個人番号は保存できません。",
  },
  {
    id: "recovery_code",
    pattern:
      /(?:recovery[_\s-]?code|backup[_\s-]?code|復旧コード|バックアップコード)/i,
    reasonJa: "復旧コードやバックアップコードは保存できません。",
  },
];

export const DEFAULT_ALLOWED_USAGE: BusinessFieldUsageFlags = {
  aiUsageAllowed: true,
  documentUsageAllowed: true,
  usageForbidden: false,
};

export const FORBIDDEN_USAGE: BusinessFieldUsageFlags = {
  aiUsageAllowed: false,
  documentUsageAllowed: false,
  usageForbidden: true,
};

export const DEFAULT_FIELD_USAGE: Readonly<
  Record<BuiltinBusinessProfileFieldKey, BusinessFieldUsageFlags>
> = {
  displayName: DEFAULT_ALLOWED_USAGE,
  companyName: DEFAULT_ALLOWED_USAGE,
  legalName: DEFAULT_ALLOWED_USAGE,
  department: DEFAULT_ALLOWED_USAGE,
  postalCode: DEFAULT_ALLOWED_USAGE,
  addressLine1: DEFAULT_ALLOWED_USAGE,
  addressLine2: DEFAULT_ALLOWED_USAGE,
  phone: DEFAULT_ALLOWED_USAGE,
  email: DEFAULT_ALLOWED_USAGE,
  websiteUrl: DEFAULT_ALLOWED_USAGE,
  invoiceRegistrationNumber: {
    aiUsageAllowed: false,
    documentUsageAllowed: true,
    usageForbidden: false,
  },
  corporateNumber: {
    aiUsageAllowed: false,
    documentUsageAllowed: true,
    usageForbidden: false,
  },
  bankName: {
    aiUsageAllowed: false,
    documentUsageAllowed: true,
    usageForbidden: false,
  },
  bankBranchName: {
    aiUsageAllowed: false,
    documentUsageAllowed: true,
    usageForbidden: false,
  },
  bankAccountType: {
    aiUsageAllowed: false,
    documentUsageAllowed: true,
    usageForbidden: false,
  },
  bankAccountNumber: {
    aiUsageAllowed: false,
    documentUsageAllowed: true,
    usageForbidden: false,
  },
  bankAccountHolder: {
    aiUsageAllowed: false,
    documentUsageAllowed: true,
    usageForbidden: false,
  },
  notes: {
    aiUsageAllowed: false,
    documentUsageAllowed: true,
    usageForbidden: false,
  },
};

export const DEFAULT_CONTACT_FIELD_USAGE: Readonly<
  Record<BuiltinBusinessContactFieldKey, BusinessFieldUsageFlags>
> = {
  displayName: DEFAULT_ALLOWED_USAGE,
  companyName: DEFAULT_ALLOWED_USAGE,
  department: DEFAULT_ALLOWED_USAGE,
  title: DEFAULT_ALLOWED_USAGE,
  email: DEFAULT_ALLOWED_USAGE,
  phone: DEFAULT_ALLOWED_USAGE,
  address: DEFAULT_ALLOWED_USAGE,
  notes: {
    aiUsageAllowed: false,
    documentUsageAllowed: true,
    usageForbidden: false,
  },
};

export const DEFAULT_CASE_FIELD_USAGE: Readonly<
  Record<BuiltinBusinessCaseFieldKey, BusinessFieldUsageFlags>
> = {
  title: DEFAULT_ALLOWED_USAGE,
  clientName: DEFAULT_ALLOWED_USAGE,
  description: DEFAULT_ALLOWED_USAGE,
  status: DEFAULT_ALLOWED_USAGE,
  startDate: DEFAULT_ALLOWED_USAGE,
  endDate: DEFAULT_ALLOWED_USAGE,
  budget: {
    aiUsageAllowed: false,
    documentUsageAllowed: true,
    usageForbidden: false,
  },
  notes: {
    aiUsageAllowed: false,
    documentUsageAllowed: true,
    usageForbidden: false,
  },
};

export const TEMPLATE_VARIABLE_SCOPES: readonly TemplateVariableScope[] = [
  "profile",
  "contact",
  "project",
];

export const PROFILE_TEMPLATE_VARIABLE_KEYS: readonly BuiltinBusinessProfileFieldKey[] = [
  "displayName",
  "companyName",
  "legalName",
  "department",
  "postalCode",
  "addressLine1",
  "addressLine2",
  "phone",
  "email",
  "websiteUrl",
  "invoiceRegistrationNumber",
  "corporateNumber",
  "bankName",
  "bankBranchName",
  "bankAccountType",
  "bankAccountNumber",
  "bankAccountHolder",
  "notes",
];

export const CONTACT_TEMPLATE_VARIABLE_KEYS: readonly BuiltinBusinessContactFieldKey[] = [
  "displayName",
  "companyName",
  "department",
  "title",
  "email",
  "phone",
  "address",
  "notes",
];

export const PROJECT_TEMPLATE_VARIABLE_KEYS: readonly BuiltinBusinessCaseFieldKey[] = [
  "title",
  "clientName",
  "description",
  "status",
  "startDate",
  "endDate",
  "budget",
  "notes",
];

export const TEMPLATE_VARIABLE_MAP_KEYS = {
  profile: PROFILE_TEMPLATE_VARIABLE_KEYS,
  contact: CONTACT_TEMPLATE_VARIABLE_KEYS,
  project: PROJECT_TEMPLATE_VARIABLE_KEYS,
} as const;

export const BANK_FIELD_KEYS = new Set<string>([
  "profile.bankName",
  "profile.bankBranchName",
  "profile.bankAccountType",
  "profile.bankAccountNumber",
  "profile.bankAccountHolder",
  "bankName",
  "bankBranchName",
  "bankAccountType",
  "bankAccountNumber",
  "bankAccountHolder",
]);

export const FORMAL_FIELD_KEY_PATTERN =
  /(?:name|Name|legal|Legal|address|Address|phone|Phone|account|Account|registration|Registration|corporate|Corporate|invoiceRegistrationNumber)/;
