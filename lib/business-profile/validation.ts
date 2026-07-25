import {
  CASE_KINDS,
  CONTACT_KINDS,
  PROFILE_KINDS,
  VALUE_TYPES,
} from "./constants";
import type {
  BusinessCaseKind,
  BusinessContactKind,
  BusinessFieldSensitivity,
  BusinessFieldValueType,
  BusinessProfileBankAccountType,
  BusinessProfileKind,
  CreateBusinessCaseInput,
  CreateBusinessContactInput,
  CreateBusinessProfileInput,
  CustomFieldInput,
  ParseResult,
  UpdateBusinessCaseInput,
  UpdateBusinessContactInput,
  UpdateBusinessProfileInput,
} from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-()\s]{7,20}$/;
const FIELD_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{1,63}$/;
const POSTAL_CODE_PATTERN = /^[0-9]{3}-?[0-9]{4}$/;
const CORPORATE_NUMBER_PATTERN = /^[0-9]{13}$/;
const INVOICE_REGISTRATION_PATTERN = /^T[0-9]{13}$/i;
const BANK_ACCOUNT_TYPES: readonly BusinessProfileBankAccountType[] = [
  "ordinary",
  "checking",
  "savings",
  "other",
];
const SENSITIVITY_VALUES: readonly BusinessFieldSensitivity[] = [
  "public",
  "internal",
  "restricted",
  "secret",
];

type MutableRecord = Record<string, unknown>;

function isRecord(body: unknown): body is MutableRecord {
  return Boolean(body && typeof body === "object" && !Array.isArray(body));
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalString(record: MutableRecord, key: string): string | null | undefined {
  if (!(key in record)) return undefined;
  return stringOrNull(record[key]);
}

function optionalBoolean(record: MutableRecord, key: string): boolean | undefined {
  if (!(key in record)) return undefined;
  return Boolean(record[key]);
}

function optionalNumber(record: MutableRecord, key: string): number | undefined {
  if (!(key in record)) return undefined;
  const value = Number(record[key]);
  return Number.isFinite(value) ? value : undefined;
}

function error<T>(message: string, field?: string): ParseResult<T> {
  return {
    ok: false,
    error: message,
    ...(field ? { fieldErrors: [{ field, message }] } : {}),
  };
}

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function isValidPhone(value: string): boolean {
  return PHONE_PATTERN.test(value.trim());
}

export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function isProfileKind(value: unknown): value is BusinessProfileKind {
  return PROFILE_KINDS.includes(value as BusinessProfileKind);
}

export function isContactKind(value: unknown): value is BusinessContactKind {
  return CONTACT_KINDS.includes(value as BusinessContactKind);
}

export function isCaseKind(value: unknown): value is BusinessCaseKind {
  return CASE_KINDS.includes(value as BusinessCaseKind);
}

export function isValueType(value: unknown): value is BusinessFieldValueType {
  return VALUE_TYPES.includes(value as BusinessFieldValueType);
}

function validateOptionalContactInfo(input: {
  email?: string | null;
  phone?: string | null;
  websiteUrl?: string | null;
}): ParseResult<true> {
  if (input.email && !isValidEmail(input.email)) {
    return error("メールアドレスの形式が正しくありません。", "email");
  }
  if (input.phone && !isValidPhone(input.phone)) {
    return error("電話番号の形式が正しくありません。", "phone");
  }
  if (input.websiteUrl && !isValidUrl(input.websiteUrl)) {
    return error("URLの形式が正しくありません。", "websiteUrl");
  }
  return { ok: true, data: true };
}

function normalizeBankAccountType(
  value: unknown,
): BusinessProfileBankAccountType | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return BANK_ACCOUNT_TYPES.includes(value as BusinessProfileBankAccountType)
    ? (value as BusinessProfileBankAccountType)
    : undefined;
}

export function parseCreateProfileBody(
  body: unknown,
): ParseResult<CreateBusinessProfileInput> {
  if (!isRecord(body)) return error("Request body must be an object");

  const companyName = stringOrNull(body.companyName);
  if (!companyName) return error("会社名を入力してください。", "companyName");

  const kind = body.kind === undefined ? "company" : body.kind;
  if (!isProfileKind(kind)) {
    return error("プロフィール種別が正しくありません。", "kind");
  }

  const bankAccountType = normalizeBankAccountType(body.bankAccountType);
  if (bankAccountType === undefined) {
    return error("口座種別が正しくありません。", "bankAccountType");
  }

  const input: CreateBusinessProfileInput = {
    kind,
    companyName,
    displayName: stringOrNull(body.displayName) ?? companyName,
    legalName: stringOrNull(body.legalName),
    department: stringOrNull(body.department),
    postalCode: stringOrNull(body.postalCode),
    addressLine1: stringOrNull(body.addressLine1),
    addressLine2: stringOrNull(body.addressLine2),
    phone: stringOrNull(body.phone),
    email: stringOrNull(body.email),
    websiteUrl: stringOrNull(body.websiteUrl),
    invoiceRegistrationNumber: stringOrNull(body.invoiceRegistrationNumber),
    corporateNumber: stringOrNull(body.corporateNumber),
    bankName: stringOrNull(body.bankName),
    bankBranchName: stringOrNull(body.bankBranchName),
    bankAccountType,
    bankAccountNumber: stringOrNull(body.bankAccountNumber),
    bankAccountHolder: stringOrNull(body.bankAccountHolder),
    notes: stringOrNull(body.notes),
    isDefault: optionalBoolean(body, "isDefault") ?? false,
  };

  const contactCheck = validateOptionalContactInfo(input);
  if (!contactCheck.ok) return contactCheck;
  if (input.postalCode && !POSTAL_CODE_PATTERN.test(input.postalCode)) {
    return error("郵便番号の形式が正しくありません。", "postalCode");
  }
  if (
    input.corporateNumber &&
    !CORPORATE_NUMBER_PATTERN.test(input.corporateNumber)
  ) {
    return error("法人番号は13桁で入力してください。", "corporateNumber");
  }
  if (
    input.invoiceRegistrationNumber &&
    !INVOICE_REGISTRATION_PATTERN.test(input.invoiceRegistrationNumber)
  ) {
    return error("適格請求書登録番号の形式が正しくありません。", "invoiceRegistrationNumber");
  }

  return { ok: true, data: input };
}

export function parseUpdateProfileBody(
  body: unknown,
): ParseResult<UpdateBusinessProfileInput> {
  if (!isRecord(body)) return error("Request body must be an object");

  const input: UpdateBusinessProfileInput = {};

  if ("kind" in body) {
    if (!isProfileKind(body.kind)) {
      return error("プロフィール種別が正しくありません。", "kind");
    }
    input.kind = body.kind;
  }

  const stringFields: Array<keyof UpdateBusinessProfileInput> = [
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
    "bankAccountNumber",
    "bankAccountHolder",
    "notes",
  ];

  for (const key of stringFields) {
    const value = optionalString(body, key);
    if (value !== undefined) {
      input[key] = value as never;
    }
  }

  if ("bankAccountType" in body) {
    const bankAccountType = normalizeBankAccountType(body.bankAccountType);
    if (bankAccountType === undefined) {
      return error("口座種別が正しくありません。", "bankAccountType");
    }
    input.bankAccountType = bankAccountType;
  }

  if ("isDefault" in body) input.isDefault = Boolean(body.isDefault);

  const contactCheck = validateOptionalContactInfo(input);
  if (!contactCheck.ok) return contactCheck;
  if (input.postalCode && !POSTAL_CODE_PATTERN.test(input.postalCode)) {
    return error("郵便番号の形式が正しくありません。", "postalCode");
  }

  return { ok: true, data: input };
}

export function parseCustomFieldBody(body: unknown): ParseResult<CustomFieldInput> {
  if (!isRecord(body)) return error("Request body must be an object");

  const key = stringOrNull(body.key);
  if (!key || !FIELD_KEY_PATTERN.test(key)) {
    return error("フィールドキーは英数字とアンダースコアで入力してください。", "key");
  }

  const label = stringOrNull(body.label);
  if (!label) return error("ラベルを入力してください。", "label");

  const valueType = body.valueType === undefined ? "text" : body.valueType;
  if (!isValueType(valueType)) {
    return error("値の種類が正しくありません。", "valueType");
  }

  const sensitivity =
    body.sensitivity === undefined ? "internal" : body.sensitivity;
  if (!SENSITIVITY_VALUES.includes(sensitivity as BusinessFieldSensitivity)) {
    return error("機密度が正しくありません。", "sensitivity");
  }

  return {
    ok: true,
    data: {
      key,
      label,
      value: stringOrNull(body.value),
      valueType,
      sensitivity: sensitivity as BusinessFieldSensitivity,
      usage:
        isRecord(body.usage) && body.usage
          ? {
              aiUsageAllowed:
                typeof body.usage.aiUsageAllowed === "boolean"
                  ? body.usage.aiUsageAllowed
                  : undefined,
              documentUsageAllowed:
                typeof body.usage.documentUsageAllowed === "boolean"
                  ? body.usage.documentUsageAllowed
                  : undefined,
              usageForbidden:
                typeof body.usage.usageForbidden === "boolean"
                  ? body.usage.usageForbidden
                  : undefined,
            }
          : undefined,
      sourceKind: "user_confirmed",
      sourceDetail: stringOrNull(body.sourceDetail),
      sortOrder: optionalNumber(body, "sortOrder") ?? 0,
    },
  };
}

export function parseCreateContactBody(
  body: unknown,
): ParseResult<CreateBusinessContactInput> {
  if (!isRecord(body)) return error("Request body must be an object");
  const displayName = stringOrNull(body.displayName);
  if (!displayName) return error("連絡先名を入力してください。", "displayName");
  const kind = body.kind === undefined ? "other" : body.kind;
  if (!isContactKind(kind)) return error("連絡先種別が正しくありません。", "kind");

  const input: CreateBusinessContactInput = {
    profileId: stringOrNull(body.profileId),
    kind,
    displayName,
    companyName: stringOrNull(body.companyName),
    department: stringOrNull(body.department),
    title: stringOrNull(body.title),
    email: stringOrNull(body.email),
    phone: stringOrNull(body.phone),
    address: stringOrNull(body.address),
    notes: stringOrNull(body.notes),
    isPrimary: optionalBoolean(body, "isPrimary") ?? false,
  };
  const contactCheck = validateOptionalContactInfo(input);
  if (!contactCheck.ok) return contactCheck;
  return { ok: true, data: input };
}

export function parseUpdateContactBody(
  body: unknown,
): ParseResult<UpdateBusinessContactInput> {
  if (!isRecord(body)) return error("Request body must be an object");
  const input: UpdateBusinessContactInput = {};
  if ("kind" in body) {
    if (!isContactKind(body.kind)) {
      return error("連絡先種別が正しくありません。", "kind");
    }
    input.kind = body.kind;
  }
  for (const key of [
    "profileId",
    "displayName",
    "companyName",
    "department",
    "title",
    "email",
    "phone",
    "address",
    "notes",
  ] as const) {
    const value = optionalString(body, key);
    if (value === undefined) continue;
    if (key === "displayName") {
      if (!value) return error("連絡先名を入力してください。", "displayName");
      input.displayName = value;
    } else {
      input[key] = value as never;
    }
  }
  if ("isPrimary" in body) input.isPrimary = Boolean(body.isPrimary);
  const contactCheck = validateOptionalContactInfo(input);
  if (!contactCheck.ok) return contactCheck;
  return { ok: true, data: input };
}

export function parseCreateCaseBody(
  body: unknown,
): ParseResult<CreateBusinessCaseInput> {
  if (!isRecord(body)) return error("Request body must be an object");
  const title = stringOrNull(body.title);
  if (!title) return error("案件名を入力してください。", "title");
  const kind = body.kind === undefined ? "other" : body.kind;
  if (!isCaseKind(kind)) return error("案件種別が正しくありません。", "kind");
  return {
    ok: true,
    data: {
      profileId: stringOrNull(body.profileId),
      kind,
      title,
      clientName: stringOrNull(body.clientName),
      description: stringOrNull(body.description),
      status: stringOrNull(body.status),
      startDate: stringOrNull(body.startDate),
      endDate: stringOrNull(body.endDate),
      budget: stringOrNull(body.budget),
      notes: stringOrNull(body.notes),
    },
  };
}

export function parseUpdateCaseBody(
  body: unknown,
): ParseResult<UpdateBusinessCaseInput> {
  if (!isRecord(body)) return error("Request body must be an object");
  const input: UpdateBusinessCaseInput = {};
  if ("kind" in body) {
    if (!isCaseKind(body.kind)) return error("案件種別が正しくありません。", "kind");
    input.kind = body.kind;
  }
  for (const key of [
    "profileId",
    "title",
    "clientName",
    "description",
    "status",
    "startDate",
    "endDate",
    "budget",
    "notes",
  ] as const) {
    const value = optionalString(body, key);
    if (value === undefined) continue;
    if (key === "title") {
      if (!value) return error("案件名を入力してください。", "title");
      input.title = value;
    } else {
      input[key] = value as never;
    }
  }
  return { ok: true, data: input };
}
