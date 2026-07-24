import "server-only";

import { encryptSecretValue } from "./crypto";
import { detectForbiddenSecretInput } from "./forbidden";
import { businessProfileRepository } from "./repository";
import { mergeUsageFlags, usageForSensitivity } from "./usage-policy";
import type {
  BusinessProfile,
  BusinessProfileField,
  CreateBusinessProfileInput,
  CustomFieldInput,
  UpdateBusinessProfileInput,
} from "./types";

export class BusinessProfileError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BusinessProfileError";
    this.code = code;
  }
}

function assertNoForbiddenInput(fields: Array<{
  label: string;
  key: string;
  value: string | null | undefined;
}>): void {
  for (const field of fields) {
    const detected = detectForbiddenSecretInput(field.label, field.key, field.value);
    if (detected.forbidden) {
      throw new BusinessProfileError("forbidden_secret", detected.reasonJa);
    }
  }
}

function profileFieldsForForbiddenCheck(
  input: CreateBusinessProfileInput | UpdateBusinessProfileInput,
) {
  return [
    { key: "companyName", label: "会社名", value: input.companyName },
    { key: "legalName", label: "正式名称", value: input.legalName },
    { key: "phone", label: "電話番号", value: input.phone },
    { key: "email", label: "メールアドレス", value: input.email },
    { key: "websiteUrl", label: "Webサイト", value: input.websiteUrl },
    { key: "notes", label: "備考", value: input.notes },
  ];
}

export async function listProfiles(ownerUserId: string): Promise<BusinessProfile[]> {
  return businessProfileRepository.listProfiles(ownerUserId);
}

export async function getProfileForUser(
  ownerUserId: string,
  profileId: string,
): Promise<BusinessProfile | null> {
  return businessProfileRepository.getProfileForUser(ownerUserId, profileId);
}

export async function getDefaultProfileForUser(
  ownerUserId: string,
): Promise<BusinessProfile | null> {
  return businessProfileRepository.getDefaultProfileForUser(ownerUserId);
}

export async function createProfile(
  ownerUserId: string,
  input: CreateBusinessProfileInput,
): Promise<BusinessProfile> {
  assertNoForbiddenInput(profileFieldsForForbiddenCheck(input));
  const encryptedBankAccount = encryptSecretValue(input.bankAccountNumber);
  return businessProfileRepository.createProfile(ownerUserId, {
    ...input,
    bankAccountNumberEncrypted: encryptedBankAccount.encrypted,
    bankAccountNumberLast4: encryptedBankAccount.last4,
  });
}

export async function updateProfile(
  ownerUserId: string,
  profileId: string,
  patch: UpdateBusinessProfileInput,
): Promise<BusinessProfile | null> {
  assertNoForbiddenInput(profileFieldsForForbiddenCheck(patch));
  const encryptedBankAccount =
    "bankAccountNumber" in patch
      ? encryptSecretValue(patch.bankAccountNumber)
      : null;
  return businessProfileRepository.updateProfile(ownerUserId, profileId, {
    ...patch,
    ...(encryptedBankAccount
      ? {
          bankAccountNumberEncrypted: encryptedBankAccount.encrypted,
          bankAccountNumberLast4: encryptedBankAccount.last4,
        }
      : {}),
  });
}

export async function setDefaultProfile(
  ownerUserId: string,
  profileId: string,
): Promise<BusinessProfile | null> {
  return businessProfileRepository.setDefaultProfile(ownerUserId, profileId);
}

export async function softDeleteProfile(
  ownerUserId: string,
  profileId: string,
  options?: { switchToProfileId?: string | null },
): Promise<boolean> {
  const profile = await businessProfileRepository.getProfileForUser(
    ownerUserId,
    profileId,
  );
  if (!profile) return false;

  const activeProfiles = await businessProfileRepository.listProfiles(ownerUserId);
  const otherActiveProfiles = activeProfiles.filter((item) => item.id !== profileId);
  const referenceCount = await businessProfileRepository.countProfileReferences(
    ownerUserId,
    profileId,
  );

  if ((profile.isDefault || referenceCount > 0) && otherActiveProfiles.length > 0) {
    const switchToProfileId = options?.switchToProfileId ?? null;
    if (!switchToProfileId) {
      throw new BusinessProfileError(
        "switch_required",
        "既定または使用中のプロフィールを削除する前に、切り替え先を指定してください。",
      );
    }
    if (switchToProfileId === profileId) {
      throw new BusinessProfileError(
        "invalid_switch",
        "削除対象とは別のプロフィールを指定してください。",
      );
    }
    const switched = await businessProfileRepository.setDefaultProfile(
      ownerUserId,
      switchToProfileId,
    );
    if (!switched) {
      throw new BusinessProfileError(
        "invalid_switch",
        "切り替え先のプロフィールが見つかりません。",
      );
    }
  }

  return businessProfileRepository.softDeleteProfile(ownerUserId, profileId);
}

export async function listFields(
  ownerUserId: string,
  profileId: string,
): Promise<BusinessProfileField[]> {
  return businessProfileRepository.listFields(ownerUserId, profileId);
}

export async function upsertField(
  ownerUserId: string,
  profileId: string,
  input: CustomFieldInput,
): Promise<BusinessProfileField | null> {
  const detected = detectForbiddenSecretInput(input.label, input.key, input.value);
  if (detected.forbidden) {
    throw new BusinessProfileError("forbidden_secret", detected.reasonJa);
  }

  const sensitivity = input.sensitivity ?? "internal";
  const encrypted =
    sensitivity === "secret" ? encryptSecretValue(input.value) : null;
  const baseUsage =
    input.valueType === "bank_account"
      ? {
          aiUsageAllowed: false,
          documentUsageAllowed: true,
          usageForbidden: false,
        }
      : {
          aiUsageAllowed: true,
          documentUsageAllowed: true,
          usageForbidden: false,
        };

  return businessProfileRepository.upsertField(ownerUserId, profileId, {
    ...input,
    sensitivity,
    usage: usageForSensitivity(sensitivity, mergeUsageFlags(baseUsage, input.usage)),
    value: sensitivity === "secret" ? null : input.value ?? null,
    secretValueEncrypted: encrypted?.encrypted ?? null,
    hasSecretValue: Boolean(encrypted?.encrypted),
  });
}

export async function deleteField(
  ownerUserId: string,
  profileId: string,
  fieldKey: string,
): Promise<boolean> {
  return businessProfileRepository.deleteField(ownerUserId, profileId, fieldKey);
}
