import {
  BANK_FIELD_KEYS,
  FORMAL_FIELD_KEY_PATTERN,
  PROFILE_TEMPLATE_VARIABLE_KEYS,
  CONTACT_TEMPLATE_VARIABLE_KEYS,
  PROJECT_TEMPLATE_VARIABLE_KEYS,
} from "./constants";
import { businessProfileRepository } from "./repository";
import { extractTemplateVariables } from "./template-vars";
import { defaultUsageForBuiltinField } from "./usage-policy";
import { validateRequiredArtifactFields } from "./needs-input";
import type {
  ArtifactContext,
  BusinessCase,
  BusinessContact,
  BusinessFieldSourceKind,
  BusinessFieldValueType,
  BusinessProfile,
  BusinessProfileField,
  ResolveArtifactContextInput,
  ResolvedField,
  TemplateVariableScope,
} from "./types";

const PROFILE_LABELS: Record<string, string> = {
  displayName: "表示名",
  companyName: "会社名",
  legalName: "正式名称",
  department: "部署",
  postalCode: "郵便番号",
  addressLine1: "住所1",
  addressLine2: "住所2",
  phone: "電話番号",
  email: "メールアドレス",
  websiteUrl: "Webサイト",
  invoiceRegistrationNumber: "適格請求書登録番号",
  corporateNumber: "法人番号",
  bankName: "銀行名",
  bankBranchName: "支店名",
  bankAccountType: "口座種別",
  bankAccountNumber: "口座番号",
  bankAccountHolder: "口座名義",
  notes: "備考",
};

const CONTACT_LABELS: Record<string, string> = {
  displayName: "連絡先名",
  companyName: "会社名",
  department: "部署",
  title: "役職",
  email: "メールアドレス",
  phone: "電話番号",
  address: "住所",
  notes: "備考",
};

const PROJECT_LABELS: Record<string, string> = {
  title: "案件名",
  clientName: "顧客名",
  description: "概要",
  status: "状態",
  startDate: "開始日",
  endDate: "終了日",
  budget: "予算",
  notes: "備考",
};

function profileValue(profile: BusinessProfile, key: string): string | null {
  const value = profile[key as keyof BusinessProfile];
  return typeof value === "string" && value ? value : null;
}

function contactValue(contact: BusinessContact, key: string): string | null {
  const value = contact[key as keyof BusinessContact];
  return typeof value === "string" && value ? value : null;
}

function projectValue(project: BusinessCase, key: string): string | null {
  const value = project[key as keyof BusinessCase];
  return typeof value === "string" && value ? value : null;
}

function valueTypeForKey(key: string): BusinessFieldValueType {
  if (/email/i.test(key)) return "email";
  if (/phone/i.test(key)) return "phone";
  if (/url|website/i.test(key)) return "url";
  if (/date/i.test(key)) return "date";
  if (/budget/i.test(key)) return "number";
  if (/bank|account/i.test(key)) return "bank_account";
  return "text";
}

function sensitivityForKey(key: string): ResolvedField["sensitivity"] {
  if (BANK_FIELD_KEYS.has(key) || /bank|account/i.test(key)) return "restricted";
  if (/notes/i.test(key)) return "internal";
  return "public";
}

function sourceLabel(scope: TemplateVariableScope, entity: {
  displayName?: string;
  companyName?: string | null;
  title?: string | null;
} | null): string | null {
  if (!entity) return null;
  if (scope === "project") return entity.title ?? null;
  return entity.displayName ?? entity.companyName ?? null;
}

function makeField(input: {
  scope: TemplateVariableScope;
  key: string;
  label: string;
  value: string | null;
  sourceKind: BusinessFieldSourceKind;
  sourceId: string | null;
  sourceLabel: string | null;
  required: boolean;
  valueType?: BusinessFieldValueType;
  sensitivity?: ResolvedField["sensitivity"];
}): ResolvedField {
  return {
    key: `${input.scope}.${input.key}`,
    label: input.label,
    value: input.value,
    valueType: input.valueType ?? valueTypeForKey(input.key),
    sensitivity: input.sensitivity ?? sensitivityForKey(`${input.scope}.${input.key}`),
    usage: defaultUsageForBuiltinField(input.scope, input.key),
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceLabel: input.sourceLabel,
    missing: !input.value,
    required: input.required,
  };
}

function normalizedSupplementalKeys(
  fields: Record<string, string | null | undefined> | undefined,
): Array<[string, string]> {
  if (!fields) return [];
  return Object.entries(fields)
    .map(([key, value]): [string, string] => [key, String(value ?? "").trim()])
    .filter(([, value]) => Boolean(value));
}

function isFormalOrBankVariable(variable: string): boolean {
  return BANK_FIELD_KEYS.has(variable) || FORMAL_FIELD_KEY_PATTERN.test(variable);
}

function addOrFillField(
  map: Map<string, ResolvedField>,
  field: ResolvedField,
): void {
  const existing = map.get(field.key);
  if (!existing || (existing.missing && field.value)) {
    map.set(field.key, field);
  }
}

function addSupplementalFields(input: {
  map: Map<string, ResolvedField>;
  fields: Record<string, string | null | undefined> | undefined;
  sourceKind: BusinessFieldSourceKind;
  requiredKeys: Set<string>;
}): void {
  for (const [rawKey, value] of normalizedSupplementalKeys(input.fields)) {
    const variable = rawKey.includes(".") ? rawKey : `profile.${rawKey}`;
    if (
      input.sourceKind === "ai_inferred" &&
      isFormalOrBankVariable(variable)
    ) {
      continue;
    }
    const [scopeRaw, key] = variable.split(".");
    const scope = scopeRaw as TemplateVariableScope;
    if (scope !== "profile" && scope !== "contact" && scope !== "project") continue;
    addOrFillField(
      input.map,
      makeField({
        scope,
        key,
        label:
          (scope === "profile"
            ? PROFILE_LABELS[key]
            : scope === "contact"
              ? CONTACT_LABELS[key]
              : PROJECT_LABELS[key]) ?? key,
        value,
        sourceKind: input.sourceKind,
        sourceId: null,
        sourceLabel: null,
        required: input.requiredKeys.has(variable),
      }),
    );
  }
}

function addMissingRequiredFields(
  map: Map<string, ResolvedField>,
  requiredKeys: Set<string>,
): void {
  for (const variable of requiredKeys) {
    if (map.has(variable)) continue;
    const [scopeRaw, key] = variable.split(".");
    const scope = scopeRaw as TemplateVariableScope;
    if (scope !== "profile" && scope !== "contact" && scope !== "project") continue;
    map.set(
      variable,
      makeField({
        scope,
        key,
        label:
          (scope === "profile"
            ? PROFILE_LABELS[key]
            : scope === "contact"
              ? CONTACT_LABELS[key]
              : PROJECT_LABELS[key]) ?? key,
        value: null,
        sourceKind: "current_request",
        sourceId: null,
        sourceLabel: null,
        required: true,
      }),
    );
  }
}

function addCustomFields(
  map: Map<string, ResolvedField>,
  fields: BusinessProfileField[],
  requiredKeys: Set<string>,
): void {
  for (const field of fields) {
    addOrFillField(map, {
      key: `profile.${field.key}`,
      label: field.label,
      value: field.value,
      valueType: field.valueType,
      sensitivity: field.sensitivity,
      usage: field.usage,
      sourceKind: field.sourceKind,
      sourceId: field.profileId,
      sourceLabel: "業務プロフィール",
      missing: !field.value,
      required: requiredKeys.has(`profile.${field.key}`),
    });
  }
}

export async function resolveArtifactContext(
  input: ResolveArtifactContextInput,
): Promise<ArtifactContext> {
  const requiredKeys = new Set([
    ...extractTemplateVariables(input.template),
    ...(input.requiredVariables ?? []),
  ]);

  const profile =
    input.profileId === null
      ? null
      : input.profileId
        ? await businessProfileRepository.getProfileForUser(
            input.ownerUserId,
            input.profileId,
          )
        : await businessProfileRepository.getDefaultProfileForUser(input.ownerUserId);

  const contactIds = [
    ...(input.contactId ? [input.contactId] : []),
    ...(input.contactIds ?? []),
  ].filter((id, index, all) => all.indexOf(id) === index);

  const contacts =
    contactIds.length > 0
      ? (
          await Promise.all(
            contactIds.map((id) =>
              businessProfileRepository.getContactForUser(input.ownerUserId, id),
            ),
          )
        ).filter((contact): contact is BusinessContact => Boolean(contact))
      : profile
        ? await businessProfileRepository.listContacts(input.ownerUserId, {
            profileId: profile.id,
          })
        : [];

  const primaryContact =
    contacts.find((contact) => contact.isPrimary) ?? contacts[0] ?? null;
  const project = input.caseId
    ? await businessProfileRepository.getCaseForUser(input.ownerUserId, input.caseId)
    : null;

  const fieldMap = new Map<string, ResolvedField>();

  if (profile) {
    for (const key of PROFILE_TEMPLATE_VARIABLE_KEYS) {
      addOrFillField(
        fieldMap,
        makeField({
          scope: "profile",
          key,
          label: PROFILE_LABELS[key],
          value: profileValue(profile, key),
          sourceKind: "saved_profile",
          sourceId: profile.id,
          sourceLabel: sourceLabel("profile", profile),
          required: requiredKeys.has(`profile.${key}`),
        }),
      );
    }
    const customFields = await businessProfileRepository.listFields(
      input.ownerUserId,
      profile.id,
    );
    addCustomFields(fieldMap, customFields, requiredKeys);
  }

  if (primaryContact) {
    for (const key of CONTACT_TEMPLATE_VARIABLE_KEYS) {
      addOrFillField(
        fieldMap,
        makeField({
          scope: "contact",
          key,
          label: CONTACT_LABELS[key],
          value: contactValue(primaryContact, key),
          sourceKind: "saved_contact",
          sourceId: primaryContact.id,
          sourceLabel: sourceLabel("contact", primaryContact),
          required: requiredKeys.has(`contact.${key}`),
        }),
      );
    }
  }

  if (project) {
    for (const key of PROJECT_TEMPLATE_VARIABLE_KEYS) {
      addOrFillField(
        fieldMap,
        makeField({
          scope: "project",
          key,
          label: PROJECT_LABELS[key],
          value: projectValue(project, key),
          sourceKind: "saved_project",
          sourceId: project.id,
          sourceLabel: sourceLabel("project", project),
          required: requiredKeys.has(`project.${key}`),
        }),
      );
    }
  }

  addSupplementalFields({
    map: fieldMap,
    fields: input.userConfirmedFields,
    sourceKind: "user_confirmed",
    requiredKeys,
  });
  addSupplementalFields({
    map: fieldMap,
    fields: input.currentRequestFields,
    sourceKind: "current_request",
    requiredKeys,
  });
  addSupplementalFields({
    map: fieldMap,
    fields: input.uploadedDocumentFields,
    sourceKind: "uploaded_document",
    requiredKeys,
  });
  addSupplementalFields({
    map: fieldMap,
    fields: input.aiInferredFields,
    sourceKind: "ai_inferred",
    requiredKeys,
  });

  addMissingRequiredFields(fieldMap, requiredKeys);

  const fields = [...fieldMap.values()];
  const usedFields = fields.filter((field) => requiredKeys.has(field.key));
  const unusedFields = fields.filter((field) => !requiredKeys.has(field.key));
  const needsInput = validateRequiredArtifactFields(fields);
  const variables = Object.fromEntries(
    fields.map((field) => [field.key, field.value]),
  );

  return {
    ownerUserId: input.ownerUserId,
    profile,
    contacts,
    project,
    fields,
    usedFields,
    unusedFields,
    missingRequired: needsInput.missingRequired,
    variables,
    needsInput,
  };
}
